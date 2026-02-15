/*
 * cpu-debugger-window.js - Z80 CPU debugger window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { BreakpointManager } from "./breakpoint-manager.js";
import "../css/cpu-debugger.css";
import { z80Disassemble } from "./z80-disassembler.js";

const DISASM_LINES = 48;

export class CPUDebuggerWindow extends BaseWindow {
  constructor() {
    super({
      id: "cpu-debugger",
      title: "Z80 Debugger",
      minWidth: 420,
      minHeight: 360,
      defaultWidth: 480,
      defaultHeight: 540,
      defaultPosition: { x: 60, y: 60 },
    });

    this.breakpointManager = new BreakpointManager();
    this.prevValues = {};
    this.elements = null;
    this.wasmSynced = false;
    this.activeTab = "breakpoints";
    this.followPC = true;
    this.disasmBaseAddr = 0;
    this.lastUpdateTime = 0;
    this.updateInterval = 1000 / 5; // 5 updates per second
  }

  renderContent() {
    return `
      <div class="cpu-dbg">
        <div class="cpu-dbg-toolbar">
          <div class="cpu-dbg-btn-group">
            <button class="cpu-dbg-btn cpu-btn-run-pause" id="dbg-run-pause" title="Run/Pause">⏸ Pause</button>
          </div>
          <span class="cpu-dbg-sep"></span>
          <div class="cpu-dbg-btn-group">
            <button class="cpu-dbg-btn cpu-btn-step" id="dbg-step" title="Step Into">Step</button>
            <button class="cpu-dbg-btn cpu-btn-step" id="dbg-step-over" title="Step Over">Over</button>
            <button class="cpu-dbg-btn cpu-btn-step" id="dbg-step-out" title="Step Out">Out</button>
          </div>
        </div>

        <div class="cpu-dbg-status-bar" data-state="off">
          <div class="cpu-dbg-status-bar-left">
            <span class="cpu-dbg-status-dot"></span>
            <span class="cpu-dbg-status-text" id="dbg-status">EMULATOR OFF</span>
          </div>
        </div>

        <div class="cpu-dbg-section">
          <span class="cpu-dbg-section-label">REGS</span>
          <div class="cpu-dbg-regs">
            <div class="cpu-dbg-reg"><span class="reg-label">AF</span><span class="reg-value" id="reg-af" data-reg="AF" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">BC</span><span class="reg-value" id="reg-bc" data-reg="BC" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">DE</span><span class="reg-value" id="reg-de" data-reg="DE" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">HL</span><span class="reg-value" id="reg-hl" data-reg="HL" data-digits="4">0000</span></div>
          </div>
        </div>

        <div class="cpu-dbg-section">
          <span class="cpu-dbg-section-label">INDEX</span>
          <div class="cpu-dbg-regs">
            <div class="cpu-dbg-reg"><span class="reg-label">IX</span><span class="reg-value" id="reg-ix" data-reg="IX" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">IY</span><span class="reg-value" id="reg-iy" data-reg="IY" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">SP</span><span class="reg-value" id="reg-sp" data-reg="SP" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg reg-wide"><span class="reg-label">PC</span><span class="reg-value" id="reg-pc" data-reg="PC" data-digits="4">0000</span></div>
          </div>
        </div>

        <div class="cpu-dbg-section">
          <span class="cpu-dbg-section-label">FLAGS</span>
          <div class="cpu-flags" id="cpu-flags">
            <span class="flag" id="flag-S" title="Sign">S</span>
            <span class="flag" id="flag-Z" title="Zero">Z</span>
            <span class="flag" id="flag-H" title="Half Carry">H</span>
            <span class="flag" id="flag-PV" title="Parity/Overflow">P</span>
            <span class="flag" id="flag-N" title="Subtract">N</span>
            <span class="flag" id="flag-C" title="Carry">C</span>
          </div>
        </div>

        <div class="cpu-dbg-section">
          <span class="cpu-dbg-section-label">MISC</span>
          <div class="cpu-dbg-regs">
            <div class="cpu-dbg-reg"><span class="reg-label">I</span><span class="reg-value" id="reg-i" data-reg="I" data-digits="2">00</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">R</span><span class="reg-value" id="reg-r" data-reg="R" data-digits="2">00</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">IM</span><span class="reg-value" id="reg-im" data-reg="IM" data-digits="1">0</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">IFF1</span><span class="reg-value" id="reg-iff1" data-reg="IFF1" data-digits="1">0</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">IFF2</span><span class="reg-value" id="reg-iff2" data-reg="IFF2" data-digits="1">0</span></div>
          </div>
        </div>

        <div class="cpu-dbg-section">
          <span class="cpu-dbg-section-label">ALT</span>
          <div class="cpu-dbg-regs">
            <div class="cpu-dbg-reg"><span class="reg-label">AF'</span><span class="reg-value" id="reg-alt-af" data-reg="AF'" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">BC'</span><span class="reg-value" id="reg-alt-bc" data-reg="BC'" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">DE'</span><span class="reg-value" id="reg-alt-de" data-reg="DE'" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">HL'</span><span class="reg-value" id="reg-alt-hl" data-reg="HL'" data-digits="4">0000</span></div>
          </div>
        </div>

        <div class="cpu-dbg-section">
          <span class="cpu-dbg-section-label">TIMING</span>
          <div class="cpu-dbg-timing-row">
            <span class="cpu-dbg-cycles" title="T-states in current frame"><span class="meta-dim">T</span> <span id="reg-ts">0</span></span>
          </div>
        </div>

        <div class="cpu-dbg-disasm">
          <div class="cpu-dbg-disasm-bar">
            <input type="text" id="disasm-goto-input" placeholder="Address (hex)" spellcheck="false">
            <button class="cpu-dbg-bar-btn" id="disasm-goto-btn" title="Go to address">Go</button>
            <button class="cpu-dbg-bar-btn" id="disasm-goto-pc" title="Follow PC">PC</button>
          </div>
          <div class="cpu-disasm-view" id="disasm-view"></div>
        </div>

        <div class="cpu-dbg-tabs">
          <div class="cpu-dbg-tab-bar">
            <button class="cpu-dbg-tab active" data-tab="breakpoints">Breakpoints <span class="cpu-dbg-tab-count" id="bp-tab-count">0</span></button>
          </div>
          <div class="cpu-dbg-tab-content active" data-tab="breakpoints">
            <div class="cpu-dbg-tab-toolbar">
              <input type="text" id="cpu-dbg-bp-input" placeholder="Address (hex)" spellcheck="false">
              <button class="cpu-dbg-add-btn" id="cpu-dbg-bp-add" title="Add breakpoint">+</button>
            </div>
            <div class="cpu-bp-list" id="cpu-dbg-bp-list"></div>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this.cacheElements();
    this.setupHandlers();
    this.renderBreakpointList();
  }

  cacheElements() {
    const el = this.contentElement;
    this.elements = {
      toolbar: {
        runPause: el.querySelector("#dbg-run-pause"),
        step: el.querySelector("#dbg-step"),
        over: el.querySelector("#dbg-step-over"),
        out: el.querySelector("#dbg-step-out"),
      },
      statusBar: el.querySelector(".cpu-dbg-status-bar"),
      statusText: el.querySelector("#dbg-status"),
      disasmView: el.querySelector("#disasm-view"),
      disasmGotoInput: el.querySelector("#disasm-goto-input"),
      disasmGotoBtn: el.querySelector("#disasm-goto-btn"),
      disasmGotoPC: el.querySelector("#disasm-goto-pc"),
      bpInput: el.querySelector("#cpu-dbg-bp-input"),
      bpAdd: el.querySelector("#cpu-dbg-bp-add"),
      bpList: el.querySelector("#cpu-dbg-bp-list"),
      bpTabCount: el.querySelector("#bp-tab-count"),
    };
  }

  setupHandlers() {
    const el = this.contentElement;

    // Toolbar
    this.elements.toolbar.runPause.addEventListener("click", () => this.handleRunPause());
    this.elements.toolbar.step.addEventListener("click", () => this.handleStep());
    this.elements.toolbar.over.addEventListener("click", () => this.handleStepOver());
    this.elements.toolbar.out.addEventListener("click", () => this.handleStepOut());

    // Breakpoint add
    this.elements.bpAdd.addEventListener("click", () => this.handleAddBreakpoint());
    this.elements.bpInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleAddBreakpoint();
    });

    // Disasm goto
    this.elements.disasmGotoBtn.addEventListener("click", () => this.handleGotoAddress());
    this.elements.disasmGotoInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleGotoAddress();
    });
    this.elements.disasmGotoPC.addEventListener("click", () => {
      this.followPC = true;
      this.renderDisassembly(this._wasmModule);
    });

    // Disassembly click for breakpoint toggle
    this.elements.disasmView.addEventListener("click", (e) => {
      const line = e.target.closest(".cpu-disasm-line");
      if (line) {
        const addr = parseInt(line.dataset.addr, 16);
        this.breakpointManager.toggle(addr);
        if (this._wasmModule) {
          if (this.breakpointManager.has(addr)) {
            this.breakpointManager.addToWasm(this._wasmModule, addr);
          } else {
            this.breakpointManager.removeFromWasm(this._wasmModule, addr);
          }
        }
        this.renderBreakpointList();
        this.renderDisassembly(this._wasmModule);
      }
    });

    // Tab switching
    el.querySelectorAll(".cpu-dbg-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        el.querySelectorAll(".cpu-dbg-tab").forEach((t) => t.classList.remove("active"));
        el.querySelectorAll(".cpu-dbg-tab-content").forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        const panel = el.querySelector(`.cpu-dbg-tab-content[data-tab="${tab.dataset.tab}"]`);
        if (panel) panel.classList.add("active");
        this.activeTab = tab.dataset.tab;
      });
    });

    // Register double-click to edit
    this.contentElement.addEventListener("dblclick", (e) => {
      const regValue = e.target.closest(".reg-value");
      if (regValue && this._wasmModule?._isPaused?.()) {
        this.startRegisterEdit(regValue);
      }
    });
  }

  updateRegisters(wasm) {
    const regs = {
      af: wasm._getAF(), bc: wasm._getBC(), de: wasm._getDE(), hl: wasm._getHL(),
      ix: wasm._getIX(), iy: wasm._getIY(), sp: wasm._getSP(), pc: wasm._getPC(),
      i: wasm._getI(), r: wasm._getR(), im: wasm._getIM(),
      iff1: wasm._getIFF1(), iff2: wasm._getIFF2(), ts: wasm._getTStates(),
      "alt-af": wasm._getAltAF(), "alt-bc": wasm._getAltBC(),
      "alt-de": wasm._getAltDE(), "alt-hl": wasm._getAltHL(),
    };

    for (const [name, value] of Object.entries(regs)) {
      const el = this.contentElement.querySelector(`#reg-${name}`);
      if (!el) continue;
      const digits = parseInt(el.dataset.digits) || 4;
      const hex = value.toString(16).toUpperCase().padStart(digits, "0");
      const changed = this.prevValues[`reg-${name}`] !== undefined && this.prevValues[`reg-${name}`] !== value;
      el.textContent = hex;
      el.classList.toggle("changed", changed);
      this.prevValues[`reg-${name}`] = value;
    }

    // Update flags from F register
    const f = regs.af & 0xFF;
    const flagBits = { S: 0x80, Z: 0x40, H: 0x10, PV: 0x04, N: 0x02, C: 0x01 };
    for (const [name, bit] of Object.entries(flagBits)) {
      const el = this.contentElement.querySelector(`#flag-${name}`);
      if (el) el.classList.toggle("active", (f & bit) !== 0);
    }
  }

  updateStatus(wasm, emulatorRunning) {
    const statusBar = this.elements.statusBar;
    const statusText = this.elements.statusText;

    const btn = this.elements.toolbar.runPause;

    if (!emulatorRunning) {
      statusBar.dataset.state = "off";
      statusText.textContent = "EMULATOR OFF";
      statusText.className = "cpu-dbg-status-text";
      btn.textContent = "⏸ Pause";
      btn.dataset.state = "pause";
    } else if (wasm._isPaused()) {
      statusBar.dataset.state = "paused";
      statusText.textContent = "PAUSED";
      statusText.className = "cpu-dbg-status-text";
      btn.textContent = "▶ Run";
      btn.dataset.state = "run";
    } else {
      statusBar.dataset.state = "running";
      statusText.textContent = "RUNNING";
      statusText.className = "cpu-dbg-status-text running";
      btn.textContent = "⏸ Pause";
      btn.dataset.state = "pause";
    }
  }

  renderDisassembly(wasm) {
    if (!wasm) return;

    const pc = wasm._getPC();
    let addr = this.followPC ? pc : this.disasmBaseAddr;

    // Start well before PC so scrollIntoView can centre it
    if (this.followPC) {
      addr = (addr - 40) & 0xFFFF;
    }

    let html = "";
    for (let i = 0; i < DISASM_LINES; i++) {
      const result = z80Disassemble(addr, (a) => wasm._readMemory(a));
      const isCurrent = addr === pc;
      const hasBp = this.breakpointManager.has(addr);

      const addrStr = addr.toString(16).toUpperCase().padStart(4, "0");
      const bytesStr = result.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");

      const lineClasses = ["cpu-disasm-line"];
      if (isCurrent) lineClasses.push("current");
      if (hasBp) lineClasses.push("breakpoint");

      html += `<div class="${lineClasses.join(" ")}" data-addr="${addrStr}">`;
      html += `<div class="cpu-disasm-gutter">`;
      if (hasBp) {
        html += `<span class="bp-dot"></span>`;
      } else if (isCurrent) {
        html += `<span class="pc-arrow">▶</span>`;
      }
      html += `</div>`;
      html += `<div class="cpu-disasm-addr">${addrStr}</div>`;
      html += `<div class="cpu-disasm-bytes">${bytesStr}</div>`;
      html += `<div class="cpu-disasm-mnemonic">${result.mnemonic}</div>`;
      html += `</div>`;

      addr = (addr + result.length) & 0xFFFF;
    }

    this.elements.disasmView.innerHTML = html;

    // Scroll current line into view
    const currentLine = this.elements.disasmView.querySelector(".current");
    if (currentLine) {
      currentLine.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }

  renderBreakpointList() {
    const bps = this.breakpointManager.getAll();

    // Update tab count
    if (this.elements?.bpTabCount) {
      this.elements.bpTabCount.textContent = bps.length;
      this.elements.bpTabCount.classList.toggle("has-items", bps.length > 0);
    }

    if (bps.length === 0) {
      this.elements.bpList.innerHTML = `<div class="cpu-dbg-empty-state">No breakpoints set</div>`;
      return;
    }
    this.elements.bpList.innerHTML = bps.map((bp) => {
      const addrStr = bp.addr.toString(16).toUpperCase().padStart(4, "0");
      return `<div class="cpu-bp-item" data-addr="${bp.addr}">
        <span class="bp-addr">$${addrStr}</span>
        <span class="bp-remove" data-action="remove" title="Remove">&times;</span>
      </div>`;
    }).join("");

    // Attach remove handlers
    this.elements.bpList.querySelectorAll("[data-action='remove']").forEach((el) => {
      el.addEventListener("click", (e) => {
        const item = e.target.closest(".cpu-bp-item");
        const addr = parseInt(item.dataset.addr);
        this.breakpointManager.remove(addr);
        this.breakpointManager.removeFromWasm(this._wasmModule, addr);
        this.renderBreakpointList();
        this.renderDisassembly(this._wasmModule);
      });
    });
  }

  handleGotoAddress() {
    const text = this.elements.disasmGotoInput.value.trim().replace(/^\$/, "").replace(/^0x/i, "");
    const addr = parseInt(text, 16);
    if (isNaN(addr) || addr < 0 || addr > 0xFFFF) return;
    this.followPC = false;
    this.disasmBaseAddr = addr;
    this.renderDisassembly(this._wasmModule);
  }

  handleRunPause() {
    if (!this._wasmModule) return;
    const emulator = window.zxspec;
    if (!emulator?.isRunning()) return;

    if (this._wasmModule._isPaused()) {
      this._wasmModule._clearBreakpointHit();
      this._wasmModule._setPaused(false);
    } else {
      this._wasmModule._setPaused(true);
    }
  }

  handleStep() {
    if (!this._wasmModule) return;
    if (!this._wasmModule._isPaused()) {
      this._wasmModule._setPaused(true);
    }
    this._wasmModule._clearBreakpointHit();
    this._wasmModule._stepInstruction();
    this.followPC = true;
  }

  handleStepOver() {
    if (!this._wasmModule) return;
    if (!this._wasmModule._isPaused()) {
      this._wasmModule._setPaused(true);
      return;
    }

    const pc = this._wasmModule._getPC();
    const opcode = this._wasmModule._readMemory(pc);

    const isCall = opcode === 0xCD || opcode === 0xC4 || opcode === 0xCC ||
                   opcode === 0xD4 || opcode === 0xDC || opcode === 0xE4 ||
                   opcode === 0xEC || opcode === 0xF4 || opcode === 0xFC;
    const isRst = (opcode & 0xC7) === 0xC7 && opcode !== 0xC7;

    if (isCall || isRst) {
      const result = z80Disassemble(pc, (a) => this._wasmModule._readMemory(a));
      const nextAddr = (pc + result.length) & 0xFFFF;
      this._wasmModule._addBreakpoint(nextAddr);
      this.breakpointManager.setTempBreakpoint(nextAddr);
      this._wasmModule._clearBreakpointHit();
      this._wasmModule._setPaused(false);
    } else {
      this.handleStep();
    }
  }

  handleStepOut() {
    if (!this._wasmModule) return;
    if (!this._wasmModule._isPaused()) {
      this._wasmModule._setPaused(true);
      return;
    }

    const sp = this._wasmModule._getSP();
    const retLow = this._wasmModule._readMemory(sp);
    const retHigh = this._wasmModule._readMemory((sp + 1) & 0xFFFF);
    const retAddr = (retHigh << 8) | retLow;

    this._wasmModule._addBreakpoint(retAddr);
    this.breakpointManager.setTempBreakpoint(retAddr);
    this._wasmModule._clearBreakpointHit();
    this._wasmModule._setPaused(false);
  }

  handleAddBreakpoint() {
    const input = this.elements.bpInput;
    const text = input.value.trim().replace(/^\$/, "").replace(/^0x/i, "");
    const addr = parseInt(text, 16);
    if (isNaN(addr) || addr < 0 || addr > 0xFFFF) return;

    this.breakpointManager.add(addr);
    this.breakpointManager.addToWasm(this._wasmModule, addr);
    input.value = "";
    this.renderBreakpointList();
    this.renderDisassembly(this._wasmModule);
  }

  startRegisterEdit(el) {
    const regName = el.dataset.reg;
    const digits = parseInt(el.dataset.digits) || 4;
    const currentValue = el.textContent;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "cpu-dbg-reg-edit";
    input.value = currentValue;
    input.style.width = `${digits * 8 + 8}px`;
    input.maxLength = digits;

    el.textContent = "";
    el.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      const val = parseInt(input.value, 16);
      if (!isNaN(val) && this._wasmModule) {
        const setters = {
          "AF": "_setAF", "BC": "_setBC", "DE": "_setDE", "HL": "_setHL",
          "IX": "_setIX", "IY": "_setIY", "SP": "_setSP", "PC": "_setPC",
          "I": "_setI", "R": "_setR",
        };
        const setter = setters[regName];
        if (setter && this._wasmModule[setter]) {
          this._wasmModule[setter](val);
        }
      }
      el.removeChild(input);
      el.textContent = currentValue;
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { commit(); e.preventDefault(); }
      if (e.key === "Escape") { el.removeChild(input); el.textContent = currentValue; }
    });
  }

  update(wasmModule) {
    if (!wasmModule) return;
    this._wasmModule = wasmModule;

    if (!this.elements) {
      this.cacheElements();
    }

    // Sync breakpoints to WASM on first update
    if (!this.wasmSynced) {
      this.wasmSynced = true;
      this.breakpointManager.syncToWasm(wasmModule);
    }

    // Check for temp breakpoint hit
    if (this.breakpointManager.getTempBreakpoint() !== null && wasmModule._isBreakpointHit()) {
      const tempAddr = this.breakpointManager.getTempBreakpoint();
      wasmModule._removeBreakpoint(tempAddr);
      this.breakpointManager.clearTempBreakpoint();
    }

    const emulator = window.zxspec;
    const running = emulator?.isRunning() ?? false;
    const paused = wasmModule._isPaused();

    // Always update immediately when paused (stepping needs instant feedback),
    // otherwise throttle to 5 updates per second while running
    if (!paused && running) {
      const now = performance.now();
      if (now - this.lastUpdateTime < this.updateInterval) return;
      this.lastUpdateTime = now;
    }

    this.updateStatus(wasmModule, running);
    this.updateRegisters(wasmModule);
    this.renderDisassembly(wasmModule);
  }
}
