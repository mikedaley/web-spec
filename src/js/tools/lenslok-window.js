/*
 * lenslok-window.js - Lenslok copy protection solver
 *
 * Decodes the scrambled two-letter codes displayed by Lenslok-protected
 * ZX Spectrum games (Elite, ACE, Mooncresta, etc.) by reading the
 * emulator framebuffer and applying known column-reorder tables.
 *
 * Decode tables derived from LensKey by Simon Owen.
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/lenslok.css";

// Framebuffer dimensions
const FB_WIDTH = 352;
const FB_HEIGHT = 288;
const FB_BPP = 4; // RGBA
const FB_STRIDE = FB_WIDTH * FB_BPP;
const BORDER = 48;
const PAPER_W = 256;
const PAPER_H = 192;

// Number of vertical strips in the decode output
const NUM_STRIPS = 16;

// Each decoded strip is rendered this many pixels wide for readability
const STRIP_SCALE = 8;

// Brightness threshold for auto-detection
const BRIGHT_THRESHOLD = 100;

// Minimum bright pixel count per row to be considered character data
// (calibration lines contribute ~2 pixels/row, character data contributes many more)
const MIN_DENSE_PIXELS = 6;

// Supported games and their decode tables (percentage offsets from center)
// Positions 1-6: character 1 strips, positions 9-14: character 2 strips
// Positions 0, 7, 8, 15: blank padding
const GAMES = [
  {
    name: "ACE",
    table: [0, -81, -31, 13, -62, -41, 22, 0, 0, -22, 39, 58, -12, 29, 70, 0],
  },
  {
    name: "Art Studio",
    table: [0, -41, -30, -68, -52, -11, -20, 0, 0, 32, 60, 11, 22, 49, 71, 0],
  },
  {
    name: "Elite",
    table: [0, -41, -57, -77, 10, -28, -19, 0, 0, 43, -10, 22, 32, 77, 58, 0],
  },
  {
    name: "Graphic Adv Creator",
    table: [0, -77, -28, -4, -19, -59, -39, 0, 0, 20, 51, 10, 10, 66, 28, 0],
  },
  {
    name: "Jewels of Darkness",
    table: [0, -40, -57, -71, 14, -27, -21, 0, 0, 42, -12, 22, 27, 67, 53, 0],
  },
  {
    name: "Mooncresta",
    table: [0, -79, -31, -7, -22, -61, -44, 0, 0, 18, 50, 7, 67, 39, 27, 0],
  },
  {
    name: "Price of Magik",
    table: [0, -27, -39, -71, -6, -17, -48, 0, 0, 51, 64, 7, 40, 17, 79, 0],
  },
  {
    name: "Tomahawk",
    table: [0, -82, -31, -58, -20, -42, 10, 0, 0, -10, 32, 65, 20, 44, 80, 0],
  },
  {
    name: "TT Racer",
    table: [0, -20, -41, -69, -53, 6, -29, 0, 0, -9, 64, 20, 46, 33, 81, 0],
  },
];

export class LenslokWindow extends BaseWindow {
  constructor() {
    super({
      id: "lenslok",
      title: "Lenslok Solver",
      minWidth: 320,
      minHeight: 300,
      defaultWidth: 380,
      defaultHeight: 420,
      defaultPosition: { x: 200, y: 100 },
    });

    this._latestFramebuffer = null;
    this._capturedFramebuffer = null;
    this._selectedGame = 2; // Default to Elite
    this._centerX = 176; // Center of framebuffer (352/2)
    this._halfWidth = 60;
    this._patternTop = 120;
    this._patternBottom = 152;
    this._elements = {};
  }

  renderContent() {
    const options = GAMES.map(
      (g, i) =>
        `<option value="${i}"${i === this._selectedGame ? " selected" : ""}>${g.name}</option>`,
    ).join("");

    return `
      <div class="lenslok-solver">
        <div class="lenslok-controls">
          <div class="lenslok-control-row">
            <label>Game</label>
            <select class="lenslok-game-select">${options}</select>
          </div>
          <div class="lenslok-control-row">
            <button class="lenslok-btn lenslok-capture-btn">Capture</button>
            <button class="lenslok-btn lenslok-detect-btn">Auto Detect</button>
          </div>
          <div class="lenslok-control-row">
            <label>Centre X</label>
            <input type="number" class="lenslok-number-input lenslok-center-x"
              min="${BORDER}" max="${BORDER + PAPER_W - 1}" step="1" value="${this._centerX}">
            <label>Half W</label>
            <input type="number" class="lenslok-number-input lenslok-half-width"
              min="4" max="128" step="1" value="${this._halfWidth}">
          </div>
          <div class="lenslok-control-row">
            <label>Top</label>
            <input type="number" class="lenslok-number-input lenslok-top"
              min="${BORDER}" max="${BORDER + PAPER_H - 1}" step="1" value="${this._patternTop}">
            <label>Bottom</label>
            <input type="number" class="lenslok-number-input lenslok-bottom"
              min="${BORDER}" max="${BORDER + PAPER_H - 1}" step="1" value="${this._patternBottom}">
          </div>
        </div>
        <div class="lenslok-preview-area">
          <div class="lenslok-preview-label">Captured Region</div>
          <canvas class="lenslok-preview-canvas"></canvas>
        </div>
        <div class="lenslok-result-area">
          <div class="lenslok-result-label">Decoded</div>
          <canvas class="lenslok-result-canvas"></canvas>
        </div>
        <div class="lenslok-status">Select game, then click Capture when the Lenslok screen is displayed.</div>
      </div>
    `;
  }

  onContentRendered() {
    const ce = this.contentElement;
    this._elements = {
      gameSelect: ce.querySelector(".lenslok-game-select"),
      captureBtn: ce.querySelector(".lenslok-capture-btn"),
      detectBtn: ce.querySelector(".lenslok-detect-btn"),
      centerX: ce.querySelector(".lenslok-center-x"),
      halfWidth: ce.querySelector(".lenslok-half-width"),
      top: ce.querySelector(".lenslok-top"),
      bottom: ce.querySelector(".lenslok-bottom"),
      previewCanvas: ce.querySelector(".lenslok-preview-canvas"),
      resultCanvas: ce.querySelector(".lenslok-result-canvas"),
      status: ce.querySelector(".lenslok-status"),
    };

    // Game select
    this._elements.gameSelect.addEventListener("change", (e) => {
      this._selectedGame = parseInt(e.target.value, 10);
      if (this._capturedFramebuffer) this._decode();
      if (this.onStateChange) this.onStateChange();
    });

    // Capture button
    this._elements.captureBtn.addEventListener("click", () => this._capture());

    // Auto detect button
    this._elements.detectBtn.addEventListener("click", () => {
      if (this._capturedFramebuffer) {
        this._autoDetect();
      } else {
        this._setStatus("Capture the screen first.");
      }
    });

    // Numeric inputs - update on change and redecode
    const numericHandler = () => {
      this._centerX = parseInt(this._elements.centerX.value, 10) || BORDER;
      this._halfWidth = parseInt(this._elements.halfWidth.value, 10) || 30;
      this._patternTop = parseInt(this._elements.top.value, 10) || BORDER;
      this._patternBottom = parseInt(this._elements.bottom.value, 10) || BORDER + 32;
      if (this._capturedFramebuffer) {
        this._drawPreview();
        this._decode();
      }
    };

    this._elements.centerX.addEventListener("change", numericHandler);
    this._elements.halfWidth.addEventListener("change", numericHandler);
    this._elements.top.addEventListener("change", numericHandler);
    this._elements.bottom.addEventListener("change", numericHandler);
  }

  /**
   * Called from main.js renderFrame() — stores the latest framebuffer reference.
   */
  updateFramebuffer(fb) {
    this._latestFramebuffer = fb;
  }

  /**
   * Freeze the current framebuffer and attempt auto-detection.
   */
  _capture() {
    if (!this._latestFramebuffer) {
      this._setStatus("No framebuffer available. Is the emulator running?");
      return;
    }

    this._capturedFramebuffer = new Uint8Array(this._latestFramebuffer);
    this._setStatus("Screen captured. Running auto-detect...");
    this._autoDetect();
  }

  /**
   * Scan the captured framebuffer for the Lenslok pattern.
   *
   * Strategy: The Lenslok display has thin calibration lines (1-2 bright pixels
   * per row) spanning many rows, plus the actual scrambled character data which
   * is a narrow vertical band (~8 rows) with many more bright pixels per row.
   * We find the character data by looking for rows with HIGH pixel density
   * (many bright pixels), then use ALL bright rows to determine the horizontal
   * extent (center and half-width from the calibration lines).
   */
  _autoDetect() {
    if (!this._capturedFramebuffer) return;

    const fb = this._capturedFramebuffer;

    // Scan each row: count bright pixels and track left/right extents
    const rowInfo = [];
    for (let y = BORDER; y < BORDER + PAPER_H; y++) {
      let left = -1;
      let right = -1;
      let count = 0;
      for (let x = BORDER; x < BORDER + PAPER_W; x++) {
        const idx = (y * FB_WIDTH + x) * FB_BPP;
        const brightness = fb[idx] + fb[idx + 1] + fb[idx + 2];
        if (brightness > BRIGHT_THRESHOLD * 3) {
          count++;
          if (left === -1) left = x;
          right = x;
        }
      }
      rowInfo.push({ y, left, right, count });
    }

    // --- Find horizontal extent (center + half-width) from ALL bright rows ---
    // The calibration lines define the full width of the Lenslok prism area.
    // Use the widest extent (min left, max right) to capture the calibration
    // line positions rather than the average, which would be pulled inward
    // by the narrower character data rows.
    const allBrightRows = rowInfo.filter((r) => r.left !== -1);
    if (allBrightRows.length < 4) {
      this._setStatus("Auto-detect failed: no bright pattern found. Adjust manually.");
      this._drawPreview();
      return;
    }

    let minLeft = FB_WIDTH;
    let maxRight = 0;
    for (const row of allBrightRows) {
      if (row.left < minLeft) minLeft = row.left;
      if (row.right > maxRight) maxRight = row.right;
    }

    this._centerX = Math.round((minLeft + maxRight) / 2);
    this._halfWidth = Math.round((maxRight - minLeft) / 2);

    // --- Find vertical extent of CHARACTER DATA (dense rows only) ---
    // Character data rows have many bright pixels; calibration lines have few
    const denseRows = rowInfo.filter((r) => r.count >= MIN_DENSE_PIXELS);

    if (denseRows.length < 2) {
      // Fallback: use a sensible default around the vertical midpoint
      const midY = BORDER + Math.round(PAPER_H / 2);
      this._patternTop = midY - 4;
      this._patternBottom = midY + 4;
    } else {
      // Find the longest contiguous run of dense rows
      let bestStart = 0;
      let bestLen = 1;
      let runStart = 0;
      let runLen = 1;

      for (let i = 1; i < denseRows.length; i++) {
        if (denseRows[i].y === denseRows[i - 1].y + 1) {
          runLen++;
        } else {
          if (runLen > bestLen) {
            bestLen = runLen;
            bestStart = runStart;
          }
          runStart = i;
          runLen = 1;
        }
      }
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = runStart;
      }

      this._patternTop = denseRows[bestStart].y;
      this._patternBottom = denseRows[bestStart + bestLen - 1].y;
    }

    // Update input fields
    this._elements.centerX.value = this._centerX;
    this._elements.halfWidth.value = this._halfWidth;
    this._elements.top.value = this._patternTop;
    this._elements.bottom.value = this._patternBottom;

    this._setStatus(
      `Detected: centre=${this._centerX}, half-width=${this._halfWidth}, rows ${this._patternTop}\u2013${this._patternBottom}`,
    );

    this._drawPreview();
    this._decode();
  }

  /**
   * Apply the selected game's decode table to the captured framebuffer
   * and render the unscrambled result at a readable scale.
   */
  _decode() {
    if (!this._capturedFramebuffer) return;

    const game = GAMES[this._selectedGame];
    if (!game) return;

    const fb = this._capturedFramebuffer;
    const table = game.table;
    const height = Math.max(1, this._patternBottom - this._patternTop + 1);

    const canvas = this._elements.resultCanvas;
    const outW = NUM_STRIPS * STRIP_SCALE;
    const outH = height * STRIP_SCALE;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(outW, outH);
    const pixels = imgData.data;

    // Read background color from CSS for blank strips
    const style = getComputedStyle(this.element);
    const bgColor = this._parseColor(
      style.getPropertyValue("--canvas-bg").trim() || "#000000",
    );

    for (let i = 0; i < NUM_STRIPS; i++) {
      const pct = table[i];
      const destXStart = i * STRIP_SCALE;

      if (pct === 0) {
        // Blank padding strip
        for (let row = 0; row < height; row++) {
          for (let sy = 0; sy < STRIP_SCALE; sy++) {
            for (let sx = 0; sx < STRIP_SCALE; sx++) {
              const outIdx = ((row * STRIP_SCALE + sy) * outW + destXStart + sx) * 4;
              pixels[outIdx] = bgColor[0];
              pixels[outIdx + 1] = bgColor[1];
              pixels[outIdx + 2] = bgColor[2];
              pixels[outIdx + 3] = 255;
            }
          }
        }
        continue;
      }

      const sourceX = this._centerX + Math.round((this._halfWidth * pct) / 100);
      const clampedX = Math.max(0, Math.min(FB_WIDTH - 1, sourceX));

      for (let row = 0; row < height; row++) {
        const srcY = this._patternTop + row;
        const srcIdx = (srcY * FB_WIDTH + clampedX) * FB_BPP;
        const r = fb[srcIdx];
        const g = fb[srcIdx + 1];
        const b = fb[srcIdx + 2];

        // Fill a STRIP_SCALE × STRIP_SCALE block for this pixel
        for (let sy = 0; sy < STRIP_SCALE; sy++) {
          for (let sx = 0; sx < STRIP_SCALE; sx++) {
            const outIdx = ((row * STRIP_SCALE + sy) * outW + destXStart + sx) * 4;
            pixels[outIdx] = r;
            pixels[outIdx + 1] = g;
            pixels[outIdx + 2] = b;
            pixels[outIdx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Draw the captured region onto the preview canvas with overlay markers.
   */
  _drawPreview() {
    if (!this._capturedFramebuffer) return;

    const canvas = this._elements.previewCanvas;
    const fb = this._capturedFramebuffer;

    // Show the paper area in the preview
    canvas.width = PAPER_W;
    canvas.height = PAPER_H;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(PAPER_W, PAPER_H);
    const pixels = imgData.data;

    // Copy the paper area from the framebuffer
    for (let y = 0; y < PAPER_H; y++) {
      for (let x = 0; x < PAPER_W; x++) {
        const srcIdx = ((y + BORDER) * FB_WIDTH + (x + BORDER)) * FB_BPP;
        const dstIdx = (y * PAPER_W + x) * 4;
        pixels[dstIdx] = fb[srcIdx];
        pixels[dstIdx + 1] = fb[srcIdx + 1];
        pixels[dstIdx + 2] = fb[srcIdx + 2];
        pixels[dstIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw overlay markers (centre line and bounds)
    const cx = this._centerX - BORDER;
    const left = cx - this._halfWidth;
    const right = cx + this._halfWidth;
    const top = this._patternTop - BORDER;
    const bottom = this._patternBottom - BORDER;

    // Read overlay colour from CSS
    const style = getComputedStyle(this.element);
    const accentColor =
      style.getPropertyValue("--accent-blue").trim() || "#00FFFF";

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.7;

    // Centre line
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, top);
    ctx.lineTo(cx + 0.5, bottom);
    ctx.stroke();

    // Left and right bounds
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(left + 0.5, top);
    ctx.lineTo(left + 0.5, bottom);
    ctx.moveTo(right + 0.5, top);
    ctx.lineTo(right + 0.5, bottom);
    ctx.stroke();

    // Top and bottom bounds
    ctx.beginPath();
    ctx.moveTo(left, top + 0.5);
    ctx.lineTo(right, top + 0.5);
    ctx.moveTo(left, bottom + 0.5);
    ctx.lineTo(right, bottom + 0.5);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  /**
   * Parse a CSS color string into [r, g, b].
   */
  _parseColor(color) {
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16),
          parseInt(hex[1] + hex[1], 16),
          parseInt(hex[2] + hex[2], 16),
        ];
      }
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return [0, 0, 0];
  }

  _setStatus(msg) {
    if (this._elements.status) {
      this._elements.status.textContent = msg;
    }
  }

  /**
   * Persist selected game across sessions.
   */
  getState() {
    return {
      ...super.getState(),
      selectedGame: this._selectedGame,
    };
  }

  restoreState(state) {
    if (state.selectedGame !== undefined) {
      this._selectedGame = state.selectedGame;
      if (this._elements.gameSelect) {
        this._elements.gameSelect.value = this._selectedGame;
      }
    }
    super.restoreState(state);
  }

  update() {
    // No per-frame work needed — decoding is triggered by user actions
  }
}
