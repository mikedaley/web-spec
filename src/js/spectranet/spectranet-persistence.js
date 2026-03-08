/*
 * spectranet-persistence.js - Spectranet flash persistence to IndexedDB
 *
 * Persists the full 128KB flash memory across sessions so that installed
 * modules, configuration, and other flash changes survive page reloads.
 * On first use the ROM firmware initialises flash; after that, the saved
 * flash image is restored over the firmware defaults each session.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "zxspec-spectranet-persistence";
const DB_VERSION = 3;
const STORE_NAME = "flashData";
const FLASH_KEY = "spectranet-flash";

const db = createDatabaseManager({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (event) => {
    const database = event.target.result;
    // Clean up old stores from previous versions
    if (database.objectStoreNames.contains("sramData")) {
      database.deleteObjectStore("sramData");
    }
    if (database.objectStoreNames.contains("flashConfig")) {
      database.deleteObjectStore("flashConfig");
    }
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  },
});

export async function saveFlashData(data) {
  try {
    await db.put(STORE_NAME, {
      id: FLASH_KEY,
      data: new Uint8Array(data),
      savedAt: Date.now(),
    });
  } catch (error) {
    console.error("Error saving Spectranet flash:", error);
  }
}

export async function loadFlashData() {
  try {
    const result = await db.get(STORE_NAME, FLASH_KEY);
    if (result) {
      return new Uint8Array(result.data);
    }
    return null;
  } catch (error) {
    console.error("Error loading Spectranet flash:", error);
    return null;
  }
}
