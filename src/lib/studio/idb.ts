import type { Piece } from "@/lib/studio/types";

const DB_NAME = "stave-studio";
const STORE = "kv";
const KEY = "piece";

export type SavedBuffer = {
  sampleRate: number;
  channels: ArrayBuffer[];
};

export type SavedPiece = {
  piece: Piece;
  buffers: Record<string, SavedBuffer>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open saved pieces"));
  });
}

export async function loadPiece(): Promise<SavedPiece | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as SavedPiece | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Could not read the piece"));
  });
}

export async function savePiece(data: SavedPiece): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save the piece"));
  });
}
