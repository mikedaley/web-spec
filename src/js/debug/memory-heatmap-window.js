/*
 * memory-heatmap-window.js - Memory Heat Map debug window
 *
 * Displays the full 64KB address space with two visualization modes:
 *   Bits     – 8-pixel bit patterns per byte (set=bright, clear=dark)
 *   Activity – change tracking with decay trails
 *
 * Features: zoom/pan, hex overlay at high zoom, minimap, region colouring,
 * configurable grid width (1–256), full state persistence.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/memory-heatmap.css";

// ── Constants ────────────────────────────────────────────────────
const BITS_PER_BYTE = 8;
const TOTAL_BYTES = 65536;
const MIN_WIDTH = 1;
const MAX_WIDTH = 256;
const DEFAULT_WIDTH = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 64;
const HEX_THRESHOLD_PX = 48;
const ZOOM_FACTOR = 1.08;
const FETCH_INTERVAL = 1000 / 60; // ~60fps memory reads
const DEFAULT_DECAY_RATE = 57; // higher = longer fade (inverted to decay rate internally)
const MIN_DECAY_RATE = 1;
const MAX_DECAY_RATE = 64;
const MINIMAP_MAX = 80;     // max minimap dimension in px

// ── Mode definitions ─────────────────────────────────────────────
const MODES = ["bits", "activity"];

const MODE_LABELS = {
  bits: "Bits",
  activity: "Activity",
};

// ── Memory region tables ─────────────────────────────────────────
const REGION_NONE = 0;

const SPECTRUM_REGIONS = [
  { start: 0x0000, end: 0x3FFF, label: "ROM",        cssVar: "--accent-blue"   },
  { start: 0x4000, end: 0x57FF, label: "Screen",      cssVar: "--accent-red"    },
  { start: 0x5800, end: 0x5AFF, label: "Attributes",  cssVar: "--accent-purple" },
  { start: 0x5B00, end: 0x5CB5, label: "Sys Vars",    cssVar: "--accent-orange" },
];

const SPECTRUM_128K_REGIONS = [
  ...SPECTRUM_REGIONS,
  { start: 0xC000, end: 0xFFFF, label: "Paged RAM",   cssVar: "--accent-blue"   },
];

const ZX81_REGIONS = [
  { start: 0x0000, end: 0x1FFF, label: "ROM",         cssVar: "--accent-blue"   },
  { start: 0x4000, end: 0x7FFF, label: "RAM",         cssVar: "--accent-green"  },
];

function regionsForMachine(machineId) {
  switch (machineId) {
    case 5:  return ZX81_REGIONS;
    case 1: case 2: case 3: case 4: return SPECTRUM_128K_REGIONS;
    default: return SPECTRUM_REGIONS;
  }
}

// ── Colour helpers ───────────────────────────────────────────────

function hexToRGB(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ];
}

function rgbToABGR(r, g, b) {
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

function cssToABGR(hex) {
  const [r, g, b] = hexToRGB(hex);
  return rgbToABGR(r, g, b);
}

function blendRGB(bg, fg, t) {
  return [
    Math.round(bg[0] + (fg[0] - bg[0]) * t),
    Math.round(bg[1] + (fg[1] - bg[1]) * t),
    Math.round(bg[2] + (fg[2] - bg[2]) * t),
  ];
}

// ── Pre-computed LUTs ────────────────────────────────────────────

/**
 * Build a 256-entry LUT from a list of gradient stops [{pos, col}].
 */
function buildGradientLUT(stops) {
  const lut = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let s0 = stops[0], s1 = stops[1];
    for (let s = 1; s < stops.length; s++) {
      if (stops[s].pos >= i) { s0 = stops[s-1]; s1 = stops[s]; break; }
    }
    const range = s1.pos - s0.pos || 1;
    const t = (i - s0.pos) / range;
    const rgb = blendRGB(s0.col, s1.col, t);
    lut[i] = rgbToABGR(rgb[0], rgb[1], rgb[2]);
  }
  return lut;
}

/**
 * Build read LUT: dark→cyan (stays saturated at peak)
 */
function buildReadLUT(style) {
  const cDark = [10, 10, 10];
  const cCyan = hexToRGB(style.getPropertyValue("--accent-blue").trim() || "#00FFFF");
  return buildGradientLUT([
    { pos: 0,   col: cDark },
    { pos: 255, col: cCyan },
  ]);
}

/**
 * Build write LUT: dark→red (stays saturated at peak)
 */
function buildWriteLUT(style) {
  const cDark = [10, 10, 10];
  const cRed  = hexToRGB(style.getPropertyValue("--accent-red").trim() || "#FF0000");
  return buildGradientLUT([
    { pos: 0,   col: cDark },
    { pos: 255, col: cRed  },
  ]);
}

/**
 * Build read+write LUT: dark→magenta (stays saturated at peak)
 */
