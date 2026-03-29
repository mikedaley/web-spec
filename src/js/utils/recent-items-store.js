/*
 * recent-items-store.js - Generic factory for recent items persistence
 *
 * Provides a reusable IndexedDB-backed store for managing recent items
 * (tapes, disks, snapshots, etc.) with find-by-filename, LRU trimming,
 * add/update, list, load, remove, and clear operations.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "./indexeddb-helper.js";

/**
 * Creates a recent-items store backed by IndexedDB.
 *
 * @param {Object} config
 * @param {string} config.dbName - IndexedDB database name
 * @param {string} config.storeName - Object store name for recent items
 * @param {number} config.maxItems - Maximum number of recent items to keep
 * @param {string} config.label - Human-readable label for error messages (e.g. "tapes")
 * @param {Array<{name: string, options: Object}>} [config.additionalStores] - Extra stores to create during upgrade
 * @returns {Object} Store with add, getList, load, loadByFilename, remove, clear methods and db manager
 */
export function createRecentItemsStore({ dbName, storeName, maxItems, label, additionalStores }) {
  const db = createDatabaseManager({
    dbName,
    version: 1,
    onUpgrade: (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("filename", "filename", { unique: false });
        store.createIndex("accessedAt", "accessedAt", { unique: false });
      }

      if (additionalStores) {
        for (const extra of additionalStores) {
          if (!database.objectStoreNames.contains(extra.name)) {
            database.createObjectStore(extra.name, extra.options);
          }
        }
      }
    },
  });

  async function findByFilename(filename) {
    let foundId = null;
    await db.iterate(
      storeName,
      { indexName: "filename", range: IDBKeyRange.only(filename) },
      (value, cursor) => {
        foundId = cursor.primaryKey;
        return false;
      },
    );
    return foundId;
  }

  async function trim() {
    const records = [];
    await db.iterate(
      storeName,
      { indexName: "accessedAt" },
      (value, cursor) => {
        records.push({ id: cursor.primaryKey, accessedAt: value.accessedAt });
      },
    );
    if (records.length > maxItems) {
      const deleteCount = records.length - maxItems;
      for (let i = 0; i < deleteCount; i++) {
        await db.remove(storeName, records[i].id);
      }
    }
  }

  return {
    db,

    async add(filename, data) {
      const dataCopy = new Uint8Array(data);
      try {
        const existingId = await findByFilename(filename);
        if (existingId !== null) {
          await db.remove(storeName, existingId);
        }
        await db.add(storeName, {
          filename,
          data: dataCopy,
          accessedAt: Date.now(),
        });
        await trim();
      } catch (error) {
        console.error(`Error adding to recent ${label}:`, error);
      }
    },

    async getList() {
      try {
        const results = [];
        await db.iterate(
          storeName,
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
        console.error(`Error getting recent ${label}:`, error);
        return [];
      }
    },

    async load(id, { updateAccessTime = false } = {}) {
      try {
        const result = await db.get(storeName, id);
        if (result) {
          if (updateAccessTime) {
            await db.put(storeName, { ...result, accessedAt: Date.now() });
          }
          return {
            filename: result.filename,
            data: new Uint8Array(result.data),
          };
        }
        return null;
      } catch (error) {
        console.error(`Error loading recent ${label}:`, error);
        return null;
      }
    },

    async loadByFilename(filename) {
      try {
        const id = await findByFilename(filename);
        if (id !== null) {
          return await this.load(id);
        }
        return null;
      } catch (error) {
        console.error(`Error loading recent ${label} by filename:`, error);
        return null;
      }
    },

    async remove(id) {
      try {
        await db.remove(storeName, id);
      } catch (error) {
        console.error(`Error removing recent ${label}:`, error);
      }
    },

    async clear() {
      try {
        const idsToDelete = [];
        await db.iterate(storeName, {}, (value, cursor) => {
          idsToDelete.push(cursor.primaryKey);
        });
        for (const id of idsToDelete) {
          await db.remove(storeName, id);
        }
      } catch (error) {
        console.error(`Error clearing recent ${label}:`, error);
      }
    },
  };
}
