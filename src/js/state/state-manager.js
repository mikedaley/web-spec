/*
 * state-manager.js - Emulator state serialization and management
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import {
  saveStateToStorage,
  loadStateFromStorage,
  hasSavedState,
  saveStateToSlot,
  loadStateFromSlot,
} from "./state-persistence.js";

const AUTO_SAVE_INTERVAL_MS = 5000;
const THUMBNAIL_WIDTH = 140;
const THUMBNAIL_HEIGHT = 96;
const PREVIEW_WIDTH = 560;
const PREVIEW_HEIGHT = 384;

export class StateManager {
  constructor(deps) {
    this.emulator = deps.emulator;
    this.proxy = deps.proxy;
    this.screenWindow = deps.screenWindow;
    this.cpuDebuggerWindow = deps.cpuDebuggerWindow || null;
    this.basicProgramWindow = deps.basicProgramWindow || null;

    this.autoSaveEnabled = false;
    this.autoSaveInterval = null;

    this.onAutosave = null;
  }

  init() {
    this.setupAutoSave();
  }

  setupAutoSave() {
    const savedAutosave = localStorage.getItem("zxspec-autosave-state");
    this.autoSaveEnabled = savedAutosave === "true";

    window.addEventListener("beforeunload", () => {
      if (this.autoSaveEnabled && this.emulator.isRunning()) {
        this.saveState();
      }
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.emulator.isRunning() && this.autoSaveEnabled) {
        this.saveState();
      }
    });

    this.autoSavePending = false;
    this.autoSaveInterval = setInterval(() => {
      if (this.emulator.isRunning() && !document.hidden && this.autoSaveEnabled && !this.autoSavePending) {
        this.autoSavePending = true;
        const doSave = () => {
          this.autoSavePending = false;
          this.saveState();
        };
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(doSave, { timeout: AUTO_SAVE_INTERVAL_MS });
        } else {
          setTimeout(doSave, 0);
        }
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }

  async captureStateData() {
    if (!this.emulator.isRunning()) {
      return null;
    }

    try {
      const stateData = await this.proxy.exportState();
      return stateData;
    } catch (error) {
      console.error("Failed to capture state:", error);
      return null;
    }
  }

  async importStateData(stateData) {
    if (!stateData) return false;

    try {
      const result = await this.proxy.importState(stateData);
      if (result.success) {
        // Ensure the emulator is running (without reset — importState already loaded the state)
        if (!this.emulator.isRunning()) {
          this.emulator.running = true;
          this.emulator.renderer.setNoSignal(false);
          this.emulator.audioDriver.start();
          this.emulator.updatePowerButton();
        }

        // Update machine UI if machine switched
        const newMachineId = result.machineId;
        const savedMachineId = parseInt(localStorage.getItem("zxspec-machine-id") || "0", 10);
        if (newMachineId !== savedMachineId) {
          localStorage.setItem("zxspec-machine-id", String(newMachineId));
          if (this.screenWindow) this.screenWindow.setMachine(newMachineId);
          if (this.basicProgramWindow) this.basicProgramWindow.setMachine(newMachineId);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Failed to import state:", error);
      return false;
    }
  }

  captureScreenshot() {
    const canvas = document.getElementById("screen");
    if (!canvas) return null;

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = THUMBNAIL_WIDTH;
      offscreen.height = THUMBNAIL_HEIGHT;
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(canvas, 0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
      return offscreen.toDataURL("image/jpeg", 0.85);
    } catch (error) {
      console.error("Failed to capture screenshot:", error);
      return null;
    }
  }

  capturePreview() {
    const canvas = document.getElementById("screen");
    if (!canvas) return null;

    try {
      const offscreen = document.createElement("canvas");
      offscreen.width = PREVIEW_WIDTH;
      offscreen.height = PREVIEW_HEIGHT;
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(canvas, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      return offscreen.toDataURL("image/jpeg", 0.85);
    } catch (error) {
      console.error("Failed to capture preview:", error);
      return null;
    }
  }

  async saveState() {
    if (!this.emulator.isRunning()) return;

    try {
      const stateData = await this.captureStateData();
      if (stateData) {
        const thumbnail = this.captureScreenshot();
        const preview = this.capturePreview();
        await saveStateToStorage(stateData, thumbnail, preview);
        if (this.onAutosave) this.onAutosave();
      }
    } catch (error) {
      console.error("Failed to save emulator state:", error);
    }
  }

  async restoreState() {
    try {
      const stateData = await loadStateFromStorage();
      if (!stateData) return false;
      return await this.importStateData(stateData);
    } catch (error) {
      console.error("Failed to restore emulator state:", error);
      return false;
    }
  }

  async saveToSlot(slotNumber) {
    const stateData = await this.captureStateData();
    if (!stateData) return false;

    const thumbnail = this.captureScreenshot();
    const preview = this.capturePreview();
    await saveStateToSlot(slotNumber, stateData, thumbnail, preview);
    return true;
  }

  async restoreFromSlot(slotNumber) {
    const slot = await loadStateFromSlot(slotNumber);
    if (!slot) return false;
    return await this.importStateData(slot.data);
  }

  async restoreFromFileData(stateData) {
    return await this.importStateData(stateData);
  }

  async hasSavedState() {
    return hasSavedState();
  }

  isAutoSaveEnabled() {
    return this.autoSaveEnabled;
  }

  setAutoSaveEnabled(enabled) {
    this.autoSaveEnabled = enabled;
    localStorage.setItem("zxspec-autosave-state", String(enabled));
  }

  destroy() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }
}
