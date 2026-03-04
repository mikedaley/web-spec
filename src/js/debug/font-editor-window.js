/*
 * font-editor-window.js - Font editor window for designing custom character sets
 *
 * Provides an interactive 8×8 pixel grid for designing 96 printable characters
 * (ASCII 32-127), with user-configurable RAM address for push/pull operations.
 */

import { BaseWindow } from "../windows/base-window.js";
import { SinclairBasicTokenizer } from "../utils/sinclair-basic-tokenizer.js";
import { highlightLine } from "../utils/sinclair-basic-highlighting.js";
import { formatBasicText } from "../utils/sinclair-basic-formatting.js";
import "../css/font-editor.css";

const CHAR_COUNT = 96;
const CHAR_ROWS = 8;
const FIRST_CHAR = 32;

export class FontEditorWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "font-editor",
      title: "Font Editor",
      minWidth: 420,
      minHeight: 440,
      defaultWidth: 520,
      defaultHeight: 680,
      defaultPosition: { x: 140, y: 100 },
    });

    this._proxy = proxy;
    this.selectedChar = 0;
    this._fontAddress = 0xF800;

    // 96 characters × 8 bytes each
    this.fontData = new Array(CHAR_COUNT);
    for (let i = 0; i < CHAR_COUNT; i++) {
      this.fontData[i] = new Uint8Array(CHAR_ROWS);
    }

    this._painting = false;
    this._paintFill = true;
    this._elements = null;
    this._charCanvases = [];

    this._emulatorFontData = null;
    this._lastSyncCheck = 0;
    this._liveUpdate = false;
    this._charClipboard = null;
    this._lastPushed = new Array(CHAR_COUNT);
    for (let i = 0; i < CHAR_COUNT; i++) {
      this._lastPushed[i] = null;
    }
    this._tokenizer = new SinclairBasicTokenizer();
  }

  _charLabel(idx) {
    const code = FIRST_CHAR + idx;
    if (code === 32) return "SP";
    if (code === 127) return "©";
    return String.fromCharCode(code);
  }

  renderContent() {
    const charBtns = Array.from({ length: CHAR_COUNT }, (_, i) => {
      const code = FIRST_CHAR + i;
      const label = this._charLabel(i);
      const tooltip = code === 32 ? "Space (32)" : code === 127 ? "© (127)" : `${label} (${code})`;
      return `<button class="fe-char-btn${i === 0 ? " selected" : ""}" data-idx="${i}" title="${tooltip}"><canvas width="8" height="8"></canvas></button>`;
    }).join("");

    const cells = Array.from({ length: 64 }, (_, i) =>
      `<div class="fe-pixel-cell" data-row="${i >> 3}" data-col="${i & 7}"></div>`
    ).join("");

    return `<div class="font-editor">
      <div class="fe-char-bar">${charBtns}</div>
      <div class="fe-editor-body">
        <div class="fe-pixel-grid">${cells}</div>
        <div class="fe-byte-display"></div>
      </div>
      <div class="fe-toolbars">
        <div class="fe-toolbar-group">
          <span class="fe-group-label">Edit</span>
          <button data-action="clear">Clear</button>
          <button data-action="invert">Invert</button>
          <button data-action="mirror-h">Mirror H</button>
          <button data-action="mirror-v">Mirror V</button>
          <button data-action="copy-char" title="Copy current character to clipboard">Copy</button>
          <button data-action="paste-char" title="Paste copied character into current slot">Paste</button>
        </div>
        <div class="fe-toolbar-group">
          <span class="fe-group-label">Shift</span>
          <button data-action="shift-left">←</button>
          <button data-action="shift-right">→</button>
          <button data-action="shift-up">↑</button>
          <button data-action="shift-down">↓</button>
        </div>
        <div class="fe-toolbar-group">
          <span class="fe-group-label">Emulator</span>
          <button data-action="pull">Pull</button>
          <button data-action="pull-all">Pull All</button>
          <button data-action="pull-chars" title="Read CHARS sysvar (0x5C36) and pull all 96 characters from the ROM/RAM font">Pull CHARS</button>
          <button data-action="push">Push</button>
          <button data-action="push-all">Push All</button>
          <button data-action="set-chars" title="Set CHARS sysvar (23606/23607) to point to this font address">Set CHARS</button>
          <label class="fe-live-toggle" title="When enabled, pixel changes are pushed to emulator memory in real time">
            <span>Live</span>
            <input type="checkbox" class="fe-live-checkbox">
          </label>
        </div>
        <div class="fe-toolbar-group">
          <span class="fe-group-label">Address</span>
          <input type="text" class="fe-address-input" value="0x${this._fontAddress.toString(16).toUpperCase()}" title="RAM address for font data (hex)" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" data-1p-ignore data-lpignore="true" data-form-type="other">
        </div>
        <div class="fe-toolbar-group">
          <span class="fe-group-label">File</span>
          <button data-action="save">Save</button>
          <button data-action="load">Load</button>
        </div>
      </div>
      <div class="fe-sync-indicator">⚠ Editor differs from emulator memory</div>
      <div class="fe-basic-panel">
        <div class="fe-basic-header">
          <span class="fe-basic-title">BASIC Code</span>
          <div class="fe-basic-actions">
            <button class="btn-generate" title="Re-generate BASIC from font data">Generate</button>
            <button class="btn-copy">Copy</button>
            <button class="btn-write" title="Tokenize and write BASIC to emulator memory">Write</button>
          </div>
        </div>
        <div class="fe-basic-editor-container">
          <pre class="fe-basic-highlight" aria-hidden="true"></pre>
          <textarea class="fe-basic-textarea" spellcheck="false" autocomplete="off"></textarea>
        </div>
      </div>
      <input type="file" class="fe-file-input" accept=".font,.json" style="display:none">
    </div>`;
  }

  onContentRendered() {
    this._cacheElements();
    this._setupHandlers();
    this._selectChar(this.selectedChar);
    this._updateAllCharPreviews();
    this._generateBasic();

    this._themeObserver = new MutationObserver(() => {
      this._updateAllCharPreviews();
    });
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  _cacheElements() {
    const el = this.contentElement;
    this._elements = {
      charBar: el.querySelector(".fe-char-bar"),
      charBtns: el.querySelectorAll(".fe-char-btn"),
      grid: el.querySelector(".fe-pixel-grid"),
      cells: el.querySelectorAll(".fe-pixel-cell"),
      byteDisplay: el.querySelector(".fe-byte-display"),
      toolbars: el.querySelector(".fe-toolbars"),
      syncIndicator: el.querySelector(".fe-sync-indicator"),
      fileInput: el.querySelector(".fe-file-input"),
      liveCheckbox: el.querySelector(".fe-live-checkbox"),
      addressInput: el.querySelector(".fe-address-input"),
      btnCopyChar: el.querySelector("[data-action='copy-char']"),
      basicTextarea: el.querySelector(".fe-basic-textarea"),
      basicHighlight: el.querySelector(".fe-basic-highlight"),
      btnGenerate: el.querySelector(".btn-generate"),
      btnCopy: el.querySelector(".btn-copy"),
      btnWrite: el.querySelector(".btn-write"),
      basicPanel: el.querySelector(".fe-basic-panel"),
    };

    this._charCanvases = Array.from(this._elements.charBtns).map(
      btn => btn.querySelector("canvas")
    );
  }

  _setupHandlers() {
    const { charBar, grid, toolbars, fileInput } = this._elements;

    // Character selection
    charBar.addEventListener("click", (e) => {
      const btn = e.target.closest(".fe-char-btn");
      if (!btn) return;
      this._selectChar(parseInt(btn.dataset.idx, 10));
    });

    // Pixel grid - click and drag painting
    grid.addEventListener("mousedown", (e) => {
      const cell = e.target.closest(".fe-pixel-cell");
      if (!cell) return;
      e.preventDefault();
      this._painting = true;
      this._paintFill = !cell.classList.contains("filled");
      this._toggleCell(cell);
    });

    grid.addEventListener("mouseover", (e) => {
      if (!this._painting) return;
      const cell = e.target.closest(".fe-pixel-cell");
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
      if (!cell || !cell.classList.contains("fe-pixel-cell")) return;
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
      if (cell && cell.classList.contains("fe-pixel-cell")) {
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

    // Address input
    this._elements.addressInput.addEventListener("change", () => this._parseAddress());
    this._elements.addressInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._parseAddress();
        this._elements.addressInput.blur();
      }
    });

    // BASIC panel events
    this._elements.btnGenerate.addEventListener("click", () => this._generateBasic());
    this._elements.btnCopy.addEventListener("click", () => this._copyBasic());
    this._elements.btnWrite.addEventListener("click", () => this._writeBasicToMemory());

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

  _parseAddress() {
    const raw = this._elements.addressInput.value.trim();
    let val = parseInt(raw, raw.startsWith("0x") || raw.startsWith("0X") ? 16 : 16);
    if (isNaN(val) || val < 0 || val > 0xFFFF) {
      // Revert to current
      this._elements.addressInput.value = "0x" + this._fontAddress.toString(16).toUpperCase();
      return;
    }
    // Clamp so the full 768 bytes fit
    if (val + CHAR_COUNT * CHAR_ROWS > 0x10000) {
      val = 0x10000 - CHAR_COUNT * CHAR_ROWS;
    }
    this._fontAddress = val;
    this._elements.addressInput.value = "0x" + val.toString(16).toUpperCase();
  }

  // ---- Character selection ----

  _selectChar(idx) {
    this.selectedChar = idx;
    this._elements.charBtns.forEach((btn, i) => {
      btn.classList.toggle("selected", i === idx);
    });
    // Scroll selected button into view
    const selectedBtn = this._elements.charBtns[idx];
    if (selectedBtn) {
      selectedBtn.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    this._loadGridFromData();
    this._updateByteDisplay();
  }

  // ---- Grid ↔ data ----

  _loadGridFromData() {
    const data = this.fontData[this.selectedChar];
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
    const data = this.fontData[this.selectedChar];
    if (filled) {
      data[row] |= (1 << bit);
    } else {
      data[row] &= ~(1 << bit);
    }
    this._onDataChanged();
  }

  _onDataChanged() {
    this._updateByteDisplay();
    this._updateCharPreview(this.selectedChar);
    this._generateBasic();
    if (this._liveUpdate) {
      this._pushToEmulator();
    }
  }

  // ---- Preview rendering ----

  _updateCharPreview(idx) {
    this._renderCharToCanvas(this._charCanvases[idx], this.fontData[idx]);
  }

  _updateAllCharPreviews() {
    for (let i = 0; i < CHAR_COUNT; i++) {
      this._updateCharPreview(i);
    }
  }

  _renderCharToCanvas(canvas, data) {
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
    const data = this.fontData[this.selectedChar];
    this._elements.byteDisplay.innerHTML = Array.from(data).map(
      b => `<span class="fe-byte-row">${b.toString(10).padStart(3, " ")}  $${b.toString(16).toUpperCase().padStart(2, "0")}</span>`
    ).join("");
  }

  _updateClipboardIndicator() {
    this._elements.btnCopyChar.classList.toggle("has-clipboard", this._charClipboard !== null);
  }

  _flashButton(btn) {
    btn.classList.add("btn-flash");
    setTimeout(() => btn.classList.remove("btn-flash"), 150);
  }

  // ---- Tool actions ----

  _handleAction(action) {
    const data = this.fontData[this.selectedChar];
    switch (action) {
      case "clear":
        data.fill(0);
        break;
      case "invert":
        for (let i = 0; i < CHAR_ROWS; i++) data[i] = (~data[i]) & 0xFF;
        break;
      case "shift-left":
        for (let i = 0; i < CHAR_ROWS; i++) data[i] = ((data[i] << 1) | (data[i] >> 7)) & 0xFF;
        break;
      case "shift-right":
        for (let i = 0; i < CHAR_ROWS; i++) data[i] = ((data[i] >> 1) | (data[i] << 7)) & 0xFF;
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
        for (let i = 0; i < CHAR_ROWS; i++) {
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
      case "copy-char":
        this._charClipboard = new Uint8Array(data);
        this._updateClipboardIndicator();
        return;
      case "paste-char":
        if (this._charClipboard) {
          this.fontData[this.selectedChar] = new Uint8Array(this._charClipboard);
          this._charClipboard = null;
          this._updateClipboardIndicator();
        }
        break;
      case "pull":
        this._pullFromEmulator();
        return;
      case "pull-all":
        this._pullAllFromEmulator();
        return;
      case "pull-chars":
        this._pullFromCharsVar();
        return;
      case "push":
        this._pushToEmulator();
        return;
      case "push-all":
        this._pushAllToEmulator();
        return;
      case "set-chars":
        this._setCharsVar();
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
    const addr = this._fontAddress;

    // Check if any characters have been edited (non-zero)
    const edited = [];
    for (let i = 0; i < CHAR_COUNT; i++) {
      if (this.fontData[i].some(b => b !== 0)) {
        edited.push(i);
      }
    }

    if (edited.length === 0) {
      this._elements.basicTextarea.value = "";
      this._updateBasicHighlight();
      return;
    }

    // CLEAR to protect font memory (only if address is in upper RAM)
    if (addr >= 24576) {
      lines.push(`${lineNum} CLEAR ${addr - 1}`);
      lineNum += 10;
    }

    // Use a single READ/POKE loop for all edited characters
    for (const idx of edited) {
      const charAddr = addr + idx * CHAR_ROWS;
      const data = Array.from(this.fontData[idx]).join(",");
      lines.push(`${lineNum} FOR i=${charAddr} TO ${charAddr + 7}`);
      lineNum += 10;
      lines.push(`${lineNum} READ a: POKE i,a`);
      lineNum += 10;
      lines.push(`${lineNum} NEXT i`);
      lineNum += 10;
      lines.push(`${lineNum} DATA ${data}`);
      lineNum += 10;
    }

    // Set CHARS sysvar to point 256 bytes below the font base
    // (CHARS points to char 0, but our font starts at char 32)
    const charsVal = addr - 256;
    lines.push(`${lineNum} POKE 23606,${charsVal & 0xFF}: POKE 23607,${(charsVal >> 8) & 0xFF}`);

    this._elements.basicTextarea.value = lines.join("\n");
    this._formatBasic();
  }

  async _copyBasic() {
    const text = this._elements.basicTextarea.value;
    try {
      await navigator.clipboard.writeText(text);
      this._elements.btnCopy.textContent = "Copied!";
      setTimeout(() => { this._elements.btnCopy.textContent = "Copy"; }, 1500);
    } catch {
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

  // ---- Emulator integration ----

  _pullFromEmulator() {
    if (!this._proxy) return;
    const idx = this.selectedChar;
    const addr = this._fontAddress + idx * CHAR_ROWS;
    this._proxy.readMemory(addr, CHAR_ROWS).then((data) => {
      this.fontData[idx] = new Uint8Array(data);
      this._lastPushed[idx] = new Uint8Array(data);
      this._loadGridFromData();
      this._updateByteDisplay();
      this._updateCharPreview(idx);
    });
  }

  _pullFromCharsVar() {
    if (!this._proxy) return;
    // CHARS sysvar at 0x5C36 points 256 bytes below the font (char 0),
    // so the actual font for printable chars (32+) starts at CHARS + 256.
    this._proxy.readMemory(0x5C36, 2).then((sysData) => {
      const charsBase = sysData[0] | (sysData[1] << 8);
      const fontBase = charsBase + 256; // skip to char 32
      this._fontAddress = fontBase;
      if (this._elements?.addressInput) {
        this._elements.addressInput.value = "0x" + fontBase.toString(16).toUpperCase();
      }
      const totalBytes = CHAR_COUNT * CHAR_ROWS;
      this._proxy.readMemory(fontBase, totalBytes).then((data) => {
        for (let i = 0; i < CHAR_COUNT; i++) {
          this.fontData[i] = new Uint8Array(data.slice(i * CHAR_ROWS, (i + 1) * CHAR_ROWS));
          this._lastPushed[i] = new Uint8Array(this.fontData[i]);
        }
        this._loadGridFromData();
        this._updateByteDisplay();
        this._updateAllCharPreviews();
      });
    });
  }

  _pullAllFromEmulator() {
    if (!this._proxy) return;
    const totalBytes = CHAR_COUNT * CHAR_ROWS;
    this._proxy.readMemory(this._fontAddress, totalBytes).then((data) => {
      for (let i = 0; i < CHAR_COUNT; i++) {
        this.fontData[i] = new Uint8Array(data.slice(i * CHAR_ROWS, (i + 1) * CHAR_ROWS));
        this._lastPushed[i] = new Uint8Array(this.fontData[i]);
      }
      this._loadGridFromData();
      this._updateByteDisplay();
      this._updateAllCharPreviews();
    });
  }

  _setCharsVar() {
    if (!this._proxy) return;
    // CHARS points 256 bytes below the font (to where char 0 would be)
    const charsVal = this._fontAddress - 256;
    const lo = charsVal & 0xFF;
    const hi = (charsVal >> 8) & 0xFF;
    this._proxy.writeMemoryBulk(0x5C36, new Uint8Array([lo, hi]));
  }

  _pushToEmulator() {
    if (!this._proxy) return;
    const idx = this.selectedChar;
    const newData = this.fontData[idx];
    this._lastPushed[idx] = new Uint8Array(newData);
    const addr = this._fontAddress + idx * CHAR_ROWS;
    this._proxy.writeMemoryBulk(addr, newData);
  }

  _pushAllToEmulator() {
    if (!this._proxy) return;
    const block = new Uint8Array(CHAR_COUNT * CHAR_ROWS);
    for (let i = 0; i < CHAR_COUNT; i++) {
      block.set(this.fontData[i], i * CHAR_ROWS);
      this._lastPushed[i] = new Uint8Array(this.fontData[i]);
    }
    this._proxy.writeMemoryBulk(this._fontAddress, block);
  }

  _toggleLive() {
    this._liveUpdate = this._elements.liveCheckbox.checked;
    if (this._liveUpdate) {
      // Seed _lastPushed from emulator so we know what to patch against
      const totalBytes = CHAR_COUNT * CHAR_ROWS;
      this._proxy.readMemory(this._fontAddress, totalBytes).then((data) => {
        for (let i = 0; i < CHAR_COUNT; i++) {
          this._lastPushed[i] = new Uint8Array(data.slice(i * CHAR_ROWS, (i + 1) * CHAR_ROWS));
        }
        this._pushToEmulator();
      });
    }
  }

  // ---- Save / Load ----

  _saveFile() {
    const obj = { version: 1, address: this._fontAddress, chars: {} };
    for (let i = 0; i < CHAR_COUNT; i++) {
      const code = FIRST_CHAR + i;
      obj.chars[code] = Array.from(this.fontData[i]);
    }
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "font-design.font";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  _loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj.chars) return;
        if (obj.address !== undefined) {
          this._fontAddress = obj.address;
          if (this._elements?.addressInput) {
            this._elements.addressInput.value = "0x" + this._fontAddress.toString(16).toUpperCase();
          }
        }
        for (let i = 0; i < CHAR_COUNT; i++) {
          const code = FIRST_CHAR + i;
          if (obj.chars[code] && Array.isArray(obj.chars[code])) {
            this.fontData[i] = new Uint8Array(obj.chars[code]);
          }
        }
        this._loadGridFromData();
        this._onDataChanged();
        this._updateAllCharPreviews();
      } catch {
        // Invalid file
      }
    };
    reader.readAsText(file);
  }

  // ---- Emulator sync check ----

  update(proxy) {
    if (!proxy) return;
    this._proxy = proxy;

    const now = performance.now();
    if (now - this._lastSyncCheck < 1000) return;
    this._lastSyncCheck = now;

    const totalBytes = CHAR_COUNT * CHAR_ROWS;
    proxy.readMemory(this._fontAddress, totalBytes).then((emuData) => {
      this._emulatorFontData = emuData;
      let differs = false;
      for (let i = 0; i < totalBytes && !differs; i++) {
        const charIdx = Math.floor(i / CHAR_ROWS);
        const byteIdx = i % CHAR_ROWS;
        if (this.fontData[charIdx][byteIdx] !== emuData[i]) differs = true;
      }
      if (this._elements?.syncIndicator) {
        this._elements.syncIndicator.classList.toggle("visible", differs);
      }
    });
  }

  // ---- State persistence ----

  getState() {
    const state = super.getState();
    state.selectedChar = this.selectedChar;
    state.fontData = this.fontData.map(d => Array.from(d));
    state.liveUpdate = this._liveUpdate;
    state.fontAddress = this._fontAddress;
    return state;
  }

  restoreState(state) {
    if (state.fontData && Array.isArray(state.fontData)) {
      for (let i = 0; i < CHAR_COUNT && i < state.fontData.length; i++) {
        this.fontData[i] = new Uint8Array(state.fontData[i]);
      }
    }
    if (state.selectedChar !== undefined) {
      this.selectedChar = state.selectedChar;
    }
    if (state.liveUpdate !== undefined) {
      this._liveUpdate = state.liveUpdate;
    }
    if (state.fontAddress !== undefined) {
      this._fontAddress = state.fontAddress;
    }

    if (this._elements) {
      this._selectChar(this.selectedChar);
      this._updateAllCharPreviews();
      if (this._elements.liveCheckbox) {
        this._elements.liveCheckbox.checked = this._liveUpdate;
      }
      if (this._elements.addressInput) {
        this._elements.addressInput.value = "0x" + this._fontAddress.toString(16).toUpperCase();
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
