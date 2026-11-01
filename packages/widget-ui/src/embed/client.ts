import { err, ok, type Result } from "@cf-chat/shared/result";
import {
  type VisitorSession,
  visitorSessionSchema,
  type WidgetPublicConfig,
  widgetPublicConfigSchema,
} from "@cf-chat/shared/widget";
import type { SubmitHandoff } from "../handoff.ts";

/**
 * The HTTP half of talking to the widget Worker. An interface with a fixture,
 * so the hook and the components are tested without a network.
 *
 * `refused` is the gate's 403 and means stop; `network` is anything else that
 * went wrong on the wire and means retry; `malformed` is a 2xx whose body did
 * not match the contract, which is our own bug on one side or the other and is
 * treated like a network failure by the caller (a retry may land on a healthy
 * deployment) but logged so it is not mistaken for one.
 */
export type ClientError =
  | { readonly kind: "refused" }
  | { readonly kind: "network" }
  | { readonly kind: "malformed" };

export interface WidgetClient {
  fetchConfig(): Promise<Result<WidgetPublicConfig, ClientError>>;
  mintSession(turnstileToken: string): Promise<Result<VisitorSession, ClientError>>;
  readonly submitHandoff: SubmitHandoff;
  /** Where the chat socket connects, without the token. */
  socketUrl(): URL;
}

/**
 * `host` is the widget Worker's origin, e.g. `https://widget.example.com`,
 * taken from the loader script's own `src` so a self-hosted deployment needs
 * no configuration.
 */
export function httpClient(
  host: string,
  siteKey: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): WidgetClient {
  const url = (path: string): URL => {
    const u = new URL(path, host);
    u.searchParams.set("k", siteKey);
    return u;
  };

  return {
    async fetchConfig() {
      return request(fetchImpl, url("/config"), { method: "GET" }, widgetPublicConfigSchema);
    },
    async mintSession(turnstileToken) {
      return request(
        fetchImpl,
        url("/session"),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ turnstileToken }),
        },
        visitorSessionSchema,
      );
    },
    // The handoff route does not exist yet (plan.md, after Phase 4). Until it
    // does, the form's existing "did not send" path is what the visitor sees.
    submitHandoff: async () => err({ kind: "unavailable" }),
    socketUrl() {
      const u = url("/chat");
      u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
      return u;
    },
  };
}

async function request<T>(
  fetchImpl: typeof fetch,
  url: URL,
  init: RequestInit,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): Promise<Result<T, ClientError>> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    return err({ kind: "network" });
  }
  if (response.status === 403) {
    return err({ kind: "refused" });
  }
  if (!response.ok) {
    return err({ kind: "network" });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err({ kind: "malformed" });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.warn("widget: response did not match the contract", url.pathname);
    return err({ kind: "malformed" });
  }
  return ok(parsed.data);
}

/** For tests and the preview. Every method can be overridden; defaults succeed. */
export function fixtureClient(
  overrides: Partial<WidgetClient> & { readonly config?: WidgetPublicConfig } = {},
): WidgetClient {
  const config: WidgetPublicConfig = overrides.config ?? {
    turnstileSiteKey: "0x-fixture",
    scope: { tenantName: "Acme" },
  };
  return {
    fetchConfig: async () => ok(config),
    mintSession: async () =>
      ok({
        token: "fixture-token",
        conversationId: visitorSessionSchema.shape.conversationId.parse(crypto.randomUUID()),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    submitHandoff: async (input) => ok({ reference: "NR-4F2K", email: input.email }),
    socketUrl: () => new URL("wss://widget.example.com/chat?k=fixture"),
    ...overrides,
  };
}
