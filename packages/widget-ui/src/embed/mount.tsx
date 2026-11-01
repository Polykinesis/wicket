import type { WidgetPublicConfig } from "@cf-chat/shared/widget";
import { type ReactElement, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LauncherVariant } from "../components/Panel.tsx";
import { Widget } from "../Widget.tsx";
import { brandInk } from "./brand.ts";
import { httpClient, type WidgetClient } from "./client.ts";
import { connectionView } from "./connection.ts";
import { Shell } from "./Shell.tsx";
import { type SessionStore, sessionStore } from "./session.ts";
import { ScriptTurnstile, type TurnstileChallenge } from "./turnstile.ts";
import { useNow } from "./useNow.ts";
import { useWidgetChat } from "./useWidgetChat.ts";

export interface MountOptions {
  readonly siteKey: string;
  /** The widget Worker's origin, e.g. `https://widget.example.com`. */
  readonly host: string;
  /** The compiled stylesheet, as text. Injected, never fetched. */
  readonly css: string;
  readonly launcher?: LauncherVariant;
  /**
   * Config the loader fetched to draw its own launcher before React arrived.
   * Passing it means the widget renders on the first frame and `/config` is
   * not requested twice.
   */
  readonly config?: WidgetPublicConfig;
  /**
   * Open the panel and start connecting as soon as it renders. The loader
   * sets this: the visitor clicked its pill, and this mount is the response.
   */
  readonly openOnMount?: boolean;
  /** Overrides for tests and the preview. Defaults talk to `host`. */
  readonly client?: WidgetClient;
  readonly turnstile?: TurnstileChallenge;
  readonly store?: SessionStore;
}

export interface Mounted {
  unmount(): void;
}

/**
 * Attach the widget to a host element on someone else's page.
 *
 * The UI renders in an open shadow root so the host's CSS and ours never
 * meet (see `.widget-root` in styles.css for the one place they still can).
 * The stylesheet goes in as a constructed sheet where the browser allows,
 * which a host `style-src` CSP does not govern; a `<style>` element is the
 * fallback. Turnstile renders into a light-DOM child of the host, not into
 * the shadow root, because its behaviour there is unverified and a plain div
 * beside the root sidesteps the question.
 */
export function mountWidget(hostEl: HTMLElement, options: MountOptions): Mounted {
  const shadow = hostEl.shadowRoot ?? hostEl.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  adoptStyles(shadow, options.css);

  const container = document.createElement("div");
  container.className = "widget-root";
  shadow.append(container);

  const turnstileContainer = document.createElement("div");
  turnstileContainer.setAttribute("data-cf-chat", "turnstile");
  // Fixed in the widget's corner, above the launcher, so an interactive
  // challenge appears next to the thing that asked for it.
  turnstileContainer.style.cssText =
    "position:fixed;right:max(1.5rem,env(safe-area-inset-right));bottom:6rem;z-index:2147483647;";
  hostEl.append(turnstileContainer);

  const client = options.client ?? httpClient(options.host, options.siteKey);
  const turnstile = options.turnstile ?? new ScriptTurnstile();
  const store = options.store ?? sessionStore(options.siteKey);

  const root = createRoot(container);
  root.render(
    <StrictMode>
      <WidgetApp
        siteKey={options.siteKey}
        client={client}
        turnstile={turnstile}
        store={store}
        turnstileContainer={turnstileContainer}
        launcher={options.launcher ?? "labelled"}
        initialConfig={options.config}
        openOnMount={options.openOnMount ?? false}
        hostEl={hostEl}
      />
    </StrictMode>,
  );

  return {
    unmount() {
      root.unmount();
      turnstileContainer.remove();
      shadow.replaceChildren();
      hostEl.style.removeProperty("--color-brand");
      hostEl.style.removeProperty("--color-brand-ink");
    },
  };
}

function adoptStyles(shadow: ShadowRoot, css: string): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement("style");
    style.textContent = css;
    shadow.append(style);
  }
}

function WidgetApp({
  siteKey,
  client,
  turnstile,
  store,
  turnstileContainer,
  launcher,
  initialConfig,
  openOnMount,
  hostEl,
}: {
  readonly siteKey: string;
  readonly client: WidgetClient;
  readonly turnstile: TurnstileChallenge;
  readonly store: SessionStore;
  readonly turnstileContainer: HTMLElement;
  readonly launcher: LauncherVariant;
  readonly initialConfig: WidgetPublicConfig | undefined;
  readonly openOnMount: boolean;
  readonly hostEl: HTMLElement;
}): ReactElement | null {
  const chat = useWidgetChat({
    siteKey,
    client,
    turnstile,
    store,
    turnstileContainer: () => turnstileContainer,
    initialConfig,
  });
  const [open, setOpen] = useState(openOnMount);
  const now = useNow();
  const config = chat.connection.config;

  // The loader's pill was clicked before React existed; honour that click.
  const openChat = chat.open;
  useEffect(() => {
    if (openOnMount) {
      openChat();
    }
  }, [openOnMount, openChat]);

  // The brand colour goes on the host element, where it beats the theme's
  // `:root, :host` default and inherits into the shadow tree.
  const brand = config?.brandColor;
  useEffect(() => {
    if (brand) {
      hostEl.style.setProperty("--color-brand", brand);
      hostEl.style.setProperty("--color-brand-ink", brandInk(brand));
    }
  }, [brand, hostEl]);

  if (!config) {
    // Nothing until config says what the widget is. A refused site key never
    // renders at all, which is the right outcome for a copied snippet.
    return null;
  }

  return (
    <Shell open={open}>
      <Widget
        scope={config.scope}
        turns={chat.turns}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            chat.open();
          }
        }}
        onAsk={chat.ask}
        onSubmitHandoff={client.submitHandoff}
        launcher={launcher}
        connection={connectionView(chat.connection)}
        page={chat.page}
        now={now}
      />
    </Shell>
  );
}