function buildReadWriteLUT(style) {
  const cDark    = [10, 10, 10];
  const cMagenta = hexToRGB(style.getPropertyValue("--accent-purple").trim() || "#FF00FF");
  return buildGradientLUT([
    { pos: 0,   col: cDark    },
    { pos: 255, col: cMagenta },
  ]);
}

// ═════════════════════════════════════════════════════════════════
//  MemoryHeatmapWindow
// ═════════════════════════════════════════════════════════════════

export class MemoryHeatmapWindow extends BaseWindow {
  constructor() {
    super({
      id: "memory-heatmap",
      title: "Memory Heat Map",
      minWidth: 200,
      minHeight: 200,
      defaultWidth: 320,
      defaultHeight: 360,
      defaultPosition: { x: 100, y: 100 },
    });

    // Canvas refs
    this._canvas = null;
    this._ctx = null;
    this._container = null;
    this._tooltip = null;
    this._zoomInfo = null;
    this._statusAddr = null;
    this._widthInput = null;

    // Mode
    this._mode = "bits";

    // Zoom / pan
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._isPanning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._panStartPanX = 0;
    this._panStartPanY = 0;

    // Grid
    this._gridCols = DEFAULT_WIDTH;
    this._gridRows = Math.ceil(TOTAL_BYTES / this._gridCols);

    // Memory data
    this._memoryData = null;
    this._readDecay = new Uint8Array(TOTAL_BYTES);
    this._writeDecay = new Uint8Array(TOTAL_BYTES);
    this._accessTrackingActive = false;
    this._decayRate = DEFAULT_DECAY_RATE;
    this._fadeEnabled = true;

    // Throttle
    this._lastFetch = 0;

    // Offscreen canvases
    this._offscreen = null;
    this._offscreenCtx = null;
    this._minimapCanvas = null;
    this._minimapCtx = null;

    // Colour LUTs (built on theme change)
    this._fgColour = 0xFF00FF00;
    this._bgColour = 0xFF0A0A0A;
    this._readLUT = null;
    this._writeLUT = null;
    this._readWriteLUT = null;

    // CSS colour strings (for hex view and overlays)
    this._fgCSS = "#00FF00";
    this._bgCSS = "#141416";
    this._textCSS = "#e0e0e0";
    this._textSecCSS = "#999";
    this._separatorCSS = "rgba(48,54,61,0.6)";

    // Theme observer
    this._themeObserver = null;

    // Region colouring
    this._machineId = 0;
    this._regions = SPECTRUM_REGIONS;
    this._regionLUT = new Uint8Array(TOTAL_BYTES);
    this._regionBgABGR = [0];
    this._regionBgCSS = [""];
    this._buildRegionLUT();

    // Bound handlers
    this._onWheel = this._handleWheel.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);
    this._resizeObserver = null;
  }

  // ── Render ───────────────────────────────────────────────────

  renderContent() {
    const modeTabs = MODES.map(m =>
      `<button class="mhm-mode-tab${m === this._mode ? " selected" : ""}" data-mode="${m}">${MODE_LABELS[m]}</button>`
    ).join("");

    return `
      <div class="memory-heatmap-content">
        <div class="memory-heatmap-toolbar">
          <div class="mhm-mode-tabs">${modeTabs}</div>
          <label>Width</label>
          <input type="number" class="memory-heatmap-width-input"
            min="${MIN_WIDTH}" max="${MAX_WIDTH}" value="${this._gridCols}" />
          <label>Fade</label>
          <label class="mhm-toggle">
            <input type="checkbox" class="mhm-fade-toggle" ${this._fadeEnabled ? "checked" : ""}>
            <span class="mhm-toggle-slider"></span>
          </label>
          <input type="number" class="memory-heatmap-fade-input"
            min="${MIN_DECAY_RATE}" max="${MAX_DECAY_RATE}" value="${this._decayRate}" />
          <span class="memory-heatmap-zoom-info">1.0x</span>
        </div>
        <div class="memory-heatmap-canvas-container">
          <canvas class="memory-heatmap-canvas"></canvas>
          <div class="mhm-minimap"><canvas></canvas></div>
          <div class="memory-heatmap-tooltip"></div>
        </div>
        <div class="memory-heatmap-statusbar">
          <span class="memory-heatmap-status-addr">--</span>
          <span class="memory-heatmap-legend"></span>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    const content = this.contentElement;
    this._canvas = content.querySelector(".memory-heatmap-canvas");
    this._ctx = this._canvas.getContext("2d", { alpha: false });
    this._tooltip = content.querySelector(".memory-heatmap-tooltip");
    this._zoomInfo = content.querySelector(".memory-heatmap-zoom-info");
    this._statusAddr = content.querySelector(".memory-heatmap-status-addr");
    this._container = content.querySelector(".memory-heatmap-canvas-container");

    // Offscreen
    this._offscreen = document.createElement("canvas");
    this._offscreenCtx = this._offscreen.getContext("2d", { alpha: false });

    // Minimap
    const mmWrap = content.querySelector(".mhm-minimap");
    this._minimapWrap = mmWrap;
    this._minimapCanvas = mmWrap.querySelector("canvas");
    this._minimapCtx = this._minimapCanvas.getContext("2d", { alpha: false });

    // Theme colours & LUTs
    this._readThemeColours();

    this._themeObserver = new MutationObserver(() => {
      this._readThemeColours();
      this._draw();
      this._drawMinimap();
    });
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Mode tabs
    content.querySelectorAll(".mhm-mode-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        this._setMode(tab.dataset.mode);
      });
    });

    // Width input
    this._widthInput = content.querySelector(".memory-heatmap-width-input");
    const applyWidth = () => {
      let v = parseInt(this._widthInput.value, 10);
      if (isNaN(v)) v = DEFAULT_WIDTH;
      v = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, v));
      this._widthInput.value = v;
      if (v !== this._gridCols) this._setGridWidth(v);
    };
    this._widthInput.addEventListener("change", applyWidth);
    this._widthInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { applyWidth(); e.preventDefault(); }
    });

    // Fade input
    this._fadeInput = content.querySelector(".memory-heatmap-fade-input");
    const applyFade = () => {
      let v = parseInt(this._fadeInput.value, 10);
      if (isNaN(v)) v = DEFAULT_DECAY_RATE;
      v = Math.max(MIN_DECAY_RATE, Math.min(MAX_DECAY_RATE, v));
      this._fadeInput.value = v;
      this._decayRate = v;
      if (this.onStateChange) this.onStateChange();
      this.saveSettings();
    };
    this._fadeInput.addEventListener("change", applyFade);
    this._fadeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { applyFade(); e.preventDefault(); }
    });

    // Fade toggle
    this._fadeToggle = content.querySelector(".mhm-fade-toggle");
    this._fadeToggle.addEventListener("change", () => {
      this._fadeEnabled = this._fadeToggle.checked;
      this._fadeInput.disabled = !this._fadeEnabled;
      if (!this._fadeEnabled) {
        this._readDecay.fill(0);
        this._writeDecay.fill(0);
      }
      if (this.onStateChange) this.onStateChange();
      this.saveSettings();
    });
    this._fadeInput.disabled = !this._fadeEnabled;

    // Mouse/wheel
    this._container.addEventListener("wheel", this._onWheel, { passive: false });
    this._container.addEventListener("mousedown", this._onMouseDown);
    this._container.addEventListener("mousemove", this._onMouseMove);
    this._container.addEventListener("mouseup", this._onMouseUp);
    this._container.addEventListener("mouseleave", this._onMouseLeave);

    // Resize
    this._resizeObserver = new ResizeObserver(() => {
      this._sizeCanvas();
      this._draw();
    });
    this._resizeObserver.observe(this._container);

    this._sizeCanvas();
    this._updateZoomInfo();
  }

  // ── Mode switching ─────────────────────────────────────────────

  _setMode(mode) {
    if (!MODES.includes(mode) || mode === this._mode) return;
    this._mode = mode;

    // Update tab selection
    const tabs = this.contentElement?.querySelectorAll(".mhm-mode-tab");
    if (tabs) {
      tabs.forEach(t => t.classList.toggle("selected", t.dataset.mode === mode));
    }

    this._renderLegend();
    this._draw();
    this._drawMinimap();
  }

  // ── Theme colours & LUT building ──────────────────────────────

  _readThemeColours() {
    const style = getComputedStyle(document.documentElement);

    this._fgColour = cssToABGR(style.getPropertyValue("--accent-green").trim() || "#00FF00");
    this._bgColour = cssToABGR(style.getPropertyValue("--bg-primary").trim() || "#141416");

    this._fgCSS = style.getPropertyValue("--accent-green").trim() || "#00FF00";
    this._bgCSS = style.getPropertyValue("--bg-primary").trim() || "#141416";
    this._textCSS = style.getPropertyValue("--text-primary").trim() || "#e0e0e0";
    this._textSecCSS = style.getPropertyValue("--text-secondary").trim() || "#999";
    this._separatorCSS = style.getPropertyValue("--separator-bg").trim() || "rgba(48,54,61,0.6)";

    // Build mode-specific LUTs
    this._readLUT = buildReadLUT(style);
    this._writeLUT = buildWriteLUT(style);
    this._readWriteLUT = buildReadWriteLUT(style);

    this._buildRegionColours();
    this._renderLegend();
  }

  // ── Region management ──────────────────────────────────────────

  _buildRegionLUT() {
    this._regionLUT.fill(0);
    for (let i = 0; i < this._regions.length; i++) {
      const r = this._regions[i];
      const idx = i + 1;
      for (let a = r.start; a <= r.end; a++) {
        this._regionLUT[a] = idx;
      }
    }
  }

  _buildRegionColours() {
    const style = getComputedStyle(document.documentElement);
    const bgHex = style.getPropertyValue("--bg-primary").trim() || "#141416";
    const bgRGB = hexToRGB(bgHex);

    this._regionBgABGR = [this._bgColour];
    this._regionBgCSS = [""];

    for (const region of this._regions) {
      const accentHex = style.getPropertyValue(region.cssVar).trim() || "#888";
      const accentRGB = hexToRGB(accentHex);
      const rgb = blendRGB(bgRGB, accentRGB, 0.18);
      this._regionBgABGR.push(rgbToABGR(rgb[0], rgb[1], rgb[2]));
      this._regionBgCSS.push(`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
    }
  }

  _renderLegend() {
    const el = this.contentElement?.querySelector(".memory-heatmap-legend");
    if (!el) return;
    const style = getComputedStyle(document.documentElement);

    let html = "";

    // Activity colour legend when in activity mode
    if (this._mode === "activity") {
      const readCol = style.getPropertyValue("--accent-blue").trim() || "#00FFFF";
      const writeCol = style.getPropertyValue("--accent-red").trim() || "#FF0000";
      const bothCol = style.getPropertyValue("--accent-purple").trim() || "#FF00FF";
      const swatch = (col, label) =>
        `<span class="memory-heatmap-legend-item">` +
        `<span class="memory-heatmap-legend-swatch" style="background:${col}"></span>` +
        `${label}</span>`;
      html += swatch(readCol, "Read") + swatch(writeCol, "Write") + swatch(bothCol, "Read+Write");
    } else {
      // Region legend (non-activity modes only)
      html += this._regions.map(r => {
        const colour = style.getPropertyValue(r.cssVar).trim() || "#888";
        return `<span class="memory-heatmap-legend-item">` +
          `<span class="memory-heatmap-legend-swatch" style="background:${colour}"></span>` +
          `${r.label}</span>`;
      }).join("");
    }

    el.innerHTML = html;
  }

  // ── Grid width ─────────────────────────────────────────────────

  _setGridWidth(cols) {
    this._gridCols = cols;
    this._gridRows = Math.ceil(TOTAL_BYTES / cols);
    this._panX = 0;
    this._panY = 0;
    this._zoom = 1;
    this._clampPan();
    this._updateZoomInfo();
    this._draw();
    this._drawMinimap();
  }

  // ── Canvas sizing ──────────────────────────────────────────────

  _sizeCanvas() {
    if (!this._canvas || !this._container) return;
    const rect = this._container.getBoundingClientRect();
    const w = Math.floor(rect.width) || 256;
    const h = Math.floor(rect.height) || 256;
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width = w;
      this._canvas.height = h;
    }
  }

  // ── Zoom / Pan ─────────────────────────────────────────────────

  _getCellWidth() {
    return (this._canvas.width / this._gridCols) * this._zoom;
  }

  _getCellHeight() {
    return (this._canvas.height / this._gridRows) * this._zoom;
  }

  _handleWheel(e) {
    e.preventDefault();
    const rect = this._container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldZoom = this._zoom;
    const factor = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

    const cwOld = this._getCellWidth();
    const chOld = this._getCellHeight();
    this._zoom = newZoom;
    const cwNew = this._getCellWidth();
    const chNew = this._getCellHeight();

    this._panX = (this._panX + mx / cwOld) - mx / cwNew;
    this._panY = (this._panY + my / chOld) - my / chNew;

    this._clampPan();
    this._updateZoomInfo();
    this._draw();
    this._updateMinimapVisibility();
  }

  _handleMouseDown(e) {
    if (e.button !== 0) return;
    if (this._zoom > 1) {
      this._isPanning = true;
      this._panStartX = e.clientX;
      this._panStartY = e.clientY;
      this._panStartPanX = this._panX;
      this._panStartPanY = this._panY;
      this._container.classList.add("panning");
    }
  }

  _handleMouseMove(e) {
    if (this._isPanning) {
      const dx = e.clientX - this._panStartX;
      const dy = e.clientY - this._panStartY;
      this._panX = this._panStartPanX - dx / this._getCellWidth();
      this._panY = this._panStartPanY - dy / this._getCellHeight();
      this._clampPan();
      this._draw();
      this._drawMinimap();
    }
    this._updateTooltip(e);
  }

  _handleMouseUp() {
    this._isPanning = false;
    this._container.classList.remove("panning");
  }

  _handleMouseLeave() {
    this._isPanning = false;
    this._container.classList.remove("panning");
    if (this._tooltip) this._tooltip.classList.remove("visible");
  }

  _clampPan() {
    const cw = this._canvas.width;
    const ch = this._canvas.height;
    const cellW = this._getCellWidth();
    const cellH = this._getCellHeight();
    const visCols = cw / cellW;
    const visRows = ch / cellH;
    this._panX = Math.max(0, Math.min(this._gridCols - visCols, this._panX));
    this._panY = Math.max(0, Math.min(this._gridRows - visRows, this._panY));
  }

  _updateZoomInfo() {
    if (this._zoomInfo) {
      this._zoomInfo.textContent = `${this._zoom.toFixed(1)}x`;
    }
  }

  // ── Tooltip ────────────────────────────────────────────────────

  _updateTooltip(e) {
    if (!this._memoryData || !this._tooltip) return;
    const rect = this._container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cellW = this._getCellWidth();
    const cellH = this._getCellHeight();
    const col = Math.floor(this._panX + mx / cellW);
    const row = Math.floor(this._panY + my / cellH);

    if (col < 0 || col >= this._gridCols || row < 0 || row >= this._gridRows) {
      this._tooltip.classList.remove("visible");
      return;
    }

    const addr = row * this._gridCols + col;
    if (addr >= TOTAL_BYTES) {
      this._tooltip.classList.remove("visible");
      return;
    }

    const val = this._memoryData[addr];
    const addrHex = addr.toString(16).toUpperCase().padStart(4, "0");
    const valHex = val.toString(16).toUpperCase().padStart(2, "0");
    const valBin = val.toString(2).padStart(8, "0");
    const rIdx = this._regionLUT[addr];
    const regionLabel = rIdx > 0 ? this._regions[rIdx - 1].label : "User RAM";

    // Mode-specific extra info
    let extra = "";
    if (this._mode === "activity") {
      const rv = this._readDecay[addr];
      const wv = this._writeDecay[addr];
      extra = `  R:${rv} W:${wv}`;
    }

    this._tooltip.textContent = `$${addrHex}: $${valHex}  %${valBin}  [${regionLabel}]${extra}`;
    this._statusAddr.textContent = `$${addrHex} = $${valHex}  %${valBin}  [${regionLabel}]${extra}`;

    let tx = mx + 12;
    let ty = my - 24;
    if (tx + 220 > rect.width) tx = mx - 220;
    if (ty < 0) ty = my + 12;
    this._tooltip.style.left = `${tx}px`;
    this._tooltip.style.top = `${ty}px`;
    this._tooltip.classList.add("visible");
  }

  // ── Activity decay computation ─────────────────────────────────

  _updateActivityDecay(accessFlags) {
    if (!accessFlags) return;
    const rd = this._readDecay;
    const wd = this._writeDecay;
    // Invert so higher user value = longer fade (slower decay)
    const rate = this._fadeEnabled ? (MAX_DECAY_RATE + MIN_DECAY_RATE) - this._decayRate : 0;

    for (let i = 0; i < TOTAL_BYTES; i++) {
      const f = accessFlags[i];
      // bit 1 = read, bit 0 = write
      if (f & 0x02) {
        rd[i] = 255;
      } else if (rd[i] > 0) {
        rd[i] = (rd[i] > rate) ? rd[i] - rate : 0;
      }
      if (f & 0x01) {
        wd[i] = 255;
      } else if (wd[i] > 0) {
        wd[i] = (wd[i] > rate) ? wd[i] - rate : 0;
      }
    }
  }

  // ── Main draw dispatcher ───────────────────────────────────────

  _draw() {
    if (!this._ctx || !this._canvas || !this._memoryData) return;

    const cw = this._canvas.width;
    const ch = this._canvas.height;
    if (cw === 0 || ch === 0) return;

    const cellW = this._getCellWidth();

    if (cellW >= HEX_THRESHOLD_PX) {
      this._drawHexView();
    } else {
      switch (this._mode) {
        case "bits":     this._drawBitView(); break;
        case "activity": this._drawActivityView(); break;
      }
    }
  }

  // ── Bit-pattern view ───────────────────────────────────────────

  _drawBitView() {
    const cw = this._canvas.width;
    const ch = this._canvas.height;
    const ctx = this._ctx;
    const cellW = this._getCellWidth();
    const cellH = this._getCellHeight();

    const startCol = Math.floor(this._panX);
    const startRow = Math.floor(this._panY);
    const endCol = Math.min(this._gridCols, Math.ceil(this._panX + cw / cellW));
    const endRow = Math.min(this._gridRows, Math.ceil(this._panY + ch / cellH));
    const visCols = endCol - startCol;
    const visRows = endRow - startRow;
    if (visCols <= 0 || visRows <= 0) return;

    const texW = visCols * BITS_PER_BYTE;
    const texH = visRows;
    if (this._offscreen.width !== texW || this._offscreen.height !== texH) {
      this._offscreen.width = texW;
      this._offscreen.height = texH;
    }

    const imgData = this._offscreenCtx.createImageData(texW, texH);
    const data32 = new Uint32Array(imgData.data.buffer);
    const mem = this._memoryData;
    const fg = this._fgColour;
    const regionLUT = this._regionLUT;
    const regionBg = this._regionBgABGR;

    for (let r = 0; r < visRows; r++) {
      const row = startRow + r;
      const memBase = row * this._gridCols + startCol;
      const pixBase = r * texW;
      for (let c = 0; c < visCols; c++) {
        const addr = memBase + c;
        if (addr >= TOTAL_BYTES) break;
        const val = mem[addr];
        const bg = regionBg[regionLUT[addr]];
        const px = pixBase + c * BITS_PER_BYTE;
        data32[px]     = (val & 0x80) ? fg : bg;
        data32[px + 1] = (val & 0x40) ? fg : bg;
        data32[px + 2] = (val & 0x20) ? fg : bg;
        data32[px + 3] = (val & 0x10) ? fg : bg;
        data32[px + 4] = (val & 0x08) ? fg : bg;
        data32[px + 5] = (val & 0x04) ? fg : bg;
        data32[px + 6] = (val & 0x02) ? fg : bg;
        data32[px + 7] = (val & 0x01) ? fg : bg;
      }
    }

    this._offscreenCtx.putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    const offsetX = -(this._panX - startCol) * cellW;
    const offsetY = -(this._panY - startRow) * cellH;
    ctx.drawImage(
      this._offscreen,
      0, 0, texW, texH,
      offsetX, offsetY,
      visCols * cellW, visRows * cellH
    );
  }

  // ── Activity view (read/write split colours) ───────────────────

  _drawActivityView() {
    const cw = this._canvas.width;
    const ch = this._canvas.height;
    const ctx = this._ctx;
    const cellW = this._getCellWidth();
    const cellH = this._getCellHeight();

    const startCol = Math.floor(this._panX);
    const startRow = Math.floor(this._panY);
    const endCol = Math.min(this._gridCols, Math.ceil(this._panX + cw / cellW));
    const endRow = Math.min(this._gridRows, Math.ceil(this._panY + ch / cellH));
    const visCols = endCol - startCol;
    const visRows = endRow - startRow;
    if (visCols <= 0 || visRows <= 0) return;

    const texW = visCols;
    const texH = visRows;
    if (this._offscreen.width !== texW || this._offscreen.height !== texH) {
      this._offscreen.width = texW;
      this._offscreen.height = texH;
    }

    const imgData = this._offscreenCtx.createImageData(texW, texH);
    const data32 = new Uint32Array(imgData.data.buffer);
    const rd = this._readDecay;
    const wd = this._writeDecay;
    const rLUT = this._readLUT;
    const wLUT = this._writeLUT;
    const rwLUT = this._readWriteLUT;

    for (let r = 0; r < visRows; r++) {
      const row = startRow + r;
      const memBase = row * this._gridCols + startCol;
      const pixBase = r * texW;
      for (let c = 0; c < visCols; c++) {
        const addr = memBase + c;
        if (addr >= TOTAL_BYTES) { data32[pixBase + c] = 0xFF000000; continue; }
        const rv = rd[addr];
        const wv = wd[addr];
        if (rv > 0 && wv > 0) {
          // Both read and write — use the stronger value through the blend LUT
          data32[pixBase + c] = rwLUT[Math.max(rv, wv)];
        } else if (wv > 0) {
          data32[pixBase + c] = wLUT[wv];
        } else if (rv > 0) {
          data32[pixBase + c] = rLUT[rv];
        } else {
          data32[pixBase + c] = 0xFF0A0A0A; // dark background
        }
      }
    }

    this._offscreenCtx.putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);

    const offsetX = -(this._panX - startCol) * cellW;
    const offsetY = -(this._panY - startRow) * cellH;
    ctx.drawImage(
      this._offscreen,
      0, 0, texW, texH,
      offsetX, offsetY,
      visCols * cellW, visRows * cellH
    );
  }

  // ── Hex-value view (high zoom) ─────────────────────────────────

  _drawHexView() {
    const cw = this._canvas.width;
    const ch = this._canvas.height;
    const ctx = this._ctx;
    const cellW = this._getCellWidth();
    const cellH = this._getCellHeight();

    const startCol = Math.floor(this._panX);
    const startRow = Math.floor(this._panY);
    const endCol = Math.min(this._gridCols, Math.ceil(this._panX + cw / cellW));
    const endRow = Math.min(this._gridRows, Math.ceil(this._panY + ch / cellH));

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this._bgCSS;
    ctx.fillRect(0, 0, cw, ch);

    const mem = this._memoryData;
    const fontSize = Math.max(9, Math.min(14, cellW * 0.22));
    ctx.font = `${fontSize}px "SF Mono","Cascadia Code","Fira Code",monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const bitBarH = Math.max(2, cellH * 0.18);
    const bitW = cellW / BITS_PER_BYTE;

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const addr = row * this._gridCols + col;
        if (addr >= TOTAL_BYTES) continue;
        const val = mem[addr];

        const x = (col - this._panX) * cellW;
        const y = (row - this._panY) * cellH;

        // Background: mode-specific tint or region tint
        const rIdx = this._regionLUT[addr];
        if (rIdx > 0) {
          ctx.fillStyle = this._regionBgCSS[rIdx];
          ctx.fillRect(x, y, cellW, cellH);
        }

        // Mode-specific cell decoration
        this._drawHexCellDecoration(ctx, x, y, cellW, cellH, addr, val);

        // Cell border
        ctx.strokeStyle = this._separatorCSS;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cellW, cellH);

        // Bit-pattern bar at top
        const barY = y + 2;
        for (let b = 0; b < BITS_PER_BYTE; b++) {
          const bit = (val >> (7 - b)) & 1;
          ctx.fillStyle = bit ? this._fgCSS : "rgba(255,255,255,0.06)";
          ctx.fillRect(x + b * bitW + 1, barY, bitW - 1, bitBarH);
        }

        // Hex value
        ctx.fillStyle = this._textCSS;
        ctx.font = `${fontSize}px "SF Mono","Cascadia Code","Fira Code",monospace`;
        ctx.fillText(
          val.toString(16).toUpperCase().padStart(2, "0"),
          x + cellW / 2,
          y + bitBarH + (cellH - bitBarH) / 2 + 1
        );

        // Address label when large
        if (cellH > 36) {
          const addrSize = Math.max(7, fontSize * 0.7);
          ctx.font = `${addrSize}px "SF Mono","Cascadia Code","Fira Code",monospace`;
          ctx.fillStyle = this._textSecCSS;
          ctx.fillText(
            addr.toString(16).toUpperCase().padStart(4, "0"),
            x + cellW / 2,
            y + cellH - addrSize * 0.6
          );
        }
      }
    }
  }

  /** Mode-specific background decoration for hex cells */
  _drawHexCellDecoration(ctx, x, y, w, h, addr, val) {
    switch (this._mode) {
      case "activity": {
        const rv = this._readDecay[addr];
        const wv = this._writeDecay[addr];
        if (rv > 0 || wv > 0) {
          let lut, idx;
          if (rv > 0 && wv > 0) { lut = this._readWriteLUT; idx = Math.max(rv, wv); }
          else if (wv > 0) { lut = this._writeLUT; idx = wv; }
          else { lut = this._readLUT; idx = rv; }
          const abgr = lut[idx];
          const r = abgr & 0xFF;
          const g = (abgr >> 8) & 0xFF;
          const b = (abgr >> 16) & 0xFF;
          ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
          ctx.fillRect(x, y, w, h);
        }
        break;
      }
    }
  }

  // ── Minimap ────────────────────────────────────────────────────

  _updateMinimapVisibility() {
    if (!this._minimapWrap) return;
    this._minimapWrap.classList.toggle("visible", this._zoom > 1.1);
    if (this._zoom > 1.1) this._drawMinimap();
  }

  _drawMinimap() {
    if (!this._minimapCanvas || !this._memoryData) return;
    if (this._zoom <= 1.1) return;

    // Determine minimap size (maintain grid aspect ratio)
    const gridAspect = this._gridCols / this._gridRows;
    let mmW, mmH;
    if (gridAspect >= 1) {
      mmW = MINIMAP_MAX;
      mmH = Math.max(8, Math.round(MINIMAP_MAX / gridAspect));
    } else {
      mmH = MINIMAP_MAX;
      mmW = Math.max(8, Math.round(MINIMAP_MAX * gridAspect));
    }

    if (this._minimapCanvas.width !== mmW || this._minimapCanvas.height !== mmH) {
      this._minimapCanvas.width = mmW;
      this._minimapCanvas.height = mmH;
    }

    const ctx = this._minimapCtx;
    const imgData = ctx.createImageData(mmW, mmH);
    const data32 = new Uint32Array(imgData.data.buffer);
    const mem = this._memoryData;

    // Each minimap pixel covers a block of the grid
    const colsPerPx = this._gridCols / mmW;
    const rowsPerPx = this._gridRows / mmH;

    // Pick the LUT for current mode
    const lut = this._getLUTForMode();

    for (let my = 0; my < mmH; my++) {
      const gridRow = Math.floor(my * rowsPerPx);
      for (let mx = 0; mx < mmW; mx++) {
        const gridCol = Math.floor(mx * colsPerPx);
        const addr = gridRow * this._gridCols + gridCol;
        if (addr >= TOTAL_BYTES) {
          data32[my * mmW + mx] = 0xFF000000;
          continue;
        }
        data32[my * mmW + mx] = this._getMinimapColour(addr, lut);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw viewport rectangle
    const cw = this._canvas.width;
    const ch = this._canvas.height;
    const cellW = this._getCellWidth();
    const cellH = this._getCellHeight();
    const vpLeft = (this._panX / this._gridCols) * mmW;
    const vpTop = (this._panY / this._gridRows) * mmH;
    const vpW = (cw / cellW / this._gridCols) * mmW;
    const vpH = (ch / cellH / this._gridRows) * mmH;

    ctx.strokeStyle = this._fgCSS;
    ctx.lineWidth = 1;
    ctx.strokeRect(vpLeft, vpTop, vpW, vpH);
  }

  _getLUTForMode() {
    switch (this._mode) {
      case "activity": return this._writeLUT; // fallback for minimap
      default:         return null; // bits mode uses special rendering
    }
  }

  _getMinimapColour(addr, lut) {
    if (this._mode === "bits") {
      // For bits mode, show region colour or value-based brightness
      const val = this._memoryData[addr];
      const popcount = this._popcount8(val);
      const bright = Math.round((popcount / 8) * 255);
      return rgbToABGR(0, bright, 0); // green brightness
    }
    if (this._mode === "activity") {
      const rv = this._readDecay[addr];
      const wv = this._writeDecay[addr];
      if (rv > 0 && wv > 0) return this._readWriteLUT[Math.max(rv, wv)];
      if (wv > 0) return this._writeLUT[wv];
      if (rv > 0) return this._readLUT[rv];
      return 0xFF0A0A0A;
    }
    return lut[this._memoryData[addr]];
  }

  _popcount8(v) {
    v = v - ((v >> 1) & 0x55);
    v = (v & 0x33) + ((v >> 2) & 0x33);
    return (v + (v >> 4)) & 0x0F;
  }

  // ── Update (called each frame by WindowManager) ────────────────

  update(proxy) {
    if (!this.isVisible || !proxy) {
      if (this._accessTrackingActive && proxy) {
        this._accessTrackingActive = false;
        proxy.setAccessTracking(false);
      }
      return;
    }

    // Detect machine change
    const mid = proxy.getMachineId();
    if (mid !== this._machineId) {
      this._machineId = mid;
      this._regions = regionsForMachine(mid);
      this._buildRegionLUT();
      this._buildRegionColours();
      this._renderLegend();
    }

    // Enable/disable C++ access tracking based on activity mode
    const needsTracking = this._mode === "activity";
    if (needsTracking !== this._accessTrackingActive) {
      this._accessTrackingActive = needsTracking;
      proxy.setAccessTracking(needsTracking);
    }

    const now = performance.now();
    if (now - this._lastFetch < FETCH_INTERVAL) return;
    this._lastFetch = now;

    // Fetch memory data (always needed for all modes)
    const memPromise = proxy.readMemory(0, TOTAL_BYTES);
    // Fetch access flags only when in activity mode
    const flagsPromise = needsTracking ? proxy.readAccessFlags() : Promise.resolve(null);

    Promise.all([memPromise, flagsPromise]).then(([data, accessFlags]) => {
      if (!data) return;

      // Update activity tracking from C++ access flags
      this._updateActivityDecay(accessFlags);

      this._memoryData = data;
      this._draw();

      // Update minimap if visible
      if (this._zoom > 1.1) {
        this._drawMinimap();
      }
    });
  }

  // ── State persistence ──────────────────────────────────────────

  getState() {
    return {
      ...super.getState(),
      zoom: this._zoom,
      panX: this._panX,
      panY: this._panY,
      gridWidth: this._gridCols,
      decayRate: this._decayRate,
      fadeEnabled: this._fadeEnabled,
      mode: this._mode,
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.gridWidth !== undefined) {
      const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, state.gridWidth));
      this._gridCols = w;
      this._gridRows = Math.ceil(TOTAL_BYTES / this._gridCols);
      if (this._widthInput) this._widthInput.value = w;
    }
    if (state.decayRate !== undefined) {
      this._decayRate = Math.max(MIN_DECAY_RATE, Math.min(MAX_DECAY_RATE, state.decayRate));
      if (this._fadeInput) this._fadeInput.value = this._decayRate;
    }
    if (state.fadeEnabled !== undefined) {
      this._fadeEnabled = state.fadeEnabled;
      if (this._fadeToggle) this._fadeToggle.checked = this._fadeEnabled;
      if (this._fadeInput) this._fadeInput.disabled = !this._fadeEnabled;
    }
    if (state.zoom !== undefined) this._zoom = state.zoom;
    if (state.panX !== undefined) this._panX = state.panX;
    if (state.panY !== undefined) this._panY = state.panY;
    if (state.mode && MODES.includes(state.mode)) {
      this._mode = state.mode;
      const tabs = this.contentElement?.querySelectorAll(".mhm-mode-tab");
      if (tabs) {
        tabs.forEach(t => t.classList.toggle("selected", t.dataset.mode === this._mode));
      }
    }
    this._updateZoomInfo();
    this._clampPan();
  }

  // ── Cleanup ────────────────────────────────────────────────────

  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
    if (this._container) {
      this._container.removeEventListener("wheel", this._onWheel);
      this._container.removeEventListener("mousedown", this._onMouseDown);
      this._container.removeEventListener("mousemove", this._onMouseMove);
      this._container.removeEventListener("mouseup", this._onMouseUp);
      this._container.removeEventListener("mouseleave", this._onMouseLeave);
    }
    super.destroy();
  }
}
