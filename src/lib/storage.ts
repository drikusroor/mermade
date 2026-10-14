import type { Diagram } from "./diagram";
import { DEFAULT_DESIGN, type Design, type Palette } from "./design";

/**
 * Diagrams live in IndexedDB (falls back to memory when unavailable, e.g. some private modes).
 * Writes are broadcast to other open tabs so they stay in sync.
 */

const DB_NAME = "mermade";
const STORE = "diagrams";

type SyncMessage = { type: "put"; diagram: Diagram } | { type: "delete"; id: string };

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, Diagram>();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("mermade-sync") : null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function loadDiagrams(): Promise<Diagram[]> {
  const db = await openDb();
  const all = db ? await tx<Diagram[]>(db, "readonly", (s) => s.getAll()) : [...memory.values()];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveDiagrams(diagrams: Diagram[]): Promise<void> {
  if (!diagrams.length) return;
  const db = await openDb();
  if (db) await tx(db, "readwrite", (s) => void diagrams.forEach((d) => s.put(d)));
  else diagrams.forEach((d) => memory.set(d.id, d));
  for (const d of diagrams) channel?.postMessage({ type: "put", diagram: d } satisfies SyncMessage);
}

export async function deleteDiagram(id: string): Promise<void> {
  const db = await openDb();
  if (db) await tx(db, "readwrite", (s) => s.delete(id));
  else memory.delete(id);
  channel?.postMessage({ type: "delete", id } satisfies SyncMessage);
}

export function subscribeToSync(handler: (msg: SyncMessage) => void): () => void {
  if (!channel) return () => {};
  const listener = (e: MessageEvent<SyncMessage>) => handler(e.data);
  channel.addEventListener("message", listener);
  return () => channel.removeEventListener("message", listener);
}

/* ---------- settings (small, synchronous, localStorage) ---------- */

export interface Settings {
  activeId: string | null;
  appTheme: "system" | "light" | "dark";
  layout: "split" | "editor" | "preview";
  splitRatio: number;
  sidebarOpen: boolean;
  pngScale: number;
  background: "transparent" | "white" | "dark" | "theme";
  /** Design for new diagrams (and existing ones without their own). */
  defaultDesign: Design;
  customPalettes: Palette[];
}

export const DEFAULT_SETTINGS: Settings = {
  activeId: null,
  appTheme: "system",
  layout: "split",
  splitRatio: 0.38,
  sidebarOpen: true,
  pngScale: 2,
  background: "theme",
  defaultDesign: DEFAULT_DESIGN,
  customPalettes: [],
};

const SETTINGS_KEY = "mermade:settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed, defaultDesign: { ...DEFAULT_DESIGN, ...parsed.defaultDesign } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage full or blocked — settings just won't persist */
  }
}
