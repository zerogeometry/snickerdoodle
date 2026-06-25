# START HERE — Snickerdoodle requirements

> **You are the build agent.** This bundle defines **what** Snickerdoodle is, how it must behave, and the rules it must never break. **You own the *how*.**

## Your task

1. Read this bundle in full (`START-HERE.md` then `docs/01`→`docs/05`, plus the companion specs listed below).
2. From these requirements, **produce the architecture yourself**: technology stack, data schema, API/service design, folder structure, your own `CLAUDE.md`/working conventions, and a phased implementation plan with acceptance criteria.
3. Surface your proposed architecture and stack for sign-off **before** building, especially around: how you store and protect children's images, the AI image processing provider, the print-on-demand provider, payments, and background jobs.
4. Then build, in deployable increments, honouring the non-negotiables below at every step.

These documents intentionally describe requirements and the problem domain — not an implementation. Where a requirement constrains a technical choice (e.g. "images must be private and never used to train AI"), treat it as a hard constraint, not a suggestion.

## Non-negotiables (constraints that never bend)

1. **Child safety first.** Never expose a child's data or art to anyone the parent didn't explicitly invite. When unsure, choose the more private option and flag it.
2. **Privacy by default.** New keepsakes default to the **Family** visibility tier — never Extended, never public. Nothing is ever public.
3. **The parent is the controller.** Children are *subjects*, not account holders. Only a parent initiates invites and sets access. No self-join into an un-invited family.
4. **AI is invisible and safe.** Generative features appear only as warm "magic edits." Image processors must be **no-retention, no-training**, and receive only the single image they need.
5. **Brand voice is load-bearing.** Warm, plain, playful-with-a-wink, quietly reassuring. No corporate tone, no pushy upsell.
6. **Mobile-first.** Most users are on phones; primary actions live in the thumb zone.
7. **Accessibility is required.** Semantic, labelled, sufficient contrast, `prefers-reduced-motion` respected.
8. **Originals are sacred.** Editing is non-destructive; the original is always recoverable and deletable on demand.
9. **Design fidelity.** The approved mockups in `/mockups` are the binding design — **reproduce them exactly**, don't reinterpret them. See `docs/00-design-fidelity.md`.

If a task seems to require breaking one of these, **stop and ask**.

## Document map

| Doc | Defines |
|---|---|
| `docs/00-design-fidelity.md` | **The mockups are binding — reproduce them exactly** |
| `docs/01-product-requirements.md` | Vision, goals, objectives, success metrics, users, scope & non-goals |
| `docs/02-brand-and-design-requirements.md` | Design tokens, voice, do/don'ts |
| `docs/03-ux-functional-requirements.md` | Every screen, flow, component, state — what each must do |
| `docs/04-domain-model-and-business-rules.md` | The conceptual domain + the invariants you must honour |
| `docs/05-trust-data-and-compliance-requirements.md` | Privacy/child-safety rules and launch gates |

## The mockups (in `/mockups`) — the binding visual design

- `snickerdoodle-desktop-mockups.html` — desktop screens + create-gift-link modal
- `snickerdoodle-mobile-mockups.html` — mobile screens
- `snickerdoodle-visibility-and-circles.html` — visibility + add-member modals

Treat the rendered mockups as the target. Build to match them, then swap placeholder doodles for real children's artwork and product photography. See `docs/00-design-fidelity.md`.

## Companion specs (authoritative source material — read these too)

All in `companion-specs/`:

- `snickerdoodle-studio-functional-spec.md` — the **complete Studio feature spec** (incl. touch/stylus §19a). This governs the Studio.
- `snickerdoodle-brand-and-product-foundations.md` — the full brand bible.
- `snickerdoodle-trust-data-spine-1/2/3.md` — compliance backbone, public privacy notice, family data promise.
- `children-and-families-gifting-roadmap.md` — strategic roadmap & unit economics.
- **Visual source of truth:** the HTML mockups in `mockups/`. The screens are designed — match them.

## Not for you (the build agent)

`COWORK-PROJECT-OFFICE.md` and the `project-office/` folder are the brief and trackers for Claude Cowork (the project office that runs alongside the build). You can ignore them — they don't define the product.

## What this bundle deliberately does *not* tell you

The stack, the schema, the API shape, the folder layout, the sequencing of work. Those are yours to design from the requirements. Propose them, get sign-off, build.
