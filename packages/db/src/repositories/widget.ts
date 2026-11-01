import type { TenantId, WidgetSiteKey } from "@cf-chat/shared";
import { and, count, eq, max } from "drizzle-orm";
import type { Queryable } from "../client.ts";
import {
  sources,
  type WidgetSettingsRow,
  type WidgetSiteRow,
  widgetSettings,
  widgetSites,
} from "../schema.ts";

/**
 * Every function here is tenant-scoped and takes the branded `TenantId` first,
 * so the predicate cannot be forgotten and Hyperdrive's cache key includes the
 * tenant (ADR-009 point 1).
 *
 * Reads work on a plain connection. Writes must run inside `withTenant`,
 * because the RLS policies in migration 0008 require `app.tenant_id` to be set
 * for INSERT, UPDATE and DELETE.
 */

export async function listWidgetSites(db: Queryable, tenantId: TenantId): Promise<WidgetSiteRow[]> {
  return db
    .select()
    .from(widgetSites)
    .where(eq(widgetSites.tenantId, tenantId))
    .orderBy(widgetSites.createdAt);
}

export interface InsertWidgetSite {
  readonly id: string;
  readonly siteKey: WidgetSiteKey;
  readonly origins: readonly string[];
  readonly turnstileSiteKey: string;
}

export async function insertWidgetSite(
  db: Queryable,
  tenantId: TenantId,
  input: InsertWidgetSite,
): Promise<WidgetSiteRow> {
  const rows = await db
    .insert(widgetSites)
    .values({ ...input, origins: [...input.origins], tenantId })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("insertWidgetSite returned no row");
  }
  return row;
}

export async function updateWidgetSiteOrigins(
  db: Queryable,
  tenantId: TenantId,
  siteKey: WidgetSiteKey,
  origins: readonly string[],
): Promise<WidgetSiteRow | undefined> {
  const rows = await db
    .update(widgetSites)
    .set({ origins: [...origins], updatedAt: new Date() })
    .where(and(eq(widgetSites.tenantId, tenantId), eq(widgetSites.siteKey, siteKey)))
    .returning();
  return rows[0];
}

/** Returns false when there was no such row, which a route turns into a 404. */
export async function deleteWidgetSite(
  db: Queryable,
  tenantId: TenantId,
  siteKey: WidgetSiteKey,
): Promise<boolean> {
  const rows = await db
    .delete(widgetSites)
    .where(and(eq(widgetSites.tenantId, tenantId), eq(widgetSites.siteKey, siteKey)))
    .returning({ id: widgetSites.id });
  return rows.length > 0;
}

export async function findWidgetSettings(
  db: Queryable,
  tenantId: TenantId,
): Promise<WidgetSettingsRow | undefined> {
  const rows = await db
    .select()
    .from(widgetSettings)
    .where(eq(widgetSettings.tenantId, tenantId))
    .limit(1);
  return rows[0];
}

export interface WidgetSettingsInput {
  readonly ownerName: string | null;
  readonly replyTime: string | null;
  readonly topics: readonly string[] | null;
  readonly suggestedQuestions: readonly string[] | null;
  readonly brandColor: string | null;
}

/**
 * The whole row at once: the settings form submits every field, and a partial
 * merge would make "clear this field" indistinguishable from "did not send it".
 */
export async function upsertWidgetSettings(
  db: Queryable,
  tenantId: TenantId,
  input: WidgetSettingsInput,
): Promise<WidgetSettingsRow> {
  const values = {
    ownerName: input.ownerName,
    replyTime: input.replyTime,
    topics: input.topics === null ? null : [...input.topics],
    suggestedQuestions: input.suggestedQuestions === null ? null : [...input.suggestedQuestions],
    brandColor: input.brandColor,
  };
  const rows = await db
    .insert(widgetSettings)
    .values({ ...values, tenantId })
    .onConflictDoUpdate({
      target: widgetSettings.tenantId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("upsertWidgetSettings returned no row");
  }
  return row;
}

export interface ReadySourcesSummary {
  readonly documentCount: number;
  /** Most recent `updated_at` among ready sources; null when there are none. */
  readonly updatedAt: Date | null;
}

/**
 * What the widget's scope line is made of: how many sources are answerable
 * and how fresh the newest one is. `ready` only; a source still indexing or
 * tombstoned as `deleting` is not something the widget can answer from.
 */
export async function countReadySources(
  db: Queryable,
  tenantId: TenantId,
): Promise<ReadySourcesSummary> {
  const rows = await db
    .select({ documentCount: count(), updatedAt: max(sources.updatedAt) })
    .from(sources)
    .where(and(eq(sources.tenantId, tenantId), eq(sources.status, "ready")));
  const row = rows[0];
  return { documentCount: row?.documentCount ?? 0, updatedAt: row?.updatedAt ?? null };
}
