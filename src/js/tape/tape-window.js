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
      minHeight: 240,
      defaultWidth: 320,
      defaultHeight: 400,
      defaultPosition: { x: 80, y: 80 },
    });
    this._proxy = proxy;
    this._blocks = [];
    this._lastCurrentBlock = -1;
    this._lastIsPlaying = false;
    this._dropdownOpen = false;
    this._fileInput = null;
    this._currentFilename = null;
    this._isTZX = false;

    // Callback for when a TAP is loaded via the window's own controls
    this.onTapeLoaded = null;
  }

  getState() {
    const state = super.getState();
    state.instantLoad = !!this.contentElement?.querySelector("#tape-speed-checkbox")?.checked;
    return state;
  }

  restoreState(state) {
    if (state.instantLoad) {
      const checkbox = this.contentElement?.querySelector("#tape-speed-checkbox");
      if (checkbox) {
        checkbox.checked = true;
        this._proxy.tapeSetInstantLoad(true);
        this._updateSpeedSwitch(true);
      }
    }
    super.restoreState(state);
  }

  renderContent() {
    return `
      <div class="tape-player">
        <div class="tape-block-list" id="tape-block-list">
          <div class="tape-empty-state">No tape loaded</div>
        </div>
        <div class="tape-transport">
          <button class="tape-transport-btn rewind" id="tape-btn-rewind" title="Rewind">
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
        </div>
        <div class="tape-controls-bar">
          <div class="tape-load-container">
            <button class="tape-load-btn" id="tape-btn-load" title="Load TAP File">Load</button>
            <div class="tape-recent-container">
              <button class="tape-recent-btn" id="tape-btn-recent" title="Recent &amp; Library">
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path d="M3 5l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="tape-speed-switch" id="tape-speed-switch" title="Toggle loading speed">
            <span class="tape-speed-label tape-speed-label-normal">Normal</span>
            <label class="tape-toggle">
              <input type="checkbox" id="tape-speed-checkbox" />
              <span class="tape-toggle-track"></span>
            </label>
            <span class="tape-speed-label tape-speed-label-instant">Instant</span>
          </div>
          <button class="tape-eject-btn" id="tape-btn-eject" title="Eject Tape" disabled>Eject</button>
        </div>
        <div class="tape-status-bar" id="tape-status-bar">
          <div class="tape-status-dot"></div>
          <span class="tape-status-text" id="tape-status-text">No tape</span>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    // Transport controls
    const playBtn = this.contentElement.querySelector("#tape-btn-play");
    const stopBtn = this.contentElement.querySelector("#tape-btn-stop");
    const rewindBtn = this.contentElement.querySelector("#tape-btn-rewind");

    playBtn.addEventListener("click", () => {
      if (!this._proxy.tapeIsLoaded()) return;
      if (this._proxy.tapeIsPlaying()) {
        this._proxy.tapeStop();
      } else {
        this._proxy.tapePlay();
      }
    });

    stopBtn.addEventListener("click", () => {
      if (!this._proxy.tapeIsLoaded()) return;
      this._proxy.tapeStop();
    });

    rewindBtn.addEventListener("click", () => {
      if (!this._proxy.tapeIsLoaded()) return;
      this._proxy.tapeRewind();
      this._lastCurrentBlock = -1;
      this.contentElement.querySelectorAll(".tape-block-progress").forEach((bar) => {
        bar.style.width = "0%";
      });
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
      if (!e.target.closest(".tape-recent-container") &&
          !this._dropdown.contains(e.target)) {
        this._closeDropdown();
      }
    };
    document.addEventListener("click", this._outsideClickHandler);

    // Speed toggle switch (disabled for TZX files)
    const speedCheckbox = this.contentElement.querySelector("#tape-speed-checkbox");
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
    addToRecentTapes(filename, data);
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
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
   * Eject the current tape
   */
  _ejectTape() {
    this._proxy.tapeEject();
    this._blocks = [];
    this._currentFilename = null;
    this._isTZX = false;
    this._lastCurrentBlock = -1;
    this._lastIsPlaying = false;
    this._renderBlocks();
    this._updateSpeedSwitch(false);
    const ejectBtn = this.contentElement.querySelector("#tape-btn-eject");
    if (ejectBtn) ejectBtn.disabled = true;
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

  _setTapeFormat(ext) {
    this._isTZX = ext === "tzx";
    if (this._isTZX) {
      this._proxy.tapeSetInstantLoad(false);
      this._updateSpeedSwitch(false);
    }
  }

  _updateSpeedSwitch(isInstant) {
    const switchContainer = this.contentElement.querySelector("#tape-speed-switch");
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
    const ejectBtn = this.contentElement.querySelector("#tape-btn-eject");
    if (ejectBtn) ejectBtn.disabled = false;
  }

  _renderBlocks() {
    const list = this.contentElement.querySelector("#tape-block-list");
    if (!this._blocks.length) {
      list.innerHTML = '<div class="tape-empty-state">No tape loaded</div>';
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
          case 0: typeName = "Program"; break;
          case 1: typeName = "Num Array"; break;
          case 2: typeName = "Char Array"; break;
          case 3: typeName = "Code"; break;
          default: typeName = "Header"; break;
        }
      }

      const name = isHeader && block.filename
        ? `${typeName}: ${block.filename}`
        : isHeader ? typeName : "Data";

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

  update(proxy) {
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
      this.contentElement.querySelectorAll(".tape-block-progress").forEach((bar) => {
        const idx = parseInt(bar.dataset.progressIndex, 10);
        if (idx < currentBlock) {
          bar.style.width = "100%";
        } else if (idx > currentBlock) {
          bar.style.width = "0%";
        }
      });

      const activeItem = this.contentElement.querySelector(".tape-block-item.active");
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Update progress bar on the active block
    if (isPlaying) {
      const progress = proxy.tapeGetBlockProgress();
      const activeBar = this.contentElement.querySelector(
        `.tape-block-progress[data-progress-index="${currentBlock}"]`
      );
      if (activeBar) {
        activeBar.style.width = `${progress}%`;
      }
    }

    // Update play button state
    if (isPlaying !== this._lastIsPlaying) {
      this._lastIsPlaying = isPlaying;
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

    // Update status bar
    const statusBar = this.contentElement.querySelector("#tape-status-bar");
    const statusText = this.contentElement.querySelector("#tape-status-text");
    const blockCount = proxy.tapeGetBlockCount();

    if (isPlaying) {
      statusBar.className = "tape-status-bar playing";
      statusText.textContent = `PLAYING block ${currentBlock + 1} of ${blockCount}`;
    } else if (proxy.tapeIsLoaded()) {
      statusBar.className = "tape-status-bar stopped";
      statusText.textContent = `STOPPED - ${blockCount} blocks`;
    } else {
      statusBar.className = "tape-status-bar";
      statusText.textContent = "No tape";
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
