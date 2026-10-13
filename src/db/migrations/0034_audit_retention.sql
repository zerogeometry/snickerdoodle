-- audit_records stays APPEND-ONLY, with ONE narrow exception: the retention job may delete rows
-- older than the audit retention period (6 years — the limitation period for contract claims),
-- and only inside a transaction that has explicitly opted in with
--   SELECT set_config('snickerdoodle.audit_purge', 'on', true);
-- UPDATE is never allowed; a DELETE of anything younger, or without the opt-in, still raises.
CREATE OR REPLACE FUNCTION audit_records_append_only() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE'
		AND current_setting('snickerdoodle.audit_purge', true) = 'on'
		AND OLD.created_at < now() - interval '6 years' THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'audit_records is append-only (% is not permitted)', TG_OP;
END;
$$ LANGUAGE plpgsql;
