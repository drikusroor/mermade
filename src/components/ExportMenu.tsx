import { ChevronDown, Code2, Copy, Download, FileCode, FileImage, FileText, Image, Archive, Link } from "lucide-react";
import type { ExportBackground } from "../lib/exporter";
import { Button, Menu, MenuItem, MenuLabel, MenuSeparator, Segmented } from "./ui";

export type ExportAction =
  | "svg"
  | "png"
  | "copy-png"
  | "copy-svg"
  | "mmd"
  | "md"
  | "copy-md"
  | "copy-link"
  | "backup";

export function ExportMenu({
  onExport,
  pngScale,
  setPngScale,
  background,
  setBackground,
  disabled,
}: {
  onExport: (a: ExportAction) => void;
  pngScale: number;
  setPngScale: (n: number) => void;
  background: ExportBackground;
  setBackground: (b: ExportBackground) => void;
  disabled: boolean;
}) {
  return (
    <Menu
      width="w-72"
      trigger={({ toggle, open }) => (
        <Button variant="primary" onClick={toggle} title="Export (Ctrl+Shift+E)">
          <Download className="size-4" />
          <span className="hidden sm:inline">Export</span>
          <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      )}
    >
      {(close) => {
        const run = (a: ExportAction) => () => {
          close();
          onExport(a);
        };
        return (
          <>
            <MenuLabel>Image</MenuLabel>
            <div className="flex flex-col gap-1.5 px-2.5 pb-2 pt-0.5">
              <div className="flex items-center gap-2">
                <span className="w-20 text-xs text-zinc-500">Background</span>
                <div className="flex-1">
                  <Segmented
                    label="Background"
                    value={background}
                    onChange={setBackground}
                    options={[
                      { value: "theme", label: "Theme" },
                      { value: "transparent", label: "None" },
                      { value: "white", label: "White" },
                      { value: "dark", label: "Dark" },
                    ]}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-xs text-zinc-500">PNG scale</span>
                <div className="flex-1">
                  <Segmented
                    label="PNG scale"
                    value={pngScale}
                    onChange={setPngScale}
                    options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n}×` }))}
                  />
                </div>
              </div>
            </div>
            {disabled && (
              <p className="px-2.5 pb-1 text-xs text-amber-600 dark:text-amber-400">Fix the syntax error to export images.</p>
            )}
            <div className={disabled ? "pointer-events-none opacity-40" : ""}>
              <MenuItem icon={<FileImage className="size-4" />} onClick={run("png")} hint="PNG">
                Download PNG
              </MenuItem>
              <MenuItem icon={<Image className="size-4" />} onClick={run("svg")} hint="SVG">
                Download SVG
              </MenuItem>
              <MenuItem icon={<Copy className="size-4" />} onClick={run("copy-png")}>
                Copy PNG to clipboard
              </MenuItem>
              <MenuItem icon={<Code2 className="size-4" />} onClick={run("copy-svg")}>
                Copy SVG markup
              </MenuItem>
            </div>
            <MenuSeparator />
            <MenuLabel>Source</MenuLabel>
            <MenuItem icon={<FileCode className="size-4" />} onClick={run("mmd")} hint=".mmd">
              Download Mermaid file
            </MenuItem>
            <MenuItem icon={<FileText className="size-4" />} onClick={run("md")} hint=".md">
              Download Markdown
            </MenuItem>
            <MenuItem icon={<Copy className="size-4" />} onClick={run("copy-md")}>
              Copy as Markdown
            </MenuItem>
            <MenuItem icon={<Link className="size-4" />} onClick={run("copy-link")}>
              Copy share link
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Archive className="size-4" />} onClick={run("backup")} hint=".json">
              Back up all diagrams
            </MenuItem>
          </>
        );
      }}
    </Menu>
  );
}
