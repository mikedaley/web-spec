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
const DB_VERSION = 4;
const STORE_NAME = "flashData";
const SNAPSHOTS_STORE = "flashSnapshots";
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
    if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) {
      database.createObjectStore(SNAPSHOTS_STORE, { keyPath: "id" });
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

export async function clearFlashData() {
  try {
    await db.remove(STORE_NAME, FLASH_KEY);
  } catch (error) {
    console.error("Error clearing Spectranet flash:", error);
  }
}

// --- Named flash snapshots ---

export async function saveFlashSnapshot(name, data) {
  try {
    const id = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.put(SNAPSHOTS_STORE, {
      id,
      name,
      data: new Uint8Array(data),
      savedAt: Date.now(),
    });
    return id;
  } catch (error) {
    console.error("Error saving flash snapshot:", error);
    return null;
  }
}

export async function listFlashSnapshots() {
  try {
    const snapshots = [];
    await db.iterate(SNAPSHOTS_STORE, {}, (value) => {
      snapshots.push({
        id: value.id,
        name: value.name,
        savedAt: value.savedAt,
      });
    });
    snapshots.sort((a, b) => b.savedAt - a.savedAt);
    return snapshots;
  } catch (error) {
    console.error("Error listing flash snapshots:", error);
    return [];
  }
}

export async function loadFlashSnapshot(id) {
  try {
    const result = await db.get(SNAPSHOTS_STORE, id);
    if (result) {
      return new Uint8Array(result.data);
    }
    return null;
  } catch (error) {
    console.error("Error loading flash snapshot:", error);
    return null;
  }
}

export async function updateFlashSnapshot(id, data) {
  try {
    const existing = await db.get(SNAPSHOTS_STORE, id);
    if (!existing) return false;
    await db.put(SNAPSHOTS_STORE, {
      ...existing,
      data: new Uint8Array(data),
      savedAt: Date.now(),
    });
    return true;
  } catch (error) {
    console.error("Error updating flash snapshot:", error);
    return false;
  }
}

export async function deleteFlashSnapshot(id) {
  try {
    await db.remove(SNAPSHOTS_STORE, id);
  } catch (error) {
    console.error("Error deleting flash snapshot:", error);
  }
}

