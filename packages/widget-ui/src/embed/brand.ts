/**
 * Text colour for a tenant's brand colour. Stored nowhere: derived at mount
 * from the one hex the tenant chose, so the settings form has one field and
 * cannot be made unreadable.
 *
 * WCAG relative luminance against the theme's ink and white; the one with
 * more contrast wins. The threshold is where the two contrast ratios cross
 * for #17201d ink, not the folk 0.5.
 */
const INK = "#17201d";
const WHITE = "#ffffff";

export function brandInk(hex: string): string {
  const l = luminance(hex);
  const vsWhite = 1.05 / (l + 0.05);
  const vsInk = (l + 0.05) / (luminance(INK) + 0.05);
  return vsWhite >= vsInk ? WHITE : INK;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}
