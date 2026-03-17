/*
 * input-handler.js - Keyboard input handling for ZX Spectrum emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 *
 * ZX Spectrum 8x5 keyboard matrix (active LOW):
 *
 *   Row 0: CAPS SHIFT, Z, X, C, V         (port 0xFEFE)
 *   Row 1: A, S, D, F, G                   (port 0xFDFE)
 *   Row 2: Q, W, E, R, T                   (port 0xFBFE)
 *   Row 3: 1, 2, 3, 4, 5                   (port 0xF7FE)
 *   Row 4: 0, 9, 8, 7, 6                   (port 0xEFFE)
 *   Row 5: P, O, I, U, Y                   (port 0xDFFE)
 *   Row 6: ENTER, L, K, J, H               (port 0xBFFE)
 *   Row 7: SPACE, SYMBOL SHIFT, M, N, B    (port 0x7FFE)
 */

const STORAGE_KEY = "zxspec-key-mappings";

// Spectrum matrix positions for the shift keys
const CAPS_SHIFT_MATRIX = [0, 0];   // row 0, bit 0
const SYMBOL_SHIFT_MATRIX = [7, 1]; // row 7, bit 1

// Default physical key codes for the two shift keys
const DEFAULT_CAPS_SHIFT_CODES = ["ShiftLeft", "ShiftRight"];
const DEFAULT_SYMBOL_SHIFT_CODES = ["ControlLeft", "ControlRight"];

// Base key map — everything except the shift keys (which are configurable)
// Each entry: [row, bit] pairs. Keys needing a modifier have two pairs.
// Bit 0 is the leftmost key in each row above.
const BASE_KEY_MAP = {
  // Row 0: Z(0,1) X(0,2) C(0,3) V(0,4)
  KeyZ: [[0, 1]],
  KeyX: [[0, 2]],
  KeyC: [[0, 3]],
  KeyV: [[0, 4]],

  // Row 1: A(1,0) S(1,1) D(1,2) F(1,3) G(1,4)
  KeyA: [[1, 0]],
  KeyS: [[1, 1]],
  KeyD: [[1, 2]],
  KeyF: [[1, 3]],
  KeyG: [[1, 4]],

  // Row 2: Q(2,0) W(2,1) E(2,2) R(2,3) T(2,4)
  KeyQ: [[2, 0]],
  KeyW: [[2, 1]],
  KeyE: [[2, 2]],
  KeyR: [[2, 3]],
  KeyT: [[2, 4]],

  // Row 3: 1(3,0) 2(3,1) 3(3,2) 4(3,3) 5(3,4)
  Digit1: [[3, 0]],
  Digit2: [[3, 1]],
  Digit3: [[3, 2]],
  Digit4: [[3, 3]],
  Digit5: [[3, 4]],

  // Row 4: 0(4,0) 9(4,1) 8(4,2) 7(4,3) 6(4,4)
  Digit0: [[4, 0]],
  Digit9: [[4, 1]],
  Digit8: [[4, 2]],
  Digit7: [[4, 3]],
  Digit6: [[4, 4]],

  // Row 5: P(5,0) O(5,1) I(5,2) U(5,3) Y(5,4)
  KeyP: [[5, 0]],
  KeyO: [[5, 1]],
  KeyI: [[5, 2]],
  KeyU: [[5, 3]],
  KeyY: [[5, 4]],

  // Row 6: ENTER(6,0) L(6,1) K(6,2) J(6,3) H(6,4)
  Enter: [[6, 0]],
  KeyL: [[6, 1]],
  KeyK: [[6, 2]],
  KeyJ: [[6, 3]],
  KeyH: [[6, 4]],

  // Row 7: SPACE(7,0) M(7,2) N(7,3) B(7,4)
  Space: [[7, 0]],
  KeyM: [[7, 2]],
  KeyN: [[7, 3]],
  KeyB: [[7, 4]],

  // Convenience mappings: arrow keys = CAPS SHIFT + 5/6/7/8
  ArrowLeft: [[0, 0], [3, 4]],   // CAPS SHIFT + 5
  ArrowDown: [[0, 0], [4, 4]],   // CAPS SHIFT + 6
  ArrowUp: [[0, 0], [4, 3]],     // CAPS SHIFT + 7
  ArrowRight: [[0, 0], [4, 2]],  // CAPS SHIFT + 8

  // Numpad arrows (same as arrow keys)
  Numpad4: [[0, 0], [3, 4]],     // CAPS SHIFT + 5 (left)
  Numpad2: [[0, 0], [4, 4]],     // CAPS SHIFT + 6 (down)
  Numpad8: [[0, 0], [4, 3]],     // CAPS SHIFT + 7 (up)
  Numpad6: [[0, 0], [4, 2]],     // CAPS SHIFT + 8 (right)
  Numpad0: [[0, 0], [4, 0]],     // CAPS SHIFT + 0 (delete / fire)

  // Backspace = CAPS SHIFT + 0 (DELETE)
  Backspace: [[0, 0], [4, 0]],

  // Punctuation: SYMBOL SHIFT(7,1) + key
  Comma: [[7, 1], [7, 3]],        // , = SS + N
  Period: [[7, 1], [7, 2]],       // . = SS + M
  Quote: [[7, 1], [5, 0]],        // " = SS + P
  Semicolon: [[7, 1], [5, 1]],    // ; = SS + O
  Slash: [[7, 1], [0, 4]],        // / = SS + V
  Minus: [[7, 1], [6, 3]],        // - = SS + J
  Equal: [[7, 1], [6, 1]],        // = = SS + L
};

