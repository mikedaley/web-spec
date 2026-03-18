/*
 * udg-editor-window.js - UDG (User-Defined Graphics) editor window
 *
 * Provides an interactive 8×8 pixel grid for designing UDGs (letters A-U),
 * generates Sinclair BASIC code, and supports save/load of UDG configurations.
 */

import { BaseWindow } from "../windows/base-window.js";
import { SinclairBasicTokenizer } from "../utils/sinclair-basic-tokenizer.js";
import { highlightLine } from "../utils/sinclair-basic-highlighting.js";
import { formatBasicText } from "../utils/sinclair-basic-formatting.js";
import "../css/udg-editor.css";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTU";
const UDG_COUNT = 21;
const UDG_ROWS = 8;

export class UDGEditorWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "udg-editor",
      title: "UDG Editor",
      minWidth: 380,
      minHeight: 400,
      defaultWidth: 480,
      defaultHeight: 560,
      defaultPosition: { x: 120, y: 80 },
    });

    this._proxy = proxy;
    this.selectedLetter = 0;

    // 21 UDGs × 8 bytes each
    this.udgData = new Array(UDG_COUNT);
    for (let i = 0; i < UDG_COUNT; i++) {
      this.udgData[i] = new Uint8Array(UDG_ROWS);
    }

    this._painting = false;
    this._paintFill = true;
    this._elements = null;
    this._letterCanvases = [];

    this._emulatorUdgData = null;
    this._lastSyncCheck = 0;
    this._liveUpdate = false;
    this._udgClipboard = null;
    // Track what's currently in emulator memory per-UDG
    this._lastPushed = new Array(UDG_COUNT);
    for (let i = 0; i < UDG_COUNT; i++) {
      this._lastPushed[i] = null;
    }
    this._tokenizer = new SinclairBasicTokenizer();
  }

  renderContent() {
    const letterBtns = LETTERS.split("").map((ch, i) =>
      `<button class="udg-letter-btn${i === 0 ? " selected" : ""}" data-idx="${i}" title="UDG ${ch}"><canvas width="8" height="8"></canvas></button>`
    ).join("");

    const cells = Array.from({ length: 64 }, (_, i) =>
      `<div class="udg-pixel-cell" data-row="${i >> 3}" data-col="${i & 7}"></div>`
    ).join("");

    return `<div class="udg-editor">
      <div class="udg-letter-bar">${letterBtns}</div>
      <div class="udg-editor-body">
        <div class="udg-pixel-grid">${cells}</div>
        <div class="udg-byte-display"></div>
      </div>
      <div class="udg-toolbars">
        <div class="udg-toolbar-group">
          <span class="udg-group-label">Edit</span>
          <button data-action="clear">Clear</button>
          <button data-action="invert">Invert</button>
          <button data-action="mirror-h">Mirror H</button>
          <button data-action="mirror-v">Mirror V</button>
          <button data-action="copy-udg" title="Copy current UDG to clipboard">Copy</button>
          <button data-action="paste-udg" title="Paste copied UDG into current letter">Paste</button>
        </div>
        <div class="udg-toolbar-group">
          <span class="udg-group-label">Shift</span>
          <button data-action="shift-left">←</button>
          <button data-action="shift-right">→</button>
          <button data-action="shift-up">↑</button>
          <button data-action="shift-down">↓</button>
        </div>
        <div class="udg-toolbar-group">
          <span class="udg-group-label">Emulator</span>
          <button data-action="pull">Pull</button>
          <button data-action="pull-all">Pull All</button>
          <button data-action="push">Push</button>
          <label class="udg-live-toggle" title="When enabled, pixel changes are pushed to emulator memory in real time">
            <span>Live</span>
            <input type="checkbox" class="udg-live-checkbox">
          </label>
        </div>
        <div class="udg-toolbar-group">
          <span class="udg-group-label">File</span>
          <button data-action="save">Save</button>
          <button data-action="load">Load</button>
        </div>
      </div>
      <div class="udg-sync-indicator">⚠ Editor differs from emulator memory</div>
      <div class="udg-basic-panel">
        <div class="udg-basic-header">
          <span class="udg-basic-title">BASIC Code</span>
          <div class="udg-basic-actions">
            <button class="btn-generate" title="Re-generate BASIC from UDG data">Generate</button>
            <button class="btn-copy">Copy</button>
            <button class="btn-write" title="Tokenize and write BASIC to emulator memory">Write</button>
          </div>
        </div>
        <div class="udg-basic-editor-container">
          <pre class="udg-basic-highlight" aria-hidden="true"></pre>
          <textarea class="udg-basic-textarea" spellcheck="false" autocomplete="off"></textarea>
        </div>
      </div>
      <input type="file" class="udg-file-input" accept=".udg,.json" style="display:none">
    </div>`;
  }

  onContentRendered() {
    this._cacheElements();
    this._setupHandlers();
    this._selectLetter(this.selectedLetter);
    this._updateAllLetterPreviews();
    this._generateBasic();

    // Re-render canvases when theme changes
    this._themeObserver = new MutationObserver(() => {
      this._updateAllLetterPreviews();
    });
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  _cacheElements() {
    const el = this.contentElement;
    this._elements = {
      letterBar: el.querySelector(".udg-letter-bar"),
      letterBtns: el.querySelectorAll(".udg-letter-btn"),
      grid: el.querySelector(".udg-pixel-grid"),
      cells: el.querySelectorAll(".udg-pixel-cell"),
      byteDisplay: el.querySelector(".udg-byte-display"),
      toolbars: el.querySelector(".udg-toolbars"),
      basicTextarea: el.querySelector(".udg-basic-textarea"),
      basicHighlight: el.querySelector(".udg-basic-highlight"),
      btnGenerate: el.querySelector(".btn-generate"),
      btnCopy: el.querySelector(".btn-copy"),
      btnWrite: el.querySelector(".btn-write"),
      basicPanel: el.querySelector(".udg-basic-panel"),
      syncIndicator: el.querySelector(".udg-sync-indicator"),
      fileInput: el.querySelector(".udg-file-input"),
      liveCheckbox: el.querySelector(".udg-live-checkbox"),
      btnCopyUdg: el.querySelector("[data-action='copy-udg']"),
    };

    this._letterCanvases = Array.from(this._elements.letterBtns).map(
      btn => btn.querySelector("canvas")
    );
  }

  _setupHandlers() {
    const { letterBar, grid, toolbars, btnCopy, btnGenerate, btnWrite, fileInput } = this._elements;

    // Letter selection
    letterBar.addEventListener("click", (e) => {
      const btn = e.target.closest(".udg-letter-btn");
      if (!btn) return;
      this._selectLetter(parseInt(btn.dataset.idx, 10));
    });

    // Pixel grid - click and drag painting
    grid.addEventListener("mousedown", (e) => {
      const cell = e.target.closest(".udg-pixel-cell");
      if (!cell) return;
      e.preventDefault();
      this._painting = true;
      this._paintFill = !cell.classList.contains("filled");
      this._toggleCell(cell);
    });

    grid.addEventListener("mouseover", (e) => {
      if (!this._painting) return;
      const cell = e.target.closest(".udg-pixel-cell");
      if (!cell) return;
      this._setCellState(cell, this._paintFill);
    });

    const stopPaint = () => { this._painting = false; };
    document.addEventListener("mouseup", stopPaint);
    this._cleanupPaint = () => document.removeEventListener("mouseup", stopPaint);

    // Touch support for grid
    grid.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      const cell = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!cell || !cell.classList.contains("udg-pixel-cell")) return;
      e.preventDefault();
      this._painting = true;
      this._paintFill = !cell.classList.contains("filled");
      this._toggleCell(cell);
    }, { passive: false });

    grid.addEventListener("touchmove", (e) => {
      if (!this._painting) return;
      e.preventDefault();
      const touch = e.touches[0];
      const cell = document.elementFromPoint(touch.clientX, touch.clientY);
      if (cell && cell.classList.contains("udg-pixel-cell")) {
        this._setCellState(cell, this._paintFill);
      }
    }, { passive: false });

    grid.addEventListener("touchend", stopPaint);

    // Tool buttons
    toolbars.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action) {
        this._flashButton(btn);
        this._handleAction(action);
      }
    });

    // Live toggle
    this._elements.liveCheckbox.addEventListener("change", () => this._toggleLive());

    // BASIC editor events
    btnGenerate.addEventListener("click", () => this._generateBasic());
    btnCopy.addEventListener("click", () => this._copyBasic());
    btnWrite.addEventListener("click", () => this._writeBasicToMemory());

    // Syntax highlighting on textarea input + scroll sync
    const textarea = this._elements.basicTextarea;
    const highlight = this._elements.basicHighlight;
    textarea.addEventListener("input", () => this._updateBasicHighlight());
    textarea.addEventListener("scroll", () => {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    });

    // File input
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length) this._loadFile(e.target.files[0]);
      e.target.value = "";
    });
  }

  // ---- Letter selection ----

  _selectLetter(idx) {
    this.selectedLetter = idx;
    this._elements.letterBtns.forEach((btn, i) => {
      btn.classList.toggle("selected", i === idx);
    });
    this._loadGridFromData();

    this._updateByteDisplay();
  }

  // ---- Grid ↔ data ----

  _loadGridFromData() {
    const data = this.udgData[this.selectedLetter];
    this._elements.cells.forEach((cell) => {
      const row = parseInt(cell.dataset.row, 10);
      const col = parseInt(cell.dataset.col, 10);
      const bit = 7 - col;
      cell.classList.toggle("filled", !!(data[row] & (1 << bit)));
    });
  }

  _toggleCell(cell) {
    const filled = cell.classList.toggle("filled");
    this._writeCellToData(cell, filled);
  }

  _setCellState(cell, filled) {
    if (cell.classList.contains("filled") === filled) return;
    cell.classList.toggle("filled", filled);
    this._writeCellToData(cell, filled);
  }

  _writeCellToData(cell, filled) {
    const row = parseInt(cell.dataset.row, 10);
    const col = parseInt(cell.dataset.col, 10);
    const bit = 7 - col;
    const data = this.udgData[this.selectedLetter];
    if (filled) {
      data[row] |= (1 << bit);
    } else {
      data[row] &= ~(1 << bit);
    }
    this._onDataChanged();
  }

  _onDataChanged() {

    this._updateByteDisplay();
    this._updateLetterPreview(this.selectedLetter);
    this._generateBasic();
    if (this._liveUpdate) {
      this._pushToEmulator();
    }
  }

  // ---- Preview rendering ----

  _updateLetterPreview(idx) {
    this._renderUdgToCanvas(this._letterCanvases[idx], this.udgData[idx]);
  }

  _updateAllLetterPreviews() {
    for (let i = 0; i < UDG_COUNT; i++) {
      this._updateLetterPreview(i);
    }
  }

  _renderUdgToCanvas(canvas, data) {
    const ctx = canvas.getContext("2d");
    const fg = getComputedStyle(this.contentElement).getPropertyValue("--text-primary").trim() || "#fff";
    const bg = getComputedStyle(this.contentElement).getPropertyValue("--bg-secondary").trim() || "#000";
    ctx.clearRect(0, 0, 8, 8);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const bit = 7 - col;
        ctx.fillStyle = (data[row] & (1 << bit)) ? fg : bg;
        ctx.fillRect(col, row, 1, 1);
      }
    }
  }

  _updateByteDisplay() {
    const data = this.udgData[this.selectedLetter];
    this._elements.byteDisplay.innerHTML = Array.from(data).map(
      b => `<span class="udg-byte-row">${b.toString(10).padStart(3, " ")}  $${b.toString(16).toUpperCase().padStart(2, "0")}</span>`
    ).join("");
  }

  _updateClipboardIndicator() {
    this._elements.btnCopyUdg.classList.toggle("has-clipboard", this._udgClipboard !== null);
  }

  _flashButton(btn) {
    btn.classList.add("btn-flash");
    setTimeout(() => btn.classList.remove("btn-flash"), 150);
  }

  // ---- Tool actions ----

  _handleAction(action) {
    const data = this.udgData[this.selectedLetter];
    switch (action) {
      case "clear":
        data.fill(0);
        break;
      case "invert":
        for (let i = 0; i < UDG_ROWS; i++) data[i] = (~data[i]) & 0xFF;
        break;
      case "shift-left":
        for (let i = 0; i < UDG_ROWS; i++) data[i] = ((data[i] << 1) | (data[i] >> 7)) & 0xFF;
        break;
      case "shift-right":
        for (let i = 0; i < UDG_ROWS; i++) data[i] = ((data[i] >> 1) | (data[i] << 7)) & 0xFF;
        break;
      case "shift-up": {
        const top = data[0];
        for (let i = 0; i < 7; i++) data[i] = data[i + 1];
        data[7] = top;
        break;
      }
      case "shift-down": {
        const bottom = data[7];
        for (let i = 7; i > 0; i--) data[i] = data[i - 1];
        data[0] = bottom;
        break;
      }
      case "mirror-h":
        for (let i = 0; i < UDG_ROWS; i++) {
          let b = data[i], r = 0;
          for (let bit = 0; bit < 8; bit++) r |= ((b >> bit) & 1) << (7 - bit);
          data[i] = r;
        }
        break;
      case "mirror-v":
        for (let i = 0; i < 4; i++) {
          const tmp = data[i];
          data[i] = data[7 - i];
          data[7 - i] = tmp;
        }
        break;
      case "copy-udg":
        this._udgClipboard = new Uint8Array(data);
        this._updateClipboardIndicator();
        return;
      case "paste-udg":
        if (this._udgClipboard) {
          this.udgData[this.selectedLetter] = new Uint8Array(this._udgClipboard);
          this._udgClipboard = null;
          this._updateClipboardIndicator();
        }
        break;
      case "pull":
        this._pullFromEmulator();
        return;
      case "pull-all":
        this._pullAllFromEmulator();
        return;
      case "push":
        this._pushToEmulator();
        return;
      case "save":
        this._saveFile();
        return;
      case "load":
        this._elements.fileInput.click();
        return;
    }
    this._loadGridFromData();
    this._onDataChanged();
  }

  // ---- BASIC code generation ----

  _generateBasic() {
    const lines = [];
    let lineNum = 10;

    // Collect UDGs that have been edited (non-zero)
    const edited = [];
    for (let i = 0; i < UDG_COUNT; i++) {
      if (this.udgData[i].some(b => b !== 0)) {
        edited.push(i);
      }
    }

    if (edited.length === 0) {
      this._elements.basicTextarea.value = "";
      this._updateBasicHighlight();
      return;
    }

    for (const idx of edited) {
      const ch = LETTERS[idx];
      const data = Array.from(this.udgData[idx]).join(",");
      lines.push(`${lineNum} FOR i=USR "${ch}" TO USR "${ch}"+7`);
      lineNum += 10;
      lines.push(`${lineNum} READ a: POKE i,a`);
      lineNum += 10;
      lines.push(`${lineNum} NEXT i`);
      lineNum += 10;
      lines.push(`${lineNum} DATA ${data}`);
      lineNum += 10;
    }

    this._elements.basicTextarea.value = lines.join("\n");
    this._formatBasic();
  }

  // ---- Copy / Apply ----

  async _copyBasic() {
    const text = this._elements.basicTextarea.value;
    try {
      await navigator.clipboard.writeText(text);
      this._elements.btnCopy.textContent = "Copied!";
      setTimeout(() => { this._elements.btnCopy.textContent = "Copy"; }, 1500);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      this._elements.btnCopy.textContent = "Copied!";
      setTimeout(() => { this._elements.btnCopy.textContent = "Copy"; }, 1500);
    }
  }

  _formatBasic() {
    const text = this._elements.basicTextarea.value;
    const newText = formatBasicText(text);
    if (newText !== text) {
      this._elements.basicTextarea.value = newText;
    }
    this._updateBasicHighlight();
  }

  _updateBasicHighlight() {
    const text = this._elements.basicTextarea.value;
    const lines = text.split("\n");
    this._elements.basicHighlight.innerHTML =
      lines.map(l => highlightLine(l)).join("\n") + "\n";
  }

  async _writeBasicToMemory() {
    if (!this._proxy) return;
    const text = this._elements.basicTextarea.value;
    if (!text.trim()) return;
    try {
      const programBytes = await this._tokenizer.tokenize(this._proxy, text);
      if (programBytes.length === 0) return;
      await this._tokenizer.writeTo(this._proxy, programBytes);
      this._elements.btnWrite.textContent = "Written!";
      setTimeout(() => { this._elements.btnWrite.textContent = "Write"; }, 1500);
    } catch (err) {
      console.error("Failed to write BASIC program:", err);
    }
  }

  _pullFromEmulator() {
    if (!this._proxy) return;
    const idx = this.selectedLetter;
    this._proxy.readMemory(0x5C7B, 2).then((sysData) => {
      const udgBase = sysData[0] | (sysData[1] << 8);
      this._proxy.readMemory(udgBase + idx * UDG_ROWS, UDG_ROWS).then((data) => {
        this.udgData[idx] = new Uint8Array(data);
        this._lastPushed[idx] = new Uint8Array(data);
        this._loadGridFromData();

        this._updateByteDisplay();
        this._updateLetterPreview(idx);
        this._generateBasic();
      });
    });
  }

  _pullAllFromEmulator() {
    if (!this._proxy) return;
    this._proxy.readMemory(0x5C7B, 2).then((sysData) => {
      const udgBase = sysData[0] | (sysData[1] << 8);
      this._proxy.readMemory(udgBase, UDG_COUNT * UDG_ROWS).then((data) => {
        for (let i = 0; i < UDG_COUNT; i++) {
          this.udgData[i] = new Uint8Array(data.slice(i * UDG_ROWS, (i + 1) * UDG_ROWS));
          this._lastPushed[i] = new Uint8Array(this.udgData[i]);
        }
        this._loadGridFromData();

        this._updateByteDisplay();
        this._updateAllLetterPreviews();
        this._generateBasic();
      });
    });
  }

  _pushToEmulator() {
    if (!this._proxy) return;
    const idx = this.selectedLetter;
    const newData = this.udgData[idx];
    this._lastPushed[idx] = new Uint8Array(newData);

    this._proxy.readMemory(0x5C7B, 2).then((sysData) => {
      const udgBase = sysData[0] | (sysData[1] << 8);
      this._proxy.writeMemoryBulk(udgBase + idx * UDG_ROWS, newData);
    });
  }

  _toggleLive() {
    this._liveUpdate = this._elements.liveCheckbox.checked;
    if (this._liveUpdate) {
      // Seed _lastPushed from emulator so we know what to patch against
      this._proxy.readMemory(0x5C7B, 2).then((sysData) => {
        const udgBase = sysData[0] | (sysData[1] << 8);
        this._proxy.readMemory(udgBase, UDG_COUNT * UDG_ROWS).then((data) => {
          for (let i = 0; i < UDG_COUNT; i++) {
            this._lastPushed[i] = new Uint8Array(data.slice(i * UDG_ROWS, (i + 1) * UDG_ROWS));
          }
          this._pushToEmulator();
        });
      });
    }
  }

  _applyToEmulator() {
    if (!this._proxy) return;

    // Read UDG system variable and current UDG data to enable display patching
    this._proxy.readMemory(0x5C7B, 2).then((sysData) => {
      const udgBase = sysData[0] | (sysData[1] << 8);
      this._proxy.readMemory(udgBase, UDG_COUNT * UDG_ROWS).then((oldBlock) => {
        // Write all editor UDGs to emulator
        const block = new Uint8Array(UDG_COUNT * UDG_ROWS);
        for (let i = 0; i < UDG_COUNT; i++) {
          block.set(this.udgData[i], i * UDG_ROWS);
        }
        this._proxy.writeMemoryBulk(udgBase, block);
        this._elements.syncIndicator.classList.remove("visible");

        // Update tracking
        for (let i = 0; i < UDG_COUNT; i++) {
          this._lastPushed[i] = new Uint8Array(this.udgData[i]);
        }
      });
    });
  }

  // ---- Save / Load ----

  _saveFile() {
    const obj = { version: 1, udgs: {} };
    for (let i = 0; i < UDG_COUNT; i++) {
      obj.udgs[LETTERS[i]] = Array.from(this.udgData[i]);
    }
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "udg-designs.udg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj.udgs) return;
        for (let i = 0; i < UDG_COUNT; i++) {
          const ch = LETTERS[i];
          if (obj.udgs[ch] && Array.isArray(obj.udgs[ch])) {
            this.udgData[i] = new Uint8Array(obj.udgs[ch]);
          }
        }
        this._loadGridFromData();
        this._onDataChanged();
        this._updateAllLetterPreviews();
      } catch {
        // Invalid file
      }
    };
    reader.readAsText(file);
  }

  // ---- Machine awareness ----

  // UDG editor is not available on +2A/+3 (machine IDs 3, 4) because
  // their paging makes system variable access unreliable.
  static _UNSUPPORTED_MACHINES = new Set([3, 4]);

  setMachine(machineId) {
    this._machineId = machineId;
    this._disabled = UDGEditorWindow._UNSUPPORTED_MACHINES.has(machineId);
    if (this._disabled && this.isVisible) {
      this.hide();
    }
    // Update menu button visibility
    const btn = document.getElementById("btn-udg-editor");
    if (btn) {
      btn.style.display = this._disabled ? "none" : "";
    }
  }

  // ---- Emulator sync check ----

  update(proxy) {
    if (!proxy || this._disabled) return;
    this._proxy = proxy;

    const now = performance.now();
    if (now - this._lastSyncCheck < 1000) return;
    this._lastSyncCheck = now;

    proxy.readMemory(0x5C7B, 2).then((sysData) => {
      const udgBase = sysData[0] | (sysData[1] << 8);
      proxy.readMemory(udgBase, UDG_COUNT * UDG_ROWS).then((emuData) => {
        this._emulatorUdgData = emuData;
        let differs = false;
        for (let i = 0; i < UDG_COUNT * UDG_ROWS && !differs; i++) {
          const udgIdx = Math.floor(i / UDG_ROWS);
          const byteIdx = i % UDG_ROWS;
          if (this.udgData[udgIdx][byteIdx] !== emuData[i]) differs = true;
        }
        if (this._elements?.syncIndicator) {
          this._elements.syncIndicator.classList.toggle("visible", differs);
        }
      });
    });
  }

  // ---- State persistence ----

  getState() {
    const state = super.getState();
    state.selectedLetter = this.selectedLetter;
    state.udgData = this.udgData.map(d => Array.from(d));
    state.liveUpdate = this._liveUpdate;
    return state;
  }

  restoreState(state) {
    if (state.udgData && Array.isArray(state.udgData)) {
      for (let i = 0; i < UDG_COUNT && i < state.udgData.length; i++) {
        this.udgData[i] = new Uint8Array(state.udgData[i]);
      }
    }
    if (state.selectedLetter !== undefined) {
      this.selectedLetter = state.selectedLetter;
    }
    if (state.liveUpdate !== undefined) {
      this._liveUpdate = state.liveUpdate;
    }

    // Re-render if content is already present
    if (this._elements) {
      this._selectLetter(this.selectedLetter);
      this._updateAllLetterPreviews();
      this._generateBasic();
      if (this._elements.liveCheckbox) {
        this._elements.liveCheckbox.checked = this._liveUpdate;
      }
    }

    super.restoreState(state);
  }

  destroy() {
    if (this._cleanupPaint) this._cleanupPaint();
    if (this._themeObserver) this._themeObserver.disconnect();
    super.destroy();
  }
}
