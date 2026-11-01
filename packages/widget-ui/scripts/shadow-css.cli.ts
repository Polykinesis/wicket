/// <reference types="node" />
/**
 * `node scripts/shadow-css.cli.ts <file.css>`: rewrite a Tailwind build in
 * place so it works inside a shadow root. See `shadow-css.ts` for why.
 *
 * The only file in this package that touches Node. The widget itself is
 * browser code and its tsconfig excludes Node types on purpose; the reference
 * above scopes them to this entry point.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { countPropertyRules, unwrapPropertiesFallback } from "./shadow-css.ts";

const file = process.argv[2];
if (file === undefined) {
  console.error("usage: node scripts/shadow-css.cli.ts <file.css>");
  process.exit(2);
}

const before = readFileSync(file, "utf8");
const after = unwrapPropertiesFallback(before);
writeFileSync(file, after);
console.log(
  `shadow-css: ${file} ${before.length} -> ${after.length} bytes, ` +
    `${countPropertyRules(after)} @property rule(s) left in place, fallback ungated`,
);
