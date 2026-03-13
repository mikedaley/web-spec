/*
 * retro-debugger.js - Full-screen WebGL retro debugger overlay
 *
 * The most comprehensive ZX Spectrum debugger ever built, rendered
 * entirely via WebGL at 60fps using the Spectrum ROM bitmap font.
 * Shows the emulator output centred at 4:3 as a backdrop with
 * floating, draggable, semi-transparent debug windows on top.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { GLTextRenderer } from "./gl-text-renderer.js";
import "../css/retro-debugger.css";

// ── Display ─────────────────────────────────────────────────────
const SCREEN_W = 352;
const SCREEN_H = 288;
const DISPLAY_ASPECT = 4 / 3;

// ── Fetch throttling (ms) ───────────────────────────────────────
const DISASM_INTERVAL = 50;
const HEX_INTERVAL = 50;

// ── Window chrome ───────────────────────────────────────────────
const TITLE_H = 1;             // title bar height in char rows
const WIN_BG_ALPHA = 0.94;
const WIN_BORDER_ALPHA = 0.9;

// ── Register change highlight duration (ms) ─────────────────────
const REG_FLASH_MS = 400;

// ── AY constants ────────────────────────────────────────────────
const AY_CLOCK = 1750000; // Spectrum AY clock = 3.5MHz / 2
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

// ── Spectrum BRIGHT palette (RGB floats) ────────────────────────
const C = {
  BLACK:     [0.00, 0.00, 0.00],
  BLUE:      [0.00, 0.00, 1.00],
  RED:       [1.00, 0.00, 0.00],
  MAGENTA:   [1.00, 0.00, 1.00],
  GREEN:     [0.00, 1.00, 0.00],
  CYAN:      [0.00, 1.00, 1.00],
  YELLOW:    [1.00, 1.00, 0.00],
  WHITE:     [1.00, 1.00, 1.00],

  // Dimmed / UI — tuned for readability on dark background
  DIM_WHITE: [0.70, 0.70, 0.70],
  DIM_CYAN:  [0.00, 0.65, 0.65],
  DIM_GREEN: [0.00, 0.55, 0.00],
  DIM_RED:   [0.65, 0.15, 0.15],
  DIM_BLUE:  [0.20, 0.20, 0.65],
  MID_GREY:  [0.45, 0.45, 0.45],
  DARK_GREY: [0.15, 0.15, 0.15],
  BG:        [0.04, 0.04, 0.06],
  ROW_ALT:   [0.10, 0.10, 0.13],
  BORDER:    [0.30, 0.30, 0.35],
};

// ── Helpers ─────────────────────────────────────────────────────

function hex16(v) { return (v & 0xFFFF).toString(16).toUpperCase().padStart(4, "0"); }
function hex8(v) { return (v & 0xFF).toString(16).toUpperCase().padStart(2, "0"); }
function bin8(v) { return (v & 0xFF).toString(2).padStart(8, "0"); }
function dec5(v) { return String(v & 0xFFFF).padStart(5); }

function freqToNote(freq) {
  if (freq <= 0) return "---";
  const noteNum = 12 * Math.log2(freq / 440) + 69;
  const n = Math.round(noteNum);
  if (n < 0 || n > 127) return "---";
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

function lerpCol(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Machine names by id
const MACHINE_NAMES = {
  0: "ZX Spectrum 48K",
  1: "ZX Spectrum 128K",
  2: "ZX Spectrum +2",
  3: "ZX Spectrum +2A",
  4: "ZX Spectrum +3",
  5: "ZX81",
};

// Memory region map for 48K
const MEM_REGIONS = [
  { start: 0x0000, end: 0x3FFF, name: "ROM",    col: C.BLUE },
  { start: 0x4000, end: 0x57FF, name: "SCREEN",  col: C.GREEN },
  { start: 0x5800, end: 0x5AFF, name: "ATTRS",   col: C.YELLOW },
  { start: 0x5B00, end: 0x5CB5, name: "SYSVARS", col: C.RED },
  { start: 0x5CB6, end: 0xFFFF, name: "RAM",     col: C.CYAN },
];

// ── Docking layout tree ─────────────────────────────────────────

const SPLIT_V = "vertical";   // divider is vertical, children are left | right
const SPLIT_H = "horizontal"; // divider is horizontal, children are top / bottom
const DIVIDER_SIZE = 1;       // 1 grid cell for dividers
const DIVIDER_GRAB = 6;       // extra pixels each side for easier grabbing

// Minimum panel sizes per window type (cols, rows)
const MIN_PANEL = {
  screen:  { cols: 20, rows: 15 },
  disasm:  { cols: 30, rows: 12 },
  regs:    { cols: 28, rows: 14 },
  hex:     { cols: 56, rows: 8 },
  stack:   { cols: 16, rows: 8 },
  ay:      { cols: 28, rows: 10 },
  memmap:  { cols: 40, rows: 6 },
  status:  { cols: 40, rows: 8 },
};

function makeLeaf(windowId) {
  return { type: "leaf", windowId, col: 0, row: 0, cols: 0, rows: 0 };
}

function makeTabs(windowIds, activeIndex = 0) {
  return { type: "tabs", windowIds: [...windowIds], activeIndex, col: 0, row: 0, cols: 0, rows: 0 };
}

function makeSplit(direction, ratio, first, second) {
  return {
    type: "split", direction, ratio, first, second,
    _regionCol: 0, _regionRow: 0, _regionCols: 0, _regionRows: 0,
    _dividerCol: 0, _dividerRow: 0, _dividerLen: 0, _dividerAxis: direction === SPLIT_V ? "v" : "h",
  };
}

function computeMinSize(node, axis) {
  if (node.type === "leaf") return MIN_PANEL[node.windowId]?.[axis] || 6;
  if (node.type === "tabs") {
    // Tabs node: use the max min-size across all tabbed windows
    let m = 6;
    for (const wid of node.windowIds) m = Math.max(m, MIN_PANEL[wid]?.[axis] || 6);
    return m;
  }
  const splitAxis = node.direction === SPLIT_V ? "cols" : "rows";
  if (axis === splitAxis) {
    return computeMinSize(node.first, axis) + computeMinSize(node.second, axis) + DIVIDER_SIZE;
  }
  return Math.max(computeMinSize(node.first, axis), computeMinSize(node.second, axis));
}

function layoutTree(node, col, row, cols, rows) {
  if (node.type === "leaf") {
    node.col = col; node.row = row; node.cols = cols; node.rows = rows;
    return;
  }
  if (node.type === "tabs") {
    node.col = col; node.row = row; node.cols = cols; node.rows = rows;
    return;
  }
  node._regionCol = col; node._regionRow = row;
  node._regionCols = cols; node._regionRows = rows;

  if (node.direction === SPLIT_V) {
    const available = cols - DIVIDER_SIZE;
    const minFirst = computeMinSize(node.first, "cols");
    const minSecond = computeMinSize(node.second, "cols");
    let firstCols = Math.round(available * node.ratio);
    firstCols = Math.max(minFirst, Math.min(available - minSecond, firstCols));
    const secondCols = available - firstCols;
    node._dividerCol = col + firstCols;
    node._dividerRow = row;
    node._dividerLen = rows;
    node._dividerAxis = "v";
    layoutTree(node.first, col, row, firstCols, rows);
    layoutTree(node.second, col + firstCols + DIVIDER_SIZE, row, secondCols, rows);
  } else {
    const available = rows - DIVIDER_SIZE;
    const minFirst = computeMinSize(node.first, "rows");
    const minSecond = computeMinSize(node.second, "rows");
    let firstRows = Math.round(available * node.ratio);
    firstRows = Math.max(minFirst, Math.min(available - minSecond, firstRows));
    const secondRows = available - firstRows;
    node._dividerCol = col;
    node._dividerRow = row + firstRows;
    node._dividerLen = cols;
    node._dividerAxis = "h";
    layoutTree(node.first, col, row, cols, firstRows);
    layoutTree(node.second, col, row + firstRows + DIVIDER_SIZE, cols, secondRows);
  }
}

function collectLeaves(node, out) {
  if (node.type === "leaf") { out.push(node); return; }
  if (node.type === "tabs") { out.push(node); return; }
  collectLeaves(node.first, out);
  collectLeaves(node.second, out);
}

function buildDefaultLayout() {
  return makeSplit(SPLIT_V, 0.355,
    // Left column: disasm / regs
    makeSplit(SPLIT_H, 0.66,
      makeLeaf("disasm"),
      makeLeaf("regs")
    ),
    // Right column: screen+hex / middle / lower
    makeSplit(SPLIT_H, 0.42,
      // Top right: screen | hex
      makeSplit(SPLIT_V, 0.45,
        makeLeaf("screen"),
        makeLeaf("hex")
      ),
      // Bottom right
      makeSplit(SPLIT_H, 0.50,
        // stack | ay
        makeSplit(SPLIT_V, 0.40,
          makeLeaf("stack"),
          makeLeaf("ay")
        ),
        // memmap / status
        makeSplit(SPLIT_H, 0.40,
          makeLeaf("memmap"),
          makeLeaf("status")
        )
      )
    )
  );
}

// ── Tree manipulation (detach / insert for drag-and-dock) ───────

// Find the parent split of a leaf with the given windowId.
// Returns { parent, childKey } where childKey is "first" or "second",
// or null if this is the root leaf.
function findParentOf(root, windowId, parent = null, childKey = null) {
  if (root.type === "leaf") {
    return root.windowId === windowId ? { parent, childKey } : null;
  }
  if (root.type === "tabs") {
    return root.windowIds.includes(windowId) ? { parent, childKey, tabNode: root } : null;
  }
  return findParentOf(root.first, windowId, root, "first") ||
         findParentOf(root.second, windowId, root, "second");
}

// Detach a leaf from the tree. The sibling takes over the parent's slot.
// Returns the new root (may change if the detached leaf was a direct child of root).
function detachLeaf(root, windowId) {
  const info = findParentOf(root, windowId);
  if (!info) return root;

  // If the window is inside a tabs node, remove it from the tab group
  if (info.tabNode) {
    const tabs = info.tabNode;
    const idx = tabs.windowIds.indexOf(windowId);
    if (idx < 0) return root;
    tabs.windowIds.splice(idx, 1);
    if (tabs.activeIndex >= tabs.windowIds.length) tabs.activeIndex = tabs.windowIds.length - 1;

    // If only one tab left, convert tabs node back to a leaf
    if (tabs.windowIds.length === 1) {
      const remainingId = tabs.windowIds[0];
      const leaf = makeLeaf(remainingId);
      if (!info.parent) {
        // tabs was root
        return leaf;
      }
      info.parent[info.childKey] = leaf;
    }
    return root;
  }

  if (!info.parent) return root; // can't detach the root leaf itself

  const parent = info.parent;
  const sibling = info.childKey === "first" ? parent.second : parent.first;

  // Find grandparent to replace parent with sibling
  const gpInfo = findParentOfNode(root, parent);
  if (!gpInfo) {
    // parent IS the root — sibling becomes new root
    return sibling;
  }
  gpInfo.parent[gpInfo.childKey] = sibling;
  return root;
}

// Find parent of a specific node (not by windowId, by reference)
function findParentOfNode(root, target, parent = null, childKey = null) {
  if (root === target) return parent ? { parent, childKey } : null;
  if (root.type === "leaf" || root.type === "tabs") return null;
  return findParentOfNode(root.first, target, root, "first") ||
         findParentOfNode(root.second, target, root, "second");
}

// Insert a leaf next to a target by creating a new split, or into a tab group for "center".
// zone: "left" | "right" | "top" | "bottom" | "center"
// Returns the new root (may change if target was root).
function insertLeafAtTarget(root, targetWindowId, newWindowId, zone) {
  // Center zone → create or extend a tab group
  if (zone === "center") {
    const targetNode = findLeafNode(root, targetWindowId);
    if (!targetNode) return root;

    if (targetNode.type === "tabs") {
      // Already a tabs node — add the new window
      targetNode.windowIds.push(newWindowId);
      targetNode.activeIndex = targetNode.windowIds.length - 1;
    } else {
      // Convert leaf to tabs
      const newTabs = makeTabs([targetWindowId, newWindowId], 1);
      const parentInfo = findParentOf(root, targetWindowId);
      if (!parentInfo || !parentInfo.parent) {
        return newTabs; // target was root
      }
      parentInfo.parent[parentInfo.childKey] = newTabs;
    }
    return root;
  }

  // Edge zones → create a new split
  const direction = (zone === "left" || zone === "right") ? SPLIT_V : SPLIT_H;
  const newLeaf = makeLeaf(newWindowId);

  // Find the target node (could be leaf or tabs)
  const targetNode = findLeafNode(root, targetWindowId);
  if (!targetNode) return root;

  // For tabs nodes, we split the whole tab group, not an individual tab.
  // We need to find the node itself in the tree and replace it.
  const nodeToReplace = targetNode.type === "tabs" ? targetNode : null;

  // Create new split
  let newSplit;
  if (zone === "left" || zone === "top") {
    newSplit = makeSplit(direction, 0.5, newLeaf, nodeToReplace || makeLeaf(targetWindowId));
  } else {
    newSplit = makeSplit(direction, 0.5, nodeToReplace || makeLeaf(targetWindowId), newLeaf);
  }

  if (nodeToReplace) {
    // Replace the tabs node with the new split
    const parentInfo = findParentOfNode(root, nodeToReplace);
    if (!parentInfo) return newSplit; // was root
    parentInfo.parent[parentInfo.childKey] = newSplit;
    return root;
  }

  // Replace the target leaf with the new split
  const parentInfo = findParentOf(root, targetWindowId);
  if (!parentInfo || !parentInfo.parent) {
    return newSplit; // target was root
  }
  parentInfo.parent[parentInfo.childKey] = newSplit;
  return root;
}

function findLeafNode(root, windowId) {
  if (root.type === "leaf") return root.windowId === windowId ? root : null;
  if (root.type === "tabs") return root.windowIds.includes(windowId) ? root : null;
  return findLeafNode(root.first, windowId) || findLeafNode(root.second, windowId);
}

// Find the tabs node containing a given windowId, or null
function findTabsNode(root, windowId) {
  if (root.type === "tabs") return root.windowIds.includes(windowId) ? root : null;
  if (root.type === "leaf") return null;
  return findTabsNode(root.first, windowId) || findTabsNode(root.second, windowId);
}

// Get the active windowId from a node (leaf or tabs)
function nodeActiveId(node) {
  if (node.type === "tabs") return node.windowIds[node.activeIndex];
  return node.windowId;
}

// Determine drop zone from mouse position within a panel.
// Returns "left" | "right" | "top" | "bottom" | "center" | null
function getDropZone(px, py, panelX, panelY, panelW, panelH) {
  const rx = (px - panelX) / panelW; // 0..1 relative x
  const ry = (py - panelY) / panelH; // 0..1 relative y

  // Edge zones: 25% strips on each side
  const EDGE = 0.25;

  // Determine which edge the point is closest to
  const dLeft = rx;
  const dRight = 1 - rx;
  const dTop = ry;
  const dBottom = 1 - ry;
  const minDist = Math.min(dLeft, dRight, dTop, dBottom);

  if (minDist > EDGE) return "center";
  if (minDist === dLeft) return "left";
  if (minDist === dRight) return "right";
  if (minDist === dTop) return "top";
  return "bottom";
}

function serializeTree(node) {
  if (node.type === "leaf") return { t: "l", w: node.windowId };
  if (node.type === "tabs") return { t: "tb", w: node.windowIds, ai: node.activeIndex };
  return { t: "s", d: node.direction, r: node.ratio, a: serializeTree(node.first), b: serializeTree(node.second) };
}

function deserializeTree(data) {
  if (!data || typeof data !== "object") return null;
  if (data.t === "l") return makeLeaf(data.w);
  if (data.t === "tb") return makeTabs(data.w, data.ai || 0);
  if (data.t === "s") {
    const first = deserializeTree(data.a);
    const second = deserializeTree(data.b);
    if (!first || !second) return null;
    return makeSplit(data.d, data.r, first, second);
  }
  return null;
}

// ── Window descriptor ───────────────────────────────────────────

function makeWindow(id, title, col, row, cols, rows, accentCol) {
  return { id, title, col, row, cols, rows, accentCol, visible: true };
}

// ═════════════════════════════════════════════════════════════════
//  RetroDebugger
// ═════════════════════════════════════════════════════════════════

export class RetroDebugger {
  constructor(emulator) {
    this._emulator = emulator;
    this._proxy = emulator.proxy;
    this._renderer = null;

    // Overlay DOM
    this._overlay = null;
    this._canvas = null;

    // State
    this.isVisible = false;
    this._animFrameId = null;
    this._dpr = 1;
    this._viewW = 0;
    this._viewH = 0;
    this._charW = 0;
    this._charH = 0;
    this._gridCols = 0;
    this._gridRows = 0;

    // Window definitions (positions are computed by layout tree each frame)
    this._windows = [
      makeWindow("screen",    "EMULATOR",        0, 0, 0, 0, C.CYAN),
      makeWindow("disasm",    "Z80 DISASSEMBLY", 0, 0, 0, 0, C.MAGENTA),
      makeWindow("regs",      "Z80 CPU",         0, 0, 0, 0, C.CYAN),
      makeWindow("hex",       "MEMORY",          0, 0, 0, 0, C.WHITE),
      makeWindow("stack",     "STACK",           0, 0, 0, 0, C.RED),
      makeWindow("ay",        "AY-3-8912",       0, 0, 0, 0, C.GREEN),
      makeWindow("memmap",    "MEMORY MAP",      0, 0, 0, 0, C.YELLOW),
      makeWindow("status",    "STATUS",          0, 0, 0, 0, C.CYAN),
    ];

    // Index by id for fast lookup
    this._windowMap = {};
    for (const w of this._windows) this._windowMap[w.id] = w;

    // Docking layout tree
    this._rootNode = this._loadLayout() || buildDefaultLayout();

    // The window currently under the mouse (for scroll routing)
    this._hoverWindow = null;
    // The last-clicked window (for keyboard routing)
    this._focusedWindow = null;

    // Divider drag state
    this._draggingDivider = null;
    this._hoveredDivider = null;

    // Window drag-and-dock state
    this._dockDragging = null;     // { windowId, startX, startY } when title bar drag begins
    this._dockDragActive = false;  // true once mouse has moved enough to activate
    this._dockDropTarget = null;   // { windowId, zone } current drop target
    this._dockDragPos = { x: 0, y: 0 }; // current mouse position during drag

    // Button hit areas (rebuilt each frame)
    this._buttons = [];

    // Data caches
    this._disasmData = null;
    this._disasmRowsBefore = 0;
    this._hexData = null;
    this._hexBaseAddr = 0x4000;
    this._stackData = null;
    this._latestFramebuffer = null;

    // Throttle
    this._lastDisasmFetch = 0;
    this._lastHexFetch = 0;
    this._lastPC = -1;

    // Register change tracking
    this._prevRegs = {};
    this._regChangeTime = {};

    // Emulator keyboard focus (click screen to capture keys for Spectrum)
    this._emuFocused = false;
    this._screenRect = { x: 0, y: 0, w: 0, h: 0 }; // computed each frame

    // GPU textures
    this._screenTex = null;

    // Bound handlers
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onDblClick = this._handleDblClick.bind(this);
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  async init() {
    this._overlay = document.createElement("div");
    this._overlay.className = "retro-debugger-overlay";

    this._canvas = document.createElement("canvas");
    this._overlay.appendChild(this._canvas);
    document.body.appendChild(this._overlay);

    this._renderer = new GLTextRenderer(this._canvas);
    await this._renderer.init();

    this._screenTex = this._renderer.createDataTexture(SCREEN_W, SCREEN_H);
  }

  toggle() { if (this.isVisible) this.close(); else this.open(); }

  open() {
    if (this.isVisible) return;
    this.isVisible = true;
    this._emuFocused = false;
    this._overlay.classList.add("visible");
    if (this._emulator.inputHandler) this._emulator.inputHandler.setEnabled(false);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    this._canvas.addEventListener("mousedown", this._onMouseDown);
    this._canvas.addEventListener("mousemove", this._onMouseMove);
    this._canvas.addEventListener("mouseup", this._onMouseUp);
    this._canvas.addEventListener("wheel", this._onWheel, { passive: false });
    this._canvas.addEventListener("dblclick", this._onDblClick);
    this._renderLoop();
  }

  close() {
    if (!this.isVisible) return;
    this.isVisible = false;
    this._overlay.classList.remove("visible");
    this._emuFocused = false;
    if (this._emulator.inputHandler) this._emulator.inputHandler.setEnabled(true);
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    this._canvas.removeEventListener("mousedown", this._onMouseDown);
    this._canvas.removeEventListener("mousemove", this._onMouseMove);
    this._canvas.removeEventListener("mouseup", this._onMouseUp);
    this._canvas.removeEventListener("wheel", this._onWheel);
    this._canvas.removeEventListener("dblclick", this._onDblClick);
    if (this._animFrameId) { cancelAnimationFrame(this._animFrameId); this._animFrameId = null; }
  }

  updateFramebuffer(fb) { this._latestFramebuffer = fb; }

  destroy() {
    this.close();
    if (this._renderer) { this._renderer.destroy(); this._renderer = null; }
    if (this._overlay?.parentElement) this._overlay.parentElement.removeChild(this._overlay);
  }

  // ── Render loop ────────────────────────────────────────────────

  _renderLoop() {
    if (!this.isVisible) return;
    this._fetchData();
    this._render();
    this._animFrameId = requestAnimationFrame(() => this._renderLoop());
  }

  // ── Data fetching ──────────────────────────────────────────────

  _fetchData() {
    const proxy = this._proxy;
    if (!proxy) return;
    const now = performance.now();
    const pc = proxy.getPC();

    if (now - this._lastDisasmFetch > DISASM_INTERVAL || pc !== this._lastPC) {
      this._lastPC = pc;
      this._lastDisasmFetch = now;
      // Use accurate backward disassembly centred on PC.
      const disasmWin = this._windowMap["disasm"];
      const contentRows = disasmWin ? (disasmWin.rows - TITLE_H - 4) : 40;
      const halfView = Math.floor(contentRows / 2);
      const rowsBefore = halfView;
      const rowsAfter = contentRows - halfView - 1; // -1 for PC row itself
      proxy.disassembleAroundPC(pc, rowsBefore, rowsAfter).then(d => {
        if (d) {
          this._disasmData = d;
          this._disasmRowsBefore = rowsBefore;
        }
      });
    }

    if (now - this._lastHexFetch > HEX_INTERVAL) {
      this._lastHexFetch = now;
      proxy.readMemory(this._hexBaseAddr, 320).then(d => { if (d) this._hexData = d; });
      const sp = proxy.getSP();
      proxy.readMemory(sp, 64).then(d => { if (d) this._stackData = d; });
    }
  }

  // ── Register change tracking ──────────────────────────────────

  _trackRegisters() {
    const p = this._proxy;
    if (!p) return;
    const now = performance.now();
    const regs = {
      AF: p.getAF(), BC: p.getBC(), DE: p.getDE(), HL: p.getHL(),
      IX: p.getIX(), IY: p.getIY(), SP: p.getSP(), PC: p.getPC(),
      AF2: p.getAltAF(), BC2: p.getAltBC(), DE2: p.getAltDE(), HL2: p.getAltHL(),
      I: p.getI(), R: p.getR(),
    };
    for (const [name, val] of Object.entries(regs)) {
      if (this._prevRegs[name] !== undefined && this._prevRegs[name] !== val) {
        this._regChangeTime[name] = now;
      }
    }
    this._prevRegs = regs;
  }

  _regColor(name) {
    const age = performance.now() - (this._regChangeTime[name] || 0);
    if (age < REG_FLASH_MS) {
      const t = age / REG_FLASH_MS;
      return lerpCol(C.YELLOW, C.WHITE, t);
    }
    return C.WHITE;
  }

  // ── Main render ────────────────────────────────────────────────

  _render() {
    this._dpr = window.devicePixelRatio || 1;
    this._viewW = Math.floor(window.innerWidth * this._dpr);
    this._viewH = Math.floor(window.innerHeight * this._dpr);

    const R = this._renderer;
    R.beginFrame(this._viewW, this._viewH);

    const charH = Math.max(10, Math.floor(this._viewH / 70));
    const charW = Math.max(7, Math.floor(charH * 0.55));
    this._charW = charW;
    this._charH = charH;
    this._gridCols = Math.floor(this._viewW / charW);
    this._gridRows = Math.floor(this._viewH / charH);
    R.setCellSize(charW, charH);

    this._trackRegisters();

    // 1. Compute docking layout
    layoutTree(this._rootNode, 0, 0, this._gridCols, this._gridRows);
    const leaves = [];
    collectLeaves(this._rootNode, leaves);

    // Track which windows are visible (active tab or standalone leaf)
    const visibleSet = new Set();
    for (const node of leaves) {
      if (node.type === "tabs") {
        const activeId = node.windowIds[node.activeIndex];
        for (const wid of node.windowIds) {
          const win = this._windowMap[wid];
          if (!win) continue;
          // All tabs share the same region but only active is drawn
          win.col = node.col;
          win.row = node.row;
          win.cols = node.cols;
          win.rows = node.rows;
        }
        if (activeId) visibleSet.add(activeId);
      } else {
        const win = this._windowMap[node.windowId];
        if (!win) continue;
        win.col = node.col;
        win.row = node.row;
        win.cols = node.cols;
        win.rows = node.rows;
        visibleSet.add(node.windowId);
      }
    }

    // 2. Draw dividers (behind windows)
    this._drawDividers(this._rootNode);

    // 3. Clear button hit areas
    this._buttons = [];

    // 4. Draw all panels
    for (const win of this._windows) {
      if (!visibleSet.has(win.id) || win.cols <= 0 || win.rows <= 0) continue;

      // Check if this window is inside a tabs node — draw tab bar instead of normal frame
      const tabsNode = findTabsNode(this._rootNode, win.id);
      if (tabsNode) {
        this._drawTabBar(tabsNode, win);
      } else {
        this._drawWindowFrame(win);
      }

      switch (win.id) {
        case "screen":  this._drawScreenPanel(win);  break;
        case "disasm":  this._drawDisasm(win);       break;
        case "regs":    this._drawRegisters(win);    break;
        case "hex":     this._drawHexDump(win);      break;
        case "stack":   this._drawStack(win);        break;
        case "ay":      this._drawAY(win);           break;
        case "memmap":  this._drawMemMap(win);       break;
        case "status":  this._drawStatus(win);       break;
      }
    }

    // 5. Draw drag-and-dock overlay (on top of everything)
    if (this._dockDragActive) {
      this._drawDockOverlay();
    }

    R.flush();
  }

  // ── Emulator screen panel ─────────────────────────────────────

  _drawScreenPanel(win) {
    const R = this._renderer;
    if (this._latestFramebuffer) {
      R.updateDataTexture(this._screenTex, this._latestFramebuffer, SCREEN_W, SCREEN_H);
    }

    const cw = this._charW, ch = this._charH;
    const px = win.col * cw, py = (win.row + TITLE_H) * ch;
    const pw = win.cols * cw, ph = (win.rows - TITLE_H) * ch;

    // Maintain 4:3 aspect within the panel
    let dw, dh;
    if (pw / ph > DISPLAY_ASPECT) { dh = ph; dw = ph * DISPLAY_ASPECT; }
    else { dw = pw; dh = pw / DISPLAY_ASPECT; }
    const dx = px + (pw - dw) / 2;
    const dy = py + (ph - dh) / 2;

    this._screenRect = { x: dx, y: dy, w: dw, h: dh };
    R.drawImage(this._screenTex, dx, dy, dw, dh);

    // Focus border when emulator has keyboard
    if (this._emuFocused) {
      const b = 3;
      R.fillRect(dx - b, dy - b, dw + b * 2, b, ...C.CYAN, 0.9);
      R.fillRect(dx - b, dy + dh, dw + b * 2, b, ...C.CYAN, 0.9);
      R.fillRect(dx - b, dy, b, dh, ...C.CYAN, 0.9);
      R.fillRect(dx + dw, dy, b, dh, ...C.CYAN, 0.9);
    }
  }

  // ── Docking layout helpers ────────────────────────────────────

  _drawDividers(node) {
    if (node.type === "leaf" || node.type === "tabs") return;
    const R = this._renderer;
    const cw = this._charW, ch = this._charH;
    const isHovered = this._hoveredDivider === node;
    const isDragging = this._draggingDivider === node;
    const highlight = isHovered || isDragging;

    if (node._dividerAxis === "v") {
      const x = node._dividerCol * cw;
      const y = node._dividerRow * ch;
      const h = node._dividerLen * ch;

      // Divider background
      R.fillRect(x, y, cw, h, ...C.BG, 0.98);
      // Centre line
      const cx = x + Math.floor(cw / 2);
      R.fillRect(cx, y, 1, h, ...(highlight ? C.CYAN : C.BORDER), highlight ? 0.8 : 0.5);
      // Grip dots
      const midY = y + h / 2;
      const dotW = Math.max(2, Math.floor(cw * 0.4));
      const dotH = 2;
      const gap = Math.max(4, Math.floor(ch * 0.4));
      const dotX = x + Math.floor((cw - dotW) / 2);
      for (let i = -2; i <= 2; i++) {
        const col = highlight ? C.WHITE : C.DIM_WHITE;
        R.fillRect(dotX, midY + i * gap - dotH / 2, dotW, dotH, ...col, highlight ? 0.9 : 0.5);
      }
    } else {
      const x = node._dividerCol * cw;
      const y = node._dividerRow * ch;
      const w = node._dividerLen * cw;

      R.fillRect(x, y, w, ch, ...C.BG, 0.98);
      const cy = y + Math.floor(ch / 2);
      R.fillRect(x, cy, w, 1, ...(highlight ? C.CYAN : C.BORDER), highlight ? 0.8 : 0.5);
      // Grip dots
      const midX = x + w / 2;
      const dotW = 2;
      const dotH = Math.max(2, Math.floor(ch * 0.4));
      const gap = Math.max(4, Math.floor(cw * 0.5));
      const dotY = y + Math.floor((ch - dotH) / 2);
      for (let i = -2; i <= 2; i++) {
        const col = highlight ? C.WHITE : C.DIM_WHITE;
        R.fillRect(midX + i * gap - dotW / 2, dotY, dotW, dotH, ...col, highlight ? 0.9 : 0.5);
      }
    }

    this._drawDividers(node.first);
    this._drawDividers(node.second);
  }

  _findDividerAtPos(node, px, py) {
    if (node.type === "leaf" || node.type === "tabs") return null;
    const cw = this._charW, ch = this._charH;

    // Check children first (deeper dividers take priority)
    const fromSecond = this._findDividerAtPos(node.second, px, py);
    if (fromSecond) return fromSecond;
    const fromFirst = this._findDividerAtPos(node.first, px, py);
    if (fromFirst) return fromFirst;

    // Check this node's divider
    if (node._dividerAxis === "v") {
      const dx = node._dividerCol * cw;
      const dy = node._dividerRow * ch;
      const dh = node._dividerLen * ch;
      if (px >= dx - DIVIDER_GRAB && px <= dx + cw + DIVIDER_GRAB &&
          py >= dy && py <= dy + dh) return node;
    } else {
      const dx = node._dividerCol * cw;
      const dy = node._dividerRow * ch;
      const dw = node._dividerLen * cw;
      if (py >= dy - DIVIDER_GRAB && py <= dy + ch + DIVIDER_GRAB &&
          px >= dx && px <= dx + dw) return node;
    }
    return null;
  }

  _findLeafAtPos(node, px, py) {
    if (node.type === "leaf") {
      const cw = this._charW, ch = this._charH;
      const x = node.col * cw, y = node.row * ch;
      const w = node.cols * cw, h = node.rows * ch;
      if (px >= x && px < x + w && py >= y && py < y + h) return node;
      return null;
    }
    if (node.type === "tabs") {
      const cw = this._charW, ch = this._charH;
      const x = node.col * cw, y = node.row * ch;
      const w = node.cols * cw, h = node.rows * ch;
      if (px >= x && px < x + w && py >= y && py < y + h) {
        // Return the tabs node itself — callers use .windowId which we alias to the active tab
        return node;
      }
      return null;
    }
    return this._findLeafAtPos(node.second, px, py) ||
           this._findLeafAtPos(node.first, px, py);
  }

  _updateDividerRatio(node, px, py) {
    if (node.direction === SPLIT_V) {
      const available = node._regionCols - DIVIDER_SIZE;
      const mouseCol = Math.round(px / this._charW) - node._regionCol;
      const minFirst = computeMinSize(node.first, "cols");
      const minSecond = computeMinSize(node.second, "cols");
      const clamped = Math.max(minFirst, Math.min(available - minSecond, mouseCol));
      node.ratio = clamped / available;
    } else {
      const available = node._regionRows - DIVIDER_SIZE;
      const mouseRow = Math.round(py / this._charH) - node._regionRow;
      const minFirst = computeMinSize(node.first, "rows");
      const minSecond = computeMinSize(node.second, "rows");
      const clamped = Math.max(minFirst, Math.min(available - minSecond, mouseRow));
      node.ratio = clamped / available;
    }
  }

  _saveLayout() {
    try {
      localStorage.setItem("zxspec-retro-debugger-layout", JSON.stringify(serializeTree(this._rootNode)));
    } catch (e) { /* ignore */ }
  }

  _loadLayout() {
    try {
      const raw = localStorage.getItem("zxspec-retro-debugger-layout");
      if (raw) return deserializeTree(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return null;
  }

  _resetLayout() {
    this._rootNode = buildDefaultLayout();
    this._saveLayout();
  }

  // ── Drag-and-dock overlay ─────────────────────────────────────

  _drawDockOverlay() {
    const R = this._renderer;
    const cw = this._charW, ch = this._charH;
    const dragWinId = this._dockDragging?.windowId;
    if (!dragWinId) return;

    const win = this._windowMap[dragWinId];
    if (!win) return;
    const [ar, ag, ab] = win.accentCol;

    // Draw ghost title bar following mouse
    const ghostW = (win.title.length + 4) * cw;
    const ghostH = ch;
    const gx = this._dockDragPos.x - ghostW / 2;
    const gy = this._dockDragPos.y - ghostH / 2;
    R.fillRect(gx, gy, ghostW, ghostH, ar * 0.4, ag * 0.4, ab * 0.4, 0.85);
    R.fillRect(gx, gy + ghostH - 1, ghostW, 1, ar, ag, ab, 0.9);
    // Ghost title text — use pixel coords → grid coords
    const ghostCol = Math.round(gx / cw);
    const ghostRow = Math.round(gy / ch);
    R.drawText(ghostCol + 2, ghostRow, win.title, 1, 1, 1, 0.9);

    // Draw drop zone highlight on target panel
    const dt = this._dockDropTarget;
    if (!dt || dt.windowId === dragWinId) return;

    const targetWin = this._windowMap[dt.windowId];
    if (!targetWin) return;

    const tx = targetWin.col * cw;
    const ty = targetWin.row * ch;
    const tw = targetWin.cols * cw;
    const th = targetWin.rows * ch;

    let zx, zy, zw, zh;
    switch (dt.zone) {
      case "left":
        zx = tx; zy = ty; zw = tw * 0.4; zh = th;
        break;
      case "right":
        zx = tx + tw * 0.6; zy = ty; zw = tw * 0.4; zh = th;
        break;
      case "top":
        zx = tx; zy = ty; zw = tw; zh = th * 0.4;
        break;
      case "bottom":
        zx = tx; zy = ty + th * 0.6; zw = tw; zh = th * 0.4;
        break;
      case "center":
        zx = tx; zy = ty; zw = tw; zh = th;
        break;
      default:
        return;
    }

    // Highlight fill
    R.fillRect(zx, zy, zw, zh, ar * 0.5, ag * 0.5, ab * 0.5, 0.3);
    // Border
    const b = 2;
    R.fillRect(zx, zy, zw, b, ar, ag, ab, 0.8);               // top
    R.fillRect(zx, zy + zh - b, zw, b, ar, ag, ab, 0.8);      // bottom
    R.fillRect(zx, zy, b, zh, ar, ag, ab, 0.8);                // left
    R.fillRect(zx + zw - b, zy, b, zh, ar, ag, ab, 0.8);      // right

    // Zone label
    const label = dt.zone === "center" ? "TAB" : dt.zone.toUpperCase();
    const labelCol = Math.round((zx + zw / 2) / cw) - Math.floor(label.length / 2);
    const labelRow = Math.round((zy + zh / 2) / ch);
    R.drawText(labelCol, labelRow, label, 1, 1, 1, 0.7);
  }

  // ── Window frame ───────────────────────────────────────────────

  _drawWindowFrame(win) {
    const R = this._renderer;
    const cw = this._charW, ch = this._charH;
    const x = win.col * cw, y = win.row * ch;
    const w = win.cols * cw, h = win.rows * ch;
    const [ar, ag, ab] = win.accentCol;

    // Background
    R.fillRect(x, y, w, h, ...C.BG, WIN_BG_ALPHA);

    // Borders (1px lines)
    R.fillRect(x, y, w, 1, ar * 0.7, ag * 0.7, ab * 0.7, WIN_BORDER_ALPHA);
    R.fillRect(x, y + h - 1, w, 1, ar * 0.3, ag * 0.3, ab * 0.3, WIN_BORDER_ALPHA);
    R.fillRect(x, y, 1, h, ar * 0.5, ag * 0.5, ab * 0.5, WIN_BORDER_ALPHA);
    R.fillRect(x + w - 1, y, 1, h, ar * 0.5, ag * 0.5, ab * 0.5, WIN_BORDER_ALPHA);

    // Title bar bg — brighter when focused
    const focused = this._focusedWindow === win;
    const tbMul = focused ? 0.35 : 0.15;
    const tbAlpha = focused ? 1.0 : 0.97;
    R.fillRect(x, y, w, ch, ar * tbMul, ag * tbMul, ab * tbMul, tbAlpha);
    // Accent line under title — full brightness when focused
    const lineMul = focused ? 1.0 : 0.6;
    R.fillRect(x, y + ch - 1, w, 1, ar * lineMul, ag * lineMul, ab * lineMul, 0.9);

    // Title text (centred) — full white when focused
    const tx = win.col + Math.floor((win.cols - win.title.length) / 2);
    if (focused) {
      R.drawText(tx, win.row, win.title, 1, 1, 1);
    } else {
      R.drawText(tx, win.row, win.title, ar, ag, ab);
    }
  }

  // ── Tab bar drawing ──────────────────────────────────────────────

  _drawTabBar(tabsNode, activeWin) {
    const R = this._renderer;
    const cw = this._charW, ch = this._charH;
    const x = activeWin.col * cw, y = activeWin.row * ch;
    const w = activeWin.cols * cw, h = activeWin.rows * ch;
    const [ar, ag, ab] = activeWin.accentCol;

    // Background
    R.fillRect(x, y, w, h, ...C.BG, WIN_BG_ALPHA);

    // Borders
    R.fillRect(x, y, w, 1, ar * 0.7, ag * 0.7, ab * 0.7, WIN_BORDER_ALPHA);
    R.fillRect(x, y + h - 1, w, 1, ar * 0.3, ag * 0.3, ab * 0.3, WIN_BORDER_ALPHA);
    R.fillRect(x, y, 1, h, ar * 0.5, ag * 0.5, ab * 0.5, WIN_BORDER_ALPHA);
    R.fillRect(x + w - 1, y, 1, h, ar * 0.5, ag * 0.5, ab * 0.5, WIN_BORDER_ALPHA);

    // Tab bar background
    const focused = this._focusedWindow === activeWin;
    R.fillRect(x, y, w, ch, ...C.DARK_GREY, 0.95);

    // Draw individual tabs
    let tabX = x;
    for (let i = 0; i < tabsNode.windowIds.length; i++) {
      const wid = tabsNode.windowIds[i];
      const tabWin = this._windowMap[wid];
      if (!tabWin) continue;

      const isActive = (i === tabsNode.activeIndex);
      const [tr, tg, tb] = tabWin.accentCol;
      const label = " " + tabWin.title + " ";
      const tabW = label.length * cw;

      // Tab background
      if (isActive) {
        const tbMul = focused ? 0.35 : 0.20;
        R.fillRect(tabX, y, tabW, ch, tr * tbMul, tg * tbMul, tb * tbMul, 1.0);
        // Active accent line under tab
        const lineMul = focused ? 1.0 : 0.7;
        R.fillRect(tabX, y + ch - 1, tabW, 1, tr * lineMul, tg * lineMul, tb * lineMul, 0.9);
      } else {
        R.fillRect(tabX, y, tabW, ch, ...C.BG, 0.95);
        // Dim accent dot
        R.fillRect(tabX, y + ch - 1, tabW, 1, tr * 0.25, tg * 0.25, tb * 0.25, 0.6);
      }

      // Tab separator
      if (i > 0) {
        R.fillRect(tabX, y + 2, 1, ch - 4, ...C.BORDER, 0.5);
      }

      // Tab text
      const tabCol = Math.round(tabX / cw);
      if (isActive && focused) {
        R.drawText(tabCol, activeWin.row, label, 1, 1, 1);
      } else if (isActive) {
        R.drawText(tabCol, activeWin.row, label, tr, tg, tb);
      } else {
        R.drawText(tabCol, activeWin.row, label, tr * 0.5, tg * 0.5, tb * 0.5, 0.7);
      }

      // Register tab click area as a button
      this._buttons.push({
        x: tabX, y: y, w: tabW, h: ch,
        action: { type: "switchTab", tabsNode, index: i },
      });

      tabX += tabW;
    }
  }

  // ── Clipped drawing helpers ─────────────────────────────────────
  // All content rendering must go through these to prevent overflow.

  // Returns true if the given grid row is within the window's content area
  _rowVisible(win, gridRow) {
    return gridRow >= win.row + TITLE_H && gridRow < win.row + win.rows;
  }

  // Draw text only if the row is within the window
  _clipText(win, col, row, text, r, g, b, a = 1) {
    if (!this._rowVisible(win, row)) return;
    // Truncate text that would overflow the right edge
    const maxChars = (win.col + win.cols) - col;
    if (maxChars <= 0) return;
    if (text.length > maxChars) text = text.substring(0, maxChars);
    this._renderer.drawText(col, row, text, r, g, b, a);
  }

  // Fill a grid rect clipped to the window bounds
  _clipFillGrid(win, col, row, cols, rows, r, g, b, a = 1) {
    const cw = this._charW, ch = this._charH;
    const winPxL = win.col * cw;
    const winPxT = win.row * ch;
    const winPxR = (win.col + win.cols) * cw;
    const winPxB = (win.row + win.rows) * ch;

    let px = col * cw, py = row * ch;
    let pw = cols * cw, ph = rows * ch;

    // Clip
    if (px < winPxL) { pw -= (winPxL - px); px = winPxL; }
    if (py < winPxT) { ph -= (winPxT - py); py = winPxT; }
    if (px + pw > winPxR) pw = winPxR - px;
    if (py + ph > winPxB) ph = winPxB - py;
    if (pw <= 0 || ph <= 0) return;

    this._renderer.fillRect(px, py, pw, ph, r, g, b, a);
  }

  // Fill a pixel rect clipped to the window bounds
  _clipFillRect(win, x, y, w, h, r, g, b, a = 1) {
    const cw = this._charW, ch = this._charH;
    const winPxL = win.col * cw;
    const winPxT = win.row * ch;
    const winPxR = (win.col + win.cols) * cw;
    const winPxB = (win.row + win.rows) * ch;

    if (x < winPxL) { w -= (winPxL - x); x = winPxL; }
    if (y < winPxT) { h -= (winPxT - y); y = winPxT; }
    if (x + w > winPxR) w = winPxR - x;
    if (y + h > winPxB) h = winPxB - y;
    if (w <= 0 || h <= 0) return;

    this._renderer.fillRect(x, y, w, h, r, g, b, a);
  }

  // Separator line within a window (clipped)
  _hline(win, localRow) {
    const row = win.row + localRow;
    if (!this._rowVisible(win, row)) return;
    const [ar, ag, ab] = win.accentCol;
    const x = win.col * this._charW;
    const y = row * this._charH + Math.floor(this._charH / 2);
    this._clipFillRect(win, x + 2, y, win.cols * this._charW - 4, 1, ar * 0.4, ag * 0.4, ab * 0.4, 0.8);
  }

  // ── Disassembly ────────────────────────────────────────────────

  _drawDisasm(win) {
    const data = this._disasmData;
    if (!data || data.length < 40) return;

    const p = this._proxy;
    const pc = p ? p.getPC() : 0;
    const paused = p && p.isPaused();
    const col = win.col + 1;
    const contentRows = win.rows - TITLE_H - 4; // room for controls + status
    if (contentRows <= 0) return;
    const y0 = win.row + TITLE_H;

    // Parse instructions — data is already centred on PC from disassembleAroundPC.
    // PC instruction is at index this._disasmRowsBefore.
    const instructions = [];
    let offset = 0;
    while (offset + 40 <= data.length) {
      const addr = data[offset] | (data[offset + 1] << 8);
      const len = data[offset + 2];
      const bytes = [];
      for (let j = 0; j < len && j < 4; j++) bytes.push(data[offset + 3 + j]);
      const mnLen = data[offset + 7];
      let mnemonic = "";
      for (let j = 0; j < mnLen; j++) mnemonic += String.fromCharCode(data[offset + 8 + j]);
      instructions.push({ addr, bytes, mnemonic });
      offset += 40;
    }

    for (let i = 0; i < contentRows; i++) {
      if (i >= instructions.length) break;
      const ins = instructions[i];
      const y = y0 + i;

      if (!this._rowVisible(win, y)) continue;
      const isPC = (i === this._disasmRowsBefore);

      // Alternating row background
      if (i % 2 === 1) {
        this._clipFillGrid(win, win.col, y, win.cols, 1, ...C.ROW_ALT, 0.4);
      }

      // PC highlight bar
      if (isPC) {
        this._clipFillGrid(win, win.col, y, win.cols, 1, 0.0, 0.25, 0.30, 0.7);
      }

      // PC arrow
      this._clipText(win, col, y, isPC ? ">" : " ", ...(isPC ? C.YELLOW : C.WHITE));

      // Address
      this._clipText(win, col + 1, y, "$" + hex16(ins.addr), ...C.CYAN);

      // Raw bytes
      let byteStr = "";
      for (const b of ins.bytes) byteStr += hex8(b) + " ";
      this._clipText(win, col + 7, y, byteStr.padEnd(12), ...C.MID_GREY);

      // Mnemonic with syntax colouring
      const sp = ins.mnemonic.indexOf(" ");
      const opcode = sp >= 0 ? ins.mnemonic.substring(0, sp) : ins.mnemonic;
      const operands = sp >= 0 ? ins.mnemonic.substring(sp) : "";

      // Colour by instruction class
      let opcodeCol = C.GREEN;
      if (/^(JP|JR|CALL|RET|RETI|RETN|RST|DJNZ)/.test(opcode)) opcodeCol = C.YELLOW;
      else if (/^(PUSH|POP|LD|EX|EXX|LDI|LDD|LDIR|LDDR)/.test(opcode)) opcodeCol = C.CYAN;
      else if (/^(IN|OUT|INI|IND|INIR|INDR|OUTI|OUTD|OTIR|OTDR)/.test(opcode)) opcodeCol = C.MAGENTA;
      else if (/^(DI|EI|IM|HALT|NOP|SCF|CCF)/.test(opcode)) opcodeCol = C.RED;

      this._clipText(win, col + 19, y, opcode, ...opcodeCol);
      if (operands) this._clipText(win, col + 19 + opcode.length, y, operands, ...C.WHITE);
    }

    // ── Separator ──
    this._hline(win, win.rows - 4);

    // ── Control buttons ──
    const btnY = win.row + win.rows - 3;
    if (this._rowVisible(win, btnY)) {
      let btnX = col;
      this._drawButton(btnX, btnY, paused ? " RUN  " : "PAUSE ", paused ? C.GREEN : C.YELLOW, "toggle-pause"); btnX += 7;
      this._drawButton(btnX, btnY, " STEP ", C.CYAN, "step"); btnX += 7;
      this._drawButton(btnX, btnY, " OVER ", C.CYAN, "step-over"); btnX += 7;
      this._drawButton(btnX, btnY, " OUT  ", C.CYAN, "step-out"); btnX += 7;
      this._drawButton(btnX, btnY, " NMI  ", C.RED, "nmi");
    }

    // ── Status line ──
    const statY = win.row + win.rows - 2;
    if (this._rowVisible(win, statY)) {
      const statCol = paused ? C.YELLOW : C.GREEN;
      this._clipText(win, col, statY, paused ? "PAUSED " : "RUNNING", ...statCol, 0.9);
      this._clipText(win, col + 8, statY, "PC=$" + hex16(pc), ...C.CYAN, 0.8);
      this._clipText(win, col + 18, statY, "SP=$" + hex16(this._proxy.getSP()), ...C.DIM_CYAN, 0.85);
    }
  }

  // ── Registers ──────────────────────────────────────────────────

  _drawRegisters(win) {
    const p = this._proxy;
    if (!p) return;

    const col = win.col + 1;
    let y = win.row + TITLE_H;
    const c2 = col + 4;
    const c3 = col + 14;
    const c4 = col + 19;

    const pairs = [
      ["AF", p.getAF(), "AF'", p.getAltAF(), "AF", "AF2"],
      ["BC", p.getBC(), "BC'", p.getAltBC(), "BC", "BC2"],
      ["DE", p.getDE(), "DE'", p.getAltDE(), "DE", "DE2"],
      ["HL", p.getHL(), "HL'", p.getAltHL(), "HL", "HL2"],
    ];

    for (const [n1, v1, n2, v2, rn1, rn2] of pairs) {
      if (this._rowVisible(win, y)) {
        this._clipText(win, col, y, n1 + ":", ...C.DIM_CYAN);
        this._clipText(win, c2, y, hex16(v1), ...this._regColor(rn1));
        this._clipText(win, c3, y, n2 + ":", ...C.DIM_CYAN);
        this._clipText(win, c4, y, hex16(v2), ...this._regColor(rn2));
      }
      y++;
    }

    this._hline(win, y - win.row); y++;
    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "IX:", ...C.DIM_CYAN);
      this._clipText(win, c2, y, hex16(p.getIX()), ...this._regColor("IX"));
      this._clipText(win, c3, y, "SP:", ...C.DIM_CYAN);
      this._clipText(win, c4, y, hex16(p.getSP()), ...this._regColor("SP"));
    }
    y++;
    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "IY:", ...C.DIM_CYAN);
      this._clipText(win, c2, y, hex16(p.getIY()), ...this._regColor("IY"));
      this._clipText(win, c3, y, "PC:", ...C.DIM_CYAN);
      this._clipText(win, c4, y, hex16(p.getPC()), ...this._regColor("PC"));
    }
    y++;

    this._hline(win, y - win.row); y++;
    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "I:", ...C.DIM_CYAN);
      this._clipText(win, col + 3, y, hex8(p.getI()), ...this._regColor("I"));
      this._clipText(win, col + 7, y, "R:", ...C.DIM_CYAN);
      this._clipText(win, col + 10, y, hex8(p.getR()), ...this._regColor("R"));
      this._clipText(win, col + 14, y, "IM:", ...C.DIM_CYAN);
      this._clipText(win, col + 18, y, String(p.getIM()), ...C.WHITE);
      this._clipText(win, col + 21, y, "IFF:", ...C.DIM_CYAN);
      this._clipText(win, col + 26, y, p.getIFF1() ? "EI" : "DI", ...(p.getIFF1() ? C.GREEN : C.RED));
    }
    y++;

    this._hline(win, y - win.row); y++;
    if (this._rowVisible(win, y)) {
      const f = p.getAF() & 0xFF;
      const flagDefs = [
        { name: "S", bit: 7 }, { name: "Z", bit: 6 }, { name: "5", bit: 5 },
        { name: "H", bit: 4 }, { name: "3", bit: 3 }, { name: "P", bit: 2 },
        { name: "N", bit: 1 }, { name: "C", bit: 0 },
      ];
      let fx = col;
      this._clipText(win, fx, y, "FLAGS:", ...C.DIM_CYAN);
      fx += 7;
      for (const fd of flagDefs) {
        const isSet = (f >> fd.bit) & 1;
        const px = fx * this._charW;
        const py = y * this._charH;
        const sz = this._charH - 2;
        this._clipFillRect(win, px, py + 1, sz, sz, ...(isSet ? [0.0, 0.8, 0.0, 1] : [0.15, 0.15, 0.15, 1]));
        this._clipText(win, fx, y, fd.name, ...(isSet ? C.WHITE : C.MID_GREY));
        fx += 2;
      }
      this._clipText(win, fx + 1, y, "%" + bin8(f), ...C.YELLOW);
    }
    y++;

    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "T:", ...C.DIM_CYAN);
      this._clipText(win, col + 3, y, String(p.getTStates()).padStart(6), ...C.WHITE);
      this._clipText(win, col + 11, y, "LINE:", ...C.DIM_CYAN);
      const line = Math.floor(p.getTStates() / 224);
      this._clipText(win, col + 17, y, String(line).padStart(3), ...C.WHITE);
    }

    y++;
    if (this._rowVisible(win, y)) {
      const a = (p.getAF() >> 8) & 0xFF;
      this._clipText(win, col, y, "A:", ...C.DIM_CYAN);
      this._clipText(win, col + 3, y, hex8(a), ...this._regColor("AF"));
      this._clipText(win, col + 6, y, "%" + bin8(a), ...C.DIM_WHITE);
      this._clipText(win, col + 16, y, String(a).padStart(3), ...C.DIM_WHITE);
      this._clipText(win, col + 20, y, "'" + (a >= 32 && a <= 126 ? String.fromCharCode(a) : ".") + "'", ...C.GREEN);
    }
  }

  // ── Hex Dump ───────────────────────────────────────────────────

  _drawHexDump(win) {
    if (!this._hexData) return;

    const col = win.col + 1;
    const bytesPerRow = 16;
    const contentRows = win.rows - TITLE_H - 1;
    if (contentRows <= 0) return;
    const y0 = win.row + TITLE_H;
    const data = this._hexData;
    const pc = this._proxy ? this._proxy.getPC() : -1;
    const sp = this._proxy ? this._proxy.getSP() : -1;

    for (let r = 0; r < contentRows; r++) {
      const addr = this._hexBaseAddr + r * bytesPerRow;
      if (r * bytesPerRow >= data.length) break;
      const y = y0 + r;
      if (!this._rowVisible(win, y)) continue;

      if (r % 2 === 1) this._clipFillGrid(win, win.col, y, win.cols, 1, ...C.ROW_ALT, 0.3);

      this._clipText(win, col, y, "$" + hex16(addr) + ":", ...C.CYAN);

      let ascii = "";
      for (let b = 0; b < bytesPerRow; b++) {
        const off = r * bytesPerRow + b;
        if (off >= data.length) break;
        const val = data[off];
        const byteAddr = addr + b;
        const xOff = 7 + b * 3 + (b >= 8 ? 1 : 0);

        let byteCol = val === 0 ? C.MID_GREY : C.WHITE;
        if (byteAddr === pc) byteCol = C.YELLOW;
        else if (byteAddr === sp) byteCol = C.RED;

        this._clipText(win, col + xOff, y, hex8(val), ...byteCol);
        ascii += (val >= 0x20 && val <= 0x7E) ? String.fromCharCode(val) : ".";
      }
      this._clipText(win, col + 7 + bytesPerRow * 3 + 2, y, ascii, ...C.DIM_GREEN);
    }

    const hintY = win.row + win.rows - 1;
    if (this._rowVisible(win, hintY)) {
      this._clipText(win, col, hintY, "$" + hex16(this._hexBaseAddr) + " PgUp/PgDn Home/End", ...C.MID_GREY, 0.7);
    }
  }

  // ── Stack ──────────────────────────────────────────────────────

  _drawStack(win) {
    const p = this._proxy;
    if (!p || !this._stackData) return;

    const col = win.col + 1;
    const sp = p.getSP();
    const data = this._stackData;
    let y = win.row + TITLE_H;
    const maxY = win.row + win.rows - 1;

    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "SP=$" + hex16(sp), ...C.CYAN);
      this._clipText(win, col + 10, y, "(" + (0x10000 - sp) + ")", ...C.MID_GREY);
    }
    y++;
    this._hline(win, y - win.row);
    y++;

    for (let i = 0; i + 1 < data.length && y < maxY; i += 2) {
      if (this._rowVisible(win, y)) {
        const addr = (sp + i) & 0xFFFF;
        const word = data[i] | (data[i + 1] << 8);
        const isTop = (i === 0);
        if (isTop) this._clipFillGrid(win, win.col, y, win.cols, 1, 0.0, 0.15, 0.0, 0.6);
        this._clipText(win, col, y, "$" + hex16(addr) + ":", ...C.DIM_CYAN);
        this._clipText(win, col + 7, y, "$" + hex16(word), ...(isTop ? C.GREEN : C.WHITE));
      }
      y++;
    }
  }

  // ── AY-3-8912 ─────────────────────────────────────────────────

  _drawAY(win) {
    const p = this._proxy;
    if (!p) return;

    const col = win.col + 1;
    let y = win.row + TITLE_H;
    const ayEnabled = p.isAYEnabled();

    if (!ayEnabled) {
      if (this._rowVisible(win, y)) this._clipText(win, col, y, "AY CHIP NOT ENABLED", ...C.MID_GREY);
      return;
    }

    const r = [];
    for (let i = 0; i < 16; i++) r.push(p._getAYRegister(i));

    const channels = [
      { name: "A", tone: r[0] | ((r[1] & 0x0F) << 8), vol: r[8] & 0x0F, env: !!(r[8] & 0x10), col: C.CYAN },
      { name: "B", tone: r[2] | ((r[3] & 0x0F) << 8), vol: r[9] & 0x0F, env: !!(r[9] & 0x10), col: C.GREEN },
      { name: "C", tone: r[4] | ((r[5] & 0x0F) << 8), vol: r[10] & 0x0F, env: !!(r[10] & 0x10), col: C.RED },
    ];

    const mixer = r[7];

    for (const ch of channels) {
      if (this._rowVisible(win, y)) {
        const freq = ch.tone > 0 ? AY_CLOCK / (16 * ch.tone) : 0;
        const note = freqToNote(freq);
        const toneOn = !(mixer & (ch.name === "A" ? 1 : ch.name === "B" ? 2 : 4));
        const noiseOn = !(mixer & (ch.name === "A" ? 8 : ch.name === "B" ? 16 : 32));

        this._clipText(win, col, y, "CH-" + ch.name, ...ch.col);
        this._clipText(win, col + 5, y, "T", ...(toneOn ? C.GREEN : C.DIM_RED));
        this._clipText(win, col + 6, y, "N", ...(noiseOn ? C.YELLOW : C.DIM_RED));

        const freqStr = freq > 0 ? Math.round(freq).toString().padStart(5) + "Hz" : "  ---  ";
        this._clipText(win, col + 8, y, freqStr, ...C.WHITE);
        this._clipText(win, col + 16, y, note.padStart(3), ...C.YELLOW);

        const barX = (col + 20) * this._charW;
        const barY = y * this._charH + 2;
        const barMaxW = 9 * this._charW;
        const barH = this._charH - 4;
        this._clipFillRect(win, barX, barY, barMaxW, barH, 0.1, 0.1, 0.1, 0.8);
        const fillW = ch.env ? barMaxW : (ch.vol / 15) * barMaxW;
        const [cr, cg, cb] = ch.col;
        this._clipFillRect(win, barX, barY, fillW, barH, cr * 0.7, cg * 0.7, cb * 0.7, 0.9);
        this._clipText(win, col + 20, y, ch.env ? "ENV" : String(ch.vol).padStart(2), ...(ch.env ? C.MAGENTA : C.WHITE));
      }
      y++;
    }

    this._hline(win, y - win.row); y++;

    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "NOISE:", ...C.DIM_CYAN);
      this._clipText(win, col + 7, y, String(r[6] & 0x1F).padStart(2), ...C.WHITE);
      const noiseFreq = (r[6] & 0x1F) > 0 ? AY_CLOCK / (16 * (r[6] & 0x1F)) : 0;
      this._clipText(win, col + 11, y, noiseFreq > 0 ? Math.round(noiseFreq) + "Hz" : "---", ...C.MID_GREY);
    }
    y++;

    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "ENV:  ", ...C.DIM_CYAN);
      const envPeriod = r[11] | (r[12] << 8);
      const envFreq = envPeriod > 0 ? AY_CLOCK / (256 * envPeriod) : 0;
      this._clipText(win, col + 6, y, "P=" + String(envPeriod).padStart(5), ...C.WHITE);
      this._clipText(win, col + 14, y, envFreq > 0 ? Math.round(envFreq * 10) / 10 + "Hz" : "---", ...C.MID_GREY);
    }
    y++;

    if (this._rowVisible(win, y)) {
      const envShape = r[13] & 0x0F;
      const shapes = [
        "\\___","\\___","\\___","\\___",
        "/___","/___","/___","/___",
        "\\\\\\\\","\\___","\\/\\/","\\^^",
        "////","/^^^","/\\/\\","/___",
      ];
      this._clipText(win, col, y, "SHAPE:", ...C.DIM_CYAN);
      this._clipText(win, col + 7, y, String(envShape).padStart(2), ...C.WHITE);
      this._clipText(win, col + 10, y, shapes[envShape] || "????", ...C.MAGENTA);
    }

    const internals = p.getAYInternals();
    if (internals) {
      y++;
      if (this._rowVisible(win, y)) {
        this._clipText(win, col, y, "LFSR:", ...C.DIM_CYAN);
        this._clipText(win, col + 6, y, "$" + (internals.noiseLFSR & 0xFFFF).toString(16).toUpperCase().padStart(4, "0"), ...C.MID_GREY);
      }
    }

  }

  // ── Memory Map ─────────────────────────────────────────────────

  _drawMemMap(win) {
    const p = this._proxy;
    const col = win.col;
    const cw = this._charW;
    const ch = this._charH;
    const contentTop = (win.row + TITLE_H) * ch;
    const contentBot = (win.row + win.rows) * ch;
    const legendRows = 2; // legend + markers legend
    const stripW = win.cols * cw - 4;
    const stripX = col * cw + 2;

    // Strip grows to fill available height minus legend
    const availH = contentBot - contentTop - legendRows * ch;
    const stripH = Math.max(ch, availH);
    const stripY = contentTop;

    // Draw strip background (clipped)
    this._clipFillRect(win, stripX, stripY, stripW, stripH, 0.05, 0.05, 0.05, 0.9);

    // Draw coloured region blocks
    for (const region of MEM_REGIONS) {
      const x0 = stripX + (region.start / 0x10000) * stripW;
      const x1 = stripX + ((region.end + 1) / 0x10000) * stripW;
      const [cr, cg, cb] = region.col;
      this._clipFillRect(win, x0, stripY, x1 - x0, stripH, cr * 0.5, cg * 0.5, cb * 0.5, 0.8);
      this._clipFillRect(win, x0, stripY, 1, stripH, cr * 0.8, cg * 0.8, cb * 0.8, 0.9);
    }

    // PC marker
    if (p) {
      const pc = p.getPC();
      const pcX = stripX + (pc / 0x10000) * stripW;
      this._clipFillRect(win, pcX - 1, stripY, 3, stripH, 1, 1, 0, 1);
    }

    // SP marker
    if (p) {
      const sp = p.getSP();
      const spX = stripX + (sp / 0x10000) * stripW;
      this._clipFillRect(win, spX - 1, stripY, 3, stripH, 1, 0, 0, 1);
    }

    // Hex view range box
    const hexWin = this._windows.find(w => w.id === "hex");
    const hexVisibleBytes = hexWin ? (hexWin.rows - TITLE_H - 1) * 16 : 256;
    const hvX0 = stripX + (this._hexBaseAddr / 0x10000) * stripW;
    const hvX1 = stripX + ((this._hexBaseAddr + hexVisibleBytes) / 0x10000) * stripW;
    const hvW = Math.max(hvX1 - hvX0, 2);
    const bw = 1;
    this._clipFillRect(win, hvX0, stripY,            hvW, bw,       1, 1, 1, 0.9);
    this._clipFillRect(win, hvX0, stripY + stripH - bw, hvW, bw,    1, 1, 1, 0.9);
    this._clipFillRect(win, hvX0, stripY,            bw,  stripH,    1, 1, 1, 0.9);
    this._clipFillRect(win, hvX0 + hvW - bw, stripY, bw,  stripH,   1, 1, 1, 0.9);

    // Legend row
    const legendY = win.row + win.rows - 2;
    if (this._rowVisible(win, legendY)) {
      let lx = col + 1;
      for (const region of MEM_REGIONS) {
        const [cr, cg, cb] = region.col;
        const px = lx * cw;
        const py = legendY * ch + 2;
        this._clipFillRect(win, px, py, cw - 2, ch - 4, cr * 0.7, cg * 0.7, cb * 0.7, 1);
        this._clipText(win, lx + 1, legendY, region.name, ...region.col, 0.85);
        lx += region.name.length + 2;
      }
    }

    // Markers legend
    const mkY = win.row + win.rows - 1;
    if (this._rowVisible(win, mkY)) {
      this._clipText(win, col + 1, mkY, "PC", ...C.YELLOW, 0.8);
      this._clipText(win, col + 4, mkY, "SP", ...C.RED, 0.8);
      this._clipText(win, col + 7, mkY, "HEX VIEW", ...C.DIM_WHITE, 0.7);
    }
  }

  // ── Status ─────────────────────────────────────────────────────

  _drawStatus(win) {
    const p = this._proxy;
    if (!p) return;

    const col = win.col + 1;
    let y = win.row + TITLE_H;

    if (this._rowVisible(win, y)) {
      const machineId = p.getMachineId();
      const machineName = MACHINE_NAMES[machineId] || "Unknown";
      this._clipText(win, col, y, "MACHINE:", ...C.DIM_CYAN);
      this._clipText(win, col + 9, y, machineName, ...C.WHITE);
    }
    y++;

    if (this._rowVisible(win, y)) {
      const machineId = p.getMachineId();
      if (machineId >= 1 && machineId <= 4) {
        const paging = p.getPagingRegister();
        this._clipText(win, col, y, "PAGING:", ...C.DIM_CYAN);
        this._clipText(win, col + 8, y, "$" + hex8(paging), ...C.WHITE);
        this._clipText(win, col + 12, y, "BANK:" + (paging & 7), ...C.DIM_WHITE);
        this._clipText(win, col + 20, y, "SCR:" + ((paging & 8) ? 7 : 5), ...C.DIM_WHITE);
        this._clipText(win, col + 27, y, (paging & 0x20) ? "LOCKED" : "", ...C.RED);
      }
    }
    y++;

    this._hline(win, y - win.row); y++;
    if (this._rowVisible(win, y)) {
      const tapeLoaded = p.tapeIsLoaded();
      const tapePlaying = p.tapeIsPlaying();
      const tapeRec = p.tapeIsRecording();
      this._clipText(win, col, y, "TAPE:", ...C.DIM_CYAN);
      if (!tapeLoaded) {
        this._clipText(win, col + 6, y, "NO TAPE", ...C.MID_GREY);
      } else {
        const state = tapeRec ? "REC" : tapePlaying ? "PLAY" : "STOP";
        const stateCol = tapeRec ? C.RED : tapePlaying ? C.GREEN : C.MID_GREY;
        this._clipText(win, col + 6, y, state, ...stateCol);
        this._clipText(win, col + 11, y, "BLK:" + p.tapeGetCurrentBlock() + "/" + p.tapeGetBlockCount(), ...C.WHITE);
        const prog = p.tapeGetBlockProgress() / 100;
        const barX = (col + 22) * this._charW;
        const barY2 = y * this._charH + 2;
        const barW = 20 * this._charW;
        const barH2 = this._charH - 4;
        this._clipFillRect(win, barX, barY2, barW, barH2, 0.1, 0.1, 0.1, 0.7);
        this._clipFillRect(win, barX, barY2, barW * prog, barH2, 0.0, 0.6, 0.0, 0.8);
      }
    }
    y++;

    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "BRK:", ...C.DIM_CYAN);
      if (p.isBreakpointHit()) {
        this._clipText(win, col + 5, y, "HIT @ $" + hex16(p.getBreakpointAddress()), ...C.RED);
      } else {
        this._clipText(win, col + 5, y, "---", ...C.MID_GREY);
      }
      this._clipText(win, col + 20, y, "T:" + String(p.getTStates()).padStart(6), ...C.DIM_WHITE);
    }
    y++;

    this._hline(win, y - win.row); y++;
    if (this._rowVisible(win, y)) {
      this._clipText(win, col, y, "INPUT:", ...C.DIM_CYAN);
      if (this._emuFocused) {
        this._clipText(win, col + 7, y, "SPECTRUM", ...C.GREEN);
        this._clipText(win, col + 17, y, "(click window for debugger)", ...C.MID_GREY, 0.7);
      } else {
        this._clipText(win, col + 7, y, "DEBUGGER", ...C.YELLOW);
        this._clipText(win, col + 17, y, "(click screen for spectrum)", ...C.MID_GREY, 0.7);
      }
    }
    y++;

    if (this._rowVisible(win, y)) this._clipText(win, col, y, "` ESC:CLOSE  SPC:PAUSE  N:OVER  F11:STEP", ...C.MID_GREY, 0.7);
    y++;
    if (this._rowVisible(win, y)) this._clipText(win, col, y, "SHIFT+F11:OUT  PGUP/DN:HEX  CMD+R:RESET LAYOUT", ...C.MID_GREY, 0.7);
    y++;
    if (this._rowVisible(win, y)) this._clipText(win, col, y, "DRAG TITLE BAR TO DOCK WINDOWS  DBL-CLICK DIVIDER:50/50", ...C.MID_GREY, 0.7);
  }

  // ── Button rendering ───────────────────────────────────────────

  _drawButton(col, row, label, accentCol, action) {
    const R = this._renderer;
    const [ar, ag, ab] = accentCol;
    const cw = this._charW, ch = this._charH;
    const x = col * cw, y = row * ch;
    const w = label.length * cw;

    // Background
    R.fillRectGrid(col, row, label.length, 1, ar * 0.12, ag * 0.12, ab * 0.12, 0.95);
    // Top/bottom accent
    R.fillRect(x, y, w, 1, ar * 0.5, ag * 0.5, ab * 0.5, 0.8);
    R.fillRect(x, y + ch - 1, w, 1, ar * 0.25, ag * 0.25, ab * 0.25, 0.6);
    // Label
    R.drawText(col, row, label, ar, ag, ab);

    // Hit area
    this._buttons.push({ x, y, w, h: ch, action });
  }

  // ── Mouse handling ─────────────────────────────────────────────

  _screenToCanvas(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * this._dpr,
      y: (clientY - rect.top) * this._dpr,
    };
  }

  _setEmuFocus(focused) {
    if (this._emuFocused === focused) return;
    this._emuFocused = focused;
    const ih = this._emulator.inputHandler;
    if (ih) ih.setEnabled(focused);
  }

  _handleMouseDown(e) {
    const pos = this._screenToCanvas(e.clientX, e.clientY);

    // 1. Button clicks first — but for tab buttons, also set up dock drag
    for (const btn of this._buttons) {
      if (pos.x >= btn.x && pos.x < btn.x + btn.w &&
          pos.y >= btn.y && pos.y < btn.y + btn.h) {
        this._setEmuFocus(false);

        if (btn.action && btn.action.type === "switchTab") {
          // Switch tab immediately, but also set up dock drag on this tab
          this._executeAction(btn.action);
          const dragId = btn.action.tabsNode.windowIds[btn.action.index];
          if (dragId) {
            this._dockDragging = { windowId: dragId, startX: pos.x, startY: pos.y };
            this._dockDragActive = false;
            this._dockDragPos = { x: pos.x, y: pos.y };
          }
        } else {
          this._executeAction(btn.action);
        }
        return;
      }
    }

    // 2. Divider grab
    const divNode = this._findDividerAtPos(this._rootNode, pos.x, pos.y);
    if (divNode) {
      this._draggingDivider = divNode;
      this._setEmuFocus(false);
      return;
    }

    // 3. Panel click
    const leaf = this._findLeafAtPos(this._rootNode, pos.x, pos.y);
    if (leaf) {
      const activeId = nodeActiveId(leaf);
      const win = this._windowMap[activeId];
      if (activeId === "screen") {
        this._focusedWindow = win;
        this._setEmuFocus(true);
      } else if (win) {
        this._focusedWindow = win;
        this._setEmuFocus(false);
      }

      // Check if click is on title bar — start potential dock drag
      // (Tab bar drags are handled above in the button click section)
      if (win && leaf.type !== "tabs") {
        const cw = this._charW, ch = this._charH;
        const titleY = win.row * ch;
        if (pos.y >= titleY && pos.y < titleY + ch) {
          this._dockDragging = { windowId: activeId, startX: pos.x, startY: pos.y };
          this._dockDragActive = false;
          this._dockDragPos = { x: pos.x, y: pos.y };
        }
      }
      return;
    }

    // Click on empty space
    this._focusedWindow = null;
    this._setEmuFocus(false);
  }

  _handleMouseMove(e) {
    const pos = this._screenToCanvas(e.clientX, e.clientY);

    // Active dock drag
    if (this._dockDragging) {
      this._dockDragPos = { x: pos.x, y: pos.y };

      // Activate drag after moving 8 pixels from start
      if (!this._dockDragActive) {
        const dx = pos.x - this._dockDragging.startX;
        const dy = pos.y - this._dockDragging.startY;
        if (Math.sqrt(dx * dx + dy * dy) > 8) {
          this._dockDragActive = true;
          this._canvas.style.cursor = "grabbing";
        }
      }

      if (this._dockDragActive) {
        // Find drop target
        const leaf = this._findLeafAtPos(this._rootNode, pos.x, pos.y);
        const targetId = leaf ? nodeActiveId(leaf) : null;
        if (leaf && targetId !== this._dockDragging.windowId) {
          const targetWin = this._windowMap[targetId];
          if (targetWin) {
            const cw = this._charW, ch = this._charH;
            const zone = getDropZone(pos.x, pos.y,
              targetWin.col * cw, targetWin.row * ch,
              targetWin.cols * cw, targetWin.rows * ch);
            this._dockDropTarget = { windowId: targetId, zone };
          }
        } else {
          this._dockDropTarget = null;
        }
      }
      return;
    }

    // Active divider drag
    if (this._draggingDivider) {
      this._updateDividerRatio(this._draggingDivider, pos.x, pos.y);
      return;
    }

    // Track hover for scroll/key routing
    const leaf = this._findLeafAtPos(this._rootNode, pos.x, pos.y);
    this._hoverWindow = leaf ? (this._windowMap[nodeActiveId(leaf)] || null) : null;

    // Divider hover detection for cursor
    const divNode = this._findDividerAtPos(this._rootNode, pos.x, pos.y);
    this._hoveredDivider = divNode;
    if (divNode) {
      this._canvas.style.cursor = divNode._dividerAxis === "v" ? "col-resize" : "row-resize";
    } else {
      this._canvas.style.cursor = "default";
    }
  }

  _handleMouseUp() {
    // Complete a dock drag
    if (this._dockDragging && this._dockDragActive && this._dockDropTarget) {
      const srcId = this._dockDragging.windowId;
      const dt = this._dockDropTarget;

      // Detach source first, then insert at target (or into tabs for center)
      this._rootNode = detachLeaf(this._rootNode, srcId);
      this._rootNode = insertLeafAtTarget(this._rootNode, dt.windowId, srcId, dt.zone);
      this._saveLayout();
    }

    this._dockDragging = null;
    this._dockDragActive = false;
    this._dockDropTarget = null;
    this._canvas.style.cursor = "default";

    if (this._draggingDivider) {
      this._draggingDivider = null;
      this._saveLayout();
    }
  }

  _handleDblClick(e) {
    const pos = this._screenToCanvas(e.clientX, e.clientY);
    const divNode = this._findDividerAtPos(this._rootNode, pos.x, pos.y);
    if (divNode) {
      divNode.ratio = 0.5;
      this._saveLayout();
    }
  }

  _handleWheel(e) {
    // Scroll the memory hex dump when the mouse is over the hex window
    if (this._hoverWindow && this._hoverWindow.id === "hex") {
      e.preventDefault();
      const bytesPerRow = 16;
      const rows = e.deltaY > 0 ? 4 : -4;
      this._hexBaseAddr = Math.max(0, Math.min(0xFFF0, this._hexBaseAddr + rows * bytesPerRow));
      this._hexData = null;
    }
  }

  _executeAction(action) {
    // Object-style actions (tab switching, etc.)
    if (action && typeof action === "object") {
      switch (action.type) {
        case "switchTab":
          action.tabsNode.activeIndex = action.index;
          // Focus the newly active tab's window
          const activeId = action.tabsNode.windowIds[action.index];
          if (activeId) {
            const win = this._windowMap[activeId];
            if (win) {
              this._focusedWindow = win;
              this._setEmuFocus(activeId === "screen");
            }
          }
          this._saveLayout();
          break;
      }
      return;
    }

    const p = this._proxy;
    if (!p) return;
    switch (action) {
      case "toggle-pause":
        if (p.isPaused()) p.resume(); else p.pause();
        break;
      case "step":      if (p.isPaused()) p.step();     break;
      case "step-over": if (p.isPaused()) p.stepOver();  break;
      case "step-out":  if (p.isPaused()) p.stepOut();   break;
      case "nmi":       p.triggerNMI();                   break;
    }
  }

  // ── Keyboard handling ──────────────────────────────────────────

  _handleKeyDown(e) {
    // Backtick / Escape always close the debugger regardless of focus mode
    if (e.key === "Escape" || e.key === "`") {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }

    // When emulator has focus, forward keyboard to the Spectrum input handler.
    // The input handler is already enabled via _setEmuFocus(true), so it will
    // process keys directly from the document keydown event. We just need to
    // stop the debugger from also processing them.
    if (this._emuFocused) return;

    // ── Debugger shortcuts ──
    switch (e.key) {
      case " ":
        e.preventDefault();
        if (this._proxy) {
          if (this._proxy.isPaused()) this._proxy.resume();
          else this._proxy.pause();
        }
        break;

      case "F10":
      case "n":
        e.preventDefault();
        if (this._proxy?.isPaused()) this._proxy.stepOver();
        break;

      case "F11":
        e.preventDefault();
        if (this._proxy?.isPaused()) {
          if (e.shiftKey) this._proxy.stepOut();
          else this._proxy.step();
        }
        break;

      case "PageDown":
        e.preventDefault();
        this._hexBaseAddr = Math.min(0xFFF0, this._hexBaseAddr + 256);
        this._hexData = null;
        break;

      case "PageUp":
        e.preventDefault();
        this._hexBaseAddr = Math.max(0, this._hexBaseAddr - 256);
        this._hexData = null;
        break;

      case "Home":
        e.preventDefault();
        this._hexBaseAddr = 0;
        this._hexData = null;
        break;

      case "End":
        e.preventDefault();
        this._hexBaseAddr = 0xFF00;
        this._hexData = null;
        break;

      case "ArrowUp":
        if (this._hoverWindow?.id === "hex" || this._focusedWindow?.id === "hex") {
          e.preventDefault();
          this._hexBaseAddr = Math.max(0, this._hexBaseAddr - 16);
          this._hexData = null;
        }
        break;

      case "ArrowDown":
        if (this._hoverWindow?.id === "hex" || this._focusedWindow?.id === "hex") {
          e.preventDefault();
          this._hexBaseAddr = Math.min(0xFFF0, this._hexBaseAddr + 16);
          this._hexData = null;
        }
        break;

      case "r":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this._resetLayout();
        }
        break;
    }
  }

  _handleKeyUp(e) {
    // Backtick consumed on keydown; prevent repeat
    if (e.key === "`") {
      e.preventDefault();
      e.stopPropagation();
    }
    // When emulator focused, the input handler gets keyup directly — no action needed here
  }
}
