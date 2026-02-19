/*
 * tape-persistence.js - Tape image persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "zxspec-tape-persistence";
const DB_VERSION = 1;
const RECENT_STORE = "recentTapes";
const CACHE_STORE = "libraryCache";
const MAX_RECENT_TAPES = 10;

const db = createDatabaseManager({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (event) => {
    const database = event.target.result;

    if (!database.objectStoreNames.contains(RECENT_STORE)) {
      const store = database.createObjectStore(RECENT_STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("filename", "filename", { unique: false });
      store.createIndex("accessedAt", "accessedAt", { unique: false });
    }

    if (!database.objectStoreNames.contains(CACHE_STORE)) {
      database.createObjectStore(CACHE_STORE, { keyPath: "id" });
    }
  },
});

/**
 * Find a recent tape by filename
 * @param {string} filename
 * @returns {Promise<number|null>} The record ID or null
 */
async function findRecentByFilename(filename) {
  let foundId = null;

  await db.iterate(
    RECENT_STORE,
    { indexName: "filename", range: IDBKeyRange.only(filename) },
    (value, cursor) => {
      foundId = cursor.primaryKey;
      return false;
    },
  );

  return foundId;
}

/**
 * Trim recent tapes to MAX_RECENT_TAPES entries
 */
async function trimRecent() {
  const records = [];

  await db.iterate(
    RECENT_STORE,
    { indexName: "accessedAt" },
    (value, cursor) => {
      records.push({ id: cursor.primaryKey, accessedAt: value.accessedAt });
    },
  );

  if (records.length > MAX_RECENT_TAPES) {
    const deleteCount = records.length - MAX_RECENT_TAPES;
    for (let i = 0; i < deleteCount; i++) {
      await db.remove(RECENT_STORE, records[i].id);
    }
  }
}

/**
 * Add a tape to the recent list.
 * If it already exists (same filename), update its access time.
 * @param {string} filename
 * @param {Uint8Array} data
 */
export async function addToRecentTapes(filename, data) {
  // Copy immediately before any await — the caller may transfer
  // the underlying ArrayBuffer to a worker, detaching the view.
  const dataCopy = new Uint8Array(data);

  try {
    const existingId = await findRecentByFilename(filename);
    if (existingId !== null) {
      await db.remove(RECENT_STORE, existingId);
    }

    await db.add(RECENT_STORE, {
      filename,
      data: dataCopy,
      accessedAt: Date.now(),
    });

    await trimRecent();
  } catch (error) {
    console.error("Error adding to recent tapes:", error);
  }
}

/**
 * Get the list of recent tapes, sorted by most recently accessed
 * @returns {Promise<Array<{id: number, filename: string, accessedAt: number}>>}
 */
export async function getRecentTapes() {
  try {
    const results = [];

    await db.iterate(
      RECENT_STORE,
      { indexName: "accessedAt", direction: "prev" },
      (value) => {
        results.push({
          id: value.id,
          filename: value.filename,
          accessedAt: value.accessedAt,
        });
      },
    );

    return results;
  } catch (error) {
    console.error("Error getting recent tapes:", error);
    return [];
  }
}

/**
 * Load a recent tape by its ID
 * @param {number} id
 * @returns {Promise<{filename: string, data: Uint8Array} | null>}
 */
export async function loadRecentTape(id) {
  try {
    const result = await db.get(RECENT_STORE, id);
    if (result) {
      return {
        filename: result.filename,
        data: new Uint8Array(result.data),
      };
    }
    return null;
  } catch (error) {
    console.error("Error loading recent tape:", error);
    return null;
  }
}

/**
 * Load a recent tape by its filename
 * @param {string} filename
 * @returns {Promise<{filename: string, data: Uint8Array} | null>}
 */
export async function loadRecentTapeByFilename(filename) {
  try {
    const id = await findRecentByFilename(filename);
    if (id !== null) {
      return await loadRecentTape(id);
    }
    return null;
  } catch (error) {
    console.error("Error loading recent tape by filename:", error);
    return null;
  }
}

/**
 * Clear all recent tapes
 */
export async function clearRecentTapes() {
  try {
    const idsToDelete = [];

    await db.iterate(RECENT_STORE, {}, (value, cursor) => {
      idsToDelete.push(cursor.primaryKey);
    });

    for (const id of idsToDelete) {
      await db.remove(RECENT_STORE, id);
    }
  } catch (error) {
    console.error("Error clearing recent tapes:", error);
  }
}

/**
 * Fetch a library tape image with IndexedDB caching
 * @param {Object} entry - Library entry with id and file fields
 * @returns {Promise<Uint8Array>}
 */
export async function getLibraryTapeData(entry) {
  try {
    const cached = await db.get(CACHE_STORE, entry.id);
    if (cached) return new Uint8Array(cached.data);
  } catch (err) {
    console.warn("Library cache read failed:", err);
  }

  const resp = await fetch(`/tapes/${entry.file}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  try {
    await db.put(CACHE_STORE, {
      id: entry.id,
      file: entry.file,
      data: arrayBuffer,
    });
  } catch (err) {
    console.warn("Library cache write failed:", err);
  }

  return data;
}
