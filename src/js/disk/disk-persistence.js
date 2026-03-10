/*
 * disk-persistence.js - Disk image persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "zxspec-disk-persistence";
const DB_VERSION = 1;
const RECENT_STORE = "recentDisks";
const MAX_RECENT_DISKS = 10;

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

/**
 * Find a recent disk by filename
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
 * Trim recent disks to MAX_RECENT_DISKS entries
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

  if (records.length > MAX_RECENT_DISKS) {
    const deleteCount = records.length - MAX_RECENT_DISKS;
    for (let i = 0; i < deleteCount; i++) {
      await db.remove(RECENT_STORE, records[i].id);
    }
  }
}

/**
 * Add a disk to the recent list.
 * If it already exists (same filename), update its access time.
 * @param {string} filename
 * @param {Uint8Array} data
 */
export async function addToRecentDisks(filename, data) {
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
    console.error("Error adding to recent disks:", error);
  }
}

/**
 * Get the list of recent disks, sorted by most recently accessed
 * @returns {Promise<Array<{id: number, filename: string, accessedAt: number}>>}
 */
export async function getRecentDisks() {
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
    console.error("Error getting recent disks:", error);
    return [];
  }
}

/**
 * Load a recent disk by its ID
 * @param {number} id
 * @returns {Promise<{filename: string, data: Uint8Array} | null>}
 */
export async function loadRecentDisk(id) {
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
    console.error("Error loading recent disk:", error);
    return null;
  }
}

/**
 * Clear all recent disks
 */
export async function clearRecentDisks() {
  try {
    const idsToDelete = [];

    await db.iterate(RECENT_STORE, {}, (value, cursor) => {
      idsToDelete.push(cursor.primaryKey);
    });

    for (const id of idsToDelete) {
      await db.remove(RECENT_STORE, id);
    }
  } catch (error) {
    console.error("Error clearing recent disks:", error);
  }
}
