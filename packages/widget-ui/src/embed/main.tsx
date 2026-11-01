/**
 * The main bundle's entry, loaded by `loader.ts` on first open. Carries the
 * compiled stylesheet as text (esbuild's `text` loader on the CSS built by
 * `build:css`) so mounting needs no second request.
 */
import css from "../../dist/widget.css?raw";
import { type Mounted, type MountOptions, mountWidget } from "./mount.tsx";

export type MainMountOptions = Omit<MountOptions, "css">;

export function mount(host: HTMLElement, options: MainMountOptions): Mounted {
  return mountWidget(host, { ...options, css });
}
