/**
 * Make Tailwind's output work inside a shadow root.
 *
 * Browsers ignore `@property` rules in a shadow tree's stylesheet (confirmed
 * Chrome 156, Phase 0 harness). Tailwind v4 registers its `--tw-*` variables
 * that way and relies on their `initial-value`s: `border` sets
 * `border-style: var(--tw-border-style)`, `shadow-*` composes five variables,
 * gradients and transforms likewise. Unregistered, those variables are empty
 * and the declarations fall back to `none`. No borders, no shadows, no
 * spinner, no shimmer.
 *
 * Tailwind also emits a fallback for browsers without `@property`: a block in
 * `@layer properties` that sets every variable on `*, :before, :after,
 * ::backdrop`, gated behind an `@supports` test that only old Safari and
 * Firefox pass. This transform removes the gate so the fallback always
 * applies. Chosen over hoisting the `@property` rules into the host document
 * at mount, which would write 46 global registrations into a page we do not
 * own. The `@property` rules are left in place; they cost ~0.4 KB gzipped and
 * take over if a browser ever honours them in shadow trees.
 *
 * Lost in the trade: `syntax` typing (nothing animates these variables) and
 * `inherits: false` (moot when every element gets its own value). Tailwind
 * wrote the block as the equivalent for non-supporting browsers.
 *
 * Throws when the expected shape is missing, so a Tailwind upgrade that
 * changes it fails the build rather than shipping a widget with no borders.
 */

const LAYER_OPEN = "@layer properties{";
const SUPPORTS = "@supports";

export function unwrapPropertiesFallback(css: string): string {
  const layerAt = css.indexOf(LAYER_OPEN);
  if (layerAt === -1) {
    throw new Error("shadow-css: no `@layer properties` block in the stylesheet");
  }
  if (css.indexOf(LAYER_OPEN, layerAt + 1) !== -1) {
    throw new Error("shadow-css: more than one `@layer properties` block; expected exactly one");
  }

  const bodyAt = layerAt + LAYER_OPEN.length;
  const supportsAt = skipWhitespace(css, bodyAt);
  if (!css.startsWith(SUPPORTS, supportsAt)) {
    throw new Error("shadow-css: `@layer properties` does not open with `@supports`");
  }

  const braceAt = css.indexOf("{", supportsAt);
  if (braceAt === -1) {
    throw new Error("shadow-css: `@supports` has no block");
  }
  const closeAt = matchingBrace(css, braceAt);
  if (closeAt === -1) {
    throw new Error("shadow-css: unbalanced braces after `@supports`");
  }

  // Drop `@supports <condition>{` and its matching `}`; keep what was inside.
  return css.slice(0, supportsAt) + css.slice(braceAt + 1, closeAt) + css.slice(closeAt + 1);
}

/** How many `@property` registrations are in the stylesheet, for the log line. */
export function countPropertyRules(css: string): number {
  return css.match(/@property\s/g)?.length ?? 0;
}

function skipWhitespace(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text.charAt(i))) {
    i += 1;
  }
  return i;
}

/** Index of the `}` matching the `{` at `openAt`, or -1. Strings are not a concern in this block. */
function matchingBrace(text: string, openAt: number): number {
  let depth = 0;
  for (let i = openAt; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}
