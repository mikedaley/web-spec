/*
 * tape-persistence.js - Tape image persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createRecentItemsStore } from "../utils/recent-items-store.js";

const CACHE_STORE = "libraryCache";

const store = createRecentItemsStore({
  dbName: "zxspec-tape-persistence",
  storeName: "recentTapes",
  maxItems: 10,
  label: "tapes",
  additionalStores: [
    { name: CACHE_STORE, options: { keyPath: "id" } },
  ],
});

export const addToRecentTapes = (filename, data) => store.add(filename, data);
export const getRecentTapes = () => store.getList();
export const loadRecentTape = (id) => store.load(id);
export const loadRecentTapeByFilename = (filename) => store.loadByFilename(filename);
export const clearRecentTapes = () => store.clear();

/**
 * Fetch a library tape image with IndexedDB caching
 * @param {Object} entry - Library entry with id and file fields
 * @returns {Promise<Uint8Array>}
 */
export async function getLibraryTapeData(entry) {
  try {
    const cached = await store.db.get(CACHE_STORE, entry.id);
    if (cached) return new Uint8Array(cached.data);
  } catch (err) {
    console.warn("Library cache read failed:", err);
  }

  const resp = await fetch(`/tapes/${entry.file}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  try {
    await store.db.put(CACHE_STORE, {
      id: entry.id,
      file: entry.file,
      data: arrayBuffer,
    });
  } catch (err) {
    console.warn("Library cache write failed:", err);
  }

  return data;
}
