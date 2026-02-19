/*
 * tape-window.js - Tape Player window with block list and transport controls
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  addToRecentTapes,
  getRecentTapes,
  loadRecentTape,
  clearRecentTapes,
  getLibraryTapeData,
} from "./tape-persistence.js";
import "../css/tape-window.css";

export class TapeWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "tape-window",
      title: "Tape Player",
      minWidth: 280,
      minHeight: 650,
      defaultWidth: 280,
      defaultHeight: 400,
      defaultPosition: { x: 80, y: 80 },
      resizeDirections: ["n", "s"],
    });
    this._proxy = proxy;
    this._blocks = [];
    this._metadata = null;
    this._infoPanelOpen = false;
    this._cassettePanelOpen = false;
    this._lastCurrentBlock = -1;
    this._lastIsPlaying = false;
    this._dropdownOpen = false;
    this._fileInput = null;
    this._currentFilename = null;
    this._isTZX = false;
    this._rawTapeData = null;
    this._lastIsRecording = false;
    this._lastRecordedBlockCount = 0;
    this._lastRecordedTapData = null;

    // Callback for when a TAP is loaded via the window's own controls
    this.onTapeLoaded = null;
  }

  getState() {
    const state = super.getState();
    state.instantLoad = !!this.contentElement?.querySelector(
      "#tape-speed-checkbox",
    )?.checked;
    state.infoPanelOpen = this._infoPanelOpen;
    state.cassettePanelOpen = this._cassettePanelOpen;
    return state;
  }

  restoreState(state) {
    if (state.instantLoad) {
      const checkbox = this.contentElement?.querySelector(
        "#tape-speed-checkbox",
      );
      if (checkbox) {
        checkbox.checked = true;
        this._proxy.tapeSetInstantLoad(true);
        this._updateSpeedSwitch(true);
      }
    }
    if (state.infoPanelOpen) {
      this._infoPanelOpen = true;
      this._applyInfoPanelState();
    }
    if (state.cassettePanelOpen) {
      this._cassettePanelOpen = true;
      this._applyCassettePanelState();
    }
    super.restoreState(state);
  }

  renderContent() {
    return `
      <div class="tape-player">
        <div class="tape-cassette-toggle" id="tape-cassette-toggle">
          <svg class="tape-cassette-chevron" viewBox="0 0 12 12" width="10" height="10">
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <span>Cassette</span>
        </div>
        <div class="tape-cassette-vis hidden" id="tape-cassette-vis">
          <div class="tape-empty-deck" id="tape-empty-deck">
            <svg viewBox="0 0 2626 1654" class="tape-cassette-img">
              <defs>
                <radialGradient id="spindle-face" cx="45%" cy="40%" r="50%">
                  <stop offset="0%" stop-color="#666"/>
                  <stop offset="60%" stop-color="#4a4a4a"/>
                  <stop offset="100%" stop-color="#3a3a3c"/>
                </radialGradient>
              </defs>
              <rect x="0" y="0" width="2626" height="1654" fill="#1a1a1a"/>
              <!-- Left spindle — center 828,757 matching cassette -->
              <g id="deck-spindle-left" class="deck-spindle">
                <circle cx="828" cy="757" r="155" fill="#222" stroke="#333" stroke-width="3"/>
                <circle cx="828" cy="757" r="120" fill="url(#spindle-face)" stroke="#555" stroke-width="3"/>
                <circle cx="828" cy="757" r="82" fill="#333" stroke="#4a4a4a" stroke-width="2"/>
                <rect x="817" y="686" width="22" height="142" rx="3" fill="#5a5a5a" stroke="#6a6a6a" stroke-width="1"/>
                <rect x="767" y="746" width="122" height="22" rx="3" fill="#5a5a5a" stroke="#6a6a6a" stroke-width="1"/>
                <circle cx="828" cy="757" r="24" fill="#1a1a1a" stroke="#444" stroke-width="2"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(0,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(30,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(60,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(90,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(120,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(150,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(180,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(210,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(240,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(270,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(300,828,757)"/>
                <rect x="822" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(330,828,757)"/>
              </g>
              <!-- Right spindle — center 1785,757 matching cassette -->
              <g id="deck-spindle-right" class="deck-spindle">
                <circle cx="1785" cy="757" r="155" fill="#222" stroke="#333" stroke-width="3"/>
                <circle cx="1785" cy="757" r="120" fill="url(#spindle-face)" stroke="#555" stroke-width="3"/>
                <circle cx="1785" cy="757" r="82" fill="#333" stroke="#4a4a4a" stroke-width="2"/>
                <rect x="1774" y="686" width="22" height="142" rx="3" fill="#5a5a5a" stroke="#6a6a6a" stroke-width="1"/>
                <rect x="1724" y="746" width="122" height="22" rx="3" fill="#5a5a5a" stroke="#6a6a6a" stroke-width="1"/>
                <circle cx="1785" cy="757" r="24" fill="#1a1a1a" stroke="#444" stroke-width="2"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(0,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(30,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(60,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(90,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(120,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(150,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(180,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(210,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(240,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(270,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(300,1785,757)"/>
                <rect x="1779" y="630" width="12" height="16" rx="2" fill="#555" transform="rotate(330,1785,757)"/>
              </g>
            </svg>
          </div>
          <div class="tape-cassette-label" id="tape-cassette-label"></div>
        </div>
        <div class="tape-transport">
          <button class="tape-transport-btn rewind-all" id="tape-btn-rewind-all" title="Rewind to Start">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="3" y="6" width="2.5" height="12"/>
              <path d="M9 18V6l-3.5 6 3.5 6zm8 0V6l-8 6 8 6z"/>
            </svg>
          </button>
          <button class="tape-transport-btn rewind" id="tape-btn-rewind" title="Rewind Block">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>
          <button class="tape-transport-btn play" id="tape-btn-play" title="Play">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button class="tape-transport-btn stop" id="tape-btn-stop" title="Stop">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="6" y="6" width="12" height="12"/>
            </svg>
          </button>
          <button class="tape-transport-btn record" id="tape-btn-record" title="Record">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="12" r="7"/>
            </svg>
          </button>
          <button class="tape-transport-btn fast-forward" id="tape-btn-ffwd" title="Fast Forward Block">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M4 18V6l8.5 6L4 18zm9 0V6l8.5 6L13 18z"/>
            </svg>
          </button>
        </div>
        <div class="tape-controls-bar">
          <div class="tape-load-container">
            <button class="tape-load-btn" id="tape-btn-load" title="Insert Tape">Insert</button>
            <div class="tape-recent-container">
              <button class="tape-recent-btn" id="tape-btn-recent" title="Recent &amp; Library">
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path d="M3 5l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </div>
          </div>
          <button class="tape-eject-btn" id="tape-btn-eject" title="Eject Tape" disabled>Eject</button>
          <div class="tape-speed-switch" id="tape-speed-switch" title="Toggle loading speed">
            <span class="tape-speed-label tape-speed-label-normal" title="Normal speed">
              <svg class="tape-speed-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </span>
            <label class="tape-toggle">
              <input type="checkbox" id="tape-speed-checkbox" />
              <span class="tape-toggle-track"></span>
            </label>
            <span class="tape-speed-label tape-speed-label-instant" title="Instant speed">
              <svg class="tape-speed-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
            </span>
          </div>
        </div>
        <div class="tape-filename-banner hidden" id="tape-filename-banner">
          <span class="tape-format-badge" id="tape-format-badge"></span>
          <span class="tape-filename-text" id="tape-filename-text"></span>
        </div>
        <div class="tape-block-list" id="tape-block-list">
          <div class="tape-empty-state">No tape inserted</div>
        </div>
        <div class="tape-info-toggle" id="tape-info-toggle">
          <svg class="tape-info-chevron" viewBox="0 0 12 12" width="10" height="10">
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
          <span>Tape Info</span>
        </div>
        <div class="tape-info-panel hidden" id="tape-info-panel">
          <div class="tape-info-content" id="tape-info-content"></div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    // Transport controls
    const playBtn = this.contentElement.querySelector("#tape-btn-play");
    const stopBtn = this.contentElement.querySelector("#tape-btn-stop");
    const rewindBtn = this.contentElement.querySelector("#tape-btn-rewind");
    const rewindAllBtn = this.contentElement.querySelector("#tape-btn-rewind-all");
    const ffwdBtn = this.contentElement.querySelector("#tape-btn-ffwd");

    playBtn.addEventListener("click", () => {
      if (!this._proxy.tapeIsLoaded() && !this._blocks.length) return;
      // Re-send tape data to WASM if it was lost (e.g. after power cycle reset)
      if (!this._proxy.tapeIsLoaded() && this._rawTapeData) {
        this._reloadTapeIntoWasm();
      }
      if (this._proxy.tapeIsPlaying()) {
        this._proxy.tapeStop();
      } else {
        this._proxy.tapePlay();
      }
    });

    stopBtn.addEventListener("click", () => {
      if (this._proxy.tapeIsRecording()) {
        this._proxy.tapeRecordStop();
        return;
      }
      if (!this._proxy.tapeIsLoaded() && !this._blocks.length) return;
      this._proxy.tapeStop();
    });

    // Record button - toggle recording
    const recordBtn = this.contentElement.querySelector("#tape-btn-record");
    recordBtn.addEventListener("click", () => {
      if (this._proxy.tapeIsRecording()) {
        this._proxy.tapeRecordStop();
      } else {
        if (this._proxy.tapeIsPlaying()) {
          this._proxy.tapeStop();
        }
        this._lastRecordedBlockCount = 0;
        this._originalBlockCount = this._blocks.length;
        this._proxy.tapeRecordStart();
      }
    });

    // Register callback for when recording completes — store data for save on eject
    const origOnTapLoaded = this._proxy.onTapLoaded;
    this._proxy.onTapeRecordComplete = (dataBuffer, size, finalBlocks) => {
      this._lastRecordedBlockCount = 0;
      if (dataBuffer && size > 0) {
        this._lastRecordedTapData = new Uint8Array(dataBuffer);
        // Reload the combined TAP data into WASM so the full tape is playable
        this._rawTapeData = new Uint8Array(this._lastRecordedTapData);
        this._isTZX = false;

        // After reload, set a 5-second pause at the boundary between original and recorded blocks
        const boundaryIndex = this._originalBlockCount;
        if (boundaryIndex > 0) {
          const savedOnTapLoaded = this._proxy.onTapLoaded;
          this._proxy.onTapLoaded = (blocks, metadata) => {
            // Restore original callback and forward
            this._proxy.onTapLoaded = savedOnTapLoaded;
            if (savedOnTapLoaded) savedOnTapLoaded(blocks, metadata);
            // Set 5-second pause on the last block before the recording boundary
            this._proxy.tapeSetBlockPause(boundaryIndex - 1, 5000);
          };
        }

        const buffer = this._rawTapeData.buffer.slice(0);
        this._proxy.loadTAP(buffer);

        // Update the recent tapes entry in IndexedDB with the combined TAP data
        if (this._currentFilename) {
          addToRecentTapes(this._currentFilename, this._rawTapeData);
        }
      }
      // Render the complete block list including the flushed final block
      if (finalBlocks && finalBlocks.length > 0) {
        this._renderRecordedBlocks(finalBlocks);
      }
    };

    rewindBtn.addEventListener("click", () => {
      if (!this._proxy.tapeIsLoaded() && !this._blocks.length) return;
      if (this._proxy.tapeIsPlaying()) return;

      const currentBlock = this._proxy.tapeGetCurrentBlock();
      if (currentBlock === 0) return;

      // Rewind one block
      this._proxy.tapeRewindBlock();
      this._lastCurrentBlock = -1;

      // Reset progress bar for the block we just rewound past
      const bar = this.contentElement.querySelector(
        `.tape-block-progress[data-progress-index="${currentBlock}"]`,
      );
      if (bar) bar.style.width = "0%";

      // Also reset the previous block's progress (we're now at its start)
      const prevBar = this.contentElement.querySelector(
        `.tape-block-progress[data-progress-index="${currentBlock - 1}"]`,
      );
      if (prevBar) prevBar.style.width = "0%";

      // Update active block highlight
      const items = this.contentElement.querySelectorAll(".tape-block-item");
      items.forEach((item) => {
        const idx = parseInt(item.dataset.index, 10);
        item.classList.toggle("active", idx === currentBlock - 1);
      });

      // Brief fast-reverse spindle animation
      const spindleEls = this._getAllSpindleEls();
      for (const el of spindleEls) {
        el.classList.remove("spinning", "paused");
        el.classList.add("rewinding");
      }
      setTimeout(() => {
        for (const el of spindleEls) {
          el.classList.remove("rewinding");
        }
      }, 800);
    });

    rewindAllBtn.addEventListener("click", () => {
      if (!this._proxy.tapeIsLoaded() && !this._blocks.length) return;
      if (this._proxy.tapeIsPlaying()) return;

      const currentBlock = this._proxy.tapeGetCurrentBlock();
      if (currentBlock === 0) return;

      this._proxy.tapeRewind();
      this._lastCurrentBlock = -1;
      this.contentElement
        .querySelectorAll(".tape-block-progress")
        .forEach((bar) => {
          bar.style.width = "0%";
        });

      // Update active block highlight to block 0
      const items = this.contentElement.querySelectorAll(".tape-block-item");
      items.forEach((item) => {
        const idx = parseInt(item.dataset.index, 10);
        item.classList.toggle("active", idx === 0);
      });

      // Longer fast-reverse spindle animation for full rewind
      const spindleEls = this._getAllSpindleEls();
      for (const el of spindleEls) {
        el.classList.remove("spinning", "paused");
        el.classList.add("rewinding");
      }
      setTimeout(() => {
        for (const el of spindleEls) {
          el.classList.remove("rewinding");
        }
      }, 2000);
    });

    ffwdBtn.addEventListener("click", () => {
      if (!this._proxy.tapeIsLoaded() && !this._blocks.length) return;
      if (this._proxy.tapeIsPlaying()) return;

      const currentBlock = this._proxy.tapeGetCurrentBlock();
      const blockCount = this._proxy.tapeGetBlockCount();
      if (currentBlock + 1 >= blockCount) return;

      this._proxy.tapeForwardBlock();
      this._lastCurrentBlock = -1;

      // Mark the current block's progress as complete
      const bar = this.contentElement.querySelector(
        `.tape-block-progress[data-progress-index="${currentBlock}"]`,
      );
      if (bar) bar.style.width = "100%";

      // Update active block highlight
      const items = this.contentElement.querySelectorAll(".tape-block-item");
      items.forEach((item) => {
        const idx = parseInt(item.dataset.index, 10);
        item.classList.toggle("active", idx === currentBlock + 1);
      });

      // Brief fast-forward spindle animation (play direction)
      const spindleEls = this._getAllSpindleEls();
      for (const el of spindleEls) {
        el.classList.remove("spinning", "paused");
        el.classList.add("fast-forwarding");
      }
      setTimeout(() => {
        for (const el of spindleEls) {
          el.classList.remove("fast-forwarding");
        }
      }, 800);
    });

    // Load button - opens file picker
    const loadBtn = this.contentElement.querySelector("#tape-btn-load");
    this._fileInput = document.createElement("input");
    this._fileInput.type = "file";
    this._fileInput.accept = ".tap,.tzx";
    this._fileInput.style.display = "none";
    this.contentElement.appendChild(this._fileInput);

    loadBtn.addEventListener("click", () => {
      this._closeDropdown();
      this._fileInput.click();
    });

    this._fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this._loadFileFromDisk(file);
      this._fileInput.value = "";
    });

    // Recent/Library dropdown (appended to body to avoid overflow clipping)
    this._dropdown = document.createElement("div");
    this._dropdown.className = "tape-recent-dropdown";
    this._dropdown.id = "tape-recent-dropdown";
    document.body.appendChild(this._dropdown);

    const recentBtn = this.contentElement.querySelector("#tape-btn-recent");
    recentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleDropdown();
    });

    // Close dropdown on outside click
    this._outsideClickHandler = (e) => {
      if (
        !e.target.closest(".tape-recent-container") &&
        !this._dropdown.contains(e.target)
      ) {
        this._closeDropdown();
      }
    };
    document.addEventListener("click", this._outsideClickHandler);

    // Speed toggle switch (disabled for TZX files)
    const speedCheckbox = this.contentElement.querySelector(
      "#tape-speed-checkbox",
    );
    speedCheckbox.addEventListener("change", () => {
      if (this._isTZX) {
        speedCheckbox.checked = false;
        return;
      }
      this._proxy.tapeSetInstantLoad(speedCheckbox.checked);
      this._updateSpeedSwitch(speedCheckbox.checked);
    });

    // Eject button
    const ejectBtn = this.contentElement.querySelector("#tape-btn-eject");
    ejectBtn.addEventListener("click", () => {
      this._ejectTape();
    });

    // Info panel toggle
    const infoToggle = this.contentElement.querySelector("#tape-info-toggle");
    infoToggle.addEventListener("click", () => {
      this._infoPanelOpen = !this._infoPanelOpen;
      this._applyInfoPanelState();
    });

    // Cassette visualization toggle
    const cassetteToggle = this.contentElement.querySelector(
      "#tape-cassette-toggle",
    );
    cassetteToggle.addEventListener("click", () => {
      this._cassettePanelOpen = !this._cassettePanelOpen;
      this._applyCassettePanelState();
    });

    // Load cassette SVG inline so we can animate spindle elements
    this._loadCassetteSvg();
  }

  async _loadCassetteSvg() {
    const container = this.contentElement?.querySelector("#tape-cassette-vis");
    if (!container) return;
    try {
      const resp = await fetch("/assets/cassette.svg");
      const svgText = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (!svg) return;

      svg.classList.add("tape-cassette-img");
      svg.removeAttribute("width");
      svg.removeAttribute("height");

      // Initially hidden until a tape is inserted
      svg.style.display = "none";

      // Make the reel window fills transparent so deck spindles are visible behind the cassette spindles


      // Make reel window fills transparent so deck spindles are visible
      for (const id of ["#path19", "#path20"]) {
        const el = svg.querySelector(id);
        if (el) {
          el.setAttribute("fill", "transparent");
          el.setAttribute("stroke", "transparent");
        }
      }

      // Insert SVG before the label overlay
      const label = container.querySelector("#tape-cassette-label");
      container.insertBefore(svg, label);
      this._cassetteSvg = svg;

      // Show cassette if a tape is already loaded (e.g. restored from session)
      if (this._blocks.length > 0) {
        this._showCassette(true);
      }
    } catch (err) {
      console.warn("Failed to load cassette SVG:", err);
    }
  }

  /**
   * Load a TAP file from the local file picker
   */
  _loadFileFromDisk(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      if (data.length < 2) {
        console.error(`Invalid tape file: too small (${data.length} bytes)`);
        return;
      }
      this._currentFilename = file.name;
      this._rawTapeData = new Uint8Array(data);
      addToRecentTapes(file.name, data);
      const ext = file.name.split(".").pop().toLowerCase();
      this._setTapeFormat(ext);
      if (ext === "tzx") {
        this._proxy.loadTZXTape(data.buffer);
      } else {
        this._proxy.loadTAP(data.buffer);
      }
      if (this.onTapeLoaded) this.onTapeLoaded();
    };
    reader.readAsArrayBuffer(file);
  }

  /**
   * Load a TAP from raw data (used by recent and library)
   */
  _loadFromData(filename, data) {
    this._currentFilename = filename;
    this._rawTapeData = new Uint8Array(data);
    addToRecentTapes(filename, data);
    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    );
    const ext = filename.split(".").pop().toLowerCase();
    this._setTapeFormat(ext);
    if (ext === "tzx") {
      this._proxy.loadTZXTape(buffer);
    } else {
      this._proxy.loadTAP(buffer);
    }
    if (this.onTapeLoaded) this.onTapeLoaded();
  }

  /**
   * Prompt the user to save recorded TAP data via the browser save dialog
   */
  async _promptSaveTap(data) {
    const tapData = data || this._lastRecordedTapData;
    if (!tapData || tapData.length === 0) return;

    const suggestedName = this._currentFilename || "recording.tap";
    const blob = new Blob([tapData], { type: "application/octet-stream" });

    // Use the File System Access API if available for a native save dialog
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{
            description: "TAP Tape File",
            accept: { "application/octet-stream": [".tap"] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        // Update IndexedDB with the saved filename
        const savedName = handle.name || suggestedName;
        addToRecentTapes(savedName, tapData);
        this._lastRecordedTapData = null;
      } catch {
        // User cancelled - that's fine, keep the data
      }
    } else {
      // Fallback: trigger a download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToRecentTapes(suggestedName, tapData);
      this._lastRecordedTapData = null;
    }
  }

  /**
   * Insert a blank tape ready for recording
   */
  async _insertBlankTape() {
    // Eject any existing tape first
    if (this._proxy.tapeIsLoaded() || this._blocks.length) {
      await this._ejectTape();
    }

    this._currentFilename = "blank.tap";
    this._rawTapeData = null;
    this._isTZX = false;
    this._blocks = [];
    this._metadata = null;

    this._renderBlocks();
    this._updateFilenameBanner();
    this._showCassette(true);

    const ejectBtn = this.contentElement?.querySelector("#tape-btn-eject");
    if (ejectBtn) ejectBtn.disabled = false;

    // Show a blank-tape empty state
    const list = this.contentElement?.querySelector("#tape-block-list");
    if (list) {
      list.innerHTML = '<div class="tape-empty-state">Blank tape — ready to record</div>';
    }
  }

  /**
   * Eject the current tape
   */
  async _ejectTape() {
    // If there's unsaved recorded data, prompt save before ejecting
    if (this._lastRecordedTapData && this._lastRecordedTapData.length > 0) {
      await this._promptSaveTap();
    }
    this._proxy.tapeEject();
    this._blocks = [];
    this._metadata = null;
    this._infoPanelOpen = false;
    this._currentFilename = null;
    this._isTZX = false;
    this._rawTapeData = null;
    this._lastCurrentBlock = -1;
    this._lastIsPlaying = false;
    this._renderBlocks();
    this._renderInfoPanel();
    this._applyInfoPanelState();
    this._updateFilenameBanner();
    this._updateSpeedSwitch(false);
    this._showCassette(false);
    // Reset spindle animation fully on eject
    this._resetSpindles();
    const ejectBtn = this.contentElement.querySelector("#tape-btn-eject");
    if (ejectBtn) ejectBtn.disabled = true;
  }

  setMetadata(metadata) {
    this._metadata = metadata || null;
    this._renderInfoPanel();
  }

  _applyInfoPanelState() {
    const panel = this.contentElement?.querySelector("#tape-info-panel");
    const toggle = this.contentElement?.querySelector("#tape-info-toggle");
    if (!panel || !toggle) return;
    if (this._infoPanelOpen) {
      panel.classList.remove("hidden");
      toggle.classList.add("open");
    } else {
      panel.classList.add("hidden");
      toggle.classList.remove("open");
    }
  }

  _applyCassettePanelState() {
    const panel = this.contentElement?.querySelector("#tape-cassette-vis");
    const toggle = this.contentElement?.querySelector("#tape-cassette-toggle");
    if (!panel || !toggle) return;
    if (this._cassettePanelOpen) {
      panel.classList.remove("hidden");
      toggle.classList.add("open");
    } else {
      panel.classList.add("hidden");
      toggle.classList.remove("open");
    }
  }

  _showCassette(hasTape) {
    if (this._cassetteSvg) {
      this._cassetteSvg.style.display = hasTape ? "" : "none";
    }
    // Hide label overlay when no tape
    const label = this.contentElement?.querySelector("#tape-cassette-label");
    if (label) label.style.display = hasTape ? "" : "none";
  }

  _getAllSpindleEls() {
    const els = [];
    const deckSvg = this.contentElement?.querySelector("#tape-empty-deck svg");
    if (deckSvg) {
      for (const id of ["#deck-spindle-left", "#deck-spindle-right"]) {
        const el = deckSvg.querySelector(id);
        if (el) els.push(el);
      }
    }
    if (this._cassetteSvg) {
      for (const id of [
        "#spindle-left-filled", "#spindle-left-outline",
        "#spindle-right-filled", "#spindle-right-outline",
      ]) {
        const el = this._cassetteSvg.querySelector(id);
        if (el) els.push(el);
      }
    }
    return els;
  }

  _setSpindleSpinning(isPlaying) {
    for (const el of this._getAllSpindleEls()) {
      if (isPlaying) {
        el.classList.add("spinning");
        el.classList.remove("paused");
      } else {
        el.classList.add("paused");
      }
    }
  }

  _resetSpindles() {
    for (const el of this._getAllSpindleEls()) {
      el.classList.remove("spinning", "paused");
    }
  }

  _updateFilenameBanner() {
    const banner = this.contentElement?.querySelector("#tape-filename-banner");
    const text = this.contentElement?.querySelector("#tape-filename-text");
    const badge = this.contentElement?.querySelector("#tape-format-badge");
    const label = this.contentElement?.querySelector("#tape-cassette-label");
    if (!banner || !text || !badge) return;
    if (this._currentFilename) {
      const ext = this._currentFilename.split(".").pop().toUpperCase();
      badge.textContent = ext === "TZX" ? "TZX" : "TAP";
      badge.className = `tape-format-badge ${ext === "TZX" ? "tzx" : "tap"}`;
      text.textContent = this._currentFilename;
      banner.classList.remove("hidden");
      banner.classList.remove("error");
      // Update cassette label text
      const displayName = this._currentFilename.replace(/\.(tap|tzx)$/i, "");
      if (label) label.textContent = displayName;
    } else {
      banner.classList.add("hidden");
      banner.classList.remove("error");
      text.textContent = "";
      badge.textContent = "";
      if (label) label.textContent = "";
    }
  }

  showError(error) {
    this._blocks = [];
    this._metadata = null;
    this._infoPanelOpen = false;
    this._renderBlocks();
    this._renderInfoPanel();
    this._applyInfoPanelState();

    // Collapse cassette visualization on error
    this._cassettePanelOpen = false;
    this._applyCassettePanelState();

    const banner = this.contentElement?.querySelector("#tape-filename-banner");
    const text = this.contentElement?.querySelector("#tape-filename-text");
    const badge = this.contentElement?.querySelector("#tape-format-badge");
    if (banner && text && badge) {
      badge.textContent = "ERR";
      badge.className = "tape-format-badge error";
      const filename = this._currentFilename || "Unknown file";
      text.textContent = `${filename} — ${error}`;
      banner.classList.remove("hidden");
      banner.classList.add("error");
    }

    this._currentFilename = null;
    this._isTZX = false;
    const ejectBtn = this.contentElement?.querySelector("#tape-btn-eject");
    if (ejectBtn) ejectBtn.disabled = true;
  }

  _renderInfoPanel() {
    const content = this.contentElement?.querySelector("#tape-info-content");
    if (!content) return;

    if (!this._metadata || !this._metadata.format) {
      content.innerHTML = "";
      return;
    }

    const m = this._metadata;
    const esc = (v) =>
      String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    let html = "";

    // File stats row — compact pills
    let version = "";
    if (m.format === "TZX" && (m.versionMajor || m.versionMinor)) {
      version = ` v${m.versionMajor}.${String(m.versionMinor).padStart(2, "0")}`;
    }
    html += '<div class="tape-info-stats">';
    html += `<span class="tape-info-pill format">${esc(m.format)}${version}</span>`;
    html += `<span class="tape-info-pill">${this._formatBytes(m.fileSize)}</span>`;
    html += `<span class="tape-info-pill">${m.blockCount} blocks</span>`;
    html += `<span class="tape-info-pill">${this._formatBytes(m.totalDataBytes)} data</span>`;
    html += "</div>";

    // Archive section (TZX only) — title prominent, details in grid
    const archiveFields = [
      ["Publisher", m.publisher],
      ["Author", m.author],
      ["Year", m.year],
      ["Language", m.language],
      ["Type", m.type],
      ["Price", m.price],
      ["Protection", m.protection],
      ["Origin", m.origin],
    ].filter(([, v]) => v);
    const hasArchive = m.title || archiveFields.length > 0 || m.comment;

    if (hasArchive) {
      html += '<div class="tape-info-archive">';
      if (m.title) {
        html += `<div class="tape-info-title">${esc(m.title)}</div>`;
      }
      if (archiveFields.length > 0) {
        html += '<div class="tape-info-grid">';
        for (const [label, value] of archiveFields) {
          html += `<span class="tape-info-grid-label">${label}</span>`;
          html += `<span class="tape-info-grid-value">${esc(value)}</span>`;
        }
        html += "</div>";
      }
      if (m.comment) {
        html += `<div class="tape-info-comment">${esc(m.comment)}</div>`;
      }
      html += "</div>";
    }

    // Headers — compact inline entries
    const headerBlocks = this._blocks.filter((b) => b.flagByte === 0x00);
    if (headerBlocks.length > 0) {
      html += '<div class="tape-info-headers">';
      for (const b of headerBlocks) {
        let typeBadge = "";
        let detail = "";
        switch (b.headerType) {
          case 0:
            typeBadge = "PRG";
            detail = esc(b.filename || "unnamed");
            if (b.param1 !== 32768 && b.param1 !== 65535) {
              detail += ` <span class="tape-info-detail-dim">LINE ${b.param1}</span>`;
            }
            break;
          case 3:
            typeBadge = "CODE";
            detail = `${esc(b.filename || "unnamed")} <span class="tape-info-detail-dim">@ 0x${b.param1.toString(16).toUpperCase().padStart(4, "0")} (${b.dataLength}b)</span>`;
            break;
          case 1:
            typeBadge = "NUM[]";
            detail = esc(b.filename || "unnamed");
            break;
          case 2:
            typeBadge = "CHR[]";
            detail = esc(b.filename || "unnamed");
            break;
          default:
            typeBadge = "HDR";
            detail = esc(b.filename || "unnamed");
        }
        html += `<div class="tape-info-header-entry">`;
        html += `<span class="tape-info-type-badge">${typeBadge}</span>`;
        html += `<span class="tape-info-header-detail">${detail}</span>`;
        html += `</div>`;
      }
      html += "</div>";
    }

    content.innerHTML = html;
  }

  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  /**
   * Toggle the Recent/Library dropdown
   */
  async _toggleDropdown() {
    if (this._dropdownOpen) {
      this._closeDropdown();
    } else {
      await this._populateDropdown();
      this._positionDropdown();
      this._dropdown.classList.add("open");
      this._dropdownOpen = true;
    }
  }

  _positionDropdown() {
    const recentBtn = this.contentElement.querySelector("#tape-btn-recent");
    if (!recentBtn) return;
    const rect = recentBtn.getBoundingClientRect();
    this._dropdown.style.position = "fixed";
    this._dropdown.style.left = `${rect.right}px`;
    this._dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    this._dropdown.style.right = "auto";
    this._dropdown.style.top = "auto";

    // After positioning, clamp to viewport
    requestAnimationFrame(() => {
      const dropRect = this._dropdown.getBoundingClientRect();
      if (dropRect.left + dropRect.width > window.innerWidth) {
        this._dropdown.style.left = `${window.innerWidth - dropRect.width - 4}px`;
      }
      if (dropRect.top < 0) {
        this._dropdown.style.bottom = "auto";
        this._dropdown.style.top = `${rect.bottom + 4}px`;
      }
    });
  }

  _closeDropdown() {
    if (this._dropdown) this._dropdown.classList.remove("open");
    this._dropdownOpen = false;
  }

  /**
   * Populate the dropdown with Recent tapes and Library entries
   */
  async _populateDropdown() {
    const dropdown = this._dropdown;
    dropdown.innerHTML = "";

    // Recent section label
    const recentLabel = document.createElement("div");
    recentLabel.className = "tape-dropdown-label";
    recentLabel.textContent = "Recent";
    dropdown.appendChild(recentLabel);

    const recentTapes = await getRecentTapes();

    if (recentTapes.length === 0) {
      const emptyItem = document.createElement("div");
      emptyItem.className = "tape-dropdown-item empty";
      emptyItem.textContent = "No recent tapes";
      dropdown.appendChild(emptyItem);
    } else {
      for (const tape of recentTapes) {
        const item = document.createElement("div");
        item.className = "tape-dropdown-item";
        item.textContent = tape.filename;
        item.title = tape.filename;
        item.addEventListener("click", async (e) => {
          e.stopPropagation();
          this._closeDropdown();
          const tapeData = await loadRecentTape(tape.id);
          if (tapeData) {
            this._loadFromData(tapeData.filename, tapeData.data);
          }
        });
        dropdown.appendChild(item);
      }

      // Separator + Clear
      const sep1 = document.createElement("div");
      sep1.className = "tape-dropdown-separator";
      dropdown.appendChild(sep1);

      const clearItem = document.createElement("div");
      clearItem.className = "tape-dropdown-item clear";
      clearItem.textContent = "Clear Recent";
      clearItem.addEventListener("click", async (e) => {
        e.stopPropagation();
        await clearRecentTapes();
        this._closeDropdown();
      });
      dropdown.appendChild(clearItem);
    }

    // Library section
    await this._appendLibrarySection(dropdown);

    // Blank tape option (always at bottom)
    const blankSep = document.createElement("div");
    blankSep.className = "tape-dropdown-separator";
    dropdown.appendChild(blankSep);

    const blankItem = document.createElement("div");
    blankItem.className = "tape-dropdown-item blank";
    blankItem.textContent = "Blank Tape";
    blankItem.title = "Insert a blank tape for recording";
    blankItem.addEventListener("click", (e) => {
      e.stopPropagation();
      this._closeDropdown();
      this._insertBlankTape();
    });
    dropdown.appendChild(blankItem);
  }

  /**
   * Append library entries to the dropdown
   */
  async _appendLibrarySection(dropdown) {
    try {
      const resp = await fetch("/tapes/library.json");
      if (!resp.ok) return;
      const library = await resp.json();
      if (!library.length) return;

      const sep = document.createElement("div");
      sep.className = "tape-dropdown-separator";
      dropdown.appendChild(sep);

      const label = document.createElement("div");
      label.className = "tape-dropdown-label";
      label.textContent = "Library";
      dropdown.appendChild(label);

      for (const entry of library) {
        const item = document.createElement("div");
        item.className = "tape-dropdown-item";
        item.textContent = entry.name;
        item.title = entry.description || entry.name;
        item.addEventListener("click", async (e) => {
          e.stopPropagation();
          this._closeDropdown();
          try {
            const data = await getLibraryTapeData(entry);
            this._loadFromData(entry.file, data);
          } catch (err) {
            console.error(`Failed to load library tape ${entry.file}:`, err);
          }
        });
        dropdown.appendChild(item);
      }
    } catch (err) {
      // Library fetch failed silently - not critical
    }
  }

  /**
   * Re-send cached tape data to WASM when it has been lost (e.g. after reset)
   */
  _reloadTapeIntoWasm() {
    if (!this._rawTapeData || !this._currentFilename) return;
    const buffer = this._rawTapeData.buffer.slice(
      this._rawTapeData.byteOffset,
      this._rawTapeData.byteOffset + this._rawTapeData.byteLength,
    );
    const ext = this._currentFilename.split(".").pop().toLowerCase();
    if (ext === "tzx") {
      this._proxy.loadTZXTape(buffer);
    } else {
      this._proxy.loadTAP(buffer);
    }
  }

  _setTapeFormat(ext) {
    this._isTZX = ext === "tzx";
    if (this._isTZX) {
      this._proxy.tapeSetInstantLoad(false);
      this._updateSpeedSwitch(false);
    }
  }

  _updateSpeedSwitch(isInstant) {
    const switchContainer =
      this.contentElement.querySelector("#tape-speed-switch");
    const checkbox = this.contentElement.querySelector("#tape-speed-checkbox");
    if (!switchContainer || !checkbox) return;
    if (this._isTZX) {
      checkbox.checked = false;
      switchContainer.classList.add("disabled");
      switchContainer.classList.remove("instant");
    } else {
      checkbox.checked = isInstant;
      switchContainer.classList.toggle("instant", isInstant);
      switchContainer.classList.remove("disabled");
    }
  }

  setBlocks(blocks) {
    this._blocks = blocks;
    this._lastCurrentBlock = -1;
    this._renderBlocks();
    this._updateFilenameBanner();
    this._showCassette(blocks.length > 0);
    const ejectBtn = this.contentElement.querySelector("#tape-btn-eject");
    if (ejectBtn) ejectBtn.disabled = false;
  }

  _renderBlocks() {
    const list = this.contentElement.querySelector("#tape-block-list");
    if (!this._blocks.length) {
      list.innerHTML = '<div class="tape-empty-state">No tape inserted</div>';
      return;
    }

    let html = "";
    for (const block of this._blocks) {
      const isHeader = block.flagByte === 0x00;
      const badgeClass = isHeader ? "header" : "data";
      const badgeText = isHeader ? "HDR" : "DATA";

      let typeName = "";
      if (isHeader) {
        switch (block.headerType) {
          case 0:
            typeName = "Program";
            break;
          case 1:
            typeName = "Num Array";
            break;
          case 2:
            typeName = "Char Array";
            break;
          case 3:
            typeName = "Code";
            break;
          default:
            typeName = "Header";
            break;
        }
      }

      const name =
        isHeader && block.filename
          ? `${typeName}: ${block.filename}`
          : isHeader
            ? typeName
            : "Data";

      html += `<div class="tape-block-item" data-index="${block.index}">
        <div class="tape-block-progress" data-progress-index="${block.index}"></div>
        <span class="tape-block-index">${block.index}</span>
        <span class="tape-block-badge ${badgeClass}">${badgeText}</span>
        <span class="tape-block-name">${name}</span>
        <span class="tape-block-size">${block.dataLength}b</span>
      </div>`;
    }
    list.innerHTML = html;
  }

  _renderRecordedBlocks(newBlocks) {
    const list = this.contentElement?.querySelector("#tape-block-list");
    if (!list) return;

    const existingBlocks = this._blocks || [];
    if (!existingBlocks.length && !newBlocks.length) {
      list.innerHTML = '<div class="tape-empty-state">Recording — waiting for data...</div>';
      return;
    }

    let html = "";
    let idx = 0;

    // Render existing loaded blocks first
    for (const block of existingBlocks) {
      const isHeader = block.flagByte === 0x00;
      const badgeClass = isHeader ? "header" : "data";
      const badgeText = isHeader ? "HDR" : "DATA";
      let typeName = "";
      if (isHeader) {
        switch (block.headerType) {
          case 0: typeName = "Program"; break;
          case 1: typeName = "Num Array"; break;
          case 2: typeName = "Char Array"; break;
          case 3: typeName = "Code"; break;
          default: typeName = "Header"; break;
        }
      }
      const name =
        isHeader && block.filename
          ? `${typeName}: ${block.filename}`
          : isHeader ? typeName : "Data";

      html += `<div class="tape-block-item" data-index="${idx}">
        <span class="tape-block-index">${idx}</span>
        <span class="tape-block-badge ${badgeClass}">${badgeText}</span>
        <span class="tape-block-name">${name}</span>
        <span class="tape-block-size">${block.dataLength}b</span>
      </div>`;
      idx++;
    }

    // Then render newly recorded blocks with red accent
    for (const block of newBlocks) {
      const isHeader = block.flagByte === 0x00;
      const badgeClass = isHeader ? "header" : "data";
      const badgeText = isHeader ? "HDR" : "DATA";
      let typeName = "";
      if (isHeader) {
        switch (block.headerType) {
          case 0: typeName = "Program"; break;
          case 1: typeName = "Num Array"; break;
          case 2: typeName = "Char Array"; break;
          case 3: typeName = "Code"; break;
          default: typeName = "Header"; break;
        }
      }
      const name =
        isHeader && block.filename
          ? `${typeName}: ${block.filename}`
          : isHeader ? typeName : "Data";

      html += `<div class="tape-block-item recording" data-index="${idx}">
        <span class="tape-block-index">${idx}</span>
        <span class="tape-block-badge ${badgeClass}">${badgeText}</span>
        <span class="tape-block-name">${name}</span>
        <span class="tape-block-size">${block.dataLength}b</span>
      </div>`;
      idx++;
    }

    list.innerHTML = html;

    // Scroll to the latest block
    const lastItem = list.querySelector(".tape-block-item:last-child");
    if (lastItem) {
      lastItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  update(proxy) {
    // Update record button state
    const isRecording = proxy.tapeIsRecording();
    const recordBtn = this.contentElement?.querySelector("#tape-btn-record");
    if (recordBtn) {
      recordBtn.classList.toggle("recording", isRecording);
    }

    // Disable other transport buttons while recording
    const playBtn = this.contentElement?.querySelector("#tape-btn-play");
    const rewindBtn = this.contentElement?.querySelector("#tape-btn-rewind");
    const rewindAllBtn = this.contentElement?.querySelector("#tape-btn-rewind-all");
    const ffwdBtn = this.contentElement?.querySelector("#tape-btn-ffwd");
    if (playBtn) playBtn.disabled = isRecording;
    if (rewindBtn) rewindBtn.disabled = isRecording;
    if (rewindAllBtn) rewindAllBtn.disabled = isRecording;
    if (ffwdBtn) ffwdBtn.disabled = isRecording;

    // Spindle rotation during recording
    if (isRecording !== this._lastIsRecording) {
      this._lastIsRecording = isRecording;
      this._setSpindleSpinning(isRecording);
    }

    // Render recorded blocks as they are detected
    if (isRecording) {
      const recBlocks = proxy.tapeRecordGetBlocks();
      if (recBlocks.length !== this._lastRecordedBlockCount) {
        this._lastRecordedBlockCount = recBlocks.length;
        this._renderRecordedBlocks(recBlocks);
      }
      return;
    }

    if (!this._blocks.length) return;

    const currentBlock = proxy.tapeGetCurrentBlock();
    const isPlaying = proxy.tapeIsPlaying();

    // Update active block highlight
    if (currentBlock !== this._lastCurrentBlock) {
      this._lastCurrentBlock = currentBlock;
      const items = this.contentElement.querySelectorAll(".tape-block-item");
      items.forEach((item) => {
        const idx = parseInt(item.dataset.index, 10);
        item.classList.toggle("active", idx === currentBlock);
      });

      // Reset progress bars on completed blocks
      this.contentElement
        .querySelectorAll(".tape-block-progress")
        .forEach((bar) => {
          const idx = parseInt(bar.dataset.progressIndex, 10);
          if (idx < currentBlock) {
            bar.style.width = "100%";
          } else if (idx > currentBlock) {
            bar.style.width = "0%";
          }
        });

      const activeItem = this.contentElement.querySelector(
        ".tape-block-item.active",
      );
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Update progress bar on the active block
    if (isPlaying) {
      const progress = proxy.tapeGetBlockProgress();
      const activeBar = this.contentElement.querySelector(
        `.tape-block-progress[data-progress-index="${currentBlock}"]`,
      );
      if (activeBar) {
        activeBar.style.width = `${progress}%`;
      }
    }

    // Update play button state and spindle rotation
    if (isPlaying !== this._lastIsPlaying) {
      this._lastIsPlaying = isPlaying;

      // Spindle rotation — add spinning class on first play, then toggle paused
      this._setSpindleSpinning(isPlaying);

      // Disable transport buttons while playing
      const rewindBtn = this.contentElement.querySelector("#tape-btn-rewind");
      const rewindAllBtn = this.contentElement.querySelector("#tape-btn-rewind-all");
      const ffwdBtn = this.contentElement.querySelector("#tape-btn-ffwd");
      if (rewindBtn) rewindBtn.disabled = isPlaying;
      if (rewindAllBtn) rewindAllBtn.disabled = isPlaying;
      if (ffwdBtn) ffwdBtn.disabled = isPlaying;

      const playBtn = this.contentElement.querySelector("#tape-btn-play");
      playBtn.classList.toggle("playing", isPlaying);

      if (isPlaying) {
        playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="6" y="5" width="4" height="14"/>
          <rect x="14" y="5" width="4" height="14"/>
        </svg>`;
        playBtn.title = "Pause";
      } else {
        playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M8 5v14l11-7z"/>
        </svg>`;
        playBtn.title = "Play";
      }
    }

  }

  destroy() {
    if (this._outsideClickHandler) {
      document.removeEventListener("click", this._outsideClickHandler);
    }
    if (this._dropdown && this._dropdown.parentNode) {
      this._dropdown.parentNode.removeChild(this._dropdown);
      this._dropdown = null;
    }
    super.destroy();
  }
}
