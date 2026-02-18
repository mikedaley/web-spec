/*
 * indexeddb-helper.js - IndexedDB helper utilities
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Creates a database manager for a specific IndexedDB database.
 * Handles connection caching, database opening, and provides
 * Promise-based wrappers for common operations.
 *
 * @param {Object} config - Database configuration
 * @param {string} config.dbName - The database name
 * @param {number} config.version - The database version
 * @param {function} config.onUpgrade - Upgrade handler (event) => void
 * @returns {Object} Database manager with helper methods
 */
export function createDatabaseManager({ dbName, version, onUpgrade }) {
  let cachedDb = null;

  async function open() {
    if (cachedDb) {
      return cachedDb;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);

      request.onerror = () => {
        console.error(`Failed to open database ${dbName}:`, request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        cachedDb = request.result;
        resolve(cachedDb);
      };

      request.onupgradeneeded = onUpgrade;
    });
  }

  async function get(storeName, key) {
    const db = await open();
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function put(storeName, record) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function add(storeName, record) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function remove(storeName, key) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function count(storeName) {
    const db = await open();
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function iterate(storeName, options, callback) {
    const db = await open();
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const source = options.indexName ? store.index(options.indexName) : store;

    return new Promise((resolve, reject) => {
      const request = source.openCursor(options.range || null, options.direction || "next");

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const result = callback(cursor.value, cursor);
          if (result !== false) {
            cursor.continue();
          } else {
            resolve();
          }
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  return {
    open,
    get,
    put,
    add,
    remove,
    count,
    iterate,
  };
}
