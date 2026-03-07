/*
 * spectranet-persistence.js - Spectranet flash config persistence to IndexedDB
 *
 * Persists the flash config page (0x1F) across sessions so that network
 * configuration and other settings survive page reloads. When the ROM is
 * loaded it overwrites flash with defaults; the saved config is restored
 * before ROM init runs so it reads correct values into SRAM.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "zxspec-spectranet-persistence";
const DB_VERSION = 2;
const STORE_NAME = "flashConfig";
const CONFIG_KEY = "spectranet-flash-config";

const db = createDatabaseManager({
  dbName: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (event) => {
    const database = event.target.result;
    if (database.objectStoreNames.contains("sramData")) {
      database.deleteObjectStore("sramData");
    }
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  },
});

export async function saveFlashConfig(data) {
  try {
    await db.put(STORE_NAME, {
      id: CONFIG_KEY,
      data: new Uint8Array(data),
      savedAt: Date.now(),
    });
  } catch (error) {
    console.error("Error saving Spectranet flash config:", error);
  }
}

export async function loadFlashConfig() {
  try {
    const result = await db.get(STORE_NAME, CONFIG_KEY);
    if (result) {
      return new Uint8Array(result.data);
    }
    return null;
  } catch (error) {
    console.error("Error loading Spectranet flash config:", error);
    return null;
  }
}
