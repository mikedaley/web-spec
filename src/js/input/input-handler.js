/*
 * input-handler.js - Keyboard input handling for ZX Spectrum emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class InputHandler {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.canvas = null;
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
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));
    document.addEventListener("keyup", (e) => this.handleKeyUp(e));
  }

  handleKeyDown(event) {
    // TODO: Map browser keycodes to ZX Spectrum keyboard matrix
    // The ZX Spectrum uses a 8x5 keyboard matrix read via port 0xFE.
    // Each half-row is selected by the high byte of the port address.
    // This will need a mapping from browser key codes to matrix positions.
  }

  handleKeyUp(event) {
    // TODO: Release ZX Spectrum key from keyboard matrix
  }

  destroy() {
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
  }
}
