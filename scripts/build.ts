/**
 * Production build → ./dist (static files, relative URLs).
 * The output works from any sub-path, e.g. https://<user>.github.io/<repo>/.
 */
import tailwind from "bun-plugin-tailwind";
import { rm, writeFile } from "node:fs/promises";

const outdir = "dist";
await rm(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir,
  plugins: [tailwind],
  minify: true,
  splitting: true,
  sourcemap: process.env.SOURCEMAP ? "linked" : "none",
  target: "browser",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Keep GitHub Pages from running Jekyll over the output.
await writeFile(`${outdir}/.nojekyll`, "");

let total = 0;
for (const o of result.outputs) total += o.size;
console.log(`Built ${result.outputs.length} files (${(total / 1024 / 1024).toFixed(2)} MB) → ${outdir}/`);
