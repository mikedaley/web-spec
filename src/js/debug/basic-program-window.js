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
import { BasicVariableInspector } from "./basic-variable-inspector.js";

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
    this._variableUpdateInterval = 500; // ms between variable refreshes
    this._pendingHighlight = false;

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
          <button class="bas-toolbar-btn" data-action="read" title="Read program from Spectrum memory">Read</button>
          <button class="bas-toolbar-btn" data-action="write" title="Write program to Spectrum memory">Write</button>
        </div>
        <div class="bas-toolbar-separator"></div>
        <div class="bas-toolbar-group">
          <button class="bas-toolbar-btn" data-action="format" title="Auto-format: sort and indent lines">Format</button>
          <button class="bas-toolbar-btn" data-action="renum" title="Renumber lines by 10s">Renum</button>
        </div>
        <div class="bas-toolbar-separator"></div>
        <div class="bas-toolbar-group">
          <button class="bas-toolbar-btn" data-action="new" title="Clear editor">New</button>
          <button class="bas-toolbar-btn" data-action="open" title="Open .bas file">Open</button>
          <button class="bas-toolbar-btn" data-action="save" title="Save as .bas file">Save</button>
        </div>
        <div class="bas-toolbar-separator"></div>
        <div class="bas-toolbar-group">
          <button class="bas-toolbar-btn run" data-action="run" title="Write program and type RUN">Run</button>
          <button class="bas-toolbar-btn step" data-action="step" title="Step one instruction">Step</button>
        </div>
      </div>
      <div class="bas-editor-area">
        <div class="bas-editor-container">
          <div class="bas-gutter">
            <div class="bas-gutter-inner"></div>
          </div>
          <div class="bas-editor-scroll">
            <pre class="bas-highlight"></pre>
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
    this._gutter = this.contentElement.querySelector(".bas-gutter-inner");
    this._editorScroll = this.contentElement.querySelector(".bas-editor-scroll");
    this._sidebar = this.contentElement.querySelector(".bas-sidebar");
    this._sidebarContent = this.contentElement.querySelector(".bas-sidebar-content");
    this._sidebarResize = this.contentElement.querySelector(".bas-sidebar-resize");
    this._statusLines = this.contentElement.querySelector('[data-status="lines"]');
    this._statusCursor = this.contentElement.querySelector('[data-status="cursor"]');

    // Apply saved sidebar state
    if (!this._sidebarVisible) {
      this._sidebar.classList.add("hidden");
      this._sidebarResize.style.display = "none";
    }
    this._sidebar.style.width = `${this._sidebarWidth}px`;

    // Textarea events
    this._textarea.addEventListener("input", () => this._onInput());
    this._textarea.addEventListener("scroll", () => this._syncScroll());
    this._textarea.addEventListener("keydown", (e) => this._onKeyDown(e));
    this._textarea.addEventListener("click", () => this._updateCursorStatus());
    this._textarea.addEventListener("keyup", () => this._updateCursorStatus());

    // Toolbar button events
    this.contentElement.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        this._handleAction(action);
      });
    });

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

    // Load saved content
    this._loadEditorContent();

    // Initial highlight
    this._updateHighlight();
    this._updateGutter();
    this._updateStatus();
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

  _syncScroll() {
    this._highlight.style.transform = `translate(-${this._editorScroll.scrollLeft}px, -${this._editorScroll.scrollTop}px)`;
    this._gutter.style.transform = `translateY(-${this._editorScroll.scrollTop}px)`;
  }

  _updateHighlight() {
    const text = this._textarea.value;
    const lines = text.split("\n");
    const highlighted = lines.map((line) => highlightLine(line)).join("\n");
    this._highlight.innerHTML = highlighted + "\n";
  }

  _updateGutter() {
    const text = this._textarea.value;
    const lineCount = text.split("\n").length;
    let gutterText = "";
    for (let i = 1; i <= lineCount; i++) {
      gutterText += i + "\n";
    }
    this._gutter.textContent = gutterText;
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
        this.proxy.step();
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
      this._onInput();
    } catch (err) {
      console.error("Failed to read BASIC program:", err);
    }
  }

  async _writeToMemory() {
    try {
      const text = this._textarea.value;
      if (!text.trim()) return;
      const programBytes = this.tokenizer.tokenize(text);
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

  _renumberProgram() {
    const text = this._textarea.value;
    const lines = this._parseEditorLines(text);
    if (lines.length === 0) return;

    // Sort by current line number
    lines.sort((a, b) => a.lineNumber - b.lineNumber);

    // Build old->new mapping
    const mapping = {};
    lines.forEach((line, idx) => {
      mapping[line.lineNumber] = (idx + 1) * 10;
    });

    // Update references in GO TO, GO SUB, RESTORE, RUN
    const refPattern = /\b(GO\s*TO|GO\s*SUB|RESTORE|RUN)\s+(\d+)/gi;
    const result = [];
    for (const line of lines) {
      const newNum = mapping[line.lineNumber];
      const updatedBody = line.body.replace(refPattern, (match, keyword, num) => {
        const oldNum = parseInt(num, 10);
        const newTarget = mapping[oldNum];
        return newTarget !== undefined ? `${keyword} ${newTarget}` : match;
      });
      result.push(`${newNum} ${updatedBody}`);
    }

    this._textarea.value = result.join("\n");
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
        this._onInput();
      };
      reader.readAsText(file);
    });
    input.click();
  }

  _saveFile() {
    const text = this._textarea.value;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "program.bas";
    a.click();
    URL.revokeObjectURL(url);
  }

  async _runProgram() {
    await this._writeToMemory();

    // On the 48K, pressing R in keyword mode generates RUN automatically.
    // So we just need R + ENTER.
    // R = row 2, bit 3; ENTER = row 6, bit 0
    const keys = [
      [2, 3], // R (produces RUN in 48K keyword mode)
      [6, 0], // ENTER
    ];

    // Resume if paused
    if (this.proxy.isPaused()) {
      this.proxy.resume();
    }

    for (const [row, bit] of keys) {
      this.proxy.keyDown(row, bit);
      await this._delay(50);
      this.proxy.keyUp(row, bit);
      await this._delay(50);
    }
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
    return state;
  }

  restoreState(state) {
    if (state.sidebarVisible !== undefined) {
      this._sidebarVisible = state.sidebarVisible;
    }
    if (state.sidebarWidth !== undefined) {
      this._sidebarWidth = state.sidebarWidth;
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
  }

  destroy() {
    document.removeEventListener("mousemove", this._onSidebarResizeMove);
    document.removeEventListener("mouseup", this._onSidebarResizeEnd);
    super.destroy();
  }
}
