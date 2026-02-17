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
    this._memoryPending = false;
    this._proxy = null;
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

  analyzeReturnAddress(addr, stackData, stackBase) {
    if (addr < 1 || addr > 0xffff) return null;

    // We need memory at (addr-3) to check for CALL instructions.
    // This requires separate memory — we'll use a simple check from the
    // stack data if the call site happens to be in the stack region,
    // otherwise return null (we can't easily read arbitrary memory synchronously).
    // For a better experience, we'd need to pre-fetch the call-site memory too.
    // For now, skip return address analysis when using async memory.
    return null;
  }

  renderFromData(sp, stackData) {
    const stackBase = 0xffff;
    const stackDepth = (stackBase - sp) & 0xffff;
    const displayDepth = Math.min(stackDepth, 256);

    this.spValueEl.textContent = sp.toString(16).toUpperCase().padStart(4, "0");
    this.depthValueEl.textContent = displayDepth.toString();

    const maxEntries = 64;
    const entries = Math.min(displayDepth, maxEntries);

    if (entries === 0) {
      this.contentDiv.innerHTML = '<div class="stack-empty">Stack is empty</div>';
      this.previousSP = sp;
      return;
    }

    let html = "";
    let i = 0;

    while (i < entries && i < stackData.length) {
      const addr = (sp + i) & 0xffff;
      const value = stackData[i];
      const isTop = i === 0;

      const classes = ["stack-entry"];
      if (isTop) classes.push("stack-top");

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

  update(proxy) {
    if (!proxy || !this.contentDiv) return;
    this._proxy = proxy;

    const paused = proxy.isPaused();
    const emulator = window.zxspec;
    const running = emulator?.isRunning() ?? false;

    // Throttle while running, instant when paused
    if (!paused && running) {
      const now = performance.now();
      if (now - this.lastUpdateTime < this.updateInterval) return;
      this.lastUpdateTime = now;
    }

    if (this._memoryPending) return;

    const sp = proxy.getSP();
    const stackBase = 0xffff;
    const stackDepth = (stackBase - sp) & 0xffff;
    const displayDepth = Math.min(stackDepth, 256);
    const maxEntries = Math.min(displayDepth, 64);

    if (maxEntries === 0) {
      this.renderFromData(sp, new Uint8Array(0));
      return;
    }

    this._memoryPending = true;
    proxy.readMemory(sp, maxEntries).then((data) => {
      this._memoryPending = false;
      this.renderFromData(sp, data);
    });
  }
}
