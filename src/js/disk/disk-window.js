/*
 * disk-window.js - Disk Drive window for the ZX Spectrum +3
 *
 * Provides UI for inserting/ejecting DSK disk images with a spinning disk
 * surface visualization, track access heatmap, technical details panel,
 * and recent disks popup.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  addToRecentDisks,
  getRecentDisks,
  loadRecentDisk,
  clearRecentDisks,
} from "./disk-persistence.js";
import { DiskSurfaceRenderer } from "./disk-surface-renderer.js";
import "../css/disk-window.css";

const FDC_PHASE_NAMES = ["Command", "Exec", "Result"];

export class DiskWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "disk-window",
      title: "Disk Drive",
      minWidth: 360,
      minHeight: 100,
      maxWidth: 360,
      defaultWidth: 360,
      defaultHeight: 420,
      defaultPosition: { x: 80, y: 500 },
      resizeDirections: [],
    });
    this._proxy = proxy;
    this._fileInput = null;
    this._currentFilename = null;
    this._detailsOpen = false;
    this._graphicsHidden = false;
    this._renderer = null;
    this._trackAccessCounts = new Uint32Array(40);
    this._maxAccessCount = 0;
    this._lastDecayTime = 0;
    this._lastMotorOn = false;
    this._lastTrack = -1;
    this._lastInserted = false;
    this._lastWriteProtected = false;
  }

  getState() {
    const state = super.getState();
    state.currentFilename = this._currentFilename;
    state.graphicsHidden = this._graphicsHidden;
    state.detailsOpen = this._detailsOpen;
    return state;
  }

  restoreState(state) {
    this._restoring = true;
    if (state.graphicsHidden) {
      this._graphicsHidden = true;
      this.contentElement.classList.add("hide-graphics");
      if (this._graphicsBtn) this._graphicsBtn.classList.remove("active");
    }
    if (state.detailsOpen) {
      this._detailsOpen = true;
      this.contentElement.classList.add("show-details");
      if (this._detailBtn) this._detailBtn.classList.add("active");
    }
    if (state.currentFilename) {
      this._currentFilename = state.currentFilename;
      this._updateNameDisplay();
    }
    super.restoreState(state);
    this._restoring = false;
    // Fit height after restore — element is now visible so offsetHeight works
    if (this.isVisible) {
      this._fitToContent();
    }
  }

  renderContent() {
    return `
      <div class="disk-drives-toolbar">
        <button class="drive-toolbar-btn drive-graphics-btn active" title="Toggle disk surface">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M8 3C4.5 3 1.6 5.3.6 8c1 2.7 3.9 5 7.4 5s6.4-2.3 7.4-5c-1-2.7-3.9-5-7.4-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
          </svg>
          <span>Surface</span>
        </button>
        <button class="drive-toolbar-btn drive-detail-btn" title="Toggle technical details">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM6.5 7h1.75v4.5H10v1H6v-1h1.25V8H6.5V7z"/>
          </svg>
          <span>Details</span>
        </button>
      </div>
      <div class="disk-drives-row">
        <div class="disk-drive" id="disk-drive-a">
          <div class="drive-image-container">
            <canvas class="disk-surface" width="560" height="480"></canvas>
            <span class="drive-label">A</span>
          </div>
          <div class="drive-info">
            <span class="disk-name" id="disk-name">No Disk</span>
            <span class="disk-track" id="disk-track" title="Current Track">T--</span>
          </div>
          <div class="drive-controls">
            <button class="disk-insert" id="disk-insert-btn" title="Insert Disk from File">Insert</button>
            <div class="recent-container">
              <button class="disk-recent" id="disk-recent-btn" title="Recent Disks">Recent</button>
              <div class="recent-dropdown" id="disk-recent-dropdown"></div>
            </div>
            <button class="disk-blank" id="disk-blank-btn" title="Insert Blank Disk">Blank</button>
            <button class="disk-eject" id="disk-eject-btn" disabled title="Eject Disk">Eject</button>
          </div>
          <div class="drive-controls drive-controls-secondary">
            <button class="disk-save" id="disk-save-btn" disabled title="Save Disk Image">Save</button>
            <div class="disk-wp-row">
              <span class="disk-wp-text">WP</span>
              <label class="disk-wp-toggle" id="disk-wp-toggle">
                <input type="checkbox" id="disk-wp-checkbox">
                <span class="disk-wp-slider"></span>
              </label>
            </div>
          </div>
          <div class="drive-detail-panel">
            <div class="drive-detail-grid">
              <span class="dd-label">Track</span><span class="dd-val" id="dd-track">0</span>
              <span class="dd-label">Motor</span><span class="dd-val" id="dd-motor">OFF</span>
              <span class="dd-label">Phase</span><span class="dd-val" id="dd-phase">Command</span>
              <span class="dd-label">Mode</span><span class="dd-val" id="dd-mode">Read</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    // Toolbar buttons
    this._graphicsBtn = this.contentElement.querySelector(".drive-graphics-btn");
    this._graphicsBtn.addEventListener("click", () => this._toggleGraphics());
    this._detailBtn = this.contentElement.querySelector(".drive-detail-btn");
    this._detailBtn.addEventListener("click", () => this._toggleDetails());

    // Disk surface renderer
    const canvas = this.contentElement.querySelector(".disk-surface");
    if (canvas) {
      this._renderer = new DiskSurfaceRenderer(canvas);
    }

    // Hidden file input
    this._fileInput = document.createElement("input");
    this._fileInput.type = "file";
    this._fileInput.accept = ".dsk,.DSK";
    this._fileInput.style.display = "none";
    this.contentElement.appendChild(this._fileInput);
    this._fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this._loadDiskFile(file);
      this._fileInput.value = "";
    });

    // Buttons
    this.contentElement.querySelector("#disk-insert-btn").addEventListener("click", () => {
      this._fileInput.click();
    });
    this.contentElement.querySelector("#disk-blank-btn").addEventListener("click", () => {
      this._proxy.diskInsertEmpty(0);
      this._currentFilename = "Untitled.dsk";
      this._updateNameDisplay();
    });
    this.contentElement.querySelector("#disk-eject-btn").addEventListener("click", () => {
      this._confirmAndEject();
    });
    this.contentElement.querySelector("#disk-save-btn").addEventListener("click", () => {
      this._saveDisk();
    });
    this.contentElement.querySelector("#disk-recent-btn").addEventListener("click", () => {
      this._toggleRecentDropdown();
    });
    this.contentElement.querySelector("#disk-wp-checkbox").addEventListener("change", (e) => {
      this._proxy.diskSetWriteProtected(0, e.target.checked);
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (this._dropdownOpen && !e.target.closest(".recent-container")) {
        this._closeRecentDropdown();
      }
    });

    // Drag and drop
    this.contentElement.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });
    this.contentElement.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && /\.dsk$/i.test(file.name)) {
        this._loadDiskFile(file);
      }
    });

    this._fitToContent();
  }

  show() {
    super.show();
    this._fitToContent();
  }

  _toggleGraphics() {
    this._graphicsHidden = !this._graphicsHidden;
    this.contentElement.classList.toggle("hide-graphics", this._graphicsHidden);
    if (this._graphicsBtn) {
      this._graphicsBtn.classList.toggle("active", !this._graphicsHidden);
    }
    this._fitToContent();
    if (this.onStateChange) this.onStateChange();
  }

  _toggleDetails() {
    this._detailsOpen = !this._detailsOpen;
    this.contentElement.classList.toggle("show-details", this._detailsOpen);
    if (this._detailBtn) {
      this._detailBtn.classList.toggle("active", this._detailsOpen);
    }
    this._fitToContent();
    if (this.onStateChange) this.onStateChange();
  }

  _fitToContent() {
    if (!this.element) return;
    const savedX = this.currentX;
    const savedY = this.currentY;
    this.element.style.height = "auto";
    const newHeight = this.element.offsetHeight;
    if (newHeight === 0) return; // Element is hidden, skip
    this.element.style.height = `${newHeight}px`;
    this.currentHeight = newHeight;
    this.minHeight = newHeight;
    this.maxHeight = newHeight;
    this.updateEdgeDistances();
    this.constrainToViewport();
    if (this._restoring) {
      // Preserve restored position
      this.currentX = savedX;
      this.currentY = savedY;
      this.element.style.left = `${savedX}px`;
      this.element.style.top = `${savedY}px`;
    }
  }

  // Called each frame by the render loop
  update(proxy) {
    if (!this.contentElement || !this.isVisible) return;
    const state = proxy.state;
    if (!state) return;

    const motorOn = state.diskMotorOn;
    const track = state.diskCurrentTrack;
    const inserted = state.diskInserted;
    const wp = state.diskWriteProtected;
    const isReadMode = state.diskReadMode;
    const fdcPhase = state.diskFDCPhase;

    // Track label
    if (track !== this._lastTrack || motorOn !== this._lastMotorOn) {
      const trackEl = this.contentElement.querySelector("#disk-track");
      if (trackEl) {
        trackEl.textContent = inserted ? `T${String(track).padStart(2, "0")}` : "T--";
        trackEl.classList.toggle("active", motorOn);
      }
      this._lastTrack = track;
      this._lastMotorOn = motorOn;
    }

    // Inserted state
    if (inserted !== this._lastInserted) {
      this._updateInsertedState(inserted);
      this._lastInserted = inserted;
    }

    // Write protect
    if (wp !== this._lastWriteProtected) {
      const cb = this.contentElement.querySelector("#disk-wp-checkbox");
      if (cb && cb.checked !== wp) cb.checked = wp;
      this._lastWriteProtected = wp;
    }

    // Track access heat map
    if (motorOn && inserted) {
      this._trackAccessCounts[track]++;
      if (this._trackAccessCounts[track] > this._maxAccessCount) {
        this._maxAccessCount = this._trackAccessCounts[track];
      }
    }

    // Decay access counts
    const now = performance.now();
    if (now - this._lastDecayTime > 100) {
      let max = 0;
      for (let i = 0; i < 40; i++) {
        this._trackAccessCounts[i] = Math.floor(this._trackAccessCounts[i] * 0.8);
        if (this._trackAccessCounts[i] > max) max = this._trackAccessCounts[i];
      }
      this._maxAccessCount = max;
      this._lastDecayTime = now;
    }

    // Update surface renderer
    if (this._renderer && !this._graphicsHidden) {
      this._renderer.update({
        hasDisk: inserted,
        isActive: motorOn,
        isWriteMode: !isReadMode,
        track,
        trackAccessCounts: this._trackAccessCounts,
        maxAccessCount: this._maxAccessCount,
        timestamp: now,
      });
    }

    // Update details panel
    if (this._detailsOpen) {
      const el = (id) => this.contentElement.querySelector(`#${id}`);

      const ddTrack = el("dd-track");
      if (ddTrack) ddTrack.textContent = track;

      const ddMotor = el("dd-motor");
      if (ddMotor) {
        ddMotor.textContent = motorOn ? "ON" : "OFF";
        ddMotor.classList.toggle("on", motorOn);
      }

      const ddPhase = el("dd-phase");
      if (ddPhase) ddPhase.textContent = FDC_PHASE_NAMES[fdcPhase] || "Command";

      const ddMode = el("dd-mode");
      if (ddMode) {
        const isWrite = !isReadMode && fdcPhase === 1;
        ddMode.textContent = isWrite ? "Write" : "Read";
        ddMode.classList.toggle("write", isWrite);
      }
    }
  }

  _updateInsertedState(inserted) {
    const ejectBtn = this.contentElement.querySelector("#disk-eject-btn");
    const saveBtn = this.contentElement.querySelector("#disk-save-btn");
    if (ejectBtn) ejectBtn.disabled = !inserted;
    if (saveBtn) saveBtn.disabled = !inserted;
    if (!inserted) {
      this._currentFilename = null;
      this._updateNameDisplay();
      this._trackAccessCounts.fill(0);
      this._maxAccessCount = 0;
      if (this._renderer) this._renderer.reset();
    }
  }

  _updateNameDisplay() {
    const el = this.contentElement.querySelector("#disk-name");
    if (!el) return;
    const name = this._currentFilename || "No Disk";
    el.textContent = name;
    el.title = this._currentFilename || "";

    // Check for scrolling need
    requestAnimationFrame(() => {
      const textWidth = el.scrollWidth;
      const containerWidth = el.clientWidth;
      if (textWidth > containerWidth + 2) {
        const dist = containerWidth - textWidth;
        const duration = Math.max(3, Math.abs(dist) / 40);
        el.style.setProperty("--scroll-distance", `${dist}px`);
        el.style.setProperty("--scroll-duration", `${duration}s`);
        el.classList.add("scrolling");
      } else {
        el.classList.remove("scrolling");
      }
    });
  }

  async _loadDiskFile(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target.result);
      await addToRecentDisks(file.name, data);
      this._proxy.diskInsert(0, data.buffer.slice(0));
      this._currentFilename = file.name;
      this._updateNameDisplay();
    };
    reader.readAsArrayBuffer(file);
  }

  async _confirmAndEject() {
    const state = this._proxy.state;
    if (state.diskModified) {
      if (!confirm("Disk has been modified. Eject without saving?")) return;
    }
    this._proxy.diskEject(0);
    this._currentFilename = null;
    this._updateNameDisplay();
  }

  async _saveDisk() {
    const data = await this._proxy.diskExport(0);
    if (!data) return;
    const filename = this._currentFilename || "disk.dsk";
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _toggleRecentDropdown() {
    if (this._dropdownOpen) {
      this._closeRecentDropdown();
      return;
    }

    const dropdown = this.contentElement.querySelector("#disk-recent-dropdown");
    if (!dropdown) return;

    const recents = await getRecentDisks();
    if (recents.length === 0) {
      dropdown.innerHTML = `<div class="recent-item empty">No recent disks</div>`;
    } else {
      let html = "";
      for (const entry of recents) {
        html += `<div class="recent-item" data-id="${entry.id}">${entry.filename}</div>`;
      }
      html += `<div class="recent-separator"></div>`;
      html += `<div class="recent-item recent-clear">Clear Recent</div>`;
      dropdown.innerHTML = html;

      dropdown.querySelectorAll(".recent-item:not(.empty):not(.recent-clear)").forEach((item) => {
        item.addEventListener("click", async () => {
          const id = parseInt(item.dataset.id, 10);
          const data = await loadRecentDisk(id);
          if (data) {
            this._proxy.diskInsert(0, data.data.buffer.slice(0));
            this._currentFilename = data.filename;
            this._updateNameDisplay();
          }
          this._closeRecentDropdown();
        });
      });

      const clearBtn = dropdown.querySelector(".recent-clear");
      if (clearBtn) {
        clearBtn.addEventListener("click", async () => {
          await clearRecentDisks();
          this._closeRecentDropdown();
        });
      }
    }

    dropdown.classList.add("open");
    this._dropdownOpen = true;
  }

  _closeRecentDropdown() {
    const dropdown = this.contentElement.querySelector("#disk-recent-dropdown");
    if (dropdown) dropdown.classList.remove("open");
    this._dropdownOpen = false;
  }

  setFilename(filename) {
    this._currentFilename = filename;
    this._updateNameDisplay();
  }
}
