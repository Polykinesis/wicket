import { describe, expect, it } from "vitest";
import { countPropertyRules, unwrapPropertiesFallback } from "../scripts/shadow-css.ts";

const FALLBACK =
  "*,:before,:after,::backdrop{--tw-border-style:solid;--tw-shadow:0 0 #0000;--tw-gradient-from:#0000}";

/** Tailwind v4's shape, minified: the layer, the gated fallback, then more layers. */
const tailwind = (condition = "(((-webkit-hyphens:none)) and (not (margin-trim:inline)))") =>
  `@layer properties,theme;@layer properties{@supports ${condition}{${FALLBACK}}}@layer theme{:root,:host{--color-brand:#0f5c4d}}.border{border-style:var(--tw-border-style)}`;

describe("unwrapPropertiesFallback", () => {
  it("removes the @supports gate and keeps everything else byte for byte", () => {
    const out = unwrapPropertiesFallback(tailwind());
    expect(out).toBe(
      `@layer properties,theme;@layer properties{${FALLBACK}}@layer theme{:root,:host{--color-brand:#0f5c4d}}.border{border-style:var(--tw-border-style)}`,
    );
  });

  it("copes with parentheses and nested braces inside the condition and block", () => {
    const condition = "((a:b) and (not (color:rgb(from red r g b)))) or (c:d)";
    const out = unwrapPropertiesFallback(tailwind(condition));
    expect(out).not.toContain("@supports");
    expect(out).toContain(`@layer properties{${FALLBACK}}`);
  });

  it("tolerates whitespace between the layer brace and @supports", () => {
    const css = `@layer properties{\n  @supports (x:y) {${FALLBACK}}\n}`;
    expect(unwrapPropertiesFallback(css)).toBe(`@layer properties{\n  ${FALLBACK}\n}`);
  });

  it("is idempotent only by refusing a second pass", () => {
    // Running it twice would silently do nothing useful; the second pass must
    // say the shape is wrong rather than pretend.
    const once = unwrapPropertiesFallback(tailwind());
    expect(() => unwrapPropertiesFallback(once)).toThrow(/does not open with `@supports`/);
  });

  it("fails loudly when Tailwind's shape is not there", () => {
    expect(() => unwrapPropertiesFallback(".a{color:red}")).toThrow(/no `@layer properties`/);
    expect(() => unwrapPropertiesFallback(`${tailwind()}@layer properties{}`)).toThrow(
      /more than one/,
    );
    expect(() => unwrapPropertiesFallback("@layer properties{@supports (a:b)")).toThrow(/no block/);
    expect(() => unwrapPropertiesFallback("@layer properties{@supports (a:b){*{a:b}")).toThrow(
      /unbalanced/,
    );
  });
});

describe("countPropertyRules", () => {
  it("counts registrations, not mentions in values", () => {
    expect(countPropertyRules("@property --a{syntax:'*'}@property --b{syntax:'*'}")).toBe(2);
    expect(countPropertyRules(".x{content:'@property'}")).toBe(0);
  });
});
