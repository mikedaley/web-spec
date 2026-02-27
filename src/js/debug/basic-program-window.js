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
import { BasicBreakpointManager } from "./basic-breakpoint-manager.js";

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
    this._bpPanelVisible = true;
    this._sidebarVisible = true;
    this._sidebarWidth = 180;
    this._lastVariableUpdate = 0;
    this._variableUpdateInterval = 100; // ms between variable refreshes
    this._pendingHighlight = false;
    this._romReady = false; // true once ROM has finished startup (RAM test etc.)
    this._programRunning = false; // true when a BASIC program is executing
    this._traceEnabled = true; // highlight current line while running (no pause)
    this._traceLastLine = null; // last line highlighted by trace (avoid redundant DOM updates)

    // Error overlay state
    this._errorLineNumber = null;
    this._errorMessage = null;
    this._errorLineContent = null;

    // Track last seen ERR_NR so we can detect errors from emulator-initiated runs
    this._lastSeenErrNr = 0xFF; // 0xFF = OK (no error)

    // BASIC debugging state
    this._basicBreakpoints = new BasicBreakpointManager();
    this._basicBreakpoints.setProxy(proxy);
    this._basicStepping = false; // true ONLY when paused at a BASIC breakpoint
    this._singleStepping = false; // true when executing exactly one BASIC step
    this._skipConditionRuleChecks = 0; // countdown to skip stale-variable evaluations after RUN
    this._currentBasicLine = null;
    this.onRenderFrame = null; // callback to push framebuffer to display
    this.ruleBuilderWindow = null; // set by main.js

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
      <div class="bas-bp-panel">
        <div class="bas-bp-panel-header">
          <span class="bas-bp-panel-header-label">Breakpoints</span>
          <div class="bas-bp-panel-actions">
            <button class="bas-bp-panel-btn" data-action="add-bp-line" title="Add line breakpoint">+ Line</button>
            <button class="bas-bp-panel-btn" data-action="add-bp-rule" title="Add condition-only rule">+ Rule</button>
          </div>
        </div>
        <div class="bas-bp-panel-list"></div>
      </div>
      <div class="bas-statusbar">
        <span class="bas-status-item bas-debug-status" data-status="debug"></span>
        <span class="bas-status-item" data-status="lines">0 lines</span>
        <span class="bas-status-item" data-status="cursor">Ln 1, Col 1</span>
        <div class="bas-status-right">
          <button class="bas-sidebar-toggle" data-action="toggle-bp-panel">Breakpoints</button>
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
    this._bpPanel = this.contentElement.querySelector(".bas-bp-panel");
    this._bpPanelList = this.contentElement.querySelector(".bas-bp-panel-list");

    // Apply saved breakpoint panel state
    if (!this._bpPanelVisible) {
      this._bpPanel.classList.add("hidden");
    }

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
    this._renderBreakpointPanel();

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
      // Reformat only if the current line has a line number (not a new empty line)
      const lines = this._textarea.value.split("\n");
      const curLine = lines[currentLine] || "";
      if (/^\s*\d+\s/.test(curLine)) {
        this._formatProgram();
      }
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
      const hasCond = basicLineNum !== null && this._basicBreakpoints.hasCondition(basicLineNum);
      const isCurrentLine = basicLineNum !== null && basicLineNum === this._currentBasicLine;
      const isError = basicLineNum !== null && basicLineNum === this._errorLineNumber;
      let cls = "bas-gutter-line";
      if (hasBp) cls += " breakpoint";
      if (hasCond) cls += " has-condition";
      if (isCurrentLine) cls += " current-line";
      if (isError) cls += " has-error";
      const dataAttr = basicLineNum !== null ? ` data-basic-line="${basicLineNum}"` : "";
      html += `<div class="${cls}"${dataAttr}></div>`;
    }
    this._gutter.innerHTML = html;

    // Add click handlers for breakpoint toggling and context menu
    this._gutter.querySelectorAll(".bas-gutter-line[data-basic-line]").forEach((el) => {
      el.addEventListener("click", () => {
        const lineNum = parseInt(el.dataset.basicLine, 10);
        this._toggleBreakpoint(lineNum);
      });
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const lineNum = parseInt(el.dataset.basicLine, 10);
        if (this._basicBreakpoints.has(lineNum)) {
          this._showBreakpointContextMenu(e.clientX, e.clientY, lineNum);
        }
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
      case "toggle-bp-panel":
        this._toggleBpPanel();
        break;
      case "add-bp-line":
        this._addBreakpointFromPanel();
        break;
      case "add-bp-rule":
        this._addConditionRuleFromPanel();
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
      const body = line.body.replace(/^\s+/, "");
      const upper = body.toUpperCase();
      // Decrease indent before NEXT (but not inside REM)
      if (!/^REM\b/.test(upper) && /^NEXT\b/.test(upper)) {
        indent = Math.max(0, indent - 1);
      }
      const padding = "  ".repeat(indent);
      formatted.push(`${line.lineNumber} ${padding}${body}`);
      // Increase indent after FOR (but not inside REM or strings)
      if (!/^REM\b/.test(upper) && /\bFOR\b/.test(upper) && !/\bNEXT\b/.test(upper)) {
        indent++;
      }
    }

    const newText = formatted.join("\n");
    if (newText === text) return;
    const cursorStart = this._textarea.selectionStart;
    const cursorEnd = this._textarea.selectionEnd;
    this._textarea.value = newText;
    this._textarea.selectionStart = Math.min(cursorStart, newText.length);
    this._textarea.selectionEnd = Math.min(cursorEnd, newText.length);
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

    // Reset condition-only rules so they can fire again on this run.
    // Skip evaluation for the first few handler hits to let RUN clear
    // variables before conditions are checked against stale memory.
    this._basicBreakpoints.resetConditionRuleFired();
    this._skipConditionRuleChecks = 1;

    // Arm breakpoints if any exist (they'll fire once the program starts)
    if (this._basicBreakpoints.size > 0) {
      this._syncBreakpointsToWorker();
    }

    // Arm condition-only rules if any exist
    if (this._basicBreakpoints.conditionRules.length > 0) {
      this._installBasicBreakpointHandler();
    }

    // Tell C++ to watch for MAIN-4 (0x1303) — the ROM entry point
    // reached after every report.  This is the definitive "program ended"
    // signal and works correctly during scroll?, INPUT, and PAUSE.
    this.proxy.setBasicProgramActive();
    this._programRunning = true;
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
    // No longer paused — we're executing.  _basicStepping will be set
    // back to true when the breakpoint actually fires (in _onBasicPaused).
    this._clearBreakpointPulse();
    this._basicStepping = false;
    this._currentBasicLine = null;
    this._singleStepping = true;

    this.proxy.setBasicProgramActive();
    this._installBasicBreakpointHandler();
    this.proxy.setBasicBreakpointMode("step", null);
    this._updateToolbarState();
  }

  _continueToBreakpoint() {
    // We're resuming — no longer paused at a breakpoint
    this._clearBreakpointPulse();
    this._basicStepping = false;
    this._singleStepping = false;
    this._currentBasicLine = null;
    this._clearHighlight();
    this._updateDebugStatus("");

    // Re-arm C++ program-end detection
    this.proxy.setBasicProgramActive();

    const lineNumbers = this._basicBreakpoints.toLineNumberSet();
    const hasActiveRules = this._basicBreakpoints.hasActiveConditionRules();
    if (lineNumbers.size > 0 || hasActiveRules) {
      // Resume with breakpoints armed — will pause at the next matching line.
      // Must use "step" mode when condition rules are active so the handler
      // fires on every line and can evaluate them.
      this._installBasicBreakpointHandler();
      if (hasActiveRules) {
        this.proxy.setBasicBreakpointMode("step", null);
      } else {
        this.proxy.setBasicBreakpointMode("run", lineNumbers);
      }
    } else {
      // No breakpoints — just resume freely
      this.proxy.clearBasicBreakpointMode();
      this.proxy.resume();
    }
    this._updateToolbarState();
  }

  async _stopDebugging() {
    this._clearBreakpointPulse();
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
    this._singleStepping = false;
    this._programRunning = false;
    this._currentBasicLine = null;
    this._clearHighlight();
    this._updateDebugStatus("");
    this._updateGutter();
    this._refreshVariables();
    this._updateToolbarState();
  }

  _installBasicBreakpointHandler() {
    this.proxy.onBasicBreakpointHit = async (framebuffer, lineNumber, hit) => {
      // After RUN, skip condition rule checks for a few lines to let the
      // ROM clear variables before evaluating conditions against stale memory
      const canCheckRules = this._skipConditionRuleChecks <= 0;
      if (this._skipConditionRuleChecks > 0) this._skipConditionRuleChecks--;

      // Single-step mode: always pause on the next line
      if (this._singleStepping) {
        this._singleStepping = false;
        // Still check if a breakpoint/rule happens to match for pulse display
        let firedType = null;
        let firedIndex = -1;
        if (await this._basicBreakpoints.shouldBreak(lineNumber)) {
          firedType = "line";
        } else if (canCheckRules) {
          const ruleIdx = await this._basicBreakpoints.shouldBreakOnConditionRules();
          if (ruleIdx >= 0) {
            firedType = "rule";
            firedIndex = ruleIdx;
          }
        }
        this._onBasicPaused(lineNumber, framebuffer, firedType, firedIndex);
        return;
      }

      // Check line breakpoint condition first
      let firedType = null;
      let firedIndex = -1;
      const lineBpFired = await this._basicBreakpoints.shouldBreak(lineNumber);
      if (lineBpFired) {
        firedType = "line";
      }

      // Also check condition-only rules (fire on any line)
      if (!firedType && canCheckRules) {
        const ruleIdx = await this._basicBreakpoints.shouldBreakOnConditionRules();
        if (ruleIdx >= 0) {
          firedType = "rule";
          firedIndex = ruleIdx;
        }
      }

      if (!firedType) {
        // Condition not met — resume execution
        this.proxy.setBasicProgramActive();
        this._installBasicBreakpointHandler();
        const lineNumbers = this._basicBreakpoints.toLineNumberSet();
        const hasActiveRules = this._basicBreakpoints.hasActiveConditionRules();
        if (lineNumbers.size > 0 || hasActiveRules) {
          if (hasActiveRules) {
            this.proxy.setBasicBreakpointMode("step", null);
          } else {
            this.proxy.setBasicBreakpointMode("run", lineNumbers);
          }
        }
        return;
      }
      this._onBasicPaused(lineNumber, framebuffer, firedType, firedIndex);
    };
  }

  _onBasicPaused(lineNumber, framebuffer, firedType = null, firedIndex = -1) {
    this._basicStepping = true;
    this._programRunning = true;
    this._currentBasicLine = lineNumber;

    const cond = this._basicBreakpoints.getCondition(lineNumber);
    const statusText = cond ? `Line ${lineNumber} (${cond})` : `Line ${lineNumber}`;
    this._updateDebugStatus(statusText);
    this._highlightBasicLine(lineNumber);
    this._updateGutter();
    this._renderBreakpointPanel();
    this._pulseBreakpointItem(firedType, firedType === "line" ? lineNumber : firedIndex);
    if (framebuffer && this.onRenderFrame) {
      this.onRenderFrame(framebuffer);
    }
    // Force an immediate variable refresh so the sidebar shows
    // the latest state after each step/breakpoint hit
    this._refreshVariables();
    this._updateToolbarState();
  }

  _toggleBreakpoint(lineNumber) {
    this._basicBreakpoints.toggle(lineNumber);
    this._syncBreakpointsToWorker();
    this._updateGutter();
    this._renderBreakpointPanel();
    if (this.onStateChange) this.onStateChange();
  }

  _showBreakpointContextMenu(x, y, lineNumber) {
    // Remove any existing context menu
    this._dismissContextMenu();

    const menu = document.createElement("div");
    menu.className = "rule-context-menu";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const hasCond = this._basicBreakpoints.hasCondition(lineNumber);

    const editItem = document.createElement("div");
    editItem.className = "rule-context-menu-item";
    editItem.textContent = hasCond ? "Edit Condition..." : "Add Condition...";
    editItem.addEventListener("click", () => {
      this._dismissContextMenu();
      this._editBreakpointCondition(lineNumber);
    });
    menu.appendChild(editItem);

    if (hasCond) {
      const clearItem = document.createElement("div");
      clearItem.className = "rule-context-menu-item";
      clearItem.textContent = "Clear Condition";
      clearItem.addEventListener("click", () => {
        this._dismissContextMenu();
        this._basicBreakpoints.setCondition(lineNumber, 0, null);
        this._basicBreakpoints.setConditionRules(lineNumber, 0, null);
        this._updateGutter();
        this._renderBreakpointPanel();
      });
      menu.appendChild(clearItem);
    }

    const sep = document.createElement("div");
    sep.className = "rule-context-menu-separator";
    menu.appendChild(sep);

    const removeItem = document.createElement("div");
    removeItem.className = "rule-context-menu-item danger";
    removeItem.textContent = "Remove Breakpoint";
    removeItem.addEventListener("click", () => {
      this._dismissContextMenu();
      this._basicBreakpoints.remove(lineNumber);
      this._syncBreakpointsToWorker();
      this._updateGutter();
      this._renderBreakpointPanel();
      if (this.onStateChange) this.onStateChange();
    });
    menu.appendChild(removeItem);

    document.body.appendChild(menu);
    this._contextMenu = menu;

    // Close on outside click
    this._contextMenuDismiss = (e) => {
      if (!menu.contains(e.target)) this._dismissContextMenu();
    };
    setTimeout(() => document.addEventListener("click", this._contextMenuDismiss), 0);
  }

  _dismissContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
    if (this._contextMenuDismiss) {
      document.removeEventListener("click", this._contextMenuDismiss);
      this._contextMenuDismiss = null;
    }
  }

  _editBreakpointCondition(lineNumber) {
    if (!this.ruleBuilderWindow) return;
    const key = `${lineNumber}`;
    const entry = {
      condition: this._basicBreakpoints.getCondition(lineNumber),
      conditionRules: this._basicBreakpoints.getConditionRules(lineNumber),
    };
    this.ruleBuilderWindow.editBreakpoint(
      key, entry, `Line ${lineNumber}`,
      (k, condition, conditionRules) => {
        const ln = parseInt(k, 10);
        this._basicBreakpoints.setCondition(ln, 0, condition);
        this._basicBreakpoints.setConditionRules(ln, 0, conditionRules);
        this._updateGutter();
        this._renderBreakpointPanel();
      },
      "basic"
    );
  }

  /**
   * Keep the Z80 breakpoint at 0x1B29 active whenever BASIC breakpoints exist,
   * so programs started from within the emulator (typing RUN, GO TO, etc.) also stop.
   */
  _syncBreakpointsToWorker() {
    const lineNumbers = this._basicBreakpoints.toLineNumberSet();
    const hasActiveRules = this._basicBreakpoints.hasActiveConditionRules();
    if (lineNumbers.size > 0 || hasActiveRules) {
      this._installBasicBreakpointHandler();
      // Must use "step" mode when condition rules are active so the handler
      // fires on every line and can evaluate them
      if (hasActiveRules) {
        this.proxy.setBasicBreakpointMode("step", null);
      } else {
        this.proxy.setBasicBreakpointMode("run", lineNumbers);
      }
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

  _renderBreakpointPanel() {
    if (!this._bpPanelList) return;
    const lineBps = this._basicBreakpoints.getAll();
    const condRules = this._basicBreakpoints.conditionRules;

    if (lineBps.length === 0 && condRules.length === 0) {
      this._bpPanelList.innerHTML = '<div class="bas-bp-empty">No breakpoints</div>';
      return;
    }

    let html = "";

    // Line breakpoints
    for (const bp of lineBps) {
      const checked = bp.enabled ? "checked" : "";
      const disabledCls = bp.enabled ? "" : " disabled";
      const condText = bp.condition || "";
      const condHtml = condText
        ? `<span class="bas-bp-condition">${this._escapeHtml(condText)}</span>`
        : "";
      html += `<div class="bas-bp-item${disabledCls}" data-bp-type="line" data-bp-line="${bp.lineNumber}">
        <input type="checkbox" ${checked} data-bp-enable="line:${bp.lineNumber}">
        <span class="bas-bp-dot"></span>
        <span class="bas-bp-label" data-bp-goto="${bp.lineNumber}">Line ${bp.lineNumber}</span>
        ${condHtml}
        <span class="bas-bp-spacer"></span>
        <button class="bas-bp-action-btn" data-bp-edit="line:${bp.lineNumber}" title="Edit condition">?</button>
        <button class="bas-bp-action-btn danger" data-bp-remove="line:${bp.lineNumber}" title="Remove">\u00d7</button>
      </div>`;
    }

    // Condition-only rules
    for (let i = 0; i < condRules.length; i++) {
      const rule = condRules[i];
      const checked = rule.enabled ? "checked" : "";
      const disabledCls = rule.enabled ? "" : " disabled";
      const firedCls = rule.fired ? " fired" : "";
      const label = rule.conditionRules && this.ruleBuilderWindow
        ? this.ruleBuilderWindow.toDisplayLabel(rule.conditionRules)
        : rule.condition || "Rule";
      html += `<div class="bas-bp-item${disabledCls}${firedCls}" data-bp-type="rule" data-bp-index="${i}">
        <input type="checkbox" ${checked} data-bp-enable="rule:${i}">
        <span class="bas-bp-diamond"></span>
        <span class="bas-bp-label">Rule: ${this._escapeHtml(label)}</span>
        <span class="bas-bp-spacer"></span>
        <button class="bas-bp-action-btn" data-bp-edit="rule:${i}" title="Edit rule">?</button>
        <button class="bas-bp-action-btn danger" data-bp-remove="rule:${i}" title="Remove">\u00d7</button>
      </div>`;
    }

    this._bpPanelList.innerHTML = html;

    // Wire event handlers
    this._bpPanelList.querySelectorAll("[data-bp-enable]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        e.stopPropagation();
        const [type, key] = cb.dataset.bpEnable.split(":");
        if (type === "line") {
          this._basicBreakpoints.setEnabled(parseInt(key, 10), 0, cb.checked);
          this._syncBreakpointsToWorker();
          this._updateGutter();
        } else {
          this._basicBreakpoints.setConditionRuleEnabled(parseInt(key, 10), cb.checked);
          this._syncBreakpointsToWorker();
        }
        this._renderBreakpointPanel();
      });
    });

    this._bpPanelList.querySelectorAll("[data-bp-goto]").forEach((el) => {
      el.addEventListener("click", () => {
        const lineNum = parseInt(el.dataset.bpGoto, 10);
        this._highlightBasicLine(lineNum);
      });
    });

    this._bpPanelList.querySelectorAll("[data-bp-edit]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const [type, key] = btn.dataset.bpEdit.split(":");
        if (type === "line") {
          this._editBreakpointCondition(parseInt(key, 10));
        } else {
          this._editConditionRule(parseInt(key, 10));
        }
      });
    });

    this._bpPanelList.querySelectorAll("[data-bp-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const [type, key] = btn.dataset.bpRemove.split(":");
        if (type === "line") {
          this._basicBreakpoints.remove(parseInt(key, 10));
          this._syncBreakpointsToWorker();
          this._updateGutter();
        } else {
          this._basicBreakpoints.removeConditionRule(parseInt(key, 10));
          this._syncBreakpointsToWorker();
        }
        this._renderBreakpointPanel();
        if (this.onStateChange) this.onStateChange();
      });
    });
  }

  _pulseBreakpointItem(type, key) {
    if (!type || !this._bpPanelList) return;
    this._clearBreakpointPulse();
    let selector;
    if (type === "line") {
      selector = `.bas-bp-item[data-bp-type="line"][data-bp-line="${key}"]`;
    } else {
      selector = `.bas-bp-item[data-bp-type="rule"][data-bp-index="${key}"]`;
    }
    const el = this._bpPanelList.querySelector(selector);
    if (!el) return;
    el.classList.add("fired");
    el.scrollIntoView({ block: "nearest" });
  }

  _clearBreakpointPulse() {
    if (!this._bpPanelList) return;
    this._bpPanelList.querySelectorAll(".bas-bp-item.fired").forEach((el) => {
      el.classList.remove("fired");
    });
  }

  _escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  _toggleBpPanel() {
    this._bpPanelVisible = !this._bpPanelVisible;
    if (this._bpPanel) {
      this._bpPanel.classList.toggle("hidden", !this._bpPanelVisible);
    }
    if (this.onStateChange) this.onStateChange();
  }

  _addBreakpointFromPanel() {
    const lineStr = window.prompt("Enter BASIC line number:");
    if (!lineStr) return;
    const lineNum = parseInt(lineStr, 10);
    if (isNaN(lineNum) || lineNum < 0) return;

    // Validate line exists in editor
    const lines = this._textarea.value.split("\n");
    const exists = lines.some((l) => {
      const match = l.trim().match(/^(\d+)\s/);
      return match && parseInt(match[1], 10) === lineNum;
    });
    if (!exists) {
      window.alert(`Line ${lineNum} not found in the editor.`);
      return;
    }

    if (!this._basicBreakpoints.has(lineNum)) {
      this._basicBreakpoints.add(lineNum);
      this._syncBreakpointsToWorker();
      this._updateGutter();
      this._renderBreakpointPanel();
      if (this.onStateChange) this.onStateChange();
    }
  }

  _addConditionRuleFromPanel() {
    if (!this.ruleBuilderWindow) return;
    const idx = this._basicBreakpoints.conditionRules.length;
    const entry = { condition: null, conditionRules: null };
    this.ruleBuilderWindow.editBreakpoint(
      `rule:${idx}`, entry, "New Rule",
      (_k, condition, conditionRules) => {
        if (condition) {
          this._basicBreakpoints.addConditionRule(condition, conditionRules);
          this._syncBreakpointsToWorker();
          this._renderBreakpointPanel();
          if (this.onStateChange) this.onStateChange();
        }
      },
      "basic"
    );
  }

  _editConditionRule(index) {
    if (!this.ruleBuilderWindow) return;
    const rule = this._basicBreakpoints.conditionRules[index];
    if (!rule) return;
    const entry = { condition: rule.condition, conditionRules: rule.conditionRules };
    this.ruleBuilderWindow.editBreakpoint(
      `rule:${index}`, entry, `Rule ${index + 1}`,
      (_k, condition, conditionRules) => {
        if (condition) {
          this._basicBreakpoints.updateConditionRule(index, condition, conditionRules);
        } else {
          this._basicBreakpoints.removeConditionRule(index);
        }
        this._syncBreakpointsToWorker();
        this._renderBreakpointPanel();
        if (this.onStateChange) this.onStateChange();
      },
      "basic"
    );
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

    // Check ROM readiness and whether a BASIC program report has fired.
    // Program-end detection is handled in C++: the opcode callback watches
    // for address 0x1303 (MAIN-4), which the ROM reaches after every report
    // (0 OK, errors, STOP, BREAK).  This is NOT reached during scroll?,
    // INPUT, or PAUSE waits — making it a definitive "program ended" signal.
    if (!this._romReadyChecking) {
      this._romReadyChecking = true;
      // Read from 0x5C3A to 0x5C54 inclusive (27 bytes)
      proxy.readMemory(0x5C3A, 27).then((data) => {
        this._romReadyChecking = false;
        const errNr = data[0];                            // 0x5C3A (ERR_NR)
        const ppc = data[11] | (data[12] << 8);          // 0x5C45-46
        const prog = data[25] | (data[26] << 8);         // 0x5C53-54
        this._romReady = (prog >= 0x5C00 && prog < 0x8000);

        // Check the C++ report-fired flag (set when ROM reaches MAIN-4).
        // This must fire regardless of _basicStepping — if C++ says the
        // program ended, it ended (e.g. stepping on the last line).
        const wasRunning = this._programRunning;
        if (this._programRunning && proxy.isBasicReportFired()) {
          this._programRunning = false;
          proxy.clearBasicReportFired();
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
          // Re-sync breakpoints rather than clearing — keeps them armed
          // so they fire if the user types RUN directly in the emulator
          this._syncBreakpointsToWorker();
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

        // Detect errors from emulator-initiated runs (user typed RUN directly).
        // When ERR_NR transitions from OK to an error, show it in the editor.
        if (!wasRunning && !this._programRunning) {
          const errChanged = errNr !== this._lastSeenErrNr;
          if (errChanged && errNr !== 0xFF && errNr !== 0x14 && SPECTRUM_ERRORS[errNr] !== undefined) {
            this._setError(ppc, errNr);
            this._updateHighlight();
            this._updateGutter();
          } else if (errChanged && (errNr === 0xFF || errNr === 0x14) && this._errorLineNumber !== null) {
            this._clearError();
            this._updateHighlight();
            this._updateGutter();
          }
        }
        this._lastSeenErrNr = errNr;
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
    state.traceEnabled = this._traceEnabled;
    state.bpPanelVisible = this._bpPanelVisible;
    state.errorLineNumber = this._errorLineNumber;
    state.errorMessage = this._errorMessage;
    state.errorLineContent = this._errorLineContent;
    // BasicBreakpointManager handles its own localStorage persistence
    return state;
  }

  restoreState(state) {
    if (state.sidebarVisible !== undefined) {
      this._sidebarVisible = state.sidebarVisible;
    }
    if (state.sidebarWidth !== undefined) {
      this._sidebarWidth = state.sidebarWidth;
    }
    // Migration: if old-style basicBreakpoints array exists, migrate to new manager
    if (state.basicBreakpoints && Array.isArray(state.basicBreakpoints)) {
      for (const lineNum of state.basicBreakpoints) {
        if (!this._basicBreakpoints.has(lineNum)) {
          this._basicBreakpoints.add(lineNum);
        }
      }
    }
    if (state.traceEnabled !== undefined) {
      this._traceEnabled = state.traceEnabled;
    }
    if (state.bpPanelVisible !== undefined) {
      this._bpPanelVisible = state.bpPanelVisible;
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

    // Apply breakpoint panel state after DOM exists
    if (this._bpPanel) {
      if (!this._bpPanelVisible) {
        this._bpPanel.classList.add("hidden");
      } else {
        this._bpPanel.classList.remove("hidden");
      }
    }

    // Redraw gutter and breakpoint panel so restored breakpoints are visible
    this._updateGutter();
    this._renderBreakpointPanel();
  }

  destroy() {
    this._dismissContextMenu();
    document.removeEventListener("mousemove", this._onSidebarResizeMove);
    document.removeEventListener("mouseup", this._onSidebarResizeEnd);
    super.destroy();
  }
}
