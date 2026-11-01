import type { ReactElement, ReactNode } from "react";

/**
 * Places the widget on the host page. `Launcher` and `Panel` fill whatever box
 * they are given; this is the box.
 *
 * Floating only: a corner pill on desktop that opens into a fixed-size panel,
 * and a full-screen panel on phones. Inline placement (a docs page embedding
 * the panel permanently) is a known extension and deliberately absent: it
 * needs `open` forced on and `Panel` rendered without a Close button, which is
 * a `Widget` change no page asks for yet.
 *
 * Fixed positioning works from inside a shadow root as long as no ancestor of
 * the host element creates a containing block (`transform`, `filter`,
 * `contain: paint`). Hosts append the element to `body`, so that holds. The
 * box still competes in the host page's stacking context, hence the z-index:
 * the maximum, as embeds conventionally use, so a sticky site header does not
 * cover the panel.
 *
 * Corner offsets respect the safe area. `env()` resolves to zero unless the
 * host page opts in with `viewport-fit=cover`, and `max()` keeps the normal
 * margin in that case.
 */
export function Shell({
  open,
  children,
}: {
  readonly open: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return <div className={open ? PANEL_BOX : LAUNCHER_BOX}>{children}</div>;
}

const CORNER =
  "fixed right-[max(1.5rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[2147483647]";

/**
 * Desktop: 400px wide, 660px tall but never taller than the viewport less the
 * margins, entering with a short rise unless the visitor asked for no motion.
 * Phone: the whole viewport; `Panel` drops its radius and border at the same
 * breakpoint.
 */
const PANEL_BOX = `${CORNER} h-[min(660px,calc(100dvh-48px))] w-[400px] motion-safe:animate-rise max-sm:inset-0 max-sm:h-dvh max-sm:w-auto`;

/**
 * Shrink-wraps the launcher pill and caps it so a long label truncates rather
 * than overflowing a narrow viewport. Tighter corner margin on phones.
 */
const LAUNCHER_BOX = `${CORNER} max-w-[calc(100vw-28px)] max-sm:right-[max(0.875rem,env(safe-area-inset-right))] max-sm:bottom-[max(0.875rem,env(safe-area-inset-bottom))]`;
