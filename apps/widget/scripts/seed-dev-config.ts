/// <reference types="node" />
/**
 * Seed the local widget KV with one dev site key so the test host can embed.
 *
 *   TENANT_ID=<uuid of a tenant with indexed sources> pnpm seed:dev
 *
 * Writes into this package's local `wrangler dev` state. The dashboard's
 * projection writes into `app`'s own local state in Vite, which is a
 * different store, so for local end-to-end this is the way the widget learns
 * about a site. Production never uses this: `projectWidgetConfig` does.
 *
 * The site key is fixed so `test-host/index.html` can hard-code it. The
 * Turnstile key is Cloudflare's always-passes test key, which the widget
 * Worker's `.dev.vars` TURNSTILE_SECRET_KEY must pair with
 * (1x0000000000000000000000000000000AA).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const siteKey = "wk_00000000000000000000000000000001";
const tenantId = process.env.TENANT_ID || randomUUID();
const origins = (process.env.ORIGINS ?? "http://127.0.0.1:8790,http://localhost:8790").split(",");

const config = {
  tenantId,
  origins,
  turnstileSiteKey: "1x00000000000000000000AA",
  scope: {
    tenantName: process.env.TENANT_NAME ?? "Northwind Rota",
    documentCount: 42,
    updatedAt: new Date().toISOString(),
    topics: ["Pricing", "Setup", "Refunds"],
    suggestedQuestions: ["Can I pause my subscription over summer?"],
    ownerName: "Sam",
    replyTime: "within 4 hours",
  },
  brandColor: "#0f5c4d",
};

execFileSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "kv",
    "key",
    "put",
    "--local",
    "--binding",
    "KV",
    `widget:${siteKey}`,
    JSON.stringify(config),
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);

console.log(`seeded ${siteKey} for tenant ${tenantId} with origins ${origins.join(", ")}`);
if (!process.env.TENANT_ID) {
  console.log("TENANT_ID was not set: the gates will work but retrieval finds nothing.");
}
