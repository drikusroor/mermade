import { useState } from "react";
import { FileUp, ClipboardPaste } from "lucide-react";
import { ACCEPTED_FILE_TYPES } from "../lib/importer";
import { Button, Modal } from "./ui";

export function ImportDialog({
  open,
  onClose,
  onFiles,
  onText,
}: {
  open: boolean;
  onClose: () => void;
  onFiles: (files: File[]) => void;
  onText: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [over, setOver] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title="Import diagrams">
      <div className="flex flex-col gap-5">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOver(false);
            onFiles([...e.dataTransfer.files]);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            over
              ? "border-cyan-600 bg-cyan-50 dark:bg-cyan-950/40"
              : "border-zinc-300 hover:border-cyan-600 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
          }`}
        >
          <FileUp className="size-7 text-cyan-700 dark:text-cyan-500" />
          <span className="text-sm font-medium">Drop files here or click to browse</span>
          <span className="text-xs text-zinc-500">
            .mmd · .mermaid · .md (every ```mermaid block) · .svg exported by Mermade · .json backup
          </span>
          <input
            type="file"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            className="sr-only"
            onChange={(e) => {
              onFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </label>

        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onText(text)) setText("");
          }}
        >
          <label htmlFor="import-text" className="text-sm font-medium">
            …or paste code, Markdown, or a share link
          </label>
          <textarea
            id="import-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"flowchart LR\n    A --> B\n\nhttps://mermaid.live/edit#pako:…"}
            className="w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  setText(await navigator.clipboard.readText());
                } catch {
                  /* clipboard read denied — user can paste manually */
                }
              }}
            >
              <ClipboardPaste className="size-4" /> Paste from clipboard
            </Button>
            <Button type="submit" variant="primary" disabled={!text.trim()}>
              Import
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
