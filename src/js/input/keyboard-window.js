/*
 * keyboard-window.js - Visual ZX Spectrum 48K keyboard window
 *
 * Displays an authentic 40-key keyboard layout matching the real hardware.
 * Labels appear above and below keys (printed on the case) as well as on the
 * keys themselves. Highlights keys on physical keyboard press and supports
 * click/touch input.
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/keyboard-window.css";

// Physical keyboard code → Spectrum matrix [row, bit] pairs
const KEY_MAP = {
  ShiftLeft: [[0, 0]],
  ShiftRight: [[0, 0]],
  KeyZ: [[0, 1]],
  KeyX: [[0, 2]],
  KeyC: [[0, 3]],
  KeyV: [[0, 4]],
  KeyA: [[1, 0]],
  KeyS: [[1, 1]],
  KeyD: [[1, 2]],
  KeyF: [[1, 3]],
  KeyG: [[1, 4]],
  KeyQ: [[2, 0]],
  KeyW: [[2, 1]],
  KeyE: [[2, 2]],
  KeyR: [[2, 3]],
  KeyT: [[2, 4]],
  Digit1: [[3, 0]],
  Digit2: [[3, 1]],
  Digit3: [[3, 2]],
  Digit4: [[3, 3]],
  Digit5: [[3, 4]],
  Digit0: [[4, 0]],
  Digit9: [[4, 1]],
  Digit8: [[4, 2]],
  Digit7: [[4, 3]],
  Digit6: [[4, 4]],
  KeyP: [[5, 0]],
  KeyO: [[5, 1]],
  KeyI: [[5, 2]],
  KeyU: [[5, 3]],
  KeyY: [[5, 4]],
  Enter: [[6, 0]],
  KeyL: [[6, 1]],
  KeyK: [[6, 2]],
  KeyJ: [[6, 3]],
  KeyH: [[6, 4]],
  Space: [[7, 0]],
  ControlLeft: [[7, 1]],
  ControlRight: [[7, 1]],
  KeyM: [[7, 2]],
  KeyN: [[7, 3]],
  KeyB: [[7, 4]],
  ArrowLeft: [
    [0, 0],
    [3, 4],
  ],
  ArrowDown: [
    [0, 0],
    [4, 4],
  ],
  ArrowUp: [
    [0, 0],
    [4, 3],
  ],
  ArrowRight: [
    [0, 0],
    [4, 2],
  ],
  Backspace: [
    [0, 0],
    [4, 0],
  ],
};

/*
 * Authentic ZX Spectrum 48K keyboard layout.
 *
 * Each key has:
 *   main       - large character on the key face
 *   keyword    - BASIC keyword (white, bottom of key)
 *   symChar    - Symbol Shift character (red, on key)
 *   above      - label printed on case above the key (white)
 *   aboveColor - colour name above number keys (in that colour)
 *   below      - label printed on case below the key (green)
 *   row, bit   - hardware matrix position
 *   width      - flex multiplier (1, 1.5, or 4)
 *   shift      - "caps" or "symbol" for modifier keys
 */
