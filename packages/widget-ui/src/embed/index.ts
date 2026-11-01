/**
 * The main bundle's entry: everything the loader needs to put the widget on
 * a page. The loader itself (Phase 4) stays tiny and imports this lazily.
 */
export { type ClientError, fixtureClient, httpClient, type WidgetClient } from "./client.ts";
export { type ConnectionState, type ConnectionView, connectionView } from "./connection.ts";
export { type Mounted, type MountOptions, mountWidget } from "./mount.tsx";
export { Shell } from "./Shell.tsx";
export { FixtureTurnstile, ScriptTurnstile, type TurnstileChallenge } from "./turnstile.ts";
