import { env } from "cloudflare:workers";
import {
  countReadySources,
  findTenantById,
  findWidgetSettings,
  listWidgetSites,
  type ReadySourcesSummary,
} from "@cf-chat/db";
import type { WidgetSettingsRow, WidgetSiteRow } from "@cf-chat/db/schema";
import {
  type TenantId,
  type WidgetConfig,
  type WidgetScope,
  type WidgetSiteKey,
  widgetConfigKvKey,
  widgetSiteKeySchema,
} from "@cf-chat/shared";
import { withDb } from "./api/db.ts";

/**
 * Neon is the system of record for everything the widget Worker reads; KV is a
 * projection of it, one entry per site key, rebuilt whole whenever any input
 * changes. Rebuilding rather than patching keeps a single writer shape and
 * means a projection can never carry a field the row no longer has.
 *
 * Triggered from the settings and site-key routes and from the ingest
 * consumer when a source becomes answerable or stops being one, since the
 * scope line counts ready sources. Never read back (CLAUDE.md: KV is not
 * read-after-write); the dashboard shows what Neon says.
 */

/** Everything the projection reads, passed in so tests use fixtures. */
export interface ProjectionDeps {
  readonly tenantName: (tenantId: TenantId) => Promise<string | undefined>;
  readonly sites: (tenantId: TenantId) => Promise<readonly WidgetSiteRow[]>;
  readonly settings: (tenantId: TenantId) => Promise<WidgetSettingsRow | undefined>;
  readonly readySources: (tenantId: TenantId) => Promise<ReadySourcesSummary>;
  readonly kv: Pick<KVNamespace, "put">;
}

/**
 * The pure core: one site row plus the tenant's shared inputs to one config.
 *
 * Every optional field is omitted rather than set to `undefined`, so the JSON
 * written to KV round-trips through `widgetConfigSchema` without an
 * `exactOptionalPropertyTypes` argument about what `undefined` means.
 */
export function buildWidgetConfig(
  site: WidgetSiteRow,
  tenantName: string,
  settings: WidgetSettingsRow | undefined,
  ready: ReadySourcesSummary,
): WidgetConfig {
  const scope: WidgetScope = {
    tenantName,
    documentCount: ready.documentCount,
    ...(ready.updatedAt ? { updatedAt: ready.updatedAt.toISOString() } : {}),
    ...(settings?.topics?.length ? { topics: settings.topics } : {}),
    ...(settings?.suggestedQuestions?.length
      ? { suggestedQuestions: settings.suggestedQuestions }
      : {}),
    ...(settings?.ownerName ? { ownerName: settings.ownerName } : {}),
    ...(settings?.replyTime ? { replyTime: settings.replyTime } : {}),
  };
  return {
    tenantId: site.tenantId as TenantId,
    origins: site.origins,
    turnstileSiteKey: site.turnstileSiteKey,
    scope,
    ...(settings?.brandColor ? { brandColor: settings.brandColor } : {}),
  };
}

/**
 * Rebuild every KV entry for a tenant. Returns the site keys written, which
 * is what a caller that wants to log or assert has to go on.
 *
 * A tenant with no sites writes nothing, and a deleted site is removed by the
 * route that deleted it rather than here: this function only knows the rows
 * that exist, so it cannot know which keys to clear.
 */
export async function projectWidgetConfig(
  tenantId: TenantId,
  deps: ProjectionDeps,
): Promise<readonly WidgetSiteKey[]> {
  const [tenantName, sites, settings, ready] = await Promise.all([
    deps.tenantName(tenantId),
    deps.sites(tenantId),
    deps.settings(tenantId),
    deps.readySources(tenantId),
  ]);
  if (tenantName === undefined || sites.length === 0) {
    return [];
  }

  const written: WidgetSiteKey[] = [];
  for (const site of sites) {
    const siteKey = widgetSiteKeySchema.safeParse(site.siteKey);
    if (!siteKey.success) {
      // A row that fails the brand's regex is a bug upstream of here; skip it
      // loudly rather than write a KV entry the gate would refuse anyway.
      console.error("widget-config: site key in Neon does not match the schema", {
        tenantId,
        siteId: site.id,
      });
      continue;
    }
    const config = buildWidgetConfig(site, tenantName, settings, ready);
    await deps.kv.put(widgetConfigKvKey(siteKey.data), JSON.stringify(config));
    written.push(siteKey.data);
  }
  return written;
}

export function liveProjectionDeps(): ProjectionDeps {
  return {
    tenantName: async (tenantId) => (await withDb((db) => findTenantById(db, tenantId)))?.name,
    sites: (tenantId) => withDb((db) => listWidgetSites(db, tenantId)),
    settings: (tenantId) => withDb((db) => findWidgetSettings(db, tenantId)),
    readySources: (tenantId) => withDb((db) => countReadySources(db, tenantId)),
    kv: env.KV,
  };
}

/**
 * For callers whose own work must not fail because the projection did: a
 * stale scope line is not worth re-indexing a file over. Routes call
 * `projectWidgetConfig` directly and let a failure surface.
 */
export async function projectWidgetConfigQuietly(
  tenantId: TenantId,
  deps: ProjectionDeps,
): Promise<void> {
  try {
    await projectWidgetConfig(tenantId, deps);
  } catch (error) {
    console.error("widget-config: projection failed", { tenantId, error });
  }
}
