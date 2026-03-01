/*
 * save-states-window.js - Save states window UI
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  getAutosaveInfo,
  loadStateFromStorage,
  getAllSlotInfo,
  clearSlot,
  loadStateFromSlot,
  updateSlotName,
} from "./state-persistence.js";

import "../css/save-states.css";

const SLOT_COUNT = 5;

export class SaveStatesWindow extends BaseWindow {
  constructor(stateManager) {
    super({
      id: "save-states",
      title: "Save States",
      defaultWidth: 480,
      defaultHeight: 560,
      minWidth: 400,
      minHeight: 380,
    });
    this.stateManager = stateManager;
    this.autosaveElement = null;
    this.slotElements = [];
    this.hoverPreview = null;
  }

  renderContent() {
    const autosaveHtml = `
      <div class="save-slot save-slot-auto" data-slot="auto">
        <div class="slot-number auto">A</div>
        <div class="slot-thumbnail">
          <span class="slot-empty-icon">--</span>
        </div>
        <div class="slot-info">
          <div class="slot-status empty">No autosave</div>
          <div class="slot-timestamp"></div>
        </div>
        <div class="slot-actions">
          <button class="slot-btn load-btn" data-action="load-auto" disabled>Load</button>
          <button class="slot-btn download-btn" data-action="download-auto" disabled>DL</button>
        </div>
      </div>`;

    let slotsHtml = "";
    for (let i = 1; i <= SLOT_COUNT; i++) {
      slotsHtml += `
        <div class="save-slot" data-slot="${i}">
          <div class="slot-number">${i}</div>
          <div class="slot-thumbnail">
            <span class="slot-empty-icon">--</span>
          </div>
          <div class="slot-info">
            <input class="slot-name" type="text" value="Slot ${i}" placeholder="Slot ${i}" data-slot="${i}" disabled />
            <div class="slot-timestamp"></div>
          </div>
          <div class="slot-actions">
            <button class="slot-btn save-btn" data-action="save" data-slot="${i}">Save</button>
            <button class="slot-btn load-btn" data-action="load" data-slot="${i}" disabled>Load</button>
            <button class="slot-btn clear-btn" data-action="clear" data-slot="${i}" disabled>Clear</button>
            <button class="slot-btn download-btn" data-action="download" data-slot="${i}" disabled>DL</button>
          </div>
        </div>`;
    }

    return `
      <div class="save-states-container">
        ${autosaveHtml}
        <div class="save-states-divider"></div>
        ${slotsHtml}
        <div class="save-states-toolbar">
          <input type="file" accept=".z80" style="display:none" />
          <button class="slot-btn load-file-btn">Load from File...</button>
        </div>
      </div>`;
  }

  onContentRendered() {
    this.autosaveElement = this.contentElement.querySelector('.save-slot-auto');

    for (let i = 1; i <= SLOT_COUNT; i++) {
      const row = this.contentElement.querySelector(`.save-slot[data-slot="${i}"]`);
      this.slotElements.push(row);
    }

    this.contentElement.addEventListener("click", (e) => {
      const btn = e.target.closest(".slot-btn");
      if (!btn || btn.disabled) return;

      const action = btn.dataset.action;
      const slot = parseInt(btn.dataset.slot, 10);

      if (action === "save") this.handleSave(slot);
      else if (action === "load") this.handleLoad(slot);
      else if (action === "clear") this.handleClear(slot);
      else if (action === "download") this.handleDownload(slot);
      else if (action === "load-auto") this.handleLoadAutosave();
      else if (action === "download-auto") this.handleDownloadAutosave();
    });

    this.hoverPreview = document.createElement("div");
    this.hoverPreview.className = "slot-thumbnail-preview";
    document.body.appendChild(this.hoverPreview);

    this.contentElement.addEventListener("mouseenter", (e) => {
      const thumb = e.target.closest(".slot-thumbnail");
      if (!thumb) return;
      const previewSrc = thumb.dataset.preview;
      if (!previewSrc) return;
      this.hoverPreview.innerHTML = `<img src="${previewSrc}" />`;
      this.hoverPreview.classList.add("visible");
    }, true);

    this.contentElement.addEventListener("mouseleave", (e) => {
      const thumb = e.target.closest(".slot-thumbnail");
      if (!thumb) return;
      this.hoverPreview.classList.remove("visible");
    }, true);

    this.contentElement.addEventListener("mousemove", (e) => {
      if (!this.hoverPreview.classList.contains("visible")) return;
      const previewW = 280;
      const previewH = 192;
      const pad = 12;
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      if (x + previewW > window.innerWidth) x = e.clientX - previewW - pad;
      if (y + previewH > window.innerHeight) y = e.clientY - previewH - pad;
      this.hoverPreview.style.left = `${x}px`;
      this.hoverPreview.style.top = `${y}px`;
    });

    this.contentElement.addEventListener("change", (e) => {
      const nameInput = e.target.closest(".slot-name");
      if (nameInput) {
        const slot = parseInt(nameInput.dataset.slot, 10);
        const name = nameInput.value.trim() || `Slot ${slot}`;
        nameInput.value = name;
        updateSlotName(slot, name);
      }
    });

    this.contentElement.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.closest(".slot-name")) {
        e.target.blur();
      }
    });

    const fileInput = this.contentElement.querySelector('input[type="file"]');
    const loadFileBtn = this.contentElement.querySelector(".load-file-btn");

    if (loadFileBtn && fileInput) {
      loadFileBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) this.handleLoadFromFile(file);
        fileInput.value = "";
      });
    }
  }

  show() {
    super.show();
    this.refreshSlots();
  }

  async refreshSlots() {
    await this.refreshAutosaveRow();

    const slots = await getAllSlotInfo();

    for (let i = 0; i < SLOT_COUNT; i++) {
      const row = this.slotElements[i];
      if (!row) continue;

      const info = slots[i];
      const thumbEl = row.querySelector(".slot-thumbnail");
      const nameInput = row.querySelector(".slot-name");
      const timestampEl = row.querySelector(".slot-timestamp");
      const loadBtn = row.querySelector('[data-action="load"]');
      const clearBtn = row.querySelector('[data-action="clear"]');
      const downloadBtn = row.querySelector('[data-action="download"]');

      if (info) {
        if (info.thumbnail) {
          thumbEl.innerHTML = `<img src="${info.thumbnail}" alt="Slot ${i + 1}" />`;
        } else {
          thumbEl.innerHTML = '<span class="slot-empty-icon">--</span>';
        }
        thumbEl.dataset.preview = info.preview || info.thumbnail || "";
        nameInput.value = info.name || `Slot ${i + 1}`;
        nameInput.disabled = false;
        timestampEl.textContent = this.formatTimestamp(info.savedAt);
        loadBtn.disabled = false;
        clearBtn.disabled = false;
        downloadBtn.disabled = false;
      } else {
        thumbEl.innerHTML = '<span class="slot-empty-icon">--</span>';
        delete thumbEl.dataset.preview;
        nameInput.value = `Slot ${i + 1}`;
        nameInput.disabled = true;
        timestampEl.textContent = "";
        loadBtn.disabled = true;
        clearBtn.disabled = true;
        downloadBtn.disabled = true;
      }
    }
  }

  async refreshAutosaveRow() {
    const row = this.autosaveElement;
    if (!row) return;

    const info = await getAutosaveInfo();
    const thumbEl = row.querySelector(".slot-thumbnail");
    const statusEl = row.querySelector(".slot-status");
    const timestampEl = row.querySelector(".slot-timestamp");
    const loadBtn = row.querySelector('[data-action="load-auto"]');
    const downloadBtn = row.querySelector('[data-action="download-auto"]');

    if (info) {
      if (info.thumbnail) {
        thumbEl.innerHTML = `<img src="${info.thumbnail}" alt="Autosave" />`;
      } else {
        thumbEl.innerHTML = '<span class="slot-empty-icon">--</span>';
      }
      thumbEl.dataset.preview = info.preview || info.thumbnail || "";
      statusEl.textContent = "Autosave";
      statusEl.classList.remove("empty");
      timestampEl.textContent = this.formatTimestamp(info.savedAt);
      loadBtn.disabled = false;
      downloadBtn.disabled = false;
    } else {
      thumbEl.innerHTML = '<span class="slot-empty-icon">--</span>';
      delete thumbEl.dataset.preview;
      statusEl.textContent = "No autosave";
      statusEl.classList.add("empty");
      timestampEl.textContent = "";
      loadBtn.disabled = true;
      downloadBtn.disabled = true;
    }
  }

  formatTimestamp(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  }

  async handleSave(slot) {
    if (!this.stateManager.emulator.isRunning()) return;
    const ok = await this.stateManager.saveToSlot(slot);
    if (ok) {
      console.log(`Saved to slot ${slot}`);
    }
    this.refreshSlots();
  }

  async handleLoad(slot) {
    const ok = await this.stateManager.restoreFromSlot(slot);
    if (ok) {
      console.log(`Loaded slot ${slot}`);
    }
  }

  async handleClear(slot) {
    await clearSlot(slot);
    console.log(`Cleared slot ${slot}`);
    this.refreshSlots();
  }

  async handleDownload(slot) {
    const slotData = await loadStateFromSlot(slot);
    if (!slotData) return;
    const name = (slotData.name || `Slot ${slot}`).replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "-");
    this.downloadBlob(slotData.data, `${name}.z80`);
  }

  async handleLoadAutosave() {
    const ok = await this.stateManager.restoreState();
    if (ok) {
      console.log("Loaded autosave");
    }
  }

  async handleDownloadAutosave() {
    const data = await loadStateFromStorage();
    if (!data) return;
    this.downloadBlob(data, "zxspectrum-autosave.z80");
  }

  async downloadBlob(data, filename) {
    const blob = new Blob([data], { type: "application/octet-stream" });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "Z80 Snapshot", accept: { "application/octet-stream": [".z80"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  handleLoadFromFile(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      const data = new Uint8Array(reader.result);

      // Basic Z80 format validation: minimum header size
      if (data.length < 30) {
        console.error("Invalid state file: too small");
        return;
      }

      const ok = await this.stateManager.restoreFromFileData(data);
      if (ok) {
        console.log("State loaded from file");
      } else {
        console.error("Failed to load state file");
      }
    };
    reader.onerror = () => {
      console.error("Failed to read file");
    };
    reader.readAsArrayBuffer(file);
  }

  destroy() {
    if (this.hoverPreview && this.hoverPreview.parentNode) {
      this.hoverPreview.parentNode.removeChild(this.hoverPreview);
    }
    super.destroy();
  }
}
