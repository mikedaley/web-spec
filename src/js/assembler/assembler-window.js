/*
 * assembler-window.js - Z80 assembler window
 *
 * Provides a code editor for Z80 assembly language with multi-pass assembly,
 * listing output, and the ability to push assembled code into emulator RAM.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/assembler.css";

const DEFAULT_ORG = 0x8000;
const STORAGE_KEY = "zxspec-assembler";

export class AssemblerWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "assembler",
      title: "Z80 Assembler BETA",
      minWidth: 400,
      minHeight: 300,
      defaultWidth: 560,
      defaultHeight: 520,
      defaultPosition: { x: 160, y: 80 },
    });

    this._proxy = proxy;
    this._org = DEFAULT_ORG;
    this._lastResult = null;
    this._activeTab = "listing";
    this._outputPaneHeight = 160;
    this._draggingSplitter = false;

    // DOM references
    this._editorEl = null;
    this._lineNumbersEl = null;
    this._orgInput = null;
    this._outputContent = null;
    this._statusEl = null;
  }

  renderContent() {
    return `
      <div class="assembler-window">
        <div class="asm-toolbar">
          <button class="asm-assemble-btn" data-action="assemble" title="Assemble (Ctrl+Enter)">Assemble</button>
          <button data-action="assemble-push" title="Assemble and push to RAM">Assemble &amp; Push</button>
          <button data-action="push" title="Push last assembled output to RAM">Push to RAM</button>
          <div class="asm-org-group">
            <span class="asm-org-label">ORG:</span>
            <input type="text" class="asm-org-input" value="${this._org.toString(16).toUpperCase()}" maxlength="4" spellcheck="false">
          </div>
        </div>
        <div class="asm-split">
          <div class="asm-editor-pane">
            <div class="asm-editor-wrapper">
              <div class="asm-line-numbers">1</div>
              <textarea class="asm-source-editor" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" wrap="off" placeholder="; Enter Z80 assembly here&#10;; e.g.&#10;        ORG $8000&#10;start:  LD A,0&#10;        RET"></textarea>
            </div>
          </div>
          <div class="asm-splitter"></div>
          <div class="asm-output-pane">
            <div class="asm-output-tabs">
              <button class="asm-output-tab active" data-tab="listing">Listing</button>
              <button class="asm-output-tab" data-tab="errors">Errors</button>
              <button class="asm-output-tab" data-tab="hex">Hex</button>
            </div>
            <div class="asm-output-content"></div>
          </div>
        </div>
        <div class="asm-status">
          <span class="asm-status-text">Ready</span>
          <span class="asm-status-size"></span>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    const root = this.contentElement.querySelector(".assembler-window");
    this._editorEl = root.querySelector(".asm-source-editor");
    this._lineNumbersEl = root.querySelector(".asm-line-numbers");
    this._orgInput = root.querySelector(".asm-org-input");
    this._outputContent = root.querySelector(".asm-output-content");
    this._statusEl = root.querySelector(".asm-status-text");
    this._statusSizeEl = root.querySelector(".asm-status-size");
    this._outputPane = root.querySelector(".asm-output-pane");
    this._splitter = root.querySelector(".asm-splitter");

    // Load saved source
    this._loadSource();

    // Editor events
    this._editorEl.addEventListener("input", () => {
      this._updateLineNumbers();
      this._saveSource();
    });
    this._editorEl.addEventListener("scroll", () => {
      this._lineNumbersEl.scrollTop = this._editorEl.scrollTop;
    });
    this._editorEl.addEventListener("keydown", (e) => {
      // Tab key inserts a tab character
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const start = this._editorEl.selectionStart;
        const end = this._editorEl.selectionEnd;
        this._editorEl.value =
          this._editorEl.value.substring(0, start) +
          "\t" +
          this._editorEl.value.substring(end);
        this._editorEl.selectionStart = this._editorEl.selectionEnd = start + 1;
        this._updateLineNumbers();
        this._saveSource();
      }
      // Ctrl/Cmd+Enter to assemble
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          this._assembleAndPush();
        } else {
          this._assemble();
        }
      }
    });

    // Prevent emulator keyboard handling when editor is focused
    this._editorEl.addEventListener("keydown", (e) => e.stopPropagation());
    this._editorEl.addEventListener("keyup", (e) => e.stopPropagation());
    this._editorEl.addEventListener("keypress", (e) => e.stopPropagation());
    this._orgInput.addEventListener("keydown", (e) => e.stopPropagation());
    this._orgInput.addEventListener("keyup", (e) => e.stopPropagation());
    this._orgInput.addEventListener("keypress", (e) => e.stopPropagation());

    // ORG input
    this._orgInput.addEventListener("change", () => {
      const val = parseInt(this._orgInput.value, 16);
      if (!isNaN(val) && val >= 0 && val <= 0xFFFF) {
        this._org = val;
        this._saveSource();
      } else {
        this._orgInput.value = this._org.toString(16).toUpperCase();
      }
    });

    // Toolbar buttons
    root.querySelectorAll(".asm-toolbar button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "assemble") this._assemble();
        else if (action === "assemble-push") this._assembleAndPush();
        else if (action === "push") this._pushToRAM();
      });
    });

    // Output tabs
    root.querySelectorAll(".asm-output-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        root.querySelectorAll(".asm-output-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this._activeTab = tab.dataset.tab;
        this._renderOutput();
      });
    });

    // Splitter drag
    this._splitter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this._draggingSplitter = true;
      this._splitterStartY = e.clientY;
      this._splitterStartHeight = this._outputPane.offsetHeight;
      const onMove = (ev) => {
        if (!this._draggingSplitter) return;
        const delta = this._splitterStartY - ev.clientY;
        const newHeight = Math.max(60, this._splitterStartHeight + delta);
        this._outputPane.style.height = newHeight + "px";
        this._outputPane.style.flex = "none";
        this._outputPaneHeight = newHeight;
      };
      const onUp = () => {
        this._draggingSplitter = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });

    // Set initial output pane height
    this._outputPane.style.height = this._outputPaneHeight + "px";
    this._outputPane.style.flex = "none";

    this._updateLineNumbers();
  }

  _updateLineNumbers() {
    const lines = this._editorEl.value.split("\n").length;
    const nums = [];
    for (let i = 1; i <= lines; i++) nums.push(i);
    this._lineNumbersEl.textContent = nums.join("\n");
  }

  _saveSource() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        source: this._editorEl.value,
        org: this._org,
        outputPaneHeight: this._outputPaneHeight,
      }));
    } catch (e) { /* ignore */ }
  }

  _loadSource() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.source) this._editorEl.value = data.source;
        if (data.org != null) {
          this._org = data.org;
          this._orgInput.value = this._org.toString(16).toUpperCase();
        }
        if (data.outputPaneHeight) {
          this._outputPaneHeight = data.outputPaneHeight;
          this._outputPane.style.height = this._outputPaneHeight + "px";
        }
        this._updateLineNumbers();
      }
    } catch (e) { /* ignore */ }
  }

  async _assemble() {
    const source = this._editorEl.value;
    if (!source.trim()) {
      this._statusEl.textContent = "Nothing to assemble";
      this._statusEl.className = "asm-status-text";
      return;
    }

    this._statusEl.textContent = "Assembling...";
    this._statusEl.className = "asm-status-text";

    try {
      const result = await this._proxy.assemble(source, this._org);
      this._lastResult = result;

      if (result.success) {
        this._statusEl.textContent = "Assembly successful";
        this._statusEl.className = "asm-status-text asm-status-success";
        this._statusSizeEl.textContent =
          `${result.output ? result.output.length : 0} bytes at $${result.origin.toString(16).toUpperCase().padStart(4, "0")}`;
      } else {
        this._statusEl.textContent = `${result.errors.length} error(s)`;
        this._statusEl.className = "asm-status-text asm-status-error";
        this._statusSizeEl.textContent = "";
        // Switch to errors tab
        this._activeTab = "errors";
        const root = this.contentElement.querySelector(".assembler-window");
        root.querySelectorAll(".asm-output-tab").forEach((t) => {
          t.classList.toggle("active", t.dataset.tab === "errors");
        });
      }

      this._renderOutput();
    } catch (e) {
      this._statusEl.textContent = "Assembly failed: " + e.message;
      this._statusEl.className = "asm-status-text asm-status-error";
    }
  }

  async _assembleAndPush() {
    await this._assemble();
    if (this._lastResult && this._lastResult.success) {
      this._pushToRAM();
    }
  }

  _pushToRAM() {
    if (!this._lastResult || !this._lastResult.output || this._lastResult.output.length === 0) {
      this._statusEl.textContent = "No assembled code to push";
      this._statusEl.className = "asm-status-text asm-status-error";
      return;
    }

    this._proxy.writeMemoryBulk(this._lastResult.origin, this._lastResult.output);
    this._statusEl.textContent =
      `Pushed ${this._lastResult.output.length} bytes to $${this._lastResult.origin.toString(16).toUpperCase().padStart(4, "0")}`;
    this._statusEl.className = "asm-status-text asm-status-success";
  }

  _renderOutput() {
    if (!this._outputContent) return;

    if (!this._lastResult) {
      this._outputContent.textContent = "";
      return;
    }

    const r = this._lastResult;

    if (this._activeTab === "listing") {
      this._renderListing(r.listing);
    } else if (this._activeTab === "errors") {
      this._renderErrors(r.errors);
    } else if (this._activeTab === "hex") {
      this._renderHex(r.output, r.origin);
    }
  }

  _renderListing(listing) {
    if (!listing || listing.length === 0) {
      this._outputContent.textContent = "No listing data";
      return;
    }

    const lines = [];
    for (const entry of listing) {
      const addr = entry.bytes.length > 0
        ? entry.addr.toString(16).toUpperCase().padStart(4, "0")
        : "    ";
      const bytesStr = entry.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
      lines.push(
        `<div class="asm-listing-line">` +
        `<span class="asm-listing-addr">${addr}</span>` +
        `<span class="asm-listing-bytes">${bytesStr.padEnd(12)}</span>` +
        `<span class="asm-listing-source">${this._escapeHtml(entry.source)}</span>` +
        `</div>`
      );
    }
    this._outputContent.innerHTML = lines.join("");
  }

  _renderErrors(errors) {
    if (!errors || errors.length === 0) {
      this._outputContent.textContent = "No errors";
      return;
    }

    const lines = errors.map(
      (e) =>
        `<div class="asm-error-line">` +
        `<span class="asm-error-linenum">Line ${e.line}:</span>` +
        `${this._escapeHtml(e.message)}</div>`
    );
    this._outputContent.innerHTML = lines.join("");
  }

  _renderHex(output, origin) {
    if (!output || output.length === 0) {
      this._outputContent.textContent = "No output";
      return;
    }

    const lines = [];
    for (let i = 0; i < output.length; i += 16) {
      const addr = (origin + i).toString(16).toUpperCase().padStart(4, "0");
      const hexParts = [];
      let ascii = "";
      for (let j = 0; j < 16; j++) {
        if (i + j < output.length) {
          hexParts.push(output[i + j].toString(16).toUpperCase().padStart(2, "0"));
          const ch = output[i + j];
          ascii += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : ".";
        } else {
          hexParts.push("  ");
          ascii += " ";
        }
      }
      lines.push(`${addr}  ${hexParts.slice(0, 8).join(" ")}  ${hexParts.slice(8).join(" ")}  ${ascii}`);
    }
    this._outputContent.textContent = lines.join("\n");
  }

  _escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  getState() {
    const state = super.getState();
    state.activeTab = this._activeTab;
    state.outputPaneHeight = this._outputPaneHeight;
    return state;
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.activeTab) this._activeTab = state.activeTab;
    if (state.outputPaneHeight) this._outputPaneHeight = state.outputPaneHeight;
  }
}
