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

// Each entry: [row, bit] pairs. Keys needing a modifier have two pairs.
// Bit 0 is the leftmost key in each row above.
const KEY_MAP = {
  // Row 0: CAPS SHIFT(0,0) Z(0,1) X(0,2) C(0,3) V(0,4)
  ShiftLeft: [[0, 0]],
  ShiftRight: [[0, 0]],
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

  // Row 7: SPACE(7,0) SYMBOL SHIFT(7,1) M(7,2) N(7,3) B(7,4)
  Space: [[7, 0]],
  ControlLeft: [[7, 1]],
  ControlRight: [[7, 1]],
  KeyM: [[7, 2]],
  KeyN: [[7, 3]],
  KeyB: [[7, 4]],

  // Convenience mappings: arrow keys = CAPS SHIFT + 5/6/7/8
  ArrowLeft: [[0, 0], [3, 4]],   // CAPS SHIFT + 5
  ArrowDown: [[0, 0], [4, 4]],   // CAPS SHIFT + 6
  ArrowUp: [[0, 0], [4, 3]],     // CAPS SHIFT + 7
  ArrowRight: [[0, 0], [4, 2]],  // CAPS SHIFT + 8

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

export class InputHandler {
  constructor(proxy) {
    this.proxy = proxy;
    this.canvas = null;
    this.pressedKeys = new Set();

    // Reference count for each matrix bit so compound keys sharing a bit
    // (e.g. ArrowLeft and ShiftLeft both press [0,0]) don't release it
    // prematurely when only one key is lifted.
    this._bitRefCount = new Array(8 * 5).fill(0);

    this._onKeyDown = (e) => this.handleKeyDown(e);
    this._onKeyUp = (e) => this.handleKeyUp(e);
    this._onBlur = () => this.releaseAllKeys();
  }

  _bitIndex(row, bit) {
    return row * 5 + bit;
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

  handleKeyDown(event) {
    // Don't intercept typing in input fields
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;

    const mapping = KEY_MAP[event.code];
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
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;

    const mapping = KEY_MAP[event.code];
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
      const mapping = KEY_MAP[code];
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