// Friendly label for a key code
function keyCodeLabel(code) {
  if (!code) return "—";
  return code
    .replace("ShiftLeft", "Left Shift")
    .replace("ShiftRight", "Right Shift")
    .replace("ControlLeft", "Left Ctrl")
    .replace("ControlRight", "Right Ctrl")
    .replace("AltLeft", "Left Alt")
    .replace("AltRight", "Right Alt")
    .replace("MetaLeft", "Left Meta")
    .replace("MetaRight", "Right Meta")
    .replace("Key", "")
    .replace("Digit", "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

export { CAPS_SHIFT_MATRIX, SYMBOL_SHIFT_MATRIX, keyCodeLabel };

export class InputHandler {
  constructor(proxy) {
    this.proxy = proxy;
    this.canvas = null;
    this.pressedKeys = new Set();

    // Reference count for each matrix bit so compound keys sharing a bit
    // (e.g. ArrowLeft and ShiftLeft both press [0,0]) don't release it
    // prematurely when only one key is lifted.
    this._bitRefCount = new Array(8 * 5).fill(0);

    this._enabled = true;
    this._onKeyDown = (e) => this.handleKeyDown(e);
    this._onKeyUp = (e) => this.handleKeyUp(e);
    this._onBlur = () => this.releaseAllKeys();

    // Configurable shift key codes
    this._capsShiftCodes = [...DEFAULT_CAPS_SHIFT_CODES];
    this._symbolShiftCodes = [...DEFAULT_SYMBOL_SHIFT_CODES];

    this._loadMappings();
    this._rebuildKeyMap();
  }

  _bitIndex(row, bit) {
    return row * 5 + bit;
  }

  // Build the active KEY_MAP from base map + current shift key assignments
  _rebuildKeyMap() {
    this._keyMap = { ...BASE_KEY_MAP };
    for (const code of this._capsShiftCodes) {
      this._keyMap[code] = [CAPS_SHIFT_MATRIX];
    }
    for (const code of this._symbolShiftCodes) {
      this._keyMap[code] = [SYMBOL_SHIFT_MATRIX];
    }
  }

  _loadMappings() {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      if (!json) return;
      const data = JSON.parse(json);
      if (Array.isArray(data.capsShift) && data.capsShift.length > 0) {
        this._capsShiftCodes = data.capsShift;
      }
      if (Array.isArray(data.symbolShift) && data.symbolShift.length > 0) {
        this._symbolShiftCodes = data.symbolShift;
      }
    } catch { /* ignore corrupt data */ }
  }

  _saveMappings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      capsShift: this._capsShiftCodes,
      symbolShift: this._symbolShiftCodes,
    }));
  }

  // Public API for getting/setting shift key codes
  getCapsShiftCodes() { return [...this._capsShiftCodes]; }
  getSymbolShiftCodes() { return [...this._symbolShiftCodes]; }
  getKeyMap() { return this._keyMap; }

  setCapsShiftCodes(codes) {
    this.releaseAllKeys();
    this._capsShiftCodes = [...codes];
    this._rebuildKeyMap();
    this._saveMappings();
  }

  setSymbolShiftCodes(codes) {
    this.releaseAllKeys();
    this._symbolShiftCodes = [...codes];
    this._rebuildKeyMap();
    this._saveMappings();
  }

  resetToDefaults() {
    this.releaseAllKeys();
    this._capsShiftCodes = [...DEFAULT_CAPS_SHIFT_CODES];
    this._symbolShiftCodes = [...DEFAULT_SYMBOL_SHIFT_CODES];
    this._rebuildKeyMap();
    this._saveMappings();
  }

  isCapsShiftCode(code) {
    return this._capsShiftCodes.includes(code);
  }

  isSymbolShiftCode(code) {
    return this._symbolShiftCodes.includes(code);
  }

  init() {
    this.canvas = document.getElementById("screen");
    if (this.canvas) {
      this.canvas.tabIndex = 1;
    }

    // Focus canvas on click
    if (this.canvas) {
      this.canvas.addEventListener("click", () => {
        this.canvas.focus();
      });
    }

    // Keyboard event listeners
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);

    // Release all keys when window loses focus to prevent stuck keys
    window.addEventListener("blur", this._onBlur);
  }

  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) this.releaseAllKeys();
  }

  handleKeyDown(event) {
    if (!this._enabled) return;
    // Don't intercept typing in input fields
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;

    const mapping = this._keyMap[event.code];
    if (!mapping) return;

    event.preventDefault();

    // Ignore OS key repeat (matches SpectREMCPP's !event.isARepeat)
    if (event.repeat) return;

    if (this.pressedKeys.has(event.code)) return;
    this.pressedKeys.add(event.code);

    for (const [row, bit] of mapping) {
      const idx = this._bitIndex(row, bit);
      this._bitRefCount[idx]++;
      if (this._bitRefCount[idx] === 1) {
        this.proxy.keyDown(row, bit);
      }
    }
  }

  handleKeyUp(event) {
    if (!this._enabled) return;
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;

    const mapping = this._keyMap[event.code];
    if (!mapping) return;

    event.preventDefault();

    if (!this.pressedKeys.has(event.code)) return;
    this.pressedKeys.delete(event.code);

    for (const [row, bit] of mapping) {
      const idx = this._bitIndex(row, bit);
      this._bitRefCount[idx]--;
      if (this._bitRefCount[idx] <= 0) {
        this._bitRefCount[idx] = 0;
        this.proxy.keyUp(row, bit);
      }
    }
  }

  releaseAllKeys() {
    for (const code of this.pressedKeys) {
      const mapping = this._keyMap[code];
      if (!mapping) continue;
      for (const [row, bit] of mapping) {
        this.proxy.keyUp(row, bit);
      }
    }
    this.pressedKeys.clear();
    this._bitRefCount.fill(0);
  }

  destroy() {
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
  }
}
