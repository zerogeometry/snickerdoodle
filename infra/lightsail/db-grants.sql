-- Least-privilege database access. Run as the postgres superuser against the snickerdoodle
-- database after every migration (deploy.sh does) and after a restore (restore-db.sh does).
-- Safe to run again and again.
--
--   sd_migrator  owns the database and its tables; only migrations log in as it.
--   sd_app       what the running app uses: read/write rows, nothing else. No DDL, no TRUNCATE
--                (TRUNCATE would skip the audit trail's append-only trigger).

DO $$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO sd_app', current_database());
  EXECUTE format('GRANT ALL ON DATABASE %I TO sd_migrator', current_database());
END
$$;

ALTER SCHEMA public OWNER TO sd_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO sd_app;

-- what exists now
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sd_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sd_app;

-- and whatever later migrations create
ALTER DEFAULT PRIVILEGES FOR ROLE sd_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sd_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sd_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sd_app;

-- The audit trail is append-only: never UPDATE. DELETE stays for the 6-year purge, which the
-- table's trigger still guards (migration 0034).
DO $$
BEGIN
  IF to_regclass('public.audit_records') IS NOT NULL THEN
    REVOKE UPDATE, TRUNCATE ON public.audit_records FROM sd_app;
  END IF;
END
$$;

-- The migration bookkeeping is the migrator's alone.
DO $$
BEGIN
  IF to_regnamespace('drizzle') IS NOT NULL THEN
    REVOKE ALL ON SCHEMA drizzle FROM sd_app;
  END IF;
END
$$;
