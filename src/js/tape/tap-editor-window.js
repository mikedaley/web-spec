/*
 * tap-editor-window.js - TAP file editor window
 *
 * Provides a full-featured editor for TAP tape image files: block list with
 * reordering, header field editing, hex viewer/editor, import/export, checksum
 * validation, and integration with the emulator's tape system.
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  parseTAP,
  assembleTAP,
  computeChecksum,
  recalcChecksum,
  updateHeaderPayload,
  createHeaderBlock,
  createDataBlock,
  isHeader,
  describeBlock,
  FLAG_HEADER,
  FLAG_DATA,
  HEADER_PROGRAM,
  HEADER_CODE,
  HEADER_TYPE_NAMES,
} from "./tap-parser.js";
import "../css/tap-editor.css";

/* SVG icon fragments */
const ICON_PLUS = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>`;
const ICON_TRASH = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h8M4 3V2h4v1M3 3v7h6V3"/></svg>`;
const ICON_UP = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2v8M3 5l3-3 3 3"/></svg>`;
const ICON_DOWN = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 10V2M3 7l3 3 3-3"/></svg>`;
const ICON_DOWNLOAD = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2v6M3 6l3 3 3-3M2 10h8"/></svg>`;
const ICON_GRIP = `<svg viewBox="0 0 8 14" fill="currentColor"><circle cx="2.5" cy="2" r="1"/><circle cx="5.5" cy="2" r="1"/><circle cx="2.5" cy="5" r="1"/><circle cx="5.5" cy="5" r="1"/><circle cx="2.5" cy="8" r="1"/><circle cx="5.5" cy="8" r="1"/><circle cx="2.5" cy="11" r="1"/><circle cx="5.5" cy="11" r="1"/></svg>`;
const ICON_CHECK = `\u2713`;
const ICON_CROSS = `\u2717`;
const ICON_CHEVRON = `<svg class="tap-detail-chevron" viewBox="0 0 12 12" width="10" height="10"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;

const HEX_BYTES_PER_ROW = 16;
const HEX_VISIBLE_ROWS = 32;
const HEX_ROW_HEIGHT = 17; // approx line-height in pixels

export class TAPEditorWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "tap-editor",
      title: "TAP Editor",
      minWidth: 480,
      minHeight: 400,
      defaultWidth: 600,
      defaultHeight: 550,
      defaultPosition: { x: 150, y: 80 },
    });

    this._proxy = proxy;
    this._blocks = [];
    this._selectedBlockIndex = -1;
    this._currentFilename = null;
    this._dirty = false;
    this._detailPanelOpen = true;
    this._detailPanelHeight = null;
    this._detailTab = "header"; // "header" or "hex"
    this._addFormVisible = false;
    this._deleteConfirmIndex = -1;
    this._hexModifiedBytes = new Set(); // track modified byte offsets for highlighting
    this._hexEditingByte = -1; // currently editing byte index
    this._hexEditBuffer = ""; // partial hex input
    this._hexScrollTop = 0;
    this._fileInput = null;
    this._mergeFileInput = null;
    this._importFileInput = null;
    this._toastTimeout = null;

    // Drag state
    this._dragIndex = -1;
    this._dragOverIndex = -1;

    // Cross-reference set by main.js
    this.tapeWindow = null;
  }

  getState() {
    const state = super.getState();
    state.currentFilename = this._currentFilename;
    state.detailPanelOpen = this._detailPanelOpen;
    state.detailPanelHeight = this._detailPanelHeight;
    state.detailTab = this._detailTab;
    state.selectedBlockIndex = this._selectedBlockIndex;
    return state;
  }

  restoreState(state) {
    if (state.currentFilename != null) this._currentFilename = state.currentFilename;
    if (state.detailPanelOpen != null) this._detailPanelOpen = state.detailPanelOpen;
    if (state.detailPanelHeight != null) this._detailPanelHeight = state.detailPanelHeight;
    if (state.detailTab) this._detailTab = state.detailTab;
    if (state.selectedBlockIndex != null) this._selectedBlockIndex = state.selectedBlockIndex;
    super.restoreState(state);
    // Restore panel state after DOM is ready
    this._applyDetailPanelState();
  }

  renderContent() {
    return `
      <div class="tap-editor">
        <div class="tap-toolbar">
          <div class="tap-toolbar-group">
            <button class="tap-toolbar-btn" data-action="new" title="New empty TAP">
              ${ICON_PLUS} New
            </button>
            <button class="tap-toolbar-btn" data-action="open" title="Open TAP file">
              Open
            </button>
            <button class="tap-toolbar-btn save" data-action="save" title="Save TAP file">
              Save
            </button>
            <button class="tap-toolbar-btn" data-action="merge" title="Merge blocks from another TAP">
              Merge
            </button>
          </div>
          <div class="tap-toolbar-group">
            <button class="tap-toolbar-btn" data-action="import-tape" title="Import currently loaded tape">
              Import Tape
            </button>
            <button class="tap-toolbar-btn" data-action="load-emu" title="Load edited TAP into emulator">
              Load into Emu
            </button>
          </div>
          <div class="tap-toolbar-group">
            <button class="tap-toolbar-btn" data-action="fix-checksums" title="Fix all checksums">
              Fix Checksums
            </button>
          </div>
        </div>
        <div class="tap-filename-banner hidden" id="tap-editor-filename"></div>
        <div class="tap-block-list-container">
          <div class="tap-block-list" id="tap-editor-blocks">
            <div class="tap-empty-state">
              No TAP file loaded
              <div class="tap-empty-state-hint">Open a file or import the current tape</div>
            </div>
          </div>
          <div class="tap-delete-confirm hidden" id="tap-editor-delete-confirm">
            <span class="tap-delete-confirm-text">Delete paired data block too?</span>
            <button class="tap-delete-confirm-btn danger" data-confirm="pair">Delete Pair</button>
            <button class="tap-delete-confirm-btn" data-confirm="single">Header Only</button>
            <button class="tap-delete-confirm-btn" data-confirm="cancel">Cancel</button>
          </div>
          <div class="tap-add-form hidden" id="tap-editor-add-form">
            <div class="tap-add-form-row">
              <span class="tap-add-form-label">Type</span>
              <select class="tap-add-form-select" id="tap-add-type">
                <option value="0">Program</option>
                <option value="3" selected>Code</option>
                <option value="1">Num Array</option>
                <option value="2">Char Array</option>
              </select>
            </div>
            <div class="tap-add-form-row">
              <span class="tap-add-form-label">Filename</span>
              <input class="tap-add-form-input" id="tap-add-filename" type="text" maxlength="10" value="untitled  " />
            </div>
            <div class="tap-add-form-row" id="tap-add-param1-row">
              <span class="tap-add-form-label" id="tap-add-param1-label">Start Addr</span>
              <input class="tap-add-form-input" id="tap-add-param1" type="number" min="0" max="65535" value="32768" />
            </div>
            <div class="tap-add-form-row" id="tap-add-param2-row">
              <span class="tap-add-form-label" id="tap-add-param2-label">Param 2</span>
              <input class="tap-add-form-input" id="tap-add-param2" type="number" min="0" max="65535" value="32768" />
            </div>
            <div class="tap-add-form-actions">
              <button class="tap-add-form-btn" data-form-action="cancel">Cancel</button>
              <button class="tap-add-form-btn primary" data-form-action="create">Create</button>
            </div>
          </div>
          <div class="tap-add-bar">
            <button class="tap-add-btn" data-action="add-pair" title="Add a header+data block pair">
              ${ICON_PLUS} Add Block Pair
            </button>
            <button class="tap-add-btn" data-action="import-binary" title="Import a binary file as Code block">
              ${ICON_PLUS} Import Binary
            </button>
          </div>
        </div>
        <div class="tap-detail-toggle" id="tap-editor-detail-toggle">
          ${ICON_CHEVRON}
          <span>Details</span>
        </div>
        <div class="tap-detail-panel${this._detailPanelOpen ? "" : " hidden"}" id="tap-editor-detail-panel">
          <div class="tap-detail-resize-handle" id="tap-editor-detail-resize"></div>
          <div class="tap-detail-tabs">
            <button class="tap-detail-tab${this._detailTab === "header" ? " active" : ""}" data-tab="header">Header</button>
            <button class="tap-detail-tab${this._detailTab === "hex" ? " active" : ""}" data-tab="hex">Hex</button>
          </div>
          <div class="tap-detail-content" id="tap-editor-detail-content">
            <div class="tap-detail-empty">Select a block to view details</div>
          </div>
        </div>
        <div class="tap-toast" id="tap-editor-toast"></div>
      </div>
    `;
  }

  onContentRendered() {
    this._cacheElements();
    this._setupToolbar();
    this._setupBlockList();
    this._setupAddForm();
    this._setupDeleteConfirm();
    this._setupDetailPanel();
    this._setupFileInputs();
    this._applyDetailPanelState();
  }

  // ─── Element caching ──────────────────────────────────────────

  _cacheElements() {
    const ce = this.contentElement;
    this._els = {
      blockList: ce.querySelector("#tap-editor-blocks"),
      filenameBanner: ce.querySelector("#tap-editor-filename"),
      addForm: ce.querySelector("#tap-editor-add-form"),
      deleteConfirm: ce.querySelector("#tap-editor-delete-confirm"),
      detailToggle: ce.querySelector("#tap-editor-detail-toggle"),
      detailPanel: ce.querySelector("#tap-editor-detail-panel"),
      detailContent: ce.querySelector("#tap-editor-detail-content"),
      detailResize: ce.querySelector("#tap-editor-detail-resize"),
      toast: ce.querySelector("#tap-editor-toast"),
      addType: ce.querySelector("#tap-add-type"),
      addFilename: ce.querySelector("#tap-add-filename"),
      addParam1: ce.querySelector("#tap-add-param1"),
      addParam2: ce.querySelector("#tap-add-param2"),
      addParam1Row: ce.querySelector("#tap-add-param1-row"),
      addParam2Row: ce.querySelector("#tap-add-param2-row"),
      addParam1Label: ce.querySelector("#tap-add-param1-label"),
      addParam2Label: ce.querySelector("#tap-add-param2-label"),
      saveBtn: ce.querySelector('[data-action="save"]'),
    };
  }

  // ─── Toolbar ──────────────────────────────────────────────────

  _setupToolbar() {
    const toolbar = this.contentElement.querySelector(".tap-toolbar");
    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      switch (action) {
        case "new": this._newTape(); break;
        case "open": this._openFile(); break;
        case "save": this._saveFile(); break;
        case "merge": this._mergeFile(); break;
        case "import-tape": this._importCurrentTape(); break;
        case "load-emu": this._loadIntoEmulator(); break;
        case "fix-checksums": this._fixAllChecksums(); break;
      }
    });
  }

  // ─── File inputs (hidden) ─────────────────────────────────────

  _setupFileInputs() {
    // Main open file input
    this._fileInput = document.createElement("input");
    this._fileInput.type = "file";
    this._fileInput.accept = ".tap";
    this._fileInput.style.display = "none";
    this.contentElement.appendChild(this._fileInput);
    this._fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) this._loadFile(file);
      this._fileInput.value = "";
    });

    // Merge file input
    this._mergeFileInput = document.createElement("input");
    this._mergeFileInput.type = "file";
    this._mergeFileInput.accept = ".tap";
    this._mergeFileInput.style.display = "none";
    this.contentElement.appendChild(this._mergeFileInput);
    this._mergeFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) this._doMergeFile(file);
      this._mergeFileInput.value = "";
    });

    // Import binary file input
    this._importFileInput = document.createElement("input");
    this._importFileInput.type = "file";
    this._importFileInput.style.display = "none";
    this.contentElement.appendChild(this._importFileInput);
    this._importFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) this._doImportBinary(file);
      this._importFileInput.value = "";
    });
  }

  // ─── Block list ───────────────────────────────────────────────

  _setupBlockList() {
    const list = this._els.blockList;

    // Click to select
    list.addEventListener("click", (e) => {
      const row = e.target.closest(".tap-block-row");
      if (!row) return;

      // Check action buttons
      const actionBtn = e.target.closest(".tap-block-action-btn");
      if (actionBtn) {
        const idx = parseInt(row.dataset.index, 10);
        const action = actionBtn.dataset.action;
        if (action === "delete") this._startDelete(idx);
        else if (action === "up") this._moveBlock(idx, -1);
        else if (action === "down") this._moveBlock(idx, 1);
        else if (action === "export") this._exportBlock(idx);
        return;
      }

      // Don't select if clicking drag handle
      if (e.target.closest(".tap-block-drag-handle")) return;

      const idx = parseInt(row.dataset.index, 10);
      this._selectBlock(idx);
    });

    // Add block buttons
    const addBar = this.contentElement.querySelector(".tap-add-bar");
    addBar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "add-pair") this._showAddForm();
      else if (btn.dataset.action === "import-binary") this._importFileInput.click();
    });

    // Drag-and-drop
    list.addEventListener("mousedown", (e) => {
      const handle = e.target.closest(".tap-block-drag-handle");
      if (!handle) return;
      const row = handle.closest(".tap-block-row");
      if (!row) return;
      e.preventDefault();
      this._startDrag(parseInt(row.dataset.index, 10), e);
    });
  }

  _renderBlocks() {
    const list = this._els.blockList;
    if (!this._blocks.length) {
      list.innerHTML = `<div class="tap-empty-state">No TAP file loaded<div class="tap-empty-state-hint">Open a file or import the current tape</div></div>`;
      return;
    }

    // Identify header+data pairs
    const pairs = this._identifyPairs();

    let html = "";
    for (let i = 0; i < this._blocks.length; i++) {
      const block = this._blocks[i];
      const desc = describeBlock(block);
      const selected = i === this._selectedBlockIndex;
      const pairClass = pairs[i] === "start" ? " pair-start" : pairs[i] === "end" ? " pair-end" : "";
      const dragging = i === this._dragIndex ? " dragging" : "";
      const csClass = block.checksumValid ? "valid" : "invalid";
      const csIcon = block.checksumValid ? ICON_CHECK : ICON_CROSS;
      const badgeClass = isHeader(block) ? "header" : "data";

      html += `<div class="tap-block-row${selected ? " selected" : ""}${pairClass}${dragging}" data-index="${i}">
        <span class="tap-block-drag-handle" title="Drag to reorder">${ICON_GRIP}</span>
        <span class="tap-block-index">${i}</span>
        <span class="tap-block-badge ${badgeClass}">${desc.badge}</span>
        <span class="tap-block-name">${this._escapeHtml(desc.name)}</span>
        <span class="tap-block-size">${desc.size}</span>
        <span class="tap-block-checksum ${csClass}" title="Checksum: ${block.checksum.toString(16).padStart(2, "0")}h">${csIcon}</span>
        <span class="tap-block-actions">
          <button class="tap-block-action-btn" data-action="up" title="Move up">${ICON_UP}</button>
          <button class="tap-block-action-btn" data-action="down" title="Move down">${ICON_DOWN}</button>
          <button class="tap-block-action-btn" data-action="export" title="Export block">${ICON_DOWNLOAD}</button>
          <button class="tap-block-action-btn delete" data-action="delete" title="Delete block">${ICON_TRASH}</button>
        </span>
      </div>`;
    }
    list.innerHTML = html;
  }

  _identifyPairs() {
    const pairs = {};
    for (let i = 0; i < this._blocks.length - 1; i++) {
      if (isHeader(this._blocks[i]) && this._blocks[i + 1].flag === FLAG_DATA) {
        pairs[i] = "start";
        pairs[i + 1] = "end";
      }
    }
    return pairs;
  }

  _selectBlock(index) {
    if (index < 0 || index >= this._blocks.length) {
      this._selectedBlockIndex = -1;
    } else {
      this._selectedBlockIndex = index;
    }
    // Update row highlight
    const rows = this._els.blockList.querySelectorAll(".tap-block-row");
    rows.forEach((row) => {
      row.classList.toggle("selected", parseInt(row.dataset.index, 10) === this._selectedBlockIndex);
    });
    this._renderDetail();
  }

  // ─── Add block form ───────────────────────────────────────────

  _setupAddForm() {
    const form = this._els.addForm;

    // Type change updates param labels
    this._els.addType.addEventListener("change", () => this._updateAddFormLabels());

    // Form buttons
    form.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-form-action]");
      if (!btn) return;
      if (btn.dataset.formAction === "cancel") {
        this._hideAddForm();
      } else if (btn.dataset.formAction === "create") {
        this._createBlockPair();
      }
    });
  }

  _showAddForm() {
    this._addFormVisible = true;
    this._els.addForm.classList.remove("hidden");
    this._updateAddFormLabels();
    this._els.addFilename.value = "untitled  ";
    this._els.addFilename.focus();
    this._els.addFilename.select();
  }

  _hideAddForm() {
    this._addFormVisible = false;
    this._els.addForm.classList.add("hidden");
  }

  _updateAddFormLabels() {
    const type = parseInt(this._els.addType.value, 10);
    if (type === HEADER_PROGRAM) {
      this._els.addParam1Label.textContent = "Autostart";
      this._els.addParam1.value = "32768";
      this._els.addParam2Label.textContent = "Var Offset";
      this._els.addParam2.value = "32768";
      this._els.addParam2Row.style.display = "";
    } else if (type === HEADER_CODE) {
      this._els.addParam1Label.textContent = "Start Addr";
      this._els.addParam1.value = "32768";
      this._els.addParam2Label.textContent = "";
      this._els.addParam2Row.style.display = "none";
    } else {
      this._els.addParam1Label.textContent = "Param 1";
      this._els.addParam1.value = "0";
      this._els.addParam2Label.textContent = "Param 2";
      this._els.addParam2.value = "0";
      this._els.addParam2Row.style.display = "";
    }
  }

  _createBlockPair() {
    const type = parseInt(this._els.addType.value, 10);
    const filename = this._els.addFilename.value || "untitled";
    const param1 = parseInt(this._els.addParam1.value, 10) || 0;
    const param2 = type === HEADER_CODE ? 32768 : (parseInt(this._els.addParam2.value, 10) || 0);
    const emptyData = new Uint8Array(0);

    const header = createHeaderBlock(type, filename, 0, param1, param2);
    const data = createDataBlock(emptyData);

    // Insert after selected or at end
    const insertAt = this._selectedBlockIndex >= 0 ? this._selectedBlockIndex + 1 : this._blocks.length;
    this._blocks.splice(insertAt, 0, header, data);
    this._markDirty();
    this._hideAddForm();
    this._renderBlocks();
    this._selectBlock(insertAt);
  }

  // ─── Delete confirmation ──────────────────────────────────────

  _setupDeleteConfirm() {
    const confirm = this._els.deleteConfirm;
    confirm.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-confirm]");
      if (!btn) return;
      const action = btn.dataset.confirm;
      if (action === "pair") this._doDelete(true);
      else if (action === "single") this._doDelete(false);
      else this._cancelDelete();
    });
  }

  _startDelete(index) {
    // If it's a header with a paired data block, show confirmation
    const block = this._blocks[index];
    const pairs = this._identifyPairs();
    if (pairs[index] === "start") {
      this._deleteConfirmIndex = index;
      this._els.deleteConfirm.classList.remove("hidden");
    } else if (pairs[index] === "end") {
      // Deleting a data block — just delete it
      this._deleteConfirmIndex = index;
      this._doDelete(false);
    } else {
      // No pair — direct delete
      this._deleteConfirmIndex = index;
      this._doDelete(false);
    }
  }

  _doDelete(includePair) {
    const idx = this._deleteConfirmIndex;
    if (idx < 0 || idx >= this._blocks.length) return;

    if (includePair && idx + 1 < this._blocks.length) {
      this._blocks.splice(idx, 2);
    } else {
      this._blocks.splice(idx, 1);
    }

    this._markDirty();
    this._cancelDelete();

    // Adjust selection
    if (this._selectedBlockIndex >= this._blocks.length) {
      this._selectedBlockIndex = this._blocks.length - 1;
    }
    this._renderBlocks();
    this._renderDetail();
  }

  _cancelDelete() {
    this._deleteConfirmIndex = -1;
    this._els.deleteConfirm.classList.add("hidden");
  }

  // ─── Block reordering ────────────────────────────────────────

  _moveBlock(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this._blocks.length) return;

    // Check if this is part of a pair; move the pair together
    const pairs = this._identifyPairs();
    if (pairs[index] === "start" && direction === 1) {
      // Move header+data pair down: need to swap pair with the block after it
      if (index + 2 >= this._blocks.length) return;
      const [h, d] = this._blocks.splice(index, 2);
      this._blocks.splice(index + 1, 0, h, d);
      if (this._selectedBlockIndex === index) this._selectedBlockIndex = index + 1;
      else if (this._selectedBlockIndex === index + 1) this._selectedBlockIndex = index + 2;
    } else if (pairs[index] === "end" && direction === -1) {
      // Move data block up means move the pair up
      const pairStart = index - 1;
      if (pairStart <= 0) return;
      const [h, d] = this._blocks.splice(pairStart, 2);
      this._blocks.splice(pairStart - 1, 0, h, d);
      if (this._selectedBlockIndex === pairStart) this._selectedBlockIndex = pairStart - 1;
      else if (this._selectedBlockIndex === index) this._selectedBlockIndex = index - 1;
    } else if (pairs[index] === "start" && direction === -1) {
      if (index <= 0) return;
      const [h, d] = this._blocks.splice(index, 2);
      this._blocks.splice(index - 1, 0, h, d);
      if (this._selectedBlockIndex === index) this._selectedBlockIndex = index - 1;
      else if (this._selectedBlockIndex === index + 1) this._selectedBlockIndex = index;
    } else if (pairs[index] === "end" && direction === 1) {
      const pairStart = index - 1;
      if (index + 1 >= this._blocks.length) return;
      const [h, d] = this._blocks.splice(pairStart, 2);
      this._blocks.splice(pairStart + 1, 0, h, d);
      if (this._selectedBlockIndex === pairStart) this._selectedBlockIndex = pairStart + 1;
      else if (this._selectedBlockIndex === index) this._selectedBlockIndex = index + 1;
    } else {
      // Single block move
      const [block] = this._blocks.splice(index, 1);
      this._blocks.splice(newIndex, 0, block);
      if (this._selectedBlockIndex === index) this._selectedBlockIndex = newIndex;
    }

    this._markDirty();
    this._renderBlocks();
  }

  // Drag-and-drop reordering
  _startDrag(index, e) {
    this._dragIndex = index;
    this._dragOverIndex = index;
    const list = this._els.blockList;
    const startY = e.clientY;

    const rows = list.querySelectorAll(".tap-block-row");
    const rowRects = Array.from(rows).map((r) => r.getBoundingClientRect());

    const onMouseMove = (ev) => {
      const y = ev.clientY;
      let overIndex = this._dragIndex;
      for (let i = 0; i < rowRects.length; i++) {
        const mid = rowRects[i].top + rowRects[i].height / 2;
        if (y < mid) {
          overIndex = i;
          break;
        }
        overIndex = i + 1;
      }
      if (overIndex !== this._dragOverIndex) {
        this._dragOverIndex = overIndex;
        // Visual feedback: highlight target position
        rows.forEach((r) => r.classList.remove("dragging"));
        const srcRow = list.querySelector(`[data-index="${this._dragIndex}"]`);
        if (srcRow) srcRow.classList.add("dragging");
      }
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      const from = this._dragIndex;
      let to = this._dragOverIndex;
      this._dragIndex = -1;
      this._dragOverIndex = -1;

      if (from === to || from === to - 1) {
        this._renderBlocks();
        return;
      }

      // Perform the move
      const [block] = this._blocks.splice(from, 1);
      const insertAt = to > from ? to - 1 : to;
      this._blocks.splice(insertAt, 0, block);

      if (this._selectedBlockIndex === from) {
        this._selectedBlockIndex = insertAt;
      } else if (from < this._selectedBlockIndex && insertAt >= this._selectedBlockIndex) {
        this._selectedBlockIndex--;
      } else if (from > this._selectedBlockIndex && insertAt <= this._selectedBlockIndex) {
        this._selectedBlockIndex++;
      }

      this._markDirty();
      this._renderBlocks();
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // ─── Detail panel ─────────────────────────────────────────────

  _setupDetailPanel() {
    // Toggle
    this._els.detailToggle.addEventListener("click", () => {
      this._detailPanelOpen = !this._detailPanelOpen;
      this._applyDetailPanelState();
    });

    // Tabs
    const tabContainer = this.contentElement.querySelector(".tap-detail-tabs");
    tabContainer.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-tab]");
      if (!tab) return;
      this._detailTab = tab.dataset.tab;
      tabContainer.querySelectorAll(".tap-detail-tab").forEach((t) => {
        t.classList.toggle("active", t.dataset.tab === this._detailTab);
      });
      this._renderDetail();
    });

    // Resize handle
    this._setupDetailResize();
  }

  _applyDetailPanelState() {
    if (!this._els) return;
    const panel = this._els.detailPanel;
    const toggle = this._els.detailToggle;
    if (this._detailPanelOpen) {
      panel.classList.remove("hidden");
      toggle.classList.add("open");
      if (this._detailPanelHeight) {
        panel.style.height = `${this._detailPanelHeight}px`;
      } else {
        panel.style.height = "200px";
      }
    } else {
      panel.classList.add("hidden");
      toggle.classList.remove("open");
    }
  }

  _setupDetailResize() {
    let startY = 0;
    let startH = 0;

    const onMove = (e) => {
      const dy = startY - e.clientY;
      const newH = Math.max(100, startH + dy);
      this._els.detailPanel.style.height = `${newH}px`;
      this._detailPanelHeight = newH;
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    this._els.detailResize.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startY = e.clientY;
      startH = this._els.detailPanel.offsetHeight;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  _renderDetail() {
    const content = this._els.detailContent;
    if (this._selectedBlockIndex < 0 || this._selectedBlockIndex >= this._blocks.length) {
      content.innerHTML = `<div class="tap-detail-empty">Select a block to view details</div>`;
      return;
    }

    const block = this._blocks[this._selectedBlockIndex];
    if (this._detailTab === "header" && isHeader(block)) {
      this._renderHeaderEditor(block);
    } else if (this._detailTab === "header" && !isHeader(block)) {
      content.innerHTML = `<div class="tap-detail-empty">Data block — switch to Hex tab to view/edit raw bytes</div>`;
    } else {
      this._renderHexEditor(block);
    }
  }

  // ─── Header editor ────────────────────────────────────────────

  _renderHeaderEditor(block) {
    const content = this._els.detailContent;
    const typeOptions = HEADER_TYPE_NAMES.map((name, i) =>
      `<option value="${i}"${i === block.headerType ? " selected" : ""}>${name}</option>`
    ).join("");

    const isProgram = block.headerType === HEADER_PROGRAM;
    const isCode = block.headerType === HEADER_CODE;
    const param1Label = isProgram ? "Autostart" : isCode ? "Start Addr" : "Param 1";
    const param2Label = isProgram ? "Var Offset" : "Param 2";
    const csClass = block.checksumValid ? "valid" : "invalid";
    const csText = block.checksumValid
      ? `${ICON_CHECK} Valid (${block.checksum.toString(16).padStart(2, "0")}h)`
      : `${ICON_CROSS} Invalid (stored: ${block.checksum.toString(16).padStart(2, "0")}h, expected: ${computeChecksum(block.flag, block.payload).toString(16).padStart(2, "0")}h)`;

    content.innerHTML = `
      <div class="tap-header-form">
        <span class="tap-header-label">Filename</span>
        <input class="tap-header-input" id="tap-hdr-filename" type="text" maxlength="10" value="${this._escapeAttr(block.filename)}" />

        <span class="tap-header-label">Type</span>
        <select class="tap-header-select" id="tap-hdr-type">${typeOptions}</select>

        <span class="tap-header-label">Data Length</span>
        <span class="tap-header-readonly">${block.dataLength}</span>

        <span class="tap-header-label">${param1Label}</span>
        <input class="tap-header-input" id="tap-hdr-param1" type="number" min="0" max="65535" value="${block.param1}" />

        <span class="tap-header-label">${param2Label}</span>
        <input class="tap-header-input" id="tap-hdr-param2" type="number" min="0" max="65535" value="${block.param2}" />

        <div class="tap-header-checksum-row">
          <span class="tap-header-checksum-status ${csClass}">${csText}</span>
          ${!block.checksumValid ? `<button class="tap-add-form-btn primary" id="tap-hdr-fix-checksum">Fix</button>` : ""}
        </div>
      </div>
    `;

    // Wire up editing
    const filenameInput = content.querySelector("#tap-hdr-filename");
    const typeSelect = content.querySelector("#tap-hdr-type");
    const param1Input = content.querySelector("#tap-hdr-param1");
    const param2Input = content.querySelector("#tap-hdr-param2");
    const fixBtn = content.querySelector("#tap-hdr-fix-checksum");

    const update = () => {
      block.filename = (filenameInput.value || "").padEnd(10, " ").substring(0, 10);
      block.headerType = parseInt(typeSelect.value, 10);
      block.param1 = parseInt(param1Input.value, 10) || 0;
      block.param2 = parseInt(param2Input.value, 10) || 0;
      updateHeaderPayload(block);
      this._markDirty();
      this._renderBlocks();
    };

    filenameInput.addEventListener("change", update);
    typeSelect.addEventListener("change", () => {
      update();
      this._renderHeaderEditor(block); // Re-render to update labels
    });
    param1Input.addEventListener("change", update);
    param2Input.addEventListener("change", update);

    if (fixBtn) {
      fixBtn.addEventListener("click", () => {
        recalcChecksum(block);
        this._markDirty();
        this._renderBlocks();
        this._renderHeaderEditor(block);
      });
    }
  }

  // ─── Hex editor ───────────────────────────────────────────────

  _renderHexEditor(block) {
    const content = this._els.detailContent;
    // Include flag byte and checksum in the hex view for full transparency
    const fullData = new Uint8Array(1 + block.payload.length + 1);
    fullData[0] = block.flag;
    fullData.set(block.payload, 1);
    fullData[fullData.length - 1] = block.checksum;

    const totalRows = Math.ceil(fullData.length / HEX_BYTES_PER_ROW);

    if (totalRows <= HEX_VISIBLE_ROWS * 2) {
      // Small enough to render all rows
      content.innerHTML = `<div class="tap-hex-container">${this._buildHexRows(fullData, 0, totalRows)}</div>`;
    } else {
      // Virtualized rendering
      const totalHeight = totalRows * HEX_ROW_HEIGHT;
      content.innerHTML = `<div class="tap-hex-container" style="height:100%;overflow-y:auto;">
        <div style="height:${totalHeight}px;position:relative;" id="tap-hex-virtual">
          <div id="tap-hex-rows" style="position:absolute;left:0;right:0;"></div>
        </div>
      </div>`;

      const container = content.querySelector(".tap-hex-container");
      const rowsDiv = content.querySelector("#tap-hex-rows");

      const renderVisible = () => {
        const scrollTop = container.scrollTop;
        const startRow = Math.max(0, Math.floor(scrollTop / HEX_ROW_HEIGHT) - 2);
        const endRow = Math.min(totalRows, startRow + HEX_VISIBLE_ROWS + 4);
        rowsDiv.style.top = `${startRow * HEX_ROW_HEIGHT}px`;
        rowsDiv.innerHTML = this._buildHexRows(fullData, startRow, endRow);
      };

      container.addEventListener("scroll", renderVisible);
      renderVisible();
    }

    // Wire hex editing
    content.addEventListener("click", (e) => {
      const byteEl = e.target.closest(".tap-hex-byte");
      if (!byteEl) return;
      const offset = parseInt(byteEl.dataset.offset, 10);
      this._startHexEdit(block, fullData, offset, byteEl);
    });
  }

  _buildHexRows(data, startRow, endRow) {
    let html = "";
    for (let row = startRow; row < endRow; row++) {
      const offset = row * HEX_BYTES_PER_ROW;
      if (offset >= data.length) break;

      const offsetStr = offset.toString(16).padStart(4, "0");

      let hexCells = "";
      let asciiChars = "";
      for (let col = 0; col < HEX_BYTES_PER_ROW; col++) {
        const byteOffset = offset + col;
        if (col === 8) hexCells += `<span class="tap-hex-spacer"></span>`;
        if (byteOffset < data.length) {
          const val = data[byteOffset];
          const hexStr = val.toString(16).padStart(2, "0");
          const modified = this._hexModifiedBytes.has(byteOffset) ? " modified" : "";
          hexCells += `<span class="tap-hex-byte${modified}" data-offset="${byteOffset}">${hexStr}</span>`;

          const ch = val >= 0x20 && val <= 0x7e ? String.fromCharCode(val) : ".";
          const npClass = val < 0x20 || val > 0x7e ? " non-printable" : "";
          asciiChars += `<span class="tap-hex-ascii-char${npClass}">${this._escapeHtml(ch)}</span>`;
        } else {
          hexCells += `<span class="tap-hex-byte" style="visibility:hidden">  </span>`;
          asciiChars += " ";
        }
      }

      html += `<div class="tap-hex-row"><span class="tap-hex-offset">${offsetStr}</span><span class="tap-hex-bytes">${hexCells}</span><span class="tap-hex-ascii">${asciiChars}</span></div>`;
    }
    return html;
  }

  _startHexEdit(block, fullData, offset, element) {
    // Don't allow editing flag byte (offset 0) — it defines the block type
    if (offset === 0) {
      this._showToast("Flag byte is read-only");
      return;
    }
    // Don't edit checksum byte directly — use Fix Checksum
    if (offset === fullData.length - 1) {
      this._showToast("Use Fix Checksums to update the checksum");
      return;
    }

    this._hexEditingByte = offset;
    this._hexEditBuffer = "";
    element.classList.add("editing");
    element.textContent = "__";

    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key.toLowerCase();

      if (key === "escape") {
        cleanup();
        this._renderHexEditor(block);
        return;
      }

      if (/^[0-9a-f]$/.test(key)) {
        this._hexEditBuffer += key;
        element.textContent = this._hexEditBuffer.padEnd(2, "_");

        if (this._hexEditBuffer.length === 2) {
          const newVal = parseInt(this._hexEditBuffer, 16);
          // Map fullData offset back to payload offset (offset 0 = flag, 1..N = payload)
          const payloadOffset = offset - 1;
          if (payloadOffset >= 0 && payloadOffset < block.payload.length) {
            block.payload[payloadOffset] = newVal;
            // Re-decode header if applicable
            if (isHeader(block)) {
              const { headerType, filename, dataLength, param1, param2 } =
                  await_decodeHeader(block.payload);
              block.headerType = headerType;
              block.filename = filename;
              block.dataLength = dataLength;
              block.param1 = param1;
              block.param2 = param2;
            }
            // Recompute checksum validity
            const expected = computeChecksum(block.flag, block.payload);
            block.checksumValid = block.checksum === expected;
            this._hexModifiedBytes.add(offset);
            this._markDirty();
          }
          cleanup();
          this._renderBlocks();
          this._renderHexEditor(block);
        }
      }
    };

    const cleanup = () => {
      document.removeEventListener("keydown", onKey, true);
      this._hexEditingByte = -1;
      this._hexEditBuffer = "";
    };

    document.addEventListener("keydown", onKey, true);
  }

  // ─── File operations ──────────────────────────────────────────

  _newTape() {
    this._blocks = [];
    this._currentFilename = null;
    this._dirty = false;
    this._selectedBlockIndex = -1;
    this._hexModifiedBytes.clear();
    this._updateFilenameDisplay();
    this._updateDirtyState();
    this._renderBlocks();
    this._renderDetail();
  }

  _openFile() {
    this._fileInput.click();
  }

  _loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      this._blocks = parseTAP(data);
      this._currentFilename = file.name;
      this._dirty = false;
      this._selectedBlockIndex = -1;
      this._hexModifiedBytes.clear();
      this._updateFilenameDisplay();
      this._updateDirtyState();
      this._renderBlocks();
      this._renderDetail();
      this._showToast(`Loaded ${this._blocks.length} blocks`);
    };
    reader.readAsArrayBuffer(file);
  }

  _saveFile() {
    if (!this._blocks.length) {
      this._showToast("Nothing to save");
      return;
    }

    const data = assembleTAP(this._blocks);
    const blob = new Blob([data], { type: "application/octet-stream" });
    const filename = this._currentFilename || "edited.tap";

    // Try File System Access API first
    if (window.showSaveFilePicker) {
      window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "TAP files", accept: { "application/octet-stream": [".tap"] } }],
      }).then(async (handle) => {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        this._currentFilename = handle.name;
        this._dirty = false;
        this._updateFilenameDisplay();
        this._updateDirtyState();
        this._showToast("Saved");
      }).catch(() => {
        // User cancelled or API not available
      });
    } else {
      // Fallback: download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this._dirty = false;
      this._updateDirtyState();
      this._showToast("Downloaded");
    }
  }

  _mergeFile() {
    this._mergeFileInput.click();
  }

  _doMergeFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      const newBlocks = parseTAP(data);
      if (!newBlocks.length) {
        this._showToast("No blocks found in file");
        return;
      }
      this._blocks.push(...newBlocks);
      this._markDirty();
      this._renderBlocks();
      this._showToast(`Merged ${newBlocks.length} blocks`);
    };
    reader.readAsArrayBuffer(file);
  }

  _importCurrentTape() {
    if (!this.tapeWindow || !this.tapeWindow._rawTapeData) {
      this._showToast("No tape currently loaded in player");
      return;
    }

    const data = this.tapeWindow._rawTapeData;
    const isTZX = this.tapeWindow._isTZX;
    if (isTZX) {
      this._showToast("TZX format not supported — TAP only");
      return;
    }

    this._blocks = parseTAP(data);
    this._currentFilename = this.tapeWindow._currentFilename || "imported.tap";
    this._dirty = false;
    this._selectedBlockIndex = -1;
    this._hexModifiedBytes.clear();
    this._updateFilenameDisplay();
    this._updateDirtyState();
    this._renderBlocks();
    this._renderDetail();
    this._showToast(`Imported ${this._blocks.length} blocks`);
  }

  _doImportBinary(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const payload = new Uint8Array(reader.result);
      const name = (file.name || "binary").replace(/\.[^.]+$/, "").substring(0, 10);
      const header = createHeaderBlock(HEADER_CODE, name, payload.length, 32768, 32768);
      const data = createDataBlock(payload);

      // Update header's dataLength to match actual data
      header.dataLength = payload.length;
      updateHeaderPayload(header);

      const insertAt = this._selectedBlockIndex >= 0 ? this._selectedBlockIndex + 1 : this._blocks.length;
      this._blocks.splice(insertAt, 0, header, data);
      this._markDirty();
      this._renderBlocks();
      this._selectBlock(insertAt);
      this._showToast(`Imported "${name}" (${payload.length} bytes)`);
    };
    reader.readAsArrayBuffer(file);
  }

  _loadIntoEmulator() {
    if (!this._blocks.length) {
      this._showToast("No blocks to load");
      return;
    }

    const data = assembleTAP(this._blocks);
    this._proxy.loadTAP(data.buffer);
    this._showToast("Tape loaded into emulator");
  }

  _exportBlock(index) {
    if (index < 0 || index >= this._blocks.length) return;
    const block = this._blocks[index];
    const blob = new Blob([block.payload], { type: "application/octet-stream" });

    let filename = `block-${index}`;
    if (isHeader(block)) {
      filename = `${block.filename.trim() || "header"}-hdr`;
    }
    filename += ".bin";

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this._showToast(`Exported ${filename}`);
  }

  _fixAllChecksums() {
    let fixed = 0;
    for (const block of this._blocks) {
      if (!block.checksumValid) {
        recalcChecksum(block);
        fixed++;
      }
    }
    if (fixed > 0) {
      this._markDirty();
      this._renderBlocks();
      this._renderDetail();
      this._showToast(`Fixed ${fixed} checksum${fixed > 1 ? "s" : ""}`);
    } else {
      this._showToast("All checksums valid");
    }
  }

  // ─── Dirty state tracking ────────────────────────────────────

  _markDirty() {
    this._dirty = true;
    this._updateDirtyState();
  }

  _updateDirtyState() {
    if (!this._els) return;
    const saveBtn = this._els.saveBtn;
    if (saveBtn) {
      saveBtn.classList.toggle("dirty", this._dirty);
    }
  }

  _updateFilenameDisplay() {
    const banner = this._els.filenameBanner;
    if (this._currentFilename) {
      banner.classList.remove("hidden");
      banner.innerHTML = `<span class="tap-filename-text">${this._escapeHtml(this._currentFilename)}</span>${this._dirty ? '<span class="tap-dirty-indicator">Modified</span>' : ""}`;
    } else {
      banner.classList.add("hidden");
    }
  }

  // ─── Toast notifications ──────────────────────────────────────

  _showToast(message) {
    const toast = this._els.toast;
    toast.textContent = message;
    toast.classList.add("visible");
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove("visible");
    }, 2000);
  }

  // ─── Utility ──────────────────────────────────────────────────

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;").replace(/&/g, "&amp;");
  }
}

/**
 * Helper to decode header payload inline (avoids import circularity).
 * Called from hex edit handler.
 */
function await_decodeHeader(payload) {
  if (payload.length !== 17) return {};
  const headerType = payload[0];
  let filename = "";
  for (let i = 1; i <= 10; i++) filename += String.fromCharCode(payload[i]);
  const dataLength = payload[11] | (payload[12] << 8);
  const param1 = payload[13] | (payload[14] << 8);
  const param2 = payload[15] | (payload[16] << 8);
  return { headerType, filename, dataLength, param1, param2 };
}
