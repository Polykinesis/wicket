import { env } from "cloudflare:workers";
import {
  deleteWidgetSite,
  findWidgetSettings,
  insertWidgetSite,
  listWidgetSites,
  updateWidgetSiteOrigins,
  upsertWidgetSettings,
  withTenant,
} from "@cf-chat/db";
import type { WidgetSettingsRow, WidgetSiteRow } from "@cf-chat/db/schema";
import {
  AppError,
  brandColorSchema,
  newWidgetSiteKey,
  type TenantId,
  widgetConfigKvKey,
  widgetScopeSchema,
  widgetSiteKeySchema,
} from "@cf-chat/shared";
import { Hono } from "hono";
import { z } from "zod";
import { liveProjectionDeps, projectWidgetConfig } from "../../widget-config.ts";
import { withDb } from "../db.ts";
import { requireSession, type SessionVariables } from "../middleware/session.ts";
import { parseBody } from "../validation.ts";

const widget = new Hono<{ Variables: SessionVariables }>();

/**
 * Dashboard side of the widget: what it says about itself and which sites may
 * embed it. Every write goes to Neon inside `withTenant` and then rebuilds the
 * KV projection; nothing here reads KV back (CLAUDE.md), so the response is
 * what Neon returned.
 */

function activeTenant(tenantId: TenantId | null): TenantId {
  if (!tenantId) {
    throw new AppError("forbidden", "Select a workspace before configuring the widget");
  }
  return tenantId;
}

/**
 * An origin, normalised to `scheme://host[:port]` so the gate's `===` compare
 * has one spelling to match. A path or query is dropped rather than refused,
 * since pasting a page URL is the common mistake. Plain http is only for local
 * development hosts; everywhere else a widget on an http page would be sending
 * its visitor token in the clear.
 */
const originInput = z
  .string()
  .trim()
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: "custom", message: `${value} is not a URL` });
      return z.NEVER;
    }
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
      ctx.addIssue({ code: "custom", message: `${value} must be https (http only for localhost)` });
      return z.NEVER;
    }
    return url.origin;
  });

const originsInput = z
  .array(originInput)
  .min(1, "Add at least one origin")
  .max(50)
  .transform((origins) => [...new Set(origins)]);

/** Same limits as the scope the widget renders, so a saved value always projects. */
const scope = widgetScopeSchema.shape;
const settingsInput = z.object({
  ownerName: scope.ownerName.unwrap().nullable(),
  replyTime: scope.replyTime.unwrap().nullable(),
  topics: scope.topics.unwrap().nullable(),
  suggestedQuestions: scope.suggestedQuestions.unwrap().nullable(),
  brandColor: brandColorSchema.nullable(),
});

const newSiteInput = z.object({
  origins: originsInput,
  turnstileSiteKey: z.string().trim().min(1).max(100),
});

const siteOriginsInput = z.object({ origins: originsInput });

function siteKeyParam(raw: string) {
  const parsed = widgetSiteKeySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("not_found", "No such site key");
  }
  return parsed.data;
}

function toSettings(row: WidgetSettingsRow | undefined) {
  return row
    ? {
        ownerName: row.ownerName,
        replyTime: row.replyTime,
        topics: row.topics,
        suggestedQuestions: row.suggestedQuestions,
        brandColor: row.brandColor,
        updatedAt: row.updatedAt.toISOString(),
      }
    : null;
}

function toSite(row: WidgetSiteRow) {
  return {
    siteKey: row.siteKey,
    origins: row.origins,
    turnstileSiteKey: row.turnstileSiteKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function project(tenantId: TenantId): Promise<void> {
  await projectWidgetConfig(tenantId, liveProjectionDeps());
}

widget.get("/", requireSession, async (c) => {
  const tenantId = activeTenant(c.get("session").tenantId);
  const [settings, sites] = await withDb((db) =>
    Promise.all([findWidgetSettings(db, tenantId), listWidgetSites(db, tenantId)]),
  );
  return c.json({ settings: toSettings(settings), sites: sites.map(toSite) });
});

widget.put("/settings", requireSession, async (c) => {
  const tenantId = activeTenant(c.get("session").tenantId);
  const input = await parseBody(c, settingsInput);
  const row = await withDb((db) =>
    withTenant(db, tenantId, (tx) => upsertWidgetSettings(tx, tenantId, input)),
  );
  await project(tenantId);
  return c.json({ settings: toSettings(row) });
});

widget.post("/sites", requireSession, async (c) => {
  const tenantId = activeTenant(c.get("session").tenantId);
  const input = await parseBody(c, newSiteInput);
  const row = await withDb((db) =>
    withTenant(db, tenantId, (tx) =>
      insertWidgetSite(tx, tenantId, {
        id: crypto.randomUUID(),
        siteKey: newWidgetSiteKey(),
        origins: input.origins,
        turnstileSiteKey: input.turnstileSiteKey,
      }),
    ),
  );
  await project(tenantId);
  return c.json({ site: toSite(row) }, 201);
});

widget.put("/sites/:siteKey", requireSession, async (c) => {
  const tenantId = activeTenant(c.get("session").tenantId);
  const siteKey = siteKeyParam(c.req.param("siteKey"));
  const input = await parseBody(c, siteOriginsInput);
  const row = await withDb((db) =>
    withTenant(db, tenantId, (tx) => updateWidgetSiteOrigins(tx, tenantId, siteKey, input.origins)),
  );
  if (!row) {
    throw new AppError("not_found", "No such site key");
  }
  await project(tenantId);
  return c.json({ site: toSite(row) });
});

/**
 * The one place the projection is removed rather than rebuilt: the row is
 * gone, so `projectWidgetConfig` cannot know the key existed. Neon first, then
 * KV, so a KV failure leaves a stale entry that the next projection cannot fix
 * but that still only admits origins the tenant once allowed.
 */
widget.delete("/sites/:siteKey", requireSession, async (c) => {
  const tenantId = activeTenant(c.get("session").tenantId);
  const siteKey = siteKeyParam(c.req.param("siteKey"));
  const removed = await withDb((db) =>
    withTenant(db, tenantId, (tx) => deleteWidgetSite(tx, tenantId, siteKey)),
  );
  if (!removed) {
    throw new AppError("not_found", "No such site key");
  }
  await env.KV.delete(widgetConfigKvKey(siteKey));
  return c.body(null, 204);
});

export default widget;
