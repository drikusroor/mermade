/**
 * Serve ./dist under a sub-path, mimicking GitHub Pages project sites.
 *   bun run preview            → http://localhost:4173/mermade/
 *   BASE=/ bun run preview     → http://localhost:4173/
 */
import { join, normalize } from "node:path";

const base = (process.env.BASE ?? "/mermade/").replace(/\/?$/, "/");
const port = Number(process.env.PORT ?? 4173);
const root = join(import.meta.dir, "..", "dist");

Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === base.slice(0, -1)) return Response.redirect(base, 301);
    if (!pathname.startsWith(base)) return new Response("Not found", { status: 404 });
    const rel = normalize(decodeURIComponent(pathname.slice(base.length)) || "index.html");
    if (rel.startsWith("..")) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(join(root, rel));
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});

console.log(`Previewing dist/ at http://localhost:${port}${base}`);
