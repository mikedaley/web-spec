/*
 * stack-viewer-window.js - Z80 stack viewer debug window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { z80Disassemble } from "./z80-disassembler.js";
import "../css/stack-viewer.css";

export class StackViewerWindow extends BaseWindow {
  constructor() {
    super({
      id: "stack-viewer",
      title: "Stack Viewer",
      defaultWidth: 280,
      defaultHeight: 400,
      minWidth: 280,
      minHeight: 250,
      maxWidth: 280,
      defaultPosition: { x: 560, y: 60 },
    });
    this.previousSP = 0xffff;
    this.lastUpdateTime = 0;
    this.updateInterval = 1000 / 5;
  }

  renderContent() {
    return `
      <div class="stack-info">
        <span class="stack-sp-label">SP:</span>
        <span class="stack-sp-value" id="stack-sp-value">FFFF</span>
        <span class="stack-depth-label">Depth:</span>
        <span class="stack-depth-value" id="stack-depth-value">0</span>
      </div>
      <div class="stack-header">
        <span class="stack-col-addr">Addr</span>
        <span class="stack-col-value">Value</span>
        <span class="stack-col-info">Info</span>
      </div>
      <div class="stack-content" id="stack-content"></div>
    `;
  }

  onContentRendered() {
    this.spValueEl = this.contentElement.querySelector("#stack-sp-value");
    this.depthValueEl = this.contentElement.querySelector("#stack-depth-value");
    this.contentDiv = this.contentElement.querySelector("#stack-content");
  }

  /**
   * Check if a return address on the stack likely came from a CALL instruction.
   * Looks backwards from the return address to see if a CALL/RST preceded it.
   */
  analyzeReturnAddress(addr, wasm) {
    if (addr < 1 || addr > 0xffff) return null;

    // Check for CALL nn (3 bytes: CD xx xx, or conditional variants)
    const callAddr = (addr - 3) & 0xffff;
    const opcode = wasm._readMemory(callAddr);

    const isCall = opcode === 0xcd || opcode === 0xc4 || opcode === 0xcc ||
                   opcode === 0xd4 || opcode === 0xdc || opcode === 0xe4 ||
                   opcode === 0xec || opcode === 0xf4 || opcode === 0xfc;

    if (isCall) {
      const result = z80Disassemble(callAddr, (a) => wasm._readMemory(a));
      return { addr, mnemonic: result.mnemonic };
    }

    // Check for RST (1 byte, return addr is RST+1)
    const rstAddr = (addr - 1) & 0xffff;
    const rstOpcode = wasm._readMemory(rstAddr);
    const isRst = (rstOpcode & 0xc7) === 0xc7;

    if (isRst) {
      const result = z80Disassemble(rstAddr, (a) => wasm._readMemory(a));
      return { addr, mnemonic: result.mnemonic };
    }

    return null;
  }

  update(wasmModule) {
    if (!wasmModule || !this.contentDiv) return;

    const paused = wasmModule._isPaused();
    const emulator = window.zxspec;
    const running = emulator?.isRunning() ?? false;

    // Throttle while running, instant when paused
    if (!paused && running) {
      const now = performance.now();
      if (now - this.lastUpdateTime < this.updateInterval) return;
      this.lastUpdateTime = now;
    }

    const sp = wasmModule._getSP();

    // Z80 stack grows downward from initial SP. Use a reasonable
    // reference point for depth calculation. Most Spectrum programs
    // set SP to a value and grow down from there.
    const stackBase = 0xffff;
    const stackDepth = (stackBase - sp) & 0xffff;
    const displayDepth = Math.min(stackDepth, 256); // Cap display

    // Update SP display
    this.spValueEl.textContent = sp.toString(16).toUpperCase().padStart(4, "0");
    this.depthValueEl.textContent = displayDepth.toString();

    // Build stack view - show entries from SP upward
    const maxEntries = 64;
    const entries = Math.min(displayDepth, maxEntries);

    if (entries === 0) {
      this.contentDiv.innerHTML = '<div class="stack-empty">Stack is empty</div>';
      this.previousSP = sp;
      return;
    }

    let html = "";
    let i = 0;

    while (i < entries) {
      const addr = (sp + i) & 0xffff;
      const value = wasmModule._readMemory(addr);
      const isTop = i === 0;

      // Try to detect return address pairs (low byte at SP, high byte at SP+1)
      let returnInfo = null;
      let isReturnHigh = false;

      if (i + 1 < entries) {
        const low = value;
        const high = wasmModule._readMemory((addr + 1) & 0xffff);
        const retAddr = (high << 8) | low;
        returnInfo = this.analyzeReturnAddress(retAddr, wasmModule);

        if (returnInfo) {
          isReturnHigh = true;
        }
      }

      const classes = ["stack-entry"];
      if (isTop) classes.push("stack-top");

      if (isReturnHigh) {
        // Render the return address pair as two highlighted rows
        const low = value;
        const high = wasmModule._readMemory((addr + 1) & 0xffff);
        const addrStr = addr.toString(16).toUpperCase().padStart(4, "0");
        const addr2Str = ((addr + 1) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
        const lowStr = low.toString(16).toUpperCase().padStart(2, "0");
        const highStr = high.toString(16).toUpperCase().padStart(2, "0");
        const retAddrStr = returnInfo.addr.toString(16).toUpperCase().padStart(4, "0");

        const classes1 = ["stack-entry", "return-addr-low"];
        if (isTop) classes1.push("stack-top");
        const classes2 = ["stack-entry", "return-addr-high"];

        html += `<div class="${classes1.join(" ")}">`;
        html += `<span class="stack-addr">${addrStr}</span>`;
        html += `<span class="stack-value">${lowStr}</span>`;
        html += `<span class="stack-info-text">${retAddrStr} ${returnInfo.mnemonic}</span>`;
        html += `</div>`;

        html += `<div class="${classes2.join(" ")}">`;
        html += `<span class="stack-addr">${addr2Str}</span>`;
        html += `<span class="stack-value">${highStr}</span>`;
        html += `<span class="stack-info-text"></span>`;
        html += `</div>`;

        i += 2;
        continue;
      }

      const addrStr = addr.toString(16).toUpperCase().padStart(4, "0");
      const valStr = value.toString(16).toUpperCase().padStart(2, "0");
      let infoStr = "";
      if (value >= 0x20 && value < 0x7f) {
        infoStr = `'${String.fromCharCode(value)}'`;
      }

      html += `<div class="${classes.join(" ")}">`;
      html += `<span class="stack-addr">${addrStr}</span>`;
      html += `<span class="stack-value">${valStr}</span>`;
      html += `<span class="stack-info-text">${infoStr}</span>`;
      html += `</div>`;

      i++;
    }

    this.contentDiv.innerHTML = html;
    this.previousSP = sp;
  }
}
