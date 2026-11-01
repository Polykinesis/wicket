/// <reference types="node" />
/**
 * `node scripts/build.ts`: the two browser bundles.
 *
 * `js/main-<hash>.js` is React, the AI SDK and the panel, hashed so it can be
 * cached forever. `embed.js` is the loader: unhashed, short cache, and told
 * at build time which main file to import. The stylesheet is built first by
 * `build:css` and inlined into main as text.
 *
 * Hashed files sit under `js/` so one `_headers` rule in `apps/widget` can
 * give them CORS and immutable caching; `import()` across origins is a CORS
 * request even when the loader itself was a plain `<script src>`.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Metafile } from "esbuild";

const DIST = "dist";
const JS_DIR = join(DIST, "js");

rmSync(JS_DIR, { recursive: true, force: true });
rmSync(join(DIST, "embed.js"), { force: true });
rmSync(join(DIST, "embed.js.map"), { force: true });
mkdirSync(JS_DIR, { recursive: true });

const main = await build({
  entryPoints: { main: "src/embed/main.tsx" },
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  sourcemap: true,
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  outdir: DIST,
  entryNames: "js/[name]-[hash]",
  chunkNames: "js/chunk-[hash]",
  metafile: true,
  loader: { ".css": "text" },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
});

const mainFile = entryOutput(main.metafile, "src/embed/main.tsx");

await build({
  entryPoints: { embed: "src/embed/loader.ts" },
  bundle: true,
  format: "iife",
  minify: true,
  sourcemap: true,
  platform: "browser",
  target: ["es2020"],
  outdir: DIST,
  define: { __MANIFEST__: JSON.stringify({ main: mainFile }) },
  legalComments: "none",
});

const manifest = { main: mainFile, css: "widget.css", builtAt: new Date().toISOString() };
writeFileSync(join(DIST, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

for (const file of ["embed.js", ...readdirSync(JS_DIR).map((f) => `js/${f}`)]) {
  if (!file.endsWith(".js")) continue;
  const path = join(DIST, file);
  const raw = statSync(path).size;
  const gz = gzipSync(readFileSync(path)).length;
  console.log(`${file.padEnd(28)} ${kb(raw).padStart(9)} ${kb(gz).padStart(9)} gz`);
}

function entryOutput(metafile: Metafile, entryPoint: string): string {
  for (const [output, meta] of Object.entries(metafile.outputs)) {
    if (meta.entryPoint === entryPoint) {
      return output.replace(/^dist\//, "");
    }
  }
  throw new Error(`build: no output for ${entryPoint}`);
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
