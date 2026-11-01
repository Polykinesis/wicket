-- Row level security for the widget tables, following the split-by-command
-- pattern settled for `sources` in migration 0003 and the v0.6 amendment to
-- ADR-009. Reads stay permissive when the GUC is unset because ordinary reads
-- deliberately do not open a transaction and are protected by the
-- `tenant_id = $1` predicate the branded TenantId makes a compile error to
-- omit; writes require the GUC, so a write that escapes the predicate fails in
-- Postgres rather than succeeding quietly.
--
-- Both tables get the full set of four policies. Unlike the append-only reply
-- loop tables in 0006, these are edited from the dashboard: origins change,
-- site keys are revoked, settings are rewritten, so UPDATE and DELETE are real
-- paths and need both halves of their check. `USING` decides which rows are
-- visible to the command, `WITH CHECK` decides what an UPDATE may turn them
-- into; without the latter a row could be re-homed under another tenant.
--
-- One thing RLS does not cover here: the widget Worker never reads these
-- tables. It reads the KV projection written by `projectWidgetConfig`, keyed by
-- site key. The isolation of that read is the site key's unguessability plus
-- the tenant id stored inside the projected value, not a policy.
--
-- `brand_color` gets a CHECK matching `brandColorSchema` in @cf-chat/shared.
-- The value ends up in a style attribute on a stranger's page; the schema
-- refuses anything but six hex digits at the API, and the constraint makes
-- sure no other write path can relax that.

ALTER TABLE "widget_settings"
  ADD CONSTRAINT "widget_settings_brand_color_hex"
  CHECK ("brand_color" IS NULL OR "brand_color" ~ '^#[0-9a-fA-F]{6}$');
--> statement-breakpoint

ALTER TABLE "widget_sites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "widget_sites_read" ON "widget_sites"
  FOR SELECT TO app_user
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
--> statement-breakpoint

CREATE POLICY "widget_sites_insert" ON "widget_sites"
  FOR INSERT TO app_user
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "widget_sites_update" ON "widget_sites"
  FOR UPDATE TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "widget_sites_delete" ON "widget_sites"
  FOR DELETE TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "widget_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "widget_settings_read" ON "widget_settings"
  FOR SELECT TO app_user
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
--> statement-breakpoint

CREATE POLICY "widget_settings_insert" ON "widget_settings"
  FOR INSERT TO app_user
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "widget_settings_update" ON "widget_settings"
  FOR UPDATE TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

CREATE POLICY "widget_settings_delete" ON "widget_settings"
  FOR DELETE TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
