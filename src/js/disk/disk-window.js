/*
 * disk-window.js - Disk Drive window for the ZX Spectrum +3
 *
 * Provides UI for inserting/ejecting DSK disk images, showing drive status
 * (motor, track, write-protect), and saving modified disks.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { addToRecentDisks, getRecentDisks, loadRecentDisk, clearRecentDisks } from "./disk-persistence.js";
import "../css/disk-window.css";

export class DiskWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "disk-window",
      title: "Disk Drive",
      minWidth: 260,
      minHeight: 200,
      defaultWidth: 260,
      defaultHeight: 280,
      defaultPosition: { x: 80, y: 500 },
      resizeDirections: ["n", "s"],
    });
    this._proxy = proxy;
    this._fileInput = null;
    this._currentFilename = null;
    this._dropdownOpen = false;
    this._lastMotorOn = false;
    this._lastTrack = 0;
    this._lastInserted = false;
    this._lastWriteProtected = false;
  }

  getState() {
    const state = super.getState();
    state.currentFilename = this._currentFilename;
    return state;
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.currentFilename) {
      this._currentFilename = state.currentFilename;
    }
  }

  renderContent() {
    return `
      <div class="disk-window-content">
        <div class="disk-drive-section">
          <div class="disk-drive-label">
            <span class="disk-drive-name">Drive A:</span>
            <span class="disk-motor-indicator" id="disk-motor-led"></span>
          </div>
          <div class="disk-filename" id="disk-filename">No disk</div>
          <div class="disk-status-row">
            <span class="disk-track-display" id="disk-track-display">Track: 0</span>
            <label class="disk-wp-label">
              <input type="checkbox" id="disk-wp-checkbox">
              <span>Write Protect</span>
            </label>
          </div>
        </div>
        <div class="disk-controls">
          <div class="disk-btn-row">
            <button class="disk-btn" id="disk-insert-btn" title="Insert disk image">Insert</button>
            <button class="disk-btn" id="disk-empty-btn" title="Insert blank formatted disk">New</button>
            <button class="disk-btn" id="disk-eject-btn" title="Eject disk" disabled>Eject</button>
          </div>
          <div class="disk-btn-row">
            <button class="disk-btn" id="disk-save-btn" title="Save disk image" disabled>Save</button>
            <button class="disk-btn disk-btn-dropdown-toggle" id="disk-recent-btn" title="Recent disks">Recent</button>
          </div>
        </div>
        <div class="disk-recent-dropdown" id="disk-recent-dropdown"></div>
      </div>
    `;
  }

  onContentRendered() {
    // Create hidden file input for disk image selection
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

    // Insert button
    this.contentElement.querySelector("#disk-insert-btn").addEventListener("click", () => {
      this._fileInput.click();
    });

    // New blank disk button
    this.contentElement.querySelector("#disk-empty-btn").addEventListener("click", () => {
      this._proxy.diskInsertEmpty(0);
      this._currentFilename = "Untitled.dsk";
      this._updateFilenameDisplay();
    });

    // Eject button
    this.contentElement.querySelector("#disk-eject-btn").addEventListener("click", () => {
      this._confirmAndEject();
    });

    // Save button
    this.contentElement.querySelector("#disk-save-btn").addEventListener("click", () => {
      this._saveDisk();
    });

    // Recent disks dropdown
    this.contentElement.querySelector("#disk-recent-btn").addEventListener("click", () => {
      this._toggleRecentDropdown();
    });

    // Write protect checkbox
    this.contentElement.querySelector("#disk-wp-checkbox").addEventListener("change", (e) => {
      this._proxy.diskSetWriteProtected(0, e.target.checked);
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (this._dropdownOpen && !e.target.closest("#disk-recent-btn") && !e.target.closest("#disk-recent-dropdown")) {
        this._closeRecentDropdown();
      }
    });

    // Allow drag-and-drop of .dsk files
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
  }

  // Called each frame by WindowManager.updateAll()
  update(proxy) {
    if (!this.contentElement || !this.isVisible) return;

    const state = proxy.state;
    if (!state) return;

    const motorOn = state.diskMotorOn;
    const track = state.diskCurrentTrack;
    const inserted = state.diskInserted;
    const wp = state.diskWriteProtected;

    if (motorOn !== this._lastMotorOn) {
      const led = this.contentElement.querySelector("#disk-motor-led");
      if (led) {
        led.classList.toggle("active", motorOn);
      }
      this._lastMotorOn = motorOn;
    }

    if (track !== this._lastTrack) {
      const trackDisplay = this.contentElement.querySelector("#disk-track-display");
      if (trackDisplay) {
        trackDisplay.textContent = `Track: ${track}`;
      }
      this._lastTrack = track;
    }

    if (inserted !== this._lastInserted) {
      this._updateInsertedState(inserted);
      this._lastInserted = inserted;
    }

    if (wp !== this._lastWriteProtected) {
      const checkbox = this.contentElement.querySelector("#disk-wp-checkbox");
      if (checkbox && checkbox.checked !== wp) {
        checkbox.checked = wp;
      }
      this._lastWriteProtected = wp;
    }
  }

  _updateInsertedState(inserted) {
    const ejectBtn = this.contentElement.querySelector("#disk-eject-btn");
    const saveBtn = this.contentElement.querySelector("#disk-save-btn");

    if (ejectBtn) ejectBtn.disabled = !inserted;
    if (saveBtn) saveBtn.disabled = !inserted;

    if (!inserted) {
      this._currentFilename = null;
      this._updateFilenameDisplay();
    }
  }

  _updateFilenameDisplay() {
    const el = this.contentElement.querySelector("#disk-filename");
    if (el) {
      el.textContent = this._currentFilename || "No disk";
      el.title = this._currentFilename || "";
    }
  }

  async _loadDiskFile(file) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target.result);

      // Save to recent disks
      await addToRecentDisks(file.name, data);

      // Send to emulator
      const buffer = data.buffer.slice(0);
      this._proxy.diskInsert(0, buffer);

      this._currentFilename = file.name;
      this._updateFilenameDisplay();
    };
    reader.readAsArrayBuffer(file);
  }

  async _confirmAndEject() {
    const state = this._proxy.state;
    if (state.diskModified) {
      // The disk has been modified - warn the user
      const proceed = confirm("Disk has been modified. Eject without saving?");
      if (!proceed) return;
    }
    this._proxy.diskEject(0);
    this._currentFilename = null;
    this._updateFilenameDisplay();
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
      dropdown.innerHTML = `<div class="disk-recent-empty">No recent disks</div>`;
    } else {
      let html = "";
      for (const entry of recents) {
        html += `<button class="disk-recent-item" data-id="${entry.id}">${entry.filename}</button>`;
      }
      html += `<button class="disk-recent-item disk-recent-clear">Clear History</button>`;
      dropdown.innerHTML = html;

      dropdown.querySelectorAll(".disk-recent-item:not(.disk-recent-clear)").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = parseInt(btn.dataset.id, 10);
          const data = await loadRecentDisk(id);
          if (data) {
            const buffer = data.data.buffer.slice(0);
            this._proxy.diskInsert(0, buffer);
            this._currentFilename = data.filename;
            this._updateFilenameDisplay();
          }
          this._closeRecentDropdown();
        });
      });

      const clearBtn = dropdown.querySelector(".disk-recent-clear");
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
    if (dropdown) {
      dropdown.classList.remove("open");
    }
    this._dropdownOpen = false;
  }

  // Called by main.js when a disk is inserted programmatically
  setFilename(filename) {
    this._currentFilename = filename;
    this._updateFilenameDisplay();
  }
}
