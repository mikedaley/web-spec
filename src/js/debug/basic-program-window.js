/*
 * basic-program-window.js - Sinclair BASIC program editor window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import "../css/basic-program.css";
import { BaseWindow } from "../windows/base-window.js";
import { SinclairBasicParser } from "../utils/sinclair-basic-parser.js";
import { SinclairBasicTokenizer } from "../utils/sinclair-basic-tokenizer.js";
import { highlightLine } from "../utils/sinclair-basic-highlighting.js";
import { KEYWORDS_BY_LENGTH } from "../utils/sinclair-basic-tokens.js";
import { BasicVariableInspector } from "./basic-variable-inspector.js";

// ERR_NR (0x5C3A) stores the report code MINUS 1.
// Report codes: 0=OK, 1..9 use digits, 10+ use letters A..R.
// We exclude 0xFF (report 0 = OK) and 0x08 (report 9 = STOP statement).
const SPECTRUM_ERRORS = {
  0x00: ["1", "NEXT without FOR"],
  0x01: ["2", "Variable not found"],
  0x02: ["3", "Subscript wrong"],
  0x03: ["4", "Out of memory"],
  0x04: ["5", "Out of screen"],
  0x05: ["6", "Number too big"],
  0x06: ["7", "RETURN without GOSUB"],
  0x07: ["8", "End of file"],
  0x09: ["A", "Invalid argument"],
  0x0A: ["B", "Integer out of range"],
  0x0B: ["C", "Nonsense in BASIC"],
  0x0C: ["D", "BREAK - CONT repeats"],
  0x0D: ["E", "Out of DATA"],
  0x0E: ["F", "Invalid file name"],
  0x0F: ["G", "No room for line"],
  0x10: ["H", "STOP in INPUT"],
  0x11: ["I", "FOR without NEXT"],
  0x12: ["J", "Invalid I/O device"],
  0x13: ["K", "Invalid colour"],
  0x14: ["L", "BREAK into program"],
  0x15: ["M", "RAMTOP no good"],
  0x16: ["N", "Statement lost"],
  0x17: ["O", "Invalid stream"],
  0x18: ["P", "FN without DEF"],
  0x19: ["Q", "Parameter error"],
  0x1A: ["R", "Tape loading error"],
};

export class BasicProgramWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "basic-program",
      title: "Sinclair BASIC",
      defaultWidth: 640,
      defaultHeight: 480,
      minWidth: 400,
      minHeight: 280,
    });

    this.proxy = proxy;
    this.parser = new SinclairBasicParser();
    this.tokenizer = new SinclairBasicTokenizer();
    this.variableInspector = new BasicVariableInspector();

    // State
    this._sidebarVisible = true;
    this._sidebarWidth = 180;
    this._lastVariableUpdate = 0;
    this._variableUpdateInterval = 100; // ms between variable refreshes
    this._pendingHighlight = false;
    this._romReady = false; // true once ROM has finished startup (RAM test etc.)
    this._programRunning = false; // true when PPC > 0 (BASIC program executing)
    this._lastChAdd = 0; // CH_ADD value from previous poll
    this._lastActivityTime = 0; // timestamp when CH_ADD last changed
    this._traceEnabled = true; // highlight current line while running (no pause)
    this._traceLastLine = null; // last line highlighted by trace (avoid redundant DOM updates)

    // Error overlay state
    this._errorLineNumber = null;
    this._errorMessage = null;
    this._errorLineContent = null;

    // BASIC debugging state
    this._basicBreakpoints = new Set();
    this._basicStepping = false; // true ONLY when paused at a BASIC breakpoint
    this._currentBasicLine = null;
    this.onRenderFrame = null; // callback to push framebuffer to display

    // Track which editor line the cursor is on for auto-renumber on line change
    this._lastCursorLine = -1;

    // Sidebar resize state
    this._sidebarResizing = false;
    this._sidebarResizeStartX = 0;
    this._sidebarResizeStartWidth = 0;

    // Bind handlers
    this._onSidebarResizeMove = this._onSidebarResizeMove.bind(this);
    this._onSidebarResizeEnd = this._onSidebarResizeEnd.bind(this);
  }

  renderContent() {
    return `
      <div class="bas-toolbar">
        <div class="bas-toolbar-group">
          <button class="bas-toolbar-btn run" data-action="run" title="Write program and type RUN">Run</button>
          <button class="bas-toolbar-btn step" data-action="step" title="Step one BASIC statement">Step</button>
          <button class="bas-toolbar-btn continue" data-action="continue" title="Continue to next breakpoint">Continue</button>
          <button class="bas-toolbar-btn stop" data-action="stop-debug" title="Stop debugging">Stop</button>
        </div>
        <div class="bas-toolbar-separator"></div>
        <label class="bas-trace-toggle" title="Highlight current line while running">
          <input type="checkbox" class="bas-trace-checkbox">
          <span>Trace</span>
        </label>
        <div class="bas-toolbar-separator"></div>
        <div class="bas-toolbar-group">
          <button class="bas-toolbar-btn" data-action="read" title="Read program from Spectrum memory">Read</button>
          <button class="bas-toolbar-btn" data-action="write" title="Write program to Spectrum memory">Write</button>
          <button class="bas-toolbar-btn" data-action="format" title="Auto-format: sort and indent lines">Format</button>
          <button class="bas-toolbar-btn" data-action="renum" title="Renumber lines by 10s">Renum</button>
        </div>
        <div class="bas-toolbar-separator"></div>
        <div class="bas-toolbar-group">
          <button class="bas-toolbar-btn" data-action="new" title="Clear editor">New</button>
          <button class="bas-toolbar-btn" data-action="open" title="Open .bas file">Open</button>
          <button class="bas-toolbar-btn" data-action="save" title="Save as .bas file">Save</button>
        </div>
      </div>
      <div class="bas-editor-area">
        <div class="bas-editor-with-gutter">
          <div class="bas-gutter"></div>
          <div class="bas-editor-container">
            <pre class="bas-highlight" aria-hidden="true"></pre>
            <textarea class="bas-textarea" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>
          </div>
        </div>
        <div class="bas-sidebar-resize"></div>
        <div class="bas-sidebar">
          <div class="bas-sidebar-header">Variables</div>
          <div class="bas-sidebar-content"></div>
        </div>
      </div>
      <div class="bas-statusbar">
        <span class="bas-status-item bas-debug-status" data-status="debug"></span>
        <span class="bas-status-item" data-status="lines">0 lines</span>
        <span class="bas-status-item" data-status="cursor">Ln 1, Col 1</span>
        <div class="bas-status-right">
          <button class="bas-sidebar-toggle" data-action="toggle-sidebar">Variables</button>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this._textarea = this.contentElement.querySelector(".bas-textarea");
    this._highlight = this.contentElement.querySelector(".bas-highlight");
    this._gutter = this.contentElement.querySelector(".bas-gutter");
    this._sidebar = this.contentElement.querySelector(".bas-sidebar");
    this._sidebarContent = this.contentElement.querySelector(".bas-sidebar-content");
    this._sidebarResize = this.contentElement.querySelector(".bas-sidebar-resize");
    this._statusLines = this.contentElement.querySelector('[data-status="lines"]');
    this._statusCursor = this.contentElement.querySelector('[data-status="cursor"]');
    this._debugStatus = this.contentElement.querySelector('[data-status="debug"]');

    // Apply saved sidebar state
    if (!this._sidebarVisible) {
      this._sidebar.classList.add("hidden");
      this._sidebarResize.style.display = "none";
    }
    this._sidebar.style.width = `${this._sidebarWidth}px`;

    // Textarea is the scroll master — sync highlight and gutter to it
    this._textarea.addEventListener("scroll", () => this._syncScroll());
    this._textarea.addEventListener("input", () => this._onInput());
    this._textarea.addEventListener("keydown", (e) => this._onKeyDown(e));
    this._textarea.addEventListener("click", () => this._onCursorMove());
    this._textarea.addEventListener("keyup", () => this._onCursorMove());

    // Cache toolbar button references and wire up click handlers
    this._actionButtons = {};
    this.contentElement.querySelectorAll("[data-action]").forEach((btn) => {
      this._actionButtons[btn.dataset.action] = btn;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const action = btn.dataset.action;
        this._handleAction(action);
      });
    });
    this._updateToolbarState();

    // Sidebar resize
    this._sidebarResize.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._sidebarResizing = true;
      this._sidebarResizeStartX = e.clientX;
      this._sidebarResizeStartWidth = this._sidebarWidth;
      this._sidebarResize.classList.add("active");
      document.addEventListener("mousemove", this._onSidebarResizeMove);
      document.addEventListener("mouseup", this._onSidebarResizeEnd);
    });

    // Trace toggle
    this._traceCheckbox = this.contentElement.querySelector(".bas-trace-checkbox");
    this._traceCheckbox.checked = this._traceEnabled;
    this._traceCheckbox.addEventListener("change", () => {
      this._traceEnabled = this._traceCheckbox.checked;
      if (!this._traceEnabled) {
        this._traceLastLine = null;
        this._clearHighlight();
        this._updateGutter();
      }
      if (this.onStateChange) this.onStateChange();
    });

    // Load saved content
    this._loadEditorContent();

    // Initial highlight
    this._updateHighlight();
    this._updateGutter();
    this._updateStatus();

    // If breakpoints were restored from saved state, activate them in the worker
    this._syncBreakpointsToWorker();
  }

  _onSidebarResizeMove(e) {
    if (!this._sidebarResizing) return;
    const dx = this._sidebarResizeStartX - e.clientX;
    const newWidth = Math.max(100, Math.min(400, this._sidebarResizeStartWidth + dx));
    this._sidebarWidth = newWidth;
    this._sidebar.style.width = `${newWidth}px`;
  }

  _onSidebarResizeEnd() {
    this._sidebarResizing = false;
    this._sidebarResize.classList.remove("active");
    document.removeEventListener("mousemove", this._onSidebarResizeMove);
    document.removeEventListener("mouseup", this._onSidebarResizeEnd);
    if (this.onStateChange) this.onStateChange();
  }

  _onInput() {
    this._trackErrorLine();
    this._updateHighlight();
    this._updateGutter();
    this._updateStatus();
    this._saveEditorContent();
  }

  _onKeyDown(e) {
    // Tab inserts spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const start = this._textarea.selectionStart;
      const end = this._textarea.selectionEnd;
      const value = this._textarea.value;
      this._textarea.value = value.substring(0, start) + "  " + value.substring(end);
      this._textarea.selectionStart = this._textarea.selectionEnd = start + 2;
      this._onInput();
    }
  }

  _onCursorMove() {
    this._autoFormatKeywords();

    // Detect line change and auto-renumber if needed
    const pos = this._textarea.selectionStart;
    const currentLine = this._textarea.value.substring(0, pos).split("\n").length - 1;
    if (this._lastCursorLine >= 0 && currentLine !== this._lastCursorLine) {
      this._autoRenumberIfNeeded();
    }
    this._lastCursorLine = currentLine;

    this._updateCursorStatus();
  }

  /**
   * Uppercase all BASIC keywords in the textarea text.
   * Skips content inside strings and after REM.
   */
  _autoFormatKeywords() {
    const text = this._textarea.value;
    const cursorStart = this._textarea.selectionStart;
    const cursorEnd = this._textarea.selectionEnd;

    const lines = text.split("\n");
    let changed = false;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const formatted = this._uppercaseKeywordsInLine(line);
      if (formatted !== line) {
        lines[lineIdx] = formatted;
        changed = true;
      }
    }

    if (changed) {
      this._textarea.value = lines.join("\n");
      this._textarea.selectionStart = cursorStart;
      this._textarea.selectionEnd = cursorEnd;
      this._updateHighlight();
      this._saveEditorContent();
    }
  }

  /**
   * Uppercase keywords in a single line, preserving strings and REM content.
   */
  _uppercaseKeywordsInLine(text) {
    const chars = [...text];
    let i = 0;
    const len = text.length;

    // Skip line number
    while (i < len && text[i] >= "0" && text[i] <= "9") i++;
    while (i < len && text[i] === " ") i++;

    let inString = false;
    let inRem = false;

    while (i < len) {
      if (inRem) break;

      if (text[i] === '"') {
        inString = !inString;
        i++;
        continue;
      }

      if (inString) {
        i++;
        continue;
      }

      // Try keyword match
      let matched = false;
      const remaining = text.slice(i).toUpperCase();
      for (const kw of KEYWORDS_BY_LENGTH) {
        if (remaining.startsWith(kw)) {
          const afterKw = i + kw.length;
          if (afterKw < len) {
            const nextChar = text[afterKw];
            if (/[A-Za-z]/.test(kw[kw.length - 1]) && /[A-Za-z0-9]/.test(nextChar)) {
              continue;
            }
          }
          // Replace with uppercase
          for (let c = 0; c < kw.length; c++) {
            chars[i + c] = kw[c];
          }
          i += kw.length;
          matched = true;
          if (kw === "REM") inRem = true;
          break;
        }
      }
      if (matched) continue;

      i++;
    }

    return chars.join("");
  }

  /**
   * When the cursor moves off a line, check if line numbers are in ascending
   * order. If a newly inserted line causes overlap, bump all lines below it
   * by 10 and update GO TO / GO SUB / RESTORE / RUN references.
   * Uses the C++ tokenizer-based renumbering via WASM for robust reference updating.
   */
  async _autoRenumberIfNeeded() {
    const text = this._textarea.value;
    const cursorStart = this._textarea.selectionStart;
    const cursorEnd = this._textarea.selectionEnd;

    const result = await this.proxy.basicAutoRenumber(text);
    if (result !== text) {
      this._textarea.value = result;
      this._textarea.selectionStart = cursorStart;
      this._textarea.selectionEnd = cursorEnd;
      this._updateHighlight();
      this._updateGutter();
      this._saveEditorContent();
    }
  }

  _syncScroll() {
    // Textarea is the scroll master — sync highlight and gutter
    this._highlight.scrollTop = this._textarea.scrollTop;
    this._highlight.scrollLeft = this._textarea.scrollLeft;
    this._gutter.scrollTop = this._textarea.scrollTop;
  }

  _updateHighlight() {
    const text = this._textarea.value;
    const lines = text.split("\n");
    const highlighted = lines.map((line) => {
      let html = highlightLine(line);
      if (this._errorLineNumber !== null) {
        const match = line.trim().match(/^(\d+)\s/);
        if (match && parseInt(match[1], 10) === this._errorLineNumber) {
          const escapedMsg = this._errorMessage.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          html = `<span class="bas-error-line">${html}<span class="bas-error-msg">${escapedMsg}</span></span>`;
        }
      }
      return html;
    }).join("\n");
    this._highlight.innerHTML = highlighted;
  }

  _updateGutter() {
    const text = this._textarea.value;
    const lines = text.split("\n");
    const lineCount = lines.length;
    let html = "";
    for (let i = 0; i < lineCount; i++) {
      const match = lines[i].trim().match(/^(\d+)\s/);
      const basicLineNum = match ? parseInt(match[1], 10) : null;
      const hasBp = basicLineNum !== null && this._basicBreakpoints.has(basicLineNum);
      const isCurrentLine = basicLineNum !== null && basicLineNum === this._currentBasicLine;
      const isError = basicLineNum !== null && basicLineNum === this._errorLineNumber;
      let cls = "bas-gutter-line";
      if (hasBp) cls += " breakpoint";
      if (isCurrentLine) cls += " current-line";
      if (isError) cls += " has-error";
      const dataAttr = basicLineNum !== null ? ` data-basic-line="${basicLineNum}"` : "";
      html += `<div class="${cls}"${dataAttr}></div>`;
    }
    this._gutter.innerHTML = html;

    // Add click handlers for breakpoint toggling
    this._gutter.querySelectorAll(".bas-gutter-line[data-basic-line]").forEach((el) => {
      el.addEventListener("click", () => {
        const lineNum = parseInt(el.dataset.basicLine, 10);
        this._toggleBreakpoint(lineNum);
      });
    });
  }

  _updateStatus() {
    const text = this._textarea.value;
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (this._statusLines) {
      this._statusLines.textContent = `${lines.length} line${lines.length !== 1 ? "s" : ""}`;
    }
    this._updateCursorStatus();
  }

  _updateCursorStatus() {
    if (!this._statusCursor || !this._textarea) return;
    const pos = this._textarea.selectionStart;
    const text = this._textarea.value.substring(0, pos);
    const lines = text.split("\n");
    const ln = lines.length;
    const col = lines[lines.length - 1].length + 1;
    this._statusCursor.textContent = `Ln ${ln}, Col ${col}`;
  }

  _updateToolbarState() {
    if (!this._actionButtons) return;
    const paused = this._basicStepping;     // paused at a BASIC breakpoint
    const running = this._programRunning;   // program actively executing
    const active = running || paused;       // program in progress (running or paused)
    const ready = this._romReady;

    // Read/Write: ROM must be ready and program not in progress
    this._setButtonEnabled("read", ready && !active);
    this._setButtonEnabled("write", ready && !active);

    // Run: program must exist in memory and not be in progress
    const hasProgram = this.proxy?.hasBasicProgram() ?? false;
    this._setButtonEnabled("run", ready && !active && hasProgram);

    // Step: only when paused at a BASIC breakpoint
    this._setButtonEnabled("step", ready && paused);

    // Stop: any time a program is in progress (running or paused)
    this._setButtonEnabled("stop-debug", ready && active);

    // Continue: only when paused at a BASIC breakpoint
    this._setButtonEnabled("continue", paused);
  }

  _setButtonEnabled(action, enabled) {
    const btn = this._actionButtons[action];
    if (!btn) return;
    btn.disabled = !enabled;
    btn.classList.toggle("disabled", !enabled);
  }

  async _handleAction(action) {
    switch (action) {
      case "read":
        await this._readFromMemory();
        break;
      case "write":
        await this._writeToMemory();
        break;
      case "format":
        this._formatProgram();
        break;
      case "renum":
        this._renumberProgram();
        break;
      case "new":
        this._newProgram();
        break;
      case "open":
        this._openFile();
        break;
      case "save":
        this._saveFile();
        break;
      case "run":
        await this._runProgram();
        break;
      case "step":
        await this._stepBasicLine();
        break;
      case "continue":
        await this._continueToBreakpoint();
        break;
      case "stop-debug":
        this._stopDebugging();
        break;
      case "toggle-sidebar":
        this._toggleSidebar();
        break;
    }
  }

  async _readFromMemory() {
    try {
      const lines = await this.parser.parse(this.proxy);
      if (lines.length === 0) {
        this._textarea.value = "";
      } else {
        this._textarea.value = lines.map((l) => `${l.lineNumber} ${l.text}`).join("\n");
      }
      this._formatProgram();
    } catch (err) {
      console.error("Failed to read BASIC program:", err);
    }
  }

  async _writeToMemory() {
    try {
      const text = this._textarea.value;
      if (!text.trim()) return;
      const programBytes = await this.tokenizer.tokenize(this.proxy, text);
      if (programBytes.length === 0) return;
      await this.tokenizer.writeTo(this.proxy, programBytes);
    } catch (err) {
      console.error("Failed to write BASIC program:", err);
    }
  }

  _formatProgram() {
    const text = this._textarea.value;
    const lines = this._parseEditorLines(text);
    if (lines.length === 0) return;

    // Sort by line number
    lines.sort((a, b) => a.lineNumber - b.lineNumber);

    // Simple indentation based on FOR/NEXT
    let indent = 0;
    const formatted = [];
    for (const line of lines) {
      const upper = line.body.toUpperCase();
      // Decrease indent before NEXT
      if (/^\s*NEXT\b/.test(upper)) {
        indent = Math.max(0, indent - 1);
      }
      const padding = "  ".repeat(indent);
      formatted.push(`${line.lineNumber} ${padding}${line.body}`);
      // Increase indent after FOR
      if (/\bFOR\b/.test(upper) && !/\bNEXT\b/.test(upper)) {
        indent++;
      }
    }

    this._textarea.value = formatted.join("\n");
    this._onInput();
  }

  async _renumberProgram() {
    const text = this._textarea.value;
    if (!text.trim()) return;

    const result = await this.proxy.basicRenumberProgram(text, 10, 10);
    this._textarea.value = result;
    this._onInput();
  }

  _parseEditorLines(text) {
    const lines = [];
    for (const rawLine of text.split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;
      const match = trimmed.match(/^(\d+)\s*(.*)/);
      if (match) {
        lines.push({ lineNumber: parseInt(match[1], 10), body: match[2] });
      }
    }
    return lines;
  }

  _newProgram() {
    this._textarea.value = "";
    this._onInput();
  }

  _openFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".bas,.txt";
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this._textarea.value = reader.result;
        this._formatProgram();
      };
      reader.readAsText(file);
    });
    input.click();
  }

  async _saveFile() {
    const text = this._textarea.value;
    const blob = new Blob([text], { type: "text/plain" });

    // Use File System Access API if available (lets user pick save location)
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: "program.bas",
          types: [{
            description: "BASIC Program",
            accept: { "text/plain": [".bas", ".txt"] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (e) {
        // User cancelled the dialog
        if (e.name === "AbortError") return;
      }
    }

    // Fallback for browsers without File System Access API
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "program.bas";
    a.click();
    URL.revokeObjectURL(url);
  }

  async _runProgram() {
    // If paused at a breakpoint, stop first so the ROM returns to the
    // command prompt before we type RUN.
    if (this._basicStepping || this.proxy.isPaused()) {
      await this._stopDebugging();
      await this._delay(300);
    }

    // Clear any previous error highlighting
    this._clearError();
    this._updateHighlight();
    this._updateGutter();

    // Arm breakpoints if any exist (they'll fire once the program starts)
    if (this._basicBreakpoints.size > 0) {
      this._syncBreakpointsToWorker();
    }

    // Mark as running so the toolbar updates immediately and so that
    // programs finishing before the next poll still trigger the
    // wasRunning→!running cleanup transition.
    this._programRunning = true;
    this._lastChAdd = 0;
    this._lastActivityTime = performance.now();
    this._updateToolbarState();

    // Type R + ENTER (48K keyword mode generates RUN)
    const keys = [
      [2, 3], // R
      [6, 0], // ENTER
    ];
    for (const [row, bit] of keys) {
      this.proxy.keyDown(row, bit);
      await this._delay(50);
      this.proxy.keyUp(row, bit);
      await this._delay(50);
    }
  }

  async _stepBasicLine() {
    // Break on the next BASIC statement.  _basicStepping will be set
    // when the breakpoint actually fires (in _onBasicPaused).
    this._installBasicBreakpointHandler();
    this.proxy.setBasicBreakpointMode("step", null);
    this._updateToolbarState();
  }

  _continueToBreakpoint() {
    // We're resuming — no longer paused at a breakpoint
    this._basicStepping = false;
    this._currentBasicLine = null;
    this._clearHighlight();
    this._updateDebugStatus("");

    if (this._basicBreakpoints.size > 0) {
      // Resume with breakpoints armed — will pause at the next matching line
      this._installBasicBreakpointHandler();
      this.proxy.setBasicBreakpointMode("run", this._basicBreakpoints);
    } else {
      // No breakpoints — just resume freely
      this.proxy.clearBasicBreakpointMode();
      this.proxy.resume();
    }
    this._updateToolbarState();
  }

  async _stopDebugging() {
    // Break the program by sending CAPS SHIFT + SPACE (the Spectrum's
    // BREAK key combination).  The ROM checks this during execution and
    // will stop the program with "BREAK into program" / report L.
    this.proxy.clearBasicBreakpointMode();

    // If paused at a breakpoint, resume so the ROM can process the key
    if (this.proxy.isPaused()) {
      this.proxy.resume();
    }

    // CAPS SHIFT = row 0 bit 0, SPACE = row 7 bit 0
    this.proxy.keyDown(0, 0); // CAPS SHIFT
    this.proxy.keyDown(7, 0); // SPACE
    await this._delay(150);
    this.proxy.keyUp(0, 0);
    this.proxy.keyUp(7, 0);

    this._basicStepping = false;
    this._programRunning = false;
    this._currentBasicLine = null;
    this._clearHighlight();
    this._updateDebugStatus("");
    this._updateGutter();
    this._refreshVariables();
    this._updateToolbarState();
  }

  _installBasicBreakpointHandler() {
    this.proxy.onBasicBreakpointHit = (framebuffer, lineNumber, hit) => {
      this._onBasicPaused(lineNumber, framebuffer);
    };
  }

  _onBasicPaused(lineNumber, framebuffer) {
    this._basicStepping = true;
    this._currentBasicLine = lineNumber;
    this._updateDebugStatus(`Line ${lineNumber}`);
    this._highlightBasicLine(lineNumber);
    this._updateGutter();
    if (framebuffer && this.onRenderFrame) {
      this.onRenderFrame(framebuffer);
    }
    // Force an immediate variable refresh so the sidebar shows
    // the latest state after each step/breakpoint hit
    this._refreshVariables();
    this._updateToolbarState();
  }

  _toggleBreakpoint(lineNumber) {
    if (this._basicBreakpoints.has(lineNumber)) {
      this._basicBreakpoints.delete(lineNumber);
    } else {
      this._basicBreakpoints.add(lineNumber);
    }
    this._syncBreakpointsToWorker();
    this._updateGutter();
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Keep the Z80 breakpoint at 0x1B29 active whenever BASIC breakpoints exist,
   * so programs started from within the emulator (typing RUN, GO TO, etc.) also stop.
   */
  _syncBreakpointsToWorker() {
    if (this._basicBreakpoints.size > 0) {
      this._installBasicBreakpointHandler();
      this.proxy.setBasicBreakpointMode("run", this._basicBreakpoints);
    } else {
      this.proxy.clearBasicBreakpointMode();
    }
  }

  _highlightBasicLine(targetLineNumber) {
    this._clearHighlight();
    const lines = this._textarea.value.split("\n");
    const highlightEl = this._highlight;
    if (!highlightEl) return;

    // Find which editor line corresponds to the BASIC line number
    let editorLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].trim().match(/^(\d+)\s/);
      if (match && parseInt(match[1], 10) === targetLineNumber) {
        editorLineIdx = i;
        break;
      }
    }

    if (editorLineIdx < 0) return;

    // Wrap the corresponding highlight line in a highlight span
    const highlightLines = highlightEl.innerHTML.split("\n");
    if (editorLineIdx < highlightLines.length) {
      highlightLines[editorLineIdx] =
        `<span class="bas-highlight-line">${highlightLines[editorLineIdx]}</span>`;
      highlightEl.innerHTML = highlightLines.join("\n");
    }

    // Scroll textarea to make the line visible
    const lineHeight = 18;
    const targetScrollTop = editorLineIdx * lineHeight - this._textarea.clientHeight / 2 + lineHeight;
    this._textarea.scrollTop = Math.max(0, targetScrollTop);
    this._syncScroll();
  }

  _clearHighlight() {
    if (!this._highlight) return;
    const existing = this._highlight.querySelectorAll(".bas-highlight-line");
    existing.forEach((el) => {
      el.outerHTML = el.innerHTML;
    });
  }

  _updateDebugStatus(text) {
    if (this._debugStatus) {
      this._debugStatus.textContent = text;
    }
  }

  _setError(lineNumber, errNr) {
    const [reportCode, message] = SPECTRUM_ERRORS[errNr];
    this._errorLineNumber = lineNumber;
    this._errorMessage = `${reportCode} ${message}`;
    this._errorLineContent = this._getLineContent(lineNumber);
  }

  _clearError() {
    this._errorLineNumber = null;
    this._errorMessage = null;
    this._errorLineContent = null;
  }

  _trackErrorLine() {
    if (this._errorLineNumber === null) return;

    const currentContent = this._getLineContent(this._errorLineNumber);

    if (currentContent !== null && currentContent === this._errorLineContent) {
      return; // Line still exists with same content — keep error
    }

    // Check if line was renumbered (same content, different number)
    const lines = this._textarea.value.split("\n");
    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(.*)/);
      if (match && match[2] === this._errorLineContent) {
        this._errorLineNumber = parseInt(match[1], 10);
        return;
      }
    }

    // Line content changed or removed — clear error
    this._clearError();
  }

  _getLineContent(lineNumber) {
    const lines = this._textarea.value.split("\n");
    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(.*)/);
      if (match && parseInt(match[1], 10) === lineNumber) {
        return match[2];
      }
    }
    return null;
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _toggleSidebar() {
    this._sidebarVisible = !this._sidebarVisible;
    if (this._sidebarVisible) {
      this._sidebar.classList.remove("hidden");
      this._sidebarResize.style.display = "";
    } else {
      this._sidebar.classList.add("hidden");
      this._sidebarResize.style.display = "none";
    }
    if (this.onStateChange) this.onStateChange();
  }

  _saveEditorContent() {
    try {
      localStorage.setItem("zxspec-basic-editor", this._textarea.value);
    } catch (e) {
      // Ignore quota errors
    }
  }

  _loadEditorContent() {
    try {
      const saved = localStorage.getItem("zxspec-basic-editor");
      if (saved) {
        this._textarea.value = saved;
      }
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Called every frame by WindowManager when visible.
   */
  update(proxy) {
    if (!this.isVisible) return;

    // Keep toolbar state in sync with emulator state every frame
    this._updateToolbarState();

    // Check ROM readiness (PROG at 0x5C53) and whether a BASIC program
    // is currently executing.  Read FLAGS, PPC, and PROG in one call.
    // FLAGS (0x5C3B) bit 7: clear = run mode, set = edit/input mode.
    // PPC (0x5C45) = current line number (> 0 during execution).
    // PROG (0x5C53) = program start address (valid once ROM has initialised).
    if (!this._romReadyChecking) {
      this._romReadyChecking = true;
      // Read from 0x5C3A to 0x5C5E inclusive (37 bytes)
      proxy.readMemory(0x5C3A, 37).then((data) => {
        this._romReadyChecking = false;
        const errNr = data[0];                            // 0x5C3A (ERR_NR)
        const flags = data[1];                            // 0x5C3B (FLAGS)
        const ppc = data[11] | (data[12] << 8);          // 0x5C45-46
        const prog = data[25] | (data[26] << 8);         // 0x5C53-54
        const chAdd = data[35] | (data[36] << 8);        // 0x5C5D-5E (CH_ADD)
        this._romReady = (prog >= 0x5C00 && prog < 0x8000);
        // Detect whether a BASIC program is currently executing.
        // The heuristic (ERR_NR=0xFF, FLAGS bit 7 set, valid PPC)
        // matches BOTH during execution AND after "0 OK" in the editor,
        // so it can't distinguish the two on its own.  We also track
        // CH_ADD (the ROM's character-interpretation pointer): during
        // execution CH_ADD advances rapidly through the program; after
        // "0 OK" it stays fixed at the edit-line buffer.  If CH_ADD
        // hasn't changed in 500ms the program has ended.
        // _runProgram() sets _programRunning=true explicitly so that
        // programs completing within one poll cycle still trigger the
        // wasRunning→!running cleanup transition.
        const wasRunning = this._programRunning;
        const looksRunning = (errNr === 0xFF && (flags & 0x80) !== 0 && ppc > 0 && ppc <= 9999);
        const now = performance.now();

        if (looksRunning) {
          // Track CH_ADD changes as evidence of active execution
          if (chAdd !== this._lastChAdd) {
            this._lastChAdd = chAdd;
            this._lastActivityTime = now;
            this._programRunning = true;
          } else if (this._programRunning && !this._basicStepping && now - this._lastActivityTime > 500) {
            // CH_ADD hasn't changed in 500ms and we're not paused at a
            // breakpoint — program has ended
            this._programRunning = false;
          }
        } else {
          // Heuristic doesn't match — definitely not running
          this._programRunning = false;
        }

        // Trace mode: highlight current line while running (no pause)
        if (this._traceEnabled && this._programRunning && !this._basicStepping) {
          if (ppc !== this._traceLastLine) {
            this._traceLastLine = ppc;
            this._currentBasicLine = ppc;
            this._highlightBasicLine(ppc);
            this._updateGutter();
          }
        }

        // Program just ended — clean up debug/trace state
        if (wasRunning && !this._programRunning) {
          this._basicStepping = false;
          this._currentBasicLine = null;
          this._clearHighlight();
          this._updateDebugStatus("");
          this.proxy.clearBasicBreakpointMode();
          if (this._traceLastLine !== null) {
            this._traceLastLine = null;
          }

          // Check for runtime errors (ignore L BREAK into program — normal stop)
          if (errNr !== 0xFF && errNr !== 0x14 && SPECTRUM_ERRORS[errNr] !== undefined) {
            this._setError(ppc, errNr);
          } else {
            this._clearError();
          }

          this._updateHighlight();
          this._updateGutter();
          this._updateToolbarState();
        }
      }).catch(() => { this._romReadyChecking = false; });
    }

    // Throttled variable refresh
    const now = performance.now();
    if (now - this._lastVariableUpdate > this._variableUpdateInterval) {
      this._lastVariableUpdate = now;
      this._refreshVariables();
    }
  }

  async _refreshVariables() {
    if (!this._sidebarVisible || !this._sidebarContent) return;
    try {
      const vars = await this.variableInspector.readVariables(this.proxy);
      this.variableInspector.render(vars, this._sidebarContent);
    } catch (e) {
      // Ignore errors during variable read
    }
  }

  // State persistence overrides
  getState() {
    const state = super.getState();
    state.sidebarVisible = this._sidebarVisible;
    state.sidebarWidth = this._sidebarWidth;
    state.basicBreakpoints = [...this._basicBreakpoints];
    state.traceEnabled = this._traceEnabled;
    state.errorLineNumber = this._errorLineNumber;
    state.errorMessage = this._errorMessage;
    state.errorLineContent = this._errorLineContent;
    return state;
  }

  restoreState(state) {
    if (state.sidebarVisible !== undefined) {
      this._sidebarVisible = state.sidebarVisible;
    }
    if (state.sidebarWidth !== undefined) {
      this._sidebarWidth = state.sidebarWidth;
    }
    if (state.basicBreakpoints) {
      this._basicBreakpoints = new Set(state.basicBreakpoints);
    }
    if (state.traceEnabled !== undefined) {
      this._traceEnabled = state.traceEnabled;
    }
    if (state.errorLineNumber !== undefined) {
      this._errorLineNumber = state.errorLineNumber;
      this._errorMessage = state.errorMessage;
      this._errorLineContent = state.errorLineContent;
    }
    super.restoreState(state);

    // Apply sidebar state after DOM exists
    if (this._sidebar) {
      if (!this._sidebarVisible) {
        this._sidebar.classList.add("hidden");
        this._sidebarResize.style.display = "none";
      } else {
        this._sidebar.classList.remove("hidden");
        this._sidebarResize.style.display = "";
      }
      this._sidebar.style.width = `${this._sidebarWidth}px`;
    }

    // Redraw gutter so restored breakpoints are visible
    this._updateGutter();
  }

  destroy() {
    document.removeEventListener("mousemove", this._onSidebarResizeMove);
    document.removeEventListener("mouseup", this._onSidebarResizeEnd);
    super.destroy();
  }
}
