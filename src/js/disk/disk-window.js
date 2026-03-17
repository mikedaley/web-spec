/*
 * disk-window.js - Disk Drive window for the ZX Spectrum +3 and Opus Discovery
 *
 * Provides UI for inserting/ejecting DSK/OPD disk images with a spinning disk
 * surface visualization, track access heatmap, technical details panel,
 * and recent disks popup. Supports Drive A (0) and Drive B (1).
 * Automatically routes operations to the +3 FDC or Opus Discovery based
 * on which disk interface is active.
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

const FDC_COMMAND_NAMES = {
  0x06: "Read Data",
  0x0C: "Read Del",
  0x05: "Write Data",
  0x09: "Write Del",
  0x0A: "Read ID",
  0x0D: "Format",
  0x11: "Scan Eq",
  0x19: "Scan Lo/Eq",
  0x1D: "Scan Hi/Eq",
  0x07: "Recalibrate",
  0x08: "Sense Int",
  0x03: "Specify",
  0x04: "Sense Drv",
  0x0F: "Seek",
};

function _createDriveState() {
  return {
    filename: null,
    renderer: null,
    trackAccessCounts: new Uint32Array(40),
    maxAccessCount: 0,
    lastDecayTime: 0,
    lastMotorOn: false,
    lastTrack: -1,
    lastInserted: false,
    lastWriteProtected: false,
  };
}

export class DiskWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "disk-window",
      title: "Disk Drive",
      minWidth: 360,
      minHeight: 100,
      maxWidth: 360,
      defaultWidth: 360,
      defaultHeight: 580,
      defaultPosition: { x: 80, y: 500 },
      resizeDirections: [],
    });
    this._proxy = proxy;
    this._fileInput = null;
    this._detailsOpen = false;
    this._graphicsHidden = false;
    this._activeDrive = 0;
    this._drives = [_createDriveState(), _createDriveState()];
    // Track whether a manual insert has been performed on each drive,
    // so _autoRestoreDisk doesn't overwrite it if it completes later.
    this._manualInsert = [false, false];
  }

  getState() {
    const state = super.getState();
    state.filenameA = this._drives[0].filename;
    state.filenameB = this._drives[1].filename;
    state.graphicsHidden = this._graphicsHidden;
    state.detailsOpen = this._detailsOpen;
    state.activeDrive = this._activeDrive;
    state.opusRomType = this._opusRomType ?? 0;
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
    if (state.filenameA) {
      this._drives[0].filename = state.filenameA;
    }
    if (state.filenameB) {
      this._drives[1].filename = state.filenameB;
    }
    // Legacy single-drive state
    if (state.currentFilename && !state.filenameA) {
      this._drives[0].filename = state.currentFilename;
    }
    if (state.activeDrive === 1) {
      this._activeDrive = 1;
    }
    if (state.opusRomType !== undefined) {
      this._opusRomType = state.opusRomType;
      this._proxy.setOpusRomType(state.opusRomType);
    }
    this._switchDriveTab(this._activeDrive);
    this._updateNameDisplay();
    super.restoreState(state);
    this._restoring = false;
    if (this.isVisible) {
      this._fitToContent();
    }

    // Auto-restore disk images from recent disks store
    this._autoRestoreDisk(0);
    this._autoRestoreDisk(1);
  }

  async _autoRestoreDisk(driveIndex) {
    const filename = this._drives[driveIndex].filename;
    if (!filename) return;

    const recents = await getRecentDisks();
    // Check after await — user may have manually inserted a disk while we were reading
    if (this._manualInsert[driveIndex]) return;

    const entry = recents.find((r) => r.filename === filename);
    if (!entry) {
      // Disk not in recent store — clear the stale filename
      this._drives[driveIndex].filename = null;
      this._updateNameDisplay(driveIndex);
      return;
    }

    const data = await loadRecentDisk(entry.id);
    // Check again after second await
    if (this._manualInsert[driveIndex]) return;

    if (!data) {
      this._drives[driveIndex].filename = null;
      this._updateNameDisplay(driveIndex);
      return;
    }

    const isOpus = this._isOpus(this._proxy.state);
    if (isOpus) {
      this._proxy.opusDiskInsert(driveIndex, data.data.buffer.slice(0));
    } else {
      this._proxy.diskInsert(driveIndex, data.data.buffer.slice(0));
    }
  }

  _driveHTML(driveIndex, label) {
    const prefix = driveIndex === 0 ? "" : "b-";
    return `
      <div class="disk-drive" id="disk-drive-${label.toLowerCase()}" ${driveIndex === 1 ? 'style="display:none"' : ""}>
        <div class="drive-image-container">
          <canvas class="disk-surface" id="disk-surface-${label.toLowerCase()}" width="560" height="480"></canvas>
          <span class="drive-label">${label}</span>
        </div>
        <div class="drive-info">
          <span class="disk-name" id="${prefix}disk-name">No Disk</span>
          <span class="disk-track" id="${prefix}disk-track" title="Current Track">T--</span>
        </div>
        <div class="drive-controls">
          <button class="disk-insert" id="${prefix}disk-insert-btn" title="Insert Disk from File">Insert</button>
          <div class="recent-container">
            <button class="disk-recent" id="${prefix}disk-recent-btn" title="Recent Disks">Recent</button>
            <div class="recent-dropdown" id="${prefix}disk-recent-dropdown"></div>
          </div>
          <button class="disk-blank" id="${prefix}disk-blank-btn" title="Insert Blank Disk">Blank</button>
          <button class="disk-eject" id="${prefix}disk-eject-btn" disabled title="Eject Disk">Eject</button>
        </div>
        <div class="drive-controls drive-controls-secondary">
          <button class="disk-save" id="${prefix}disk-save-btn" disabled title="Save Disk Image">Save</button>
          <div class="disk-wp-row">
            <span class="disk-wp-text">WP</span>
            <label class="disk-wp-toggle" id="${prefix}disk-wp-toggle">
              <input type="checkbox" id="${prefix}disk-wp-checkbox">
              <span class="disk-wp-slider"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  renderContent() {
    return `
      <div class="disk-drives-toolbar">
        <div class="drive-tab-group">
          <button class="drive-tab active" data-drive="0">A:</button>
          <button class="drive-tab" data-drive="1">B:</button>
        </div>
        <span class="drive-interface-badge" id="drive-interface-badge">+3 FDC</span>
        <select class="drive-interface-badge drive-opus-rom-select" id="drive-opus-rom-select" style="display:none" title="Opus ROM">
          <option value="0">Opus 2.22</option>
          <option value="1">Opus QD 2.31</option>
        </select>
        <div class="drive-toolbar-spacer"></div>
        <button class="drive-toolbar-btn drive-graphics-btn active" title="Toggle disk surface">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M8 3C4.5 3 1.6 5.3.6 8c1 2.7 3.9 5 7.4 5s6.4-2.3 7.4-5c-1-2.7-3.9-5-7.4-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
          </svg>
        </button>
        <button class="drive-toolbar-btn drive-detail-btn" title="Toggle technical details">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM6.5 7h1.75v4.5H10v1H6v-1h1.25V8H6.5V7z"/>
          </svg>
        </button>
      </div>
      <div class="disk-drives-row">
        ${this._driveHTML(0, "A")}
        ${this._driveHTML(1, "B")}
        <div class="drive-detail-panel">
          <div class="dd-section-label">Drive State</div>
          <div class="drive-detail-grid">
            <span class="dd-label">Track</span><span class="dd-val" id="dd-track">0</span>
            <span class="dd-label">Motor</span><span class="dd-val" id="dd-motor">OFF</span>
            <span class="dd-label">Phase</span><span class="dd-val" id="dd-phase">Command</span>
            <span class="dd-label">Mode</span><span class="dd-val" id="dd-mode">Read</span>
          </div>
          <div class="dd-section-label">FDC Command</div>
          <div class="drive-detail-grid">
            <span class="dd-label">Cmd</span><span class="dd-val" id="dd-cmd">--</span>
            <span class="dd-label">EOT</span><span class="dd-val" id="dd-eot">--</span>
            <span class="dd-label">Side</span><span class="dd-val" id="dd-side">--</span>
            <span class="dd-label">Data</span><span class="dd-val" id="dd-data">--</span>
          </div>
          <div class="dd-section-label">Sector ID</div>
          <div class="drive-detail-grid">
            <span class="dd-label">C</span><span class="dd-val" id="dd-sec-c">--</span>
            <span class="dd-label">H</span><span class="dd-val" id="dd-sec-h">--</span>
            <span class="dd-label">R</span><span class="dd-val" id="dd-sec-r">--</span>
            <span class="dd-label">N</span><span class="dd-val" id="dd-sec-n">--</span>
          </div>
          <div class="dd-section-label">Result Status</div>
          <div class="drive-detail-grid dd-grid-3col">
            <span class="dd-label">ST0</span><span class="dd-val" id="dd-st0">--</span>
            <span class="dd-label">ST1</span><span class="dd-val" id="dd-st1">--</span>
            <span class="dd-label">ST2</span><span class="dd-val" id="dd-st2">--</span>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    // Drive tabs
    this.contentElement.querySelectorAll(".drive-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const drive = parseInt(tab.dataset.drive, 10);
        this._switchDriveTab(drive);
      });
    });

    // Opus ROM selector
    const romSelect = this.contentElement.querySelector("#drive-opus-rom-select");
    if (romSelect) {
      // Restore saved ROM type
      if (this._opusRomType !== undefined) {
        romSelect.value = String(this._opusRomType);
      }
      romSelect.addEventListener("change", () => {
        this._opusRomType = parseInt(romSelect.value, 10);
        this._proxy.setOpusRomType(this._opusRomType);
      });
    }

    // Toolbar buttons
    this._graphicsBtn = this.contentElement.querySelector(".drive-graphics-btn");
    this._graphicsBtn.addEventListener("click", () => this._toggleGraphics());
    this._detailBtn = this.contentElement.querySelector(".drive-detail-btn");
    this._detailBtn.addEventListener("click", () => this._toggleDetails());

    // Disk surface renderers
    const canvasA = this.contentElement.querySelector("#disk-surface-a");
    if (canvasA) this._drives[0].renderer = new DiskSurfaceRenderer(canvasA);
    const canvasB = this.contentElement.querySelector("#disk-surface-b");
    if (canvasB) this._drives[1].renderer = new DiskSurfaceRenderer(canvasB);

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

    // Wire up buttons for both drives
    this._wireButtons(0, "");
    this._wireButtons(1, "b-");

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
      if (file && this._isAllowedFormat(file.name, this._proxy.state)) {
        this._loadDiskFile(file);
      }
    });

    this._fitToContent();
  }

  _wireButtons(driveIndex, prefix) {
    const q = (sel) => this.contentElement.querySelector(`#${prefix}${sel}`);

    q("disk-insert-btn").addEventListener("click", () => {
      const exts = this._getAllowedExtensions(this._proxy.state);
      const accept = exts.map(e => `${e},${e.toUpperCase()}`).join(",");
      this._fileInput.accept = accept;
      this._fileInput.click();
    });
    q("disk-blank-btn").addEventListener("click", () => {
      this._manualInsert[driveIndex] = true;
      const isOpus = this._isOpus(this._proxy.state);
      if (isOpus) {
        this._proxy.opusDiskInsertEmpty(driveIndex);
      } else {
        this._proxy.diskInsertEmpty(driveIndex);
      }
      this._drives[driveIndex].filename = isOpus ? "Untitled.opd" : "Untitled.dsk";
      this._updateNameDisplay(driveIndex);
    });
    q("disk-eject-btn").addEventListener("click", () => {
      this._confirmAndEject(driveIndex);
    });
    q("disk-save-btn").addEventListener("click", () => {
      this._saveDisk(driveIndex);
    });
    q("disk-recent-btn").addEventListener("click", () => {
      this._toggleRecentDropdown(driveIndex);
    });
    q("disk-wp-checkbox").addEventListener("change", (e) => {
      if (this._isOpus(this._proxy.state)) {
        this._proxy.opusDiskSetWriteProtected(driveIndex, e.target.checked);
      } else {
        this._proxy.diskSetWriteProtected(driveIndex, e.target.checked);
      }
    });
  }

  _switchDriveTab(drive) {
    this._activeDrive = drive;
    // Update tab buttons
    this.contentElement.querySelectorAll(".drive-tab").forEach((tab) => {
      tab.classList.toggle("active", parseInt(tab.dataset.drive, 10) === drive);
    });
    // Show/hide drive panels
    const panelA = this.contentElement.querySelector("#disk-drive-a");
    const panelB = this.contentElement.querySelector("#disk-drive-b");
    if (panelA) panelA.style.display = drive === 0 ? "" : "none";
    if (panelB) panelB.style.display = drive === 1 ? "" : "none";
    this._fitToContent();
    if (this.onStateChange) this.onStateChange();
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

  // Detect which disk interface is active
  // +2A (3) and +3 (4) have the built-in µPD765A FDC
  // 48K (0), 128K (1), +2 (2) can use the Opus Discovery if enabled
  _isOpus(state) {
    const mid = state.machineId;
    if (mid === 3 || mid === 4) return false; // +2A/+3 always use built-in FDC
    return !!state.opusEnabled;
  }

  _hasDiskInterface(state) {
    const mid = state.machineId;
    if (mid === 3 || mid === 4) return true; // +2A/+3 built-in FDC
    return !!state.opusEnabled;              // others need Opus
  }

  _getInterfaceName(state) {
    const mid = state.machineId;
    if (mid === 3 || mid === 4) return "+3 FDC";
    if (state.opusEnabled) return "Opus";
    return "None";
  }

  // Get allowed disk image extensions for the active controller
  _getAllowedExtensions(state) {
    if (this._isOpus(state)) return [".opd"];
    return [".dsk"];
  }

  // Check if a filename matches the allowed formats for the active controller
  _isAllowedFormat(filename, state) {
    const exts = this._getAllowedExtensions(state);
    const lower = filename.toLowerCase();
    return exts.some(ext => lower.endsWith(ext));
  }

  // Read per-drive disk state from the correct interface (Opus or +3 FDC)
  _getDriveState(driveIndex, state) {
    if (this._isOpus(state)) {
      if (driveIndex === 0) {
        return {
          motorOn: state.opusMotorOn,
          track: state.opusCurrentTrack,
          inserted: state.opusDiskInserted,
          wp: state.opusDiskWriteProtected,
          modified: state.opusDiskModified,
          isReadMode: true, // WD1770 doesn't expose this the same way
        };
      } else {
        return {
          motorOn: state.opusMotorOn,
          track: state.opusCurrentTrack, // WD1770 has one track register
          inserted: state.opusDiskBInserted,
          wp: state.opusDiskBWriteProtected,
          modified: state.opusDiskBModified,
          isReadMode: true,
        };
      }
    }
    // +3 FDC
    if (driveIndex === 0) {
      return {
        motorOn: state.diskMotorOn,
        track: state.diskCurrentTrack,
        inserted: state.diskInserted,
        wp: state.diskWriteProtected,
        modified: state.diskModified,
        isReadMode: state.diskReadMode,
      };
    }
    return {
      motorOn: state.diskMotorOn,
      track: state.diskBCurrentTrack,
      inserted: state.diskBInserted,
      wp: state.diskBWriteProtected,
      modified: state.diskBModified,
      isReadMode: state.diskReadMode,
    };
  }

  // Called each frame by the render loop
  update(proxy) {
    if (!this.contentElement || !this.isVisible) return;
    const state = proxy.state;
    if (!state) return;

    const now = performance.now();

    // Update interface badge and ROM selector
    const isOpus = this._isOpus(state);
    if (isOpus !== this._lastIsOpus) {
      const badge = this.contentElement.querySelector("#drive-interface-badge");
      const romSelect = this.contentElement.querySelector("#drive-opus-rom-select");
      if (badge) {
        badge.textContent = isOpus ? "" : "+3 FDC";
        badge.style.display = isOpus ? "none" : "";
      }
      if (romSelect) {
        romSelect.style.display = isOpus ? "" : "none";
        romSelect.value = String(state.opusRomType ?? 0);
      }
      this._lastIsOpus = isOpus;
    }

    // Update both drives (track access counts decay even when not visible)
    this._updateDrive(0, state, now);
    this._updateDrive(1, state, now);

    // Update details panel (shared FDC state — uses active drive's track)
    if (this._detailsOpen) {
      this._updateDetailsPanel(state);
    }
  }

  _updateDrive(driveIndex, state, now) {
    const ds = this._drives[driveIndex];
    const prefix = driveIndex === 0 ? "" : "b-";
    const isActive = driveIndex === this._activeDrive;

    // Read per-drive state from the active disk interface
    const driveState = this._getDriveState(driveIndex, state);
    const { motorOn, track, inserted, wp, isReadMode } = driveState;

    // Update DOM only for the active drive tab
    if (isActive) {
      // Track label
      if (track !== ds.lastTrack || motorOn !== ds.lastMotorOn) {
        const trackEl = this.contentElement.querySelector(`#${prefix}disk-track`);
        if (trackEl) {
          trackEl.textContent = inserted ? `T${String(track).padStart(2, "0")}` : "T--";
          trackEl.classList.toggle("active", motorOn);
        }
      }

      // Inserted state
      if (inserted !== ds.lastInserted) {
        this._updateInsertedState(driveIndex, inserted);
      }

      // Write protect
      if (wp !== ds.lastWriteProtected) {
        const cb = this.contentElement.querySelector(`#${prefix}disk-wp-checkbox`);
        if (cb && cb.checked !== wp) cb.checked = wp;
      }
    }

    // Always track last-known values
    ds.lastTrack = track;
    ds.lastMotorOn = motorOn;
    ds.lastInserted = inserted;
    ds.lastWriteProtected = wp;

    // Track access heat map (always runs)
    if (motorOn && inserted) {
      ds.trackAccessCounts[track]++;
      if (ds.trackAccessCounts[track] > ds.maxAccessCount) {
        ds.maxAccessCount = ds.trackAccessCounts[track];
      }
    }

    // Decay access counts
    if (now - ds.lastDecayTime > 100) {
      let max = 0;
      for (let i = 0; i < 40; i++) {
        ds.trackAccessCounts[i] = Math.floor(ds.trackAccessCounts[i] * 0.8);
        if (ds.trackAccessCounts[i] > max) max = ds.trackAccessCounts[i];
      }
      ds.maxAccessCount = max;
      ds.lastDecayTime = now;
    }

    // Update surface renderer (only for active drive)
    if (isActive && ds.renderer && !this._graphicsHidden) {
      ds.renderer.update({
        hasDisk: inserted,
        isActive: motorOn,
        isWriteMode: !isReadMode,
        track,
        trackAccessCounts: ds.trackAccessCounts,
        maxAccessCount: ds.maxAccessCount,
        timestamp: now,
      });
    }
  }

  _updateDetailsPanel(state) {
    const el = (id) => this.contentElement.querySelector(`#${id}`);
    const hex = (v) => v !== undefined ? v.toString(16).toUpperCase().padStart(2, "0") : "--";

    const ds = this._drives[this._activeDrive];
    const driveState = this._getDriveState(this._activeDrive, state);
    const track = ds.lastTrack;
    const motorOn = driveState.motorOn;
    const isOpus = this._isOpus(state);
    const fdcPhase = isOpus ? 0 : state.diskFDCPhase;
    const isReadMode = driveState.isReadMode;

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

    // FDC command info
    const cmdId = state.diskCommand;
    const cmdName = FDC_COMMAND_NAMES[cmdId & 0x1F] || (cmdId ? `0x${hex(cmdId)}` : "--");
    const ddCmd = el("dd-cmd");
    if (ddCmd) ddCmd.textContent = cmdName;

    const ddEot = el("dd-eot");
    if (ddEot) ddEot.textContent = state.diskEOT !== undefined ? state.diskEOT : "--";

    const ddSide = el("dd-side");
    if (ddSide) ddSide.textContent = state.diskSide !== undefined ? state.diskSide : "--";

    const ddData = el("dd-data");
    if (ddData) {
      const idx = state.diskDataIndex;
      const size = state.diskDataSize;
      ddData.textContent = size > 0 ? `${idx}/${size}` : "--";
    }

    // Sector ID
    const ddC = el("dd-sec-c");
    if (ddC) ddC.textContent = state.diskLastC !== undefined ? hex(state.diskLastC) : "--";
    const ddH = el("dd-sec-h");
    if (ddH) ddH.textContent = state.diskLastH !== undefined ? hex(state.diskLastH) : "--";
    const ddR = el("dd-sec-r");
    if (ddR) ddR.textContent = state.diskLastR !== undefined ? hex(state.diskLastR) : "--";
    const ddN = el("dd-sec-n");
    if (ddN) ddN.textContent = state.diskLastN !== undefined ? hex(state.diskLastN) : "--";

    // Result status registers
    const ddST0 = el("dd-st0");
    if (ddST0) ddST0.textContent = state.diskST0 !== undefined ? hex(state.diskST0) : "--";
    const ddST1 = el("dd-st1");
    if (ddST1) ddST1.textContent = state.diskST1 !== undefined ? hex(state.diskST1) : "--";
    const ddST2 = el("dd-st2");
    if (ddST2) ddST2.textContent = state.diskST2 !== undefined ? hex(state.diskST2) : "--";
  }

  _updateInsertedState(driveIndex, inserted) {
    const prefix = driveIndex === 0 ? "" : "b-";
    const ejectBtn = this.contentElement.querySelector(`#${prefix}disk-eject-btn`);
    const saveBtn = this.contentElement.querySelector(`#${prefix}disk-save-btn`);
    if (ejectBtn) ejectBtn.disabled = !inserted;
    if (saveBtn) saveBtn.disabled = !inserted;
    if (!inserted) {
      this._drives[driveIndex].filename = null;
      this._updateNameDisplay(driveIndex);
      this._drives[driveIndex].trackAccessCounts.fill(0);
      this._drives[driveIndex].maxAccessCount = 0;
      if (this._drives[driveIndex].renderer) this._drives[driveIndex].renderer.reset();
    }
  }

  _updateNameDisplay(driveIndex) {
    if (driveIndex === undefined) driveIndex = this._activeDrive;
    const prefix = driveIndex === 0 ? "" : "b-";
    const el = this.contentElement.querySelector(`#${prefix}disk-name`);
    if (!el) return;
    const name = this._drives[driveIndex].filename || "No Disk";
    el.textContent = name;
    el.title = this._drives[driveIndex].filename || "";

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
    const drive = this._activeDrive;
    this._manualInsert[drive] = true;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target.result);
      await addToRecentDisks(file.name, data);
      if (this._isOpus(this._proxy.state)) {
        this._proxy.opusDiskInsert(drive, data.buffer.slice(0));
      } else {
        this._proxy.diskInsert(drive, data.buffer.slice(0));
      }
      this._drives[drive].filename = file.name;
      this._updateNameDisplay(drive);
    };
    reader.readAsArrayBuffer(file);
  }

  async _confirmAndEject(driveIndex) {
    const state = this._proxy.state;
    const driveState = this._getDriveState(driveIndex, state);
    if (driveState.modified) {
      if (!confirm("Disk has been modified. Eject without saving?")) return;
    }
    if (this._isOpus(state)) {
      this._proxy.opusDiskEject(driveIndex);
    } else {
      this._proxy.diskEject(driveIndex);
    }
    this._drives[driveIndex].filename = null;
    this._updateNameDisplay(driveIndex);
  }

  async _saveDisk(driveIndex) {
    const isOpus = this._isOpus(this._proxy.state);
    const data = isOpus
      ? await this._proxy.opusDiskExport(driveIndex)
      : await this._proxy.diskExport(driveIndex);
    if (!data) return;
    const defaultExt = isOpus ? ".opd" : ".dsk";
    const filename = this._drives[driveIndex].filename || `disk${defaultExt}`;
    const blob = new Blob([data], { type: "application/octet-stream" });

    if (window.showSaveFilePicker) {
      try {
        const description = isOpus ? "Opus Disk Image" : "Disk Image";
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description,
            accept: { "application/octet-stream": [defaultExt] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }

    // Fallback for browsers without File System Access API
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _toggleRecentDropdown(driveIndex) {
    if (this._dropdownOpen) {
      this._closeRecentDropdown();
      return;
    }

    const prefix = driveIndex === 0 ? "" : "b-";
    const dropdown = this.contentElement.querySelector(`#${prefix}disk-recent-dropdown`);
    if (!dropdown) return;

    const allRecents = await getRecentDisks();
    const recents = allRecents.filter(entry =>
      this._isAllowedFormat(entry.filename, this._proxy.state)
    );
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
          this._manualInsert[driveIndex] = true;
          const id = parseInt(item.dataset.id, 10);
          const data = await loadRecentDisk(id);
          if (data) {
            if (this._isOpus(this._proxy.state)) {
              this._proxy.opusDiskInsert(driveIndex, data.data.buffer.slice(0));
            } else {
              this._proxy.diskInsert(driveIndex, data.data.buffer.slice(0));
            }
            this._drives[driveIndex].filename = data.filename;
            this._updateNameDisplay(driveIndex);
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
    this._dropdownDrive = driveIndex;
  }

  _closeRecentDropdown() {
    const prefix = this._dropdownDrive === 1 ? "b-" : "";
    const dropdown = this.contentElement.querySelector(`#${prefix}disk-recent-dropdown`);
    if (dropdown) dropdown.classList.remove("open");
    this._dropdownOpen = false;
  }

  setFilename(filename, drive = 0) {
    this._manualInsert[drive] = true;
    this._drives[drive].filename = filename;
    this._updateNameDisplay(drive);
  }
}