const KEYBOARD_LAYOUT = [
  // === Row 1: Number keys 1-0 ===
  [
    {
      main: "1",
      keyword: "",
      symChar: "!",
      graphic: [1, 0, 1, 1],
      above: "EDIT",
      aboveColor: "BLUE",
      below: "DEF FN",
      row: 3,
      bit: 0,
      width: 1,
    },
    {
      main: "2",
      keyword: "",
      symChar: "@",
      graphic: [0, 1, 1, 1],
      above: "CAPS LOCK",
      aboveColor: "RED",
      below: "FN",
      row: 3,
      bit: 1,
      width: 1,
    },
    {
      main: "3",
      keyword: "",
      symChar: "#",
      graphic: [0, 0, 1, 1],
      above: "TRUE VIDEO",
      aboveColor: "MAGENTA",
      below: "LINE",
      row: 3,
      bit: 2,
      width: 1,
    },
    {
      main: "4",
      keyword: "",
      symChar: "$",
      graphic: [1, 1, 1, 0],
      above: "INV. VIDEO",
      aboveColor: "GREEN",
      below: "OPEN #",
      row: 3,
      bit: 3,
      width: 1,
    },
    {
      main: "5",
      keyword: "",
      symChar: "%",
      graphic: [1, 0, 1, 0],
      above: "",
      arrow: "left",
      aboveColor: "CYAN",
      below: "CLOSE #",
      row: 3,
      bit: 4,
      width: 1,
    },
    {
      main: "6",
      keyword: "",
      symChar: "&",
      graphic: [0, 1, 1, 0],
      above: "",
      arrow: "down",
      aboveColor: "YELLOW",
      below: "MOVE",
      row: 4,
      bit: 4,
      width: 1,
    },
    {
      main: "7",
      keyword: "",
      symChar: "'",
      graphic: [0, 0, 1, 0],
      above: "",
      arrow: "up",
      aboveColor: "WHITE",
      below: "ERASE",
      row: 4,
      bit: 3,
      width: 1,
    },
    {
      main: "8",
      keyword: "",
      symChar: "(",
      graphic: [1, 1, 1, 1],
      above: "",
      arrow: "right",
      aboveColor: "",
      below: "POINT",
      row: 4,
      bit: 2,
      width: 1,
    },
    {
      main: "9",
      keyword: "",
      symChar: ")",
      above: "GRAPHICS",
      aboveColor: "",
      below: "CAT",
      row: 4,
      bit: 1,
      width: 1,
    },
    {
      main: "0",
      keyword: "",
      symChar: "\u2582",
      above: "DELETE",
      aboveColor: "BLACK",
      below: "FORMAT",
      row: 4,
      bit: 0,
      width: 1,
    },
  ],
  // === Row 2: Q-P ===
  [
    {
      main: "Q",
      keyword: "PLOT",
      symChar: "\u2264",
      above: "SIN",
      below: "ASN",
      row: 2,
      bit: 0,
      width: 1,
    },
    {
      main: "W",
      keyword: "DRAW",
      symChar: "\u2260",
      above: "COS",
      below: "ACS",
      row: 2,
      bit: 1,
      width: 1,
    },
    {
      main: "E",
      keyword: "REM",
      symChar: "\u2265",
      above: "TAN",
      below: "ATN",
      row: 2,
      bit: 2,
      width: 1,
    },
    {
      main: "R",
      keyword: "RUN",
      symChar: "<",
      above: "INT",
      below: "VERIFY",
      row: 2,
      bit: 3,
      width: 1,
    },
    {
      main: "T",
      keyword: "RAND",
      symChar: ">",
      above: "RND",
      below: "MERGE",
      row: 2,
      bit: 4,
      width: 1,
    },
    {
      main: "Y",
      keyword: "RETURN",
      symChar: "AND",
      above: "STR$",
      below: "[",
      row: 5,
      bit: 4,
      width: 1,
    },
    {
      main: "U",
      keyword: "IF",
      symChar: "OR",
      above: "CHR$",
      below: "]",
      row: 5,
      bit: 3,
      width: 1,
    },
    {
      main: "I",
      keyword: "INPUT",
      symChar: "AT",
      above: "CODE",
      below: "IN",
      row: 5,
      bit: 2,
      width: 1,
    },
    {
      main: "O",
      keyword: "POKE",
      symChar: ";",
      above: "PEEK",
      below: "OUT",
      row: 5,
      bit: 1,
      width: 1,
    },
    {
      main: "P",
      keyword: "PRINT",
      symChar: '"',
      above: "TAB",
      below: "\u00A9",
      row: 5,
      bit: 0,
      width: 1,
    },
  ],
  // === Row 3: A-L + ENTER ===
  [
    {
      main: "A",
      keyword: "NEW",
      symChar: "STOP",
      above: "READ",
      below: "~",
      row: 1,
      bit: 0,
      width: 1,
    },
    {
      main: "S",
      keyword: "SAVE",
      symChar: "NOT",
      above: "RESTORE",
      below: "|",
      row: 1,
      bit: 1,
      width: 1,
    },
    {
      main: "D",
      keyword: "DIM",
      symChar: "STEP",
      above: "DATA",
      below: "\\",
      row: 1,
      bit: 2,
      width: 1,
    },
    {
      main: "F",
      keyword: "FOR",
      symChar: "TO",
      above: "SGN",
      below: "{",
      row: 1,
      bit: 3,
      width: 1,
    },
    {
      main: "G",
      keyword: "GOTO",
      symChar: "THEN",
      above: "ABS",
      below: "}",
      row: 1,
      bit: 4,
      width: 1,
    },
    {
      main: "H",
      keyword: "GOSUB",
      symChar: "\u2191",
      above: "SQR",
      below: "CIRCLE",
      row: 6,
      bit: 4,
      width: 1,
    },
    {
      main: "J",
      keyword: "LOAD",
      symChar: "\u2212",
      above: "VAL",
      below: "VAL$",
      row: 6,
      bit: 3,
      width: 1,
    },
    {
      main: "K",
      keyword: "LIST",
      symChar: "+",
      above: "LEN",
      below: "SCREEN$",
      row: 6,
      bit: 2,
      width: 1,
    },
    {
      main: "L",
      keyword: "LET",
      symChar: "=",
      above: "USR",
      below: "ATTR",
      row: 6,
      bit: 1,
      width: 1,
    },
    {
      main: "ENTER",
      keyword: "",
      symChar: "",
      above: "",
      below: "",
      row: 6,
      bit: 0,
      width: 1,
    },
  ],
  // === Row 4: CAPS SHIFT + Z-M + SYMBOL SHIFT + SPACE ===
  // Widths: CS=0.75 + 7×1 + SS=0.75 + SPACE=1.5 = 10 (matches rows 1-2)
  [
    {
      main: "CAPS\nSHIFT",
      keyword: "",
      symChar: "",
      above: "",
      below: "",
      row: 0,
      bit: 0,
      width: 0.75,
      shift: "caps",
    },
    {
      main: "Z",
      keyword: "COPY",
      symChar: ":",
      above: "LN",
      below: "BEEP",
      row: 0,
      bit: 1,
      width: 1,
    },
    {
      main: "X",
      keyword: "CLEAR",
      symChar: "\u00A3",
      above: "EXP",
      below: "INK",
      row: 0,
      bit: 2,
      width: 1,
    },
    {
      main: "C",
      keyword: "CONT",
      symChar: "?",
      above: "L PRINT",
      below: "PAPER",
      row: 0,
      bit: 3,
      width: 1,
    },
    {
      main: "V",
      keyword: "CLS",
      symChar: "/",
      above: "L LIST",
      below: "FLASH",
      row: 0,
      bit: 4,
      width: 1,
    },
    {
      main: "B",
      keyword: "BORDER",
      symChar: "*",
      above: "BIN",
      below: "BRIGHT",
      row: 7,
      bit: 4,
      width: 1,
    },
    {
      main: "N",
      keyword: "NEXT",
      symChar: ",",
      above: "IN KEY$",
      below: "OVER",
      row: 7,
      bit: 3,
      width: 1,
    },
    {
      main: "M",
      keyword: "PAUSE",
      symChar: ".",
      above: "PI",
      below: "INVERSE",
      row: 7,
      bit: 2,
      width: 1,
    },
    {
      main: "SYMBOL\nSHIFT",
      keyword: "",
      symChar: "",
      above: "",
      below: "",
      row: 7,
      bit: 1,
      width: 0.75,
      shift: "symbol",
    },
    {
      main: "SPACE",
      keyword: "BREAK",
      symChar: "",
      above: "",
      below: "",
      row: 7,
      bit: 0,
      width: 1.5,
      space: true,
    },
  ],
];

