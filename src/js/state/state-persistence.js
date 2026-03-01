/*
 * state-persistence.js - State persistence to IndexedDB
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { createDatabaseManager } from "../utils/indexeddb-helper.js";

const DB_NAME = "zxspec-state-persistence";
const DB_VERSION = 1;
const STORE_NAME = "emulatorState";

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

export async function saveStateToStorage(stateData, thumbnail, preview) {
  try {
    const stateRecord = {
      id: "autosave",
      data: stateData,
      savedAt: Date.now(),
      thumbnail: thumbnail || null,
      preview: preview || null,
    };
    await db.put(STORE_NAME, stateRecord);
  } catch (error) {
    console.error("Error saving emulator state:", error);
  }
}

export async function loadStateFromStorage() {
  try {
    const result = await db.get(STORE_NAME, "autosave");
    if (result) {
      return new Uint8Array(result.data);
    }
    return null;
  } catch (error) {
    console.error("Error loading emulator state:", error);
    return null;
  }
}

export async function clearStateFromStorage() {
  try {
    await db.remove(STORE_NAME, "autosave");
  } catch (error) {
    console.error("Error clearing emulator state:", error);
  }
}

export async function hasSavedState() {
  try {
    const result = await db.get(STORE_NAME, "autosave");
    return result != null;
  } catch (error) {
    console.error("Error checking for saved state:", error);
    return false;
  }
}

export async function getSavedStateTimestamp() {
  try {
    const result = await db.get(STORE_NAME, "autosave");
    return result ? result.savedAt : null;
  } catch (error) {
    console.error("Error getting saved state timestamp:", error);
    return null;
  }
}

export async function getAutosaveInfo() {
  try {
    const result = await db.get(STORE_NAME, "autosave");
    if (result) {
      return {
        savedAt: result.savedAt,
        thumbnail: result.thumbnail || null,
        preview: result.preview || null,
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting autosave info:", error);
    return null;
  }
}

// --- Save State Slots ---

const SLOT_COUNT = 5;

function slotKey(slotNumber) {
  return `slot-${slotNumber}`;
}

export async function saveStateToSlot(slotNumber, stateData, thumbnail, preview, name) {
  try {
    const existing = await db.get(STORE_NAME, slotKey(slotNumber));
    const record = {
      id: slotKey(slotNumber),
      data: new Uint8Array(stateData),
      savedAt: Date.now(),
      thumbnail: thumbnail || null,
      preview: preview || null,
      name: name || (existing && existing.name) || `Slot ${slotNumber}`,
    };
    await db.put(STORE_NAME, record);
  } catch (error) {
    console.error(`Error saving state to slot ${slotNumber}:`, error);
  }
}

export async function updateSlotName(slotNumber, name) {
  try {
    const result = await db.get(STORE_NAME, slotKey(slotNumber));
    if (!result) return;
    result.name = name;
    await db.put(STORE_NAME, result);
  } catch (error) {
    console.error(`Error updating slot ${slotNumber} name:`, error);
  }
}

export async function loadStateFromSlot(slotNumber) {
  try {
    const result = await db.get(STORE_NAME, slotKey(slotNumber));
    if (result) {
      return {
        data: new Uint8Array(result.data),
        savedAt: result.savedAt,
        thumbnail: result.thumbnail || null,
        name: result.name || null,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error loading state from slot ${slotNumber}:`, error);
    return null;
  }
}

export async function clearSlot(slotNumber) {
  try {
    await db.remove(STORE_NAME, slotKey(slotNumber));
  } catch (error) {
    console.error(`Error clearing slot ${slotNumber}:`, error);
  }
}

export async function getAllSlotInfo() {
  const slots = [];
  for (let i = 1; i <= SLOT_COUNT; i++) {
    try {
      const result = await db.get(STORE_NAME, slotKey(i));
      if (result) {
        slots.push({
          slotNumber: i,
          savedAt: result.savedAt,
          thumbnail: result.thumbnail || null,
          preview: result.preview || null,
          name: result.name || `Slot ${i}`,
        });
      } else {
        slots.push(null);
      }
    } catch (error) {
      slots.push(null);
    }
  }
  return slots;
}
