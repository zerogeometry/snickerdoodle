# syntax=docker/dockerfile:1.7
#
# Snickerdoodle — the app image for the AWS London box (decision D18).
# Build from the REPO ROOT (the context is the whole repo; Dockerfile.dockerignore next to this
# file keeps secrets, node_modules, git history and local assets out):
#
#   docker buildx build --platform linux/amd64 -f infra/aws-london/Dockerfile \
#     --build-arg APP_BUILD=$(date -u +%Y%m%d-%H%M)-$(git rev-parse --short HEAD) -t snickerdoodle:test .
#
# It builds ON LINUX so sharp (libvips) and resvg install their Linux binaries — a Windows or macOS
# node_modules would carry the wrong ones. `next build` + `next start`, exactly as package.json
# runs them; next.config.ts is untouched (no `output: 'standalone'`), so the runtime keeps the
# production node_modules instead of a traced bundle.
#
# No secret is ever baked in: every setting arrives at RUN time from /run/snickerdoodle/app.env
# (filled from SSM Parameter Store by bin/fetch-env.sh). The build needs none.

# The base image is an argument so a mirror can stand in for Docker Hub (e.g. when rate-limited):
#   --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim

# ── 1. dependencies (all of them — next build needs the dev tools) ─────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# An OPTIONAL extra CA for npm, for building behind an intercepting proxy. It is a build secret,
# so it never lands in a layer. Not needed on a normal network:
#   --secret id=extra_ca,src=/path/to/ca-bundle.crt
RUN --mount=type=secret,id=extra_ca,required=false \
    --mount=type=cache,target=/root/.npm \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund

# ── 2. build ─────────────────────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# NODE_ENV=production for the build only. Some server modules build their (lazy) database pool
# at import, which `next build` does while "collecting page data", so the build needs A
# DATABASE_URL — never a real one: this placeholder points nowhere, is never connected to, and
# exists only in this build step (the runtime image gets the real one at run time).
RUN cp -a node_modules/typescript /tmp/typescript \
 && NODE_ENV=production DATABASE_URL=postgres://build:build@127.0.0.1:9/build npm run build \
 && npm prune --omit=dev --no-audit --no-fund \
 # …but `next start` reads next.config.ts, which needs the TypeScript compiler at runtime (it is a
 # dev dependency, and Next would otherwise try to npm-install it on boot). Put it back.
 && cp -a /tmp/typescript node_modules/typescript \
 && rm -rf .next/cache \
 # the image is Debian (glibc): the Alpine (musl) builds of the native packages are dead weight
 && rm -rf node_modules/@next/swc-linux-*-musl node_modules/@img/*linuxmusl* node_modules/@resvg/*-musl

# ── 3. runtime ───────────────────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG APP_BUILD=unknown
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_BUILD=${APP_BUILD}
WORKDIR /app

# Only what `next start` and the server read at runtime:
#  - .next + production node_modules (sharp/resvg Linux binaries included; fonts under @fontsource);
#  - public/ (served files; the example painting the render check uses);
#  - src/ — the server reads print assets (src/server/print/assets) and the card fonts from disk,
#    and the migrator reads src/db/migrations;
#  - next.config.ts (read by `next start`) and package.json.
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/infra/aws-london/bin/migrate.mjs ./infra/migrate.mjs

# Non-root. The app's files belong to root, so the app user can read but never change them, and
# compose also mounts the whole filesystem read-only;
# the only writable places are tmpfs mounts (/tmp, .next/cache) — so nothing a customer sends is
# ever written to the box's disk or its snapshots.
USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# PID 1 is Docker's own init (compose: init: true), so signals reach node and `docker stop` is clean.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
