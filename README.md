# Mermade

A fast, private Mermaid diagram editor that runs entirely in your browser. There's no server and no account, and nothing you draw leaves your machine unless you share it.

## Features

- **Editor:** CodeMirror 6 with Mermaid syntax highlighting, keyword autocomplete, find/replace, folding, multi-cursor and undo history per diagram.
- **Live preview:** re-renders as you type. Syntax errors are underlined on the offending line, and the last good render stays visible while you fix them.
- **Preview controls:** pan by dragging or scrolling, zoom with Ctrl/⌘ + scroll or the + / − / 0 / 1 keys, fit to screen, and fullscreen.
- **Diagram library:** create, rename, duplicate, search and delete diagrams. Deleting can be undone. Everything autosaves to IndexedDB and stays in sync across open tabs.
- **Templates:** flowchart, sequence, class, state, ER, Gantt, pie, mindmap, timeline, user journey, git graph, quadrant and XY chart, each shown with a live thumbnail.
- **Import** from the file picker, by dragging files anywhere onto the window, or by pasting:
  - `.mmd` / `.mermaid` / `.txt` files
  - Markdown (`.md`): every ` ```mermaid ` block becomes its own diagram
  - SVGs exported from Mermade, which embed their source
  - `.json` backups
  - share links, including **mermaid.live** `#pako:` links
- **Export:**
  - PNG at 1–4× with a transparent, white or dark background
  - SVG, which embeds its source so you can re-import and edit it
  - copy PNG or SVG to the clipboard
  - `.mmd` or Markdown, as a download or copied
  - share links. The whole diagram is stored in the URL, in the same format mermaid.live uses.
  - a JSON backup of all diagrams
- **Themes:** the Mermaid themes plus an "auto" theme that follows the app, a classic or hand-drawn look, and a light, dark or system app theme.
- **Responsive:** on phones, you switch between Code and Preview with tabs.

## Development

Requires [Bun](https://bun.sh) ≥ 1.2.

```sh
bun install
bun run dev        # dev server with hot reload
bun test           # unit tests
bun run typecheck
bun run build      # static production build → dist/
bun run preview    # serve dist/ at http://localhost:4173/mermade/ (like GitHub Pages)
```

Stack: Bun (bundler, dev server, test runner), React 19, Tailwind CSS 4, CodeMirror 6 and Mermaid. Mermaid is lazy-loaded, so the editor appears before the renderer finishes downloading.

## Deploying to GitHub Pages

The build emits only relative URLs, so `dist/` works from any sub-path such as `https://<user>.github.io/<repo>/`. You don't need to configure a base path.

1. In the repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
2. Push to `main`, or run the **Deploy to GitHub Pages** workflow by hand from the Actions tab.

`.github/workflows/deploy.yml` type-checks, tests, builds and publishes `dist/`. A separate CI workflow runs the same checks on pull requests and other branches.

To host it somewhere else, upload the contents of `dist/` to any static file host.

## Project layout

```
index.html                 entry (Bun HTML bundling)
src/App.tsx                app shell: layout, state, actions, shortcuts
src/components/            Editor, Preview, Sidebar, dialogs, menus, UI primitives
src/lib/storage.ts         IndexedDB persistence + cross-tab sync + settings
src/lib/render.ts          serialized Mermaid rendering
src/lib/importer.ts        file / markdown / link import
src/lib/exporter.ts        SVG/PNG/Markdown export helpers
src/lib/share.ts           mermaid.live-compatible share links
scripts/build.ts           production build
tests/                     bun test suites
```
