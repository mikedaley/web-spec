/*
 * snapshot-persistence.js - Recent snapshot persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "zxspec-snapshot-persistence";
const DB_VERSION = 1;
const RECENT_STORE = "recentSnapshots";
const MAX_RECENT = 7;

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
  },
});

async function findByFilename(filename) {
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

async function trimRecent() {
  const records = [];
  await db.iterate(
    RECENT_STORE,
    { indexName: "accessedAt" },
    (value, cursor) => {
      records.push({ id: cursor.primaryKey, accessedAt: value.accessedAt });
    },
  );
  if (records.length > MAX_RECENT) {
    const deleteCount = records.length - MAX_RECENT;
    for (let i = 0; i < deleteCount; i++) {
      await db.remove(RECENT_STORE, records[i].id);
    }
  }
}

/**
 * Add a snapshot to the recent list.
 * @param {string} filename
 * @param {Uint8Array} data
 */
export async function addToRecentSnapshots(filename, data) {
  const dataCopy = new Uint8Array(data);
  try {
    const existingId = await findByFilename(filename);
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
    console.error("Error adding to recent snapshots:", error);
  }
}

/**
 * Get the list of recent snapshots, sorted by most recently accessed.
 * Does not include the file data (for menu display only).
 * @returns {Promise<Array<{id: number, filename: string, accessedAt: number}>>}
 */
export async function getRecentSnapshots() {
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
    console.error("Error getting recent snapshots:", error);
    return [];
  }
}

/**
 * Load a recent snapshot by its ID (includes file data).
 * @param {number} id
 * @returns {Promise<{filename: string, data: Uint8Array} | null>}
 */
export async function loadRecentSnapshot(id) {
  try {
    const result = await db.get(RECENT_STORE, id);
    if (result) {
      // Update access time
      await db.put(RECENT_STORE, {
        ...result,
        accessedAt: Date.now(),
      });
      return {
        filename: result.filename,
        data: new Uint8Array(result.data),
      };
    }
    return null;
  } catch (error) {
    console.error("Error loading recent snapshot:", error);
    return null;
  }
}

/**
 * Remove a recent snapshot by its ID.
 * @param {number} id
 */
export async function removeRecentSnapshot(id) {
  try {
    await db.remove(RECENT_STORE, id);
  } catch (error) {
    console.error("Error removing recent snapshot:", error);
  }
}
