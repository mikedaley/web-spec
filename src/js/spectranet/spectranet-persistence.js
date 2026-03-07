/*
 * spectranet-persistence.js - Spectranet SRAM persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "zxspec-spectranet-persistence";
const DB_VERSION = 1;
const STORE_NAME = "sramData";
const SRAM_KEY = "spectranet-sram";

const db = createDatabaseManager({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (event) => {
    const database = event.target.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  },
});

export async function saveSRAM(data) {
  try {
    await db.put(STORE_NAME, {
      id: SRAM_KEY,
      data: new Uint8Array(data),
      savedAt: Date.now(),
    });
  } catch (error) {
    console.error("Error saving Spectranet SRAM:", error);
  }
}

export async function loadSRAM() {
  try {
    const result = await db.get(STORE_NAME, SRAM_KEY);
    if (result) {
      return new Uint8Array(result.data);
    }
    return null;
  } catch (error) {
    console.error("Error loading Spectranet SRAM:", error);
    return null;
  }
}

export async function hasSavedSRAM() {
  try {
    const result = await db.get(STORE_NAME, SRAM_KEY);
    return result != null;
  } catch (error) {
    console.error("Error checking for saved SRAM:", error);
    return false;
  }
}
