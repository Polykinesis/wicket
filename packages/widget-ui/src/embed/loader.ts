import type { WidgetPublicConfig } from "@cf-chat/shared/widget";
import { launcherLabel } from "../scope.ts";
import { brandInk } from "./brand.ts";
import type { MainMountOptions } from "./main.tsx";
import type { Mounted } from "./mount.tsx";

/**
 * The embed loader: the only script a customer's page loads on every view.
 *
 * It does three things and no more. It reads its site key and host from its
 * own `<script>` tag, fetches `/config` and draws a launcher pill in a shadow
 * root with the tenant's label and colour, and on the first click imports the
 * main bundle (React, the AI SDK, the panel) and hands it the host element and
 * the config it already has. ADR-015's cost argument lives here: the page pays
 * for a few KB until a visitor actually wants to talk.
 *
 * No zod, no React, no shared schema: the config is checked with `typeof`
 * because the schema would pull zod into every page view. The main bundle
 * trusts this check the way it would trust its own fetch.
 *
 * Replaced at build time with `{ main: "js/main-<hash>.js" }`.
 */
declare const __MANIFEST__: { readonly main: string };

const IDLE_PRELOAD_MS = 3000;

function findScript(): HTMLScriptElement | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement && current.dataset.siteKey) {
    return current;
  }
  return document.querySelector<HTMLScriptElement>("script[data-site-key]");
}

function isConfig(value: unknown): value is WidgetPublicConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as { turnstileSiteKey?: unknown; scope?: { tenantName?: unknown } };
  return typeof v.turnstileSiteKey === "string" && typeof v.scope?.tenantName === "string";
}

/** The pill, styled inline: the stylesheet arrives with the main bundle. */
function pillStyles(): string {
  return [
    ":host{all:initial;position:fixed;right:max(1.5rem,env(safe-area-inset-right));bottom:max(1.5rem,env(safe-area-inset-bottom));z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}",
    // The font is named on the button, not inherited: a host `* { font-family }`
    // rule matches the host element and beats `:host`, so `inherit` would be
    // the host page's serif.
    "button{all:initial;display:inline-flex;align-items:center;gap:.625rem;box-sizing:border-box;min-height:3rem;max-width:calc(100vw - 28px);padding:0 1.25rem 0 1rem;border-radius:9999px;background:var(--color-brand,#0f5c4d);color:var(--color-brand-ink,#fff);font:600 15px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;cursor:pointer;box-shadow:0 12px 40px rgb(15 30 25/.18),0 2px 6px rgb(15 30 25/.08)}",
    "button:focus-visible{outline:2px solid var(--color-brand,#0f5c4d);outline-offset:2px}",
    "button[aria-busy=true]{opacity:.7;cursor:progress}",
    "span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "svg{flex:none}",
    "@media (max-width:639px){:host{right:max(.875rem,env(safe-area-inset-right));bottom:max(.875rem,env(safe-area-inset-bottom))}button{font-size:14px}}",
  ].join("");
}

const ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/><path d="M8 13h8M8 17h5"/></svg>';

function boot(): void {
  const script = findScript();
  const siteKey = script?.dataset.siteKey;
  if (!script || !siteKey) {
    return;
  }
  const host = new URL(script.src, location.href).origin;
  const mainUrl = new URL(__MANIFEST__.main, `${host}/`).toString();

  const el = document.createElement("cf-chat-widget");
  document.body.append(el);

  let config: WidgetPublicConfig | null = null;
  let loading: Promise<{ mount(host: HTMLElement, options: MainMountOptions): Mounted }> | null =
    null;
  const load = () => {
    loading ??= import(/* @vite-ignore */ mainUrl);
    return loading;
  };

  fetch(`${host}/config?k=${encodeURIComponent(siteKey)}`)
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then((body: unknown) => {
      if (!isConfig(body)) {
        return;
      }
      config = body;
      if (config.brandColor) {
        el.style.setProperty("--color-brand", config.brandColor);
        el.style.setProperty("--color-brand-ink", brandInk(config.brandColor));
      }

      const shadow = el.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = pillStyles();
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-haspopup", "dialog");
      // The only markup set here is the constant icon above; the label, which
      // is tenant data, goes in as text.
      button.innerHTML = ICON;
      const label = document.createElement("span");
      label.textContent = launcherLabel(config.scope);
      button.append(label);
      shadow.append(style, button);

      button.addEventListener("click", () => {
        button.setAttribute("aria-busy", "true");
        button.disabled = true;
        load().then(
          (main) => {
            if (!config) {
              return;
            }
            // `mount` replaces the shadow root's children, so the pill goes
            // away and the panel takes its place, already open.
            main.mount(el, { siteKey, host, config, openOnMount: true });
          },
          () => {
            button.removeAttribute("aria-busy");
            button.disabled = false;
          },
        );
      });

      // Warm the cache for the main bundle once the page is idle, so the
      // first click is a mount, not a download. A preload hint, not an
      // import: nothing runs until someone asks.
      const preload = () => {
        const link = document.createElement("link");
        link.rel = "modulepreload";
        link.href = mainUrl;
        link.crossOrigin = "anonymous";
        document.head.append(link);
      };
      const schedule = (fn: () => void) =>
        "requestIdleCallback" in window
          ? window.requestIdleCallback(fn, { timeout: IDLE_PRELOAD_MS * 2 })
          : setTimeout(fn, IDLE_PRELOAD_MS);
      setTimeout(() => schedule(preload), IDLE_PRELOAD_MS);
    })
    .catch(() => {
      // A refused or unreachable config means no widget on this page. Quiet
      // by design: the host page is someone else's and this is not its error.
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