export class KeyboardWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "keyboard",
      title: "Keyboard",
      defaultWidth: 1060,
      minWidth: 780,
      defaultHeight: 420,
      closable: true,
      resizeDirections: [],
    });

    this.proxy = proxy;
    this._keyElements = new Map();
    this._capsShiftActive = false;
    this._symbolShiftActive = false;

    this._onDocKeyDown = (e) => this._handleKeyDown(e);
    this._onDocKeyUp = (e) => this._handleKeyUp(e);
  }

  renderContent() {
    let html = '<div class="kbd-container">';

    for (let ri = 0; ri < KEYBOARD_LAYOUT.length; ri++) {
      const row = KEYBOARD_LAYOUT[ri];
      const isNumberRow = ri === 0;

      // Wrap each row section so we can apply per-row offset
      html += `<div class="kbd-section kbd-section-${ri}">`;

      // --- Above labels ---
      if (isNumberRow) {
        // Number row: colour names on their own row above the function names
        html += '<div class="kbd-label-row">';
        for (const key of row) {
          const wCls = this._widthClass(key.width);
          html += `<span class="kbd-label-cell ${wCls}">`;
          if (key.aboveColor) {
            html += `<span class="kbd-color-name kbd-clr-${key.aboveColor.toLowerCase()}">${this._esc(key.aboveColor)}</span>`;
          }
          html += "</span>";
        }
        html += "</div>";
        html += '<div class="kbd-label-row">';
        for (const key of row) {
          const wCls = this._widthClass(key.width);
          if (key.arrow) {
            html += `<span class="kbd-label-cell ${wCls}"><span class="kbd-above-text kbd-arrow">${this._arrowSVG(key.arrow)}</span></span>`;
          } else {
            html += `<span class="kbd-label-cell ${wCls}"><span class="kbd-above-text">${this._esc(key.above)}</span></span>`;
          }
        }
        html += "</div>";
      } else {
        html += '<div class="kbd-label-row">';
        for (const key of row) {
          const wCls = this._widthClass(key.width);
          html += `<span class="kbd-label-cell ${wCls}"><span class="kbd-above-text">${this._esc(key.above)}</span></span>`;
        }
        html += "</div>";
      }

      // --- Key row ---
      html += '<div class="kbd-row">';
      for (const key of row) {
        const wCls = this._widthClass(key.width);
        const shiftAttr = key.shift ? ` data-shift="${key.shift}"` : "";
        const needsCenter = !key.symChar && !key.keyword && !key.space;
        const centerCls = needsCenter ? " kbd-key-center" : "";
        const spaceCls = key.space ? " kbd-key-space" : "";
        html += `<div class="kbd-key ${wCls}${centerCls}${spaceCls}" data-row="${key.row}" data-bit="${key.bit}"${shiftAttr}>`;

        if (key.space) {
          // SPACE key: BREAK (small) above SPACE (large), both centered
          html += `<span class="kbd-space-break">${this._esc(key.keyword)}</span>`;
          html += `<span class="kbd-space-label">${this._esc(key.main)}</span>`;
        } else {
          // Top row: main letter (left) + symbol shift char (right)
          html += '<span class="kbd-top">';
          const mainLines = key.main.split("\n");
          if (mainLines.length > 1) {
            html += `<span class="kbd-main kbd-main-small">${mainLines.map((l) => this._esc(l)).join("<br>")}</span>`;
          } else if (needsCenter) {
            html += `<span class="kbd-main kbd-main-center">${this._esc(key.main)}</span>`;
          } else {
            html += `<span class="kbd-main">${this._esc(key.main)}</span>`;
          }
          const symWordCls = key.symChar && key.symChar.length > 1 ? " kbd-sym-word" : "";
          if (key.graphic) {
            html += '<span class="kbd-right-col">';
            html += '<span class="kbd-graphic">';
            const [tl, tr, bl, br] = key.graphic;
            html += `<span class="kbd-gfx-cell${tl ? " filled" : ""}"></span>`;
            html += `<span class="kbd-gfx-cell${tr ? " filled" : ""}"></span>`;
            html += `<span class="kbd-gfx-cell${bl ? " filled" : ""}"></span>`;
            html += `<span class="kbd-gfx-cell${br ? " filled" : ""}"></span>`;
            html += "</span>";
            html += `<span class="kbd-sym-char${symWordCls}">${this._esc(key.symChar)}</span>`;
            html += "</span>";
          } else {
            html += `<span class="kbd-sym-char${symWordCls}">${this._esc(key.symChar)}</span>`;
          }
          html += "</span>";

          // BASIC keyword (white, bottom-right) — skip for centered keys and empty keywords
          if (!needsCenter && key.keyword) {
            html += `<span class="kbd-keyword">${this._esc(key.keyword)}</span>`;
          }
        }

        html += "</div>";
      }
      html += "</div>";

      // --- Below labels row ---
      html += '<div class="kbd-label-row kbd-label-below">';
      for (const key of row) {
        const wCls = this._widthClass(key.width);
        html += `<span class="kbd-label-cell ${wCls}"><span class="kbd-below-text">${this._esc(key.below)}</span></span>`;
      }
      html += "</div>";

      html += "</div>"; // close kbd-section
    }

    html += "</div>";
    return html;
  }

  _widthClass(w) {
    if (w === 0.75) return "kbd-w075";
    if (w === 1.5) return "kbd-w1_5";
    return "kbd-w1";
  }

  _arrowSVG(dir) {
    // Outline arrow with tail, matching the ⇧ style on the real keyboard
    // All arrows are drawn pointing up then rotated
    const rotation = { up: 0, down: 180, left: 270, right: 90 }[dir] || 0;
    return `<svg class="kbd-arrow-svg" viewBox="0 0 16 20" fill="none" stroke="white" stroke-width="1.5" style="transform:rotate(${rotation}deg)"><path d="M8 1 L1 9 L5 9 L5 19 L11 19 L11 9 L15 9 Z"/></svg>`;
  }

  _esc(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  onContentRendered() {
    this.contentElement.querySelectorAll(".kbd-key").forEach((el) => {
      const row = el.dataset.row;
      const bit = el.dataset.bit;
      this._keyElements.set(`${row},${bit}`, el);
    });

    this.contentElement.addEventListener("mousedown", (e) =>
      this._handlePointerDown(e),
    );
    this.contentElement.addEventListener("mouseup", (e) =>
      this._handlePointerUp(e),
    );
    this.contentElement.addEventListener("mouseleave", (e) =>
      this._handlePointerUp(e),
    );
    this.contentElement.addEventListener(
      "touchstart",
      (e) => this._handleTouchStart(e),
      { passive: false },
    );
    this.contentElement.addEventListener(
      "touchend",
      (e) => this._handleTouchEnd(e),
      { passive: false },
    );
    this.contentElement.addEventListener(
      "touchcancel",
      (e) => this._handleTouchEnd(e),
      { passive: false },
    );

    document.addEventListener("keydown", this._onDocKeyDown);
    document.addEventListener("keyup", this._onDocKeyUp);

    // Auto-size window height to fit content (deferred so layout is computed)
    requestAnimationFrame(() => {
      const container = this.contentElement.querySelector(".kbd-container");
      if (!container) return;
      const headerH = this.headerElement ? this.headerElement.offsetHeight : 0;
      const contentH = container.scrollHeight;
      const totalH = headerH + contentH + 2; // +2 for border
      this.element.style.height = `${totalH}px`;
      this.currentHeight = totalH;
    });
  }

  // --- Click/touch input ---

  _getKeyFromEvent(e) {
    return e.target.closest(".kbd-key");
  }

  _handlePointerDown(e) {
    const el = this._getKeyFromEvent(e);
    if (!el) return;
    e.preventDefault();

    const row = parseInt(el.dataset.row, 10);
    const bit = parseInt(el.dataset.bit, 10);
    const shiftType = el.dataset.shift;

    if (shiftType) {
      if (shiftType === "caps") {
        this._capsShiftActive = !this._capsShiftActive;
        el.classList.toggle("shift-active", this._capsShiftActive);
        if (this._capsShiftActive) this.proxy.keyDown(row, bit);
        else this.proxy.keyUp(row, bit);
      } else if (shiftType === "symbol") {
        this._symbolShiftActive = !this._symbolShiftActive;
        el.classList.toggle("shift-active", this._symbolShiftActive);
        if (this._symbolShiftActive) this.proxy.keyDown(row, bit);
        else this.proxy.keyUp(row, bit);
      }
      return;
    }

    el.classList.add("pressed");
    this.proxy.keyDown(row, bit);
  }

  _handlePointerUp(e) {
    const el = this._getKeyFromEvent(e);
    if (!el || el.dataset.shift) return;

    const row = parseInt(el.dataset.row, 10);
    const bit = parseInt(el.dataset.bit, 10);

    el.classList.remove("pressed");
    this.proxy.keyUp(row, bit);
    this._releaseSticky();
  }

  _handleTouchStart(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const el = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest(".kbd-key");
      if (!el) continue;

      const row = parseInt(el.dataset.row, 10);
      const bit = parseInt(el.dataset.bit, 10);
      const shiftType = el.dataset.shift;

      if (shiftType) {
        if (shiftType === "caps") {
          this._capsShiftActive = !this._capsShiftActive;
          el.classList.toggle("shift-active", this._capsShiftActive);
          if (this._capsShiftActive) this.proxy.keyDown(row, bit);
          else this.proxy.keyUp(row, bit);
        } else if (shiftType === "symbol") {
          this._symbolShiftActive = !this._symbolShiftActive;
          el.classList.toggle("shift-active", this._symbolShiftActive);
          if (this._symbolShiftActive) this.proxy.keyDown(row, bit);
          else this.proxy.keyUp(row, bit);
        }
        continue;
      }

      el.classList.add("pressed");
      this.proxy.keyDown(row, bit);
    }
  }

  _handleTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const el = document
        .elementFromPoint(touch.clientX, touch.clientY)
        ?.closest(".kbd-key");
      if (!el || el.dataset.shift) continue;

      const row = parseInt(el.dataset.row, 10);
      const bit = parseInt(el.dataset.bit, 10);

      el.classList.remove("pressed");
      this.proxy.keyUp(row, bit);
    }
    this._releaseSticky();
  }

  _releaseSticky() {
    if (this._capsShiftActive) {
      this._capsShiftActive = false;
      const csEl = this._keyElements.get("0,0");
      if (csEl) csEl.classList.remove("shift-active");
      this.proxy.keyUp(0, 0);
    }
    if (this._symbolShiftActive) {
      this._symbolShiftActive = false;
      const ssEl = this._keyElements.get("7,1");
      if (ssEl) ssEl.classList.remove("shift-active");
      this.proxy.keyUp(7, 1);
    }
  }

  // --- Physical keyboard highlighting ---

  _handleKeyDown(e) {
    const mapping = KEY_MAP[e.code];
    if (!mapping) return;
    for (const [row, bit] of mapping) {
      const el = this._keyElements.get(`${row},${bit}`);
      if (el) el.classList.add("pressed");
    }
  }

  _handleKeyUp(e) {
    const mapping = KEY_MAP[e.code];
    if (!mapping) return;
    for (const [row, bit] of mapping) {
      const el = this._keyElements.get(`${row},${bit}`);
      if (el) el.classList.remove("pressed");
    }
  }

  destroy() {
    document.removeEventListener("keydown", this._onDocKeyDown);
    document.removeEventListener("keyup", this._onDocKeyUp);
    super.destroy();
  }
}
