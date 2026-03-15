/*
 * cpu-debugger-window.js - Z80 CPU debugger window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { BreakpointManager } from "./breakpoint-manager.js";
import "../css/cpu-debugger.css";
import "../css/rule-builder.css";

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
    this.prevFlags = 0;
    this.prevPC = -1;
    this.elements = null;
    this._regElements = null;  // cached register DOM refs
    this._flagElements = null; // cached flag DOM refs
    this.proxySynced = false;
    this.activeTab = "breakpoints";
    this.followPC = true;
    this.disasmBaseAddr = 0;
    this.lastUpdateTime = 0;
    this.updateInterval = 1000 / 60; // 60 updates per second
    this._proxy = null;
    this._disasmCache = null;
    this._memoryPending = false;
    this.ruleBuilderWindow = null; // set by main.js
    // condition/conditionRules per address: Map<addr, {condition, conditionRules}>
    this._bpConditions = new Map();
    this._loadConditions();
    this.beamBreakpoints = [];
  }

  renderContent() {
    return `
      <div class="cpu-dbg">
        <div class="cpu-dbg-toolbar">
          <div class="cpu-dbg-btn-group">
            <button class="cpu-dbg-btn cpu-btn-run-pause" id="dbg-run-pause" title="Run/Pause">&#x23F8; Pause</button>
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
          <span class="cpu-dbg-section-label">ALT</span>
          <div class="cpu-dbg-regs">
            <div class="cpu-dbg-reg"><span class="reg-label">AF'</span><span class="reg-value" id="reg-alt-af" data-reg="AF'" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">BC'</span><span class="reg-value" id="reg-alt-bc" data-reg="BC'" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">DE'</span><span class="reg-value" id="reg-alt-de" data-reg="DE'" data-digits="4">0000</span></div>
            <div class="cpu-dbg-reg"><span class="reg-label">HL'</span><span class="reg-value" id="reg-alt-hl" data-reg="HL'" data-digits="4">0000</span></div>
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
          <span class="cpu-dbg-section-label">TIMING</span>
          <div class="cpu-dbg-timing-row">
            <span class="cpu-dbg-cycles" title="T-states in current frame"><span class="meta-dim">T</span> <span id="reg-ts">0</span></span>
          </div>
        </div>

        <div class="cpu-dbg-section">
          <span class="cpu-dbg-section-label">BEAM</span>
          <div class="cpu-dbg-beam-row">
            <span class="beam-item" title="Current scanline"><span class="beam-label">SCAN</span> <span class="beam-value" id="beam-scan">--</span></span>
            <span class="beam-item" title="Horizontal T-state within scanline"><span class="beam-label">H</span> <span class="beam-value" id="beam-hts">--</span></span>
            <span class="beam-badge beam-badge-idle" id="beam-badge">--</span>
          </div>
        </div>

        <div class="cpu-dbg-disasm">
          <div class="cpu-dbg-disasm-bar">
            <input type="text" id="disasm-goto-input" placeholder="Address (hex)" spellcheck="false">
            <button class="cpu-dbg-bar-btn" id="disasm-goto-btn" title="Go to address">Go</button>
            <button class="cpu-dbg-bar-btn" id="disasm-goto-pc" title="Follow PC">PC</button>
          </div>
          <div class="cpu-disasm-header">
            <div class="cpu-disasm-hdr-gutter"></div>
            <div class="cpu-disasm-hdr-ts">T</div>
            <div class="cpu-disasm-hdr-addr">Addr</div>
            <div class="cpu-disasm-hdr-bytes">Hex</div>
            <div class="cpu-disasm-hdr-mnemonic">Instruction</div>
          </div>
          <div class="cpu-disasm-view" id="disasm-view"></div>
        </div>

        <div class="cpu-dbg-tabs">
          <div class="cpu-dbg-tab-bar">
            <button class="cpu-dbg-tab active" data-tab="breakpoints">Breakpoints <span class="cpu-dbg-tab-count" id="bp-tab-count">0</span></button>
            <button class="cpu-dbg-tab" data-tab="beam">Beam <span class="cpu-dbg-tab-count" id="beam-tab-count">0</span></button>
          </div>
          <div class="cpu-dbg-tab-content active" data-tab="breakpoints">
            <div class="cpu-dbg-tab-toolbar">
              <input type="text" id="cpu-dbg-bp-input" placeholder="Address (hex)" spellcheck="false">
              <button class="cpu-dbg-add-btn" id="cpu-dbg-bp-add" title="Add breakpoint">+</button>
            </div>
            <div class="cpu-bp-list" id="cpu-dbg-bp-list"></div>
          </div>
          <div class="cpu-dbg-tab-content" data-tab="beam">
            <div class="cpu-dbg-tab-toolbar">
              <select id="beam-mode-select" class="beam-mode-select">
                <option value="vbl">VBL Start</option>
                <option value="hblank">HBLANK</option>
                <option value="scanline">Scanline</option>
                <option value="hts">H T-state</option>
                <option value="scanhts">Scan + HTs</option>
              </select>
              <input type="text" id="beam-scan-input" class="beam-input" placeholder="Scanline">
              <input type="text" id="beam-hts-input" class="beam-input" placeholder="HTs">
              <button class="cpu-dbg-add-btn" id="beam-add-btn" title="Add beam breakpoint">+</button>
            </div>
            <div class="cpu-beam-list" id="beam-list"></div>
          </div>
        </div>
      </div>
    `;
  }

  getState() {
    const state = super.getState();
    state.activeTab = this.activeTab;
    return state;
  }

  restoreState(state) {
    if (state.activeTab) {
      this.switchToTab(state.activeTab);
    }
    super.restoreState(state);
  }

  switchToTab(tabName) {
    const el = this.contentElement;
    if (!el) return;
    el.querySelectorAll(".cpu-dbg-tab").forEach((t) => t.classList.remove("active"));
    el.querySelectorAll(".cpu-dbg-tab-content").forEach((c) => c.classList.remove("active"));
    const tab = el.querySelector(`.cpu-dbg-tab[data-tab="${tabName}"]`);
    if (tab) tab.classList.add("active");
    const panel = el.querySelector(`.cpu-dbg-tab-content[data-tab="${tabName}"]`);
    if (panel) panel.classList.add("active");
    this.activeTab = tabName;
  }

  onContentRendered() {
    this.cacheElements();
    this.setupHandlers();
    this.renderBreakpointList();
    this._renderBeamList();
    this._updateBeamInputVisibility();
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
      beamModeSelect: el.querySelector("#beam-mode-select"),
      beamScanInput: el.querySelector("#beam-scan-input"),
      beamHtsInput: el.querySelector("#beam-hts-input"),
      beamAddBtn: el.querySelector("#beam-add-btn"),
      beamList: el.querySelector("#beam-list"),
      beamTabCount: el.querySelector("#beam-tab-count"),
    };
  }

  setupHandlers() {
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
      this.requestDisassemblyMemory();
    });

    // Disassembly click for breakpoint toggle
    this.elements.disasmView.addEventListener("mousedown", (e) => {
      const line = e.target.closest(".cpu-disasm-line");
      if (line && line.dataset.addr) {
        const addr = parseInt(line.dataset.addr, 16);
        e.preventDefault();
        e.stopPropagation();
        this.breakpointManager.toggle(addr);
        this.renderBreakpointList();
        if (this._disasmCache) {
          this.renderDisassemblyFromCache();
        }
      }
    });

    // Right-click on disassembly gutter for condition editing
    this.elements.disasmView.addEventListener("contextmenu", (e) => {
      const line = e.target.closest(".cpu-disasm-line");
      if (line && line.dataset.addr && this.breakpointManager.has(parseInt(line.dataset.addr, 16))) {
        e.preventDefault();
        const addr = parseInt(line.dataset.addr, 16);
        this._showCpuBreakpointContextMenu(e.clientX, e.clientY, addr);
      }
    });

    // Tab switching
    this.contentElement.querySelectorAll(".cpu-dbg-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.switchToTab(tab.dataset.tab);
      });
    });

    // Register double-click to edit
    this.contentElement.addEventListener("dblclick", (e) => {
      const regValue = e.target.closest(".reg-value");
      if (regValue && this._proxy?.isPaused?.()) {
        this.startRegisterEdit(regValue);
      }
    });

    // Beam breakpoint controls
    this.elements.beamModeSelect.addEventListener("change", () => this._updateBeamInputVisibility());
    this.elements.beamAddBtn.addEventListener("click", () => this._handleAddBeamBreakpoint());
    this.elements.beamScanInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._handleAddBeamBreakpoint();
    });
    this.elements.beamHtsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._handleAddBeamBreakpoint();
    });
  }

  _cacheRegElements() {
    const REG_NAMES = [
      "af", "bc", "de", "hl", "ix", "iy", "sp", "pc",
      "i", "r", "im", "iff1", "iff2", "ts",
      "alt-af", "alt-bc", "alt-de", "alt-hl",
    ];
    const FLAG_BITS = { S: 0x80, Z: 0x40, H: 0x10, PV: 0x04, N: 0x02, C: 0x01 };

    this._regElements = [];
    for (const name of REG_NAMES) {
      const el = this.contentElement.querySelector(`#reg-${name}`);
      if (el) {
        this._regElements.push({ name, el, digits: parseInt(el.dataset.digits) || 4 });
      }
    }

    this._flagElements = [];
    for (const [name, bit] of Object.entries(FLAG_BITS)) {
      const el = this.contentElement.querySelector(`#flag-${name}`);
      if (el) this._flagElements.push({ el, bit });
    }
  }

  updateRegisters(proxy) {
    if (!this._regElements) this._cacheRegElements();

    const regs = {
      af: proxy.getAF(), bc: proxy.getBC(), de: proxy.getDE(), hl: proxy.getHL(),
      ix: proxy.getIX(), iy: proxy.getIY(), sp: proxy.getSP(), pc: proxy.getPC(),
      i: proxy.getI(), r: proxy.getR(), im: proxy.getIM(),
      iff1: proxy.getIFF1(), iff2: proxy.getIFF2(), ts: proxy.getTStates(),
      "alt-af": proxy.getAltAF(), "alt-bc": proxy.getAltBC(),
      "alt-de": proxy.getAltDE(), "alt-hl": proxy.getAltHL(),
    };

    const prev = this.prevValues;
    for (let i = 0; i < this._regElements.length; i++) {
      const { name, el, digits } = this._regElements[i];
      const value = regs[name];
      const key = `reg-${name}`;
      if (prev[key] === value) continue; // no change — skip DOM write
      const hex = value.toString(16).toUpperCase().padStart(digits, "0");
      el.textContent = hex;
      if (prev[key] !== undefined) {
        el.classList.remove("changed");
        void el.offsetWidth; // force reflow to restart animation
        el.classList.add("changed");
      }
      prev[key] = value;
    }

    // Update flags from F register — only when F changes
    const f = regs.af & 0xFF;
    if (f !== this.prevFlags) {
      this.prevFlags = f;
      for (let i = 0; i < this._flagElements.length; i++) {
        const fg = this._flagElements[i];
        fg.el.classList.toggle("active", (f & fg.bit) !== 0);
      }
    }
  }

  updateStatus(proxy, emulatorRunning) {
    const statusBar = this.elements.statusBar;
    const statusText = this.elements.statusText;
    const btn = this.elements.toolbar.runPause;

    if (!emulatorRunning) {
      statusBar.dataset.state = "off";
      statusText.textContent = "EMULATOR OFF";
      statusText.className = "cpu-dbg-status-text";
      btn.textContent = "\u23F8 Pause";
      btn.dataset.state = "pause";
    } else if (proxy.isPaused()) {
      statusBar.dataset.state = "paused";
      statusText.textContent = "PAUSED";
      statusText.className = "cpu-dbg-status-text";
      btn.textContent = "\u25B6 Run";
      btn.dataset.state = "run";
    } else {
      statusBar.dataset.state = "running";
      statusText.textContent = "RUNNING";
      statusText.className = "cpu-dbg-status-text running";
      btn.textContent = "\u23F8 Pause";
      btn.dataset.state = "pause";
    }
  }

  colorizeMnemonic(mnemonic) {
    const match = mnemonic.match(/^(\S+)\s*(.*)?$/);
    if (!match) return mnemonic;

    const instr = match[1];
    const operands = match[2] || "";

    let instrClass = "disasm-op";
    const upper = instr.toUpperCase();

    if (["JP", "JR", "CALL", "RET", "RETI", "RETN", "RST", "DJNZ"].includes(upper)) {
      instrClass = "disasm-flow";
    } else if (["LD", "LDI", "LDIR", "LDD", "LDDR", "PUSH", "POP", "EX", "EXX"].includes(upper)) {
      instrClass = "disasm-load";
    } else if (["ADD", "ADC", "SUB", "SBC", "AND", "OR", "XOR", "CP", "CPI", "CPIR", "CPD", "CPDR",
                 "INC", "DEC", "NEG", "DAA", "CPL", "SCF", "CCF",
                 "RLA", "RRA", "RLCA", "RRCA", "RL", "RR", "RLC", "RRC",
                 "SLA", "SRA", "SRL", "SLL", "BIT", "SET", "RES", "RLD", "RRD"].includes(upper)) {
      instrClass = "disasm-alu";
    } else if (["NOP", "HALT", "DI", "EI", "IM"].includes(upper)) {
      instrClass = "disasm-ctrl";
    } else if (["IN", "INI", "INIR", "IND", "INDR", "OUT", "OUTI", "OTIR", "OUTD", "OTDR"].includes(upper)) {
      instrClass = "disasm-io";
    }

    let result = `<span class="${instrClass}">${instr}</span>`;
    if (operands) {
      const coloredOps = operands.replace(/\b([0-9A-Fa-f]{2,4}h)\b/g,
        '<span class="disasm-num">$1</span>');
      result += ` <span class="disasm-operands">${coloredOps}</span>`;
    }
    return result;
  }

  requestDisassemblyMemory() {
    if (!this._proxy || this._memoryPending) return;

    const pc = this._proxy.getPC();
    let addr = this.followPC ? pc : this.disasmBaseAddr;

    if (this.followPC) {
      addr = (addr - 40) & 0xFFFF;
    }

    this._disasmStartAddr = addr;
    this._memoryPending = true;

    this._proxy.disassemble(addr, DISASM_LINES).then((data) => {
      this._disasmCache = data;
      this._memoryPending = false;
      this.renderDisassemblyFromCache();
    });
  }

  renderDisassemblyFromCache() {
    if (!this._disasmCache || !this._proxy) return;

    const data = this._disasmCache;
    const pc = this._proxy.getPC();
    const actualTs = this._proxy.getLastStepActualTs();
    const prevPC = this._lastSteppedPC;

    // Unpack binary buffer: 42 bytes per instruction
    // [0-1] addr LE, [2] length, [3-6] bytes[4], [7] mnemonicLen, [8-39] mnemonic[32], [40] tStates, [41] tStatesAlt
    let html = "";
    let offset = 0;

    for (let i = 0; i < DISASM_LINES && offset + 42 <= data.length; i++) {
      const instrAddr = data[offset] | (data[offset + 1] << 8);
      const instrLen = data[offset + 2];
      const instrBytes = [];
      for (let j = 0; j < instrLen && j < 4; j++) {
        instrBytes.push(data[offset + 3 + j]);
      }
      const mnLen = data[offset + 7];
      let mnemonic = "";
      for (let j = 0; j < mnLen; j++) {
        mnemonic += String.fromCharCode(data[offset + 8 + j]);
      }
      const tStates = data[offset + 40];
      const tStatesAlt = data[offset + 41];
      offset += 42;

      const isCurrent = instrAddr === pc;
      const hasBp = this.breakpointManager.has(instrAddr);

      // For the instruction that was just executed (prevPC), show actual T-states
      // including contention. Color red if contention added extra T-states.
      const wasJustExecuted = actualTs > 0 && instrAddr === prevPC;
      let tsStr;
      let tsClass = "cpu-disasm-tstates";
      if (wasJustExecuted) {
        const baseTs = tStatesAlt || tStates;
        const contended = actualTs > baseTs;
        tsStr = `${actualTs}`;
        if (contended) tsClass += " contended";
      } else {
        tsStr = tStatesAlt ? `${tStates}/${tStatesAlt}` : `${tStates}`;
      }

      const addrStr = instrAddr.toString(16).toUpperCase().padStart(4, "0");
      const bytesStr = instrBytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");

      const lineClasses = ["cpu-disasm-line"];
      if (isCurrent) lineClasses.push("current");
      if (hasBp) lineClasses.push("breakpoint");

      html += `<div class="${lineClasses.join(" ")}" data-addr="${addrStr}">`;
      html += `<div class="cpu-disasm-gutter">`;
      if (hasBp) {
        html += `<span class="bp-dot"></span>`;
      } else if (isCurrent) {
        html += `<span class="pc-arrow">\u25B6</span>`;
      }
      html += `</div>`;
      html += `<div class="${tsClass}">${tsStr}</div>`;
      html += `<div class="cpu-disasm-addr">${addrStr}</div>`;
      html += `<div class="cpu-disasm-bytes">${bytesStr}</div>`;
      html += `<div class="cpu-disasm-mnemonic">${this.colorizeMnemonic(mnemonic)}</div>`;
      html += `</div>`;
    }

    this.elements.disasmView.innerHTML = html;

    const currentLine = this.elements.disasmView.querySelector(".current");
    if (currentLine) {
      currentLine.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }

  renderBreakpointList() {
    const bps = this.breakpointManager.getAll();

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
      const cond = this._getBpCondition(bp.addr);
      const condBadge = cond.condition ? `<span class="bp-condition-badge" title="${cond.condition}">?</span>` : "";
      return `<div class="cpu-bp-item" data-addr="${bp.addr}">
        <span class="bp-addr">$${addrStr}</span>${condBadge}
        <span class="bp-remove" data-action="remove" title="Remove">&times;</span>
      </div>`;
    }).join("");

    this.elements.bpList.querySelectorAll("[data-action='remove']").forEach((el) => {
      el.addEventListener("click", (e) => {
        const item = e.target.closest(".cpu-bp-item");
        const addr = parseInt(item.dataset.addr);
        this.breakpointManager.remove(addr);
        this._bpConditions.delete(addr);
        this._saveConditions();
        this.renderBreakpointList();
        if (this._disasmCache) this.renderDisassemblyFromCache();
      });
    });

    // Right-click context menu on breakpoint items
    this.elements.bpList.querySelectorAll(".cpu-bp-item").forEach((el) => {
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const addr = parseInt(el.dataset.addr);
        this._showCpuBreakpointContextMenu(e.clientX, e.clientY, addr);
      });
    });
  }

  handleGotoAddress() {
    const text = this.elements.disasmGotoInput.value.trim().replace(/^\$/, "").replace(/^0x/i, "");
    const addr = parseInt(text, 16);
    if (isNaN(addr) || addr < 0 || addr > 0xFFFF) return;
    this.followPC = false;
    this.disasmBaseAddr = addr;
    this.requestDisassemblyMemory();
  }

  handleRunPause() {
    if (!this._proxy) return;
    const emulator = window.zxspec;
    if (!emulator?.isRunning()) return;

    if (this._proxy.isPaused()) {
      this._proxy.resume();
    } else {
      this._proxy.pause();
    }
  }

  handleStep() {
    if (!this._proxy) return;
    if (!this._proxy.isPaused()) {
      this._proxy.pause();
      return;
    }
    this._proxy.step();
    this.followPC = true;
  }

  handleStepOver() {
    if (!this._proxy) return;
    if (!this._proxy.isPaused()) {
      this._proxy.pause();
      return;
    }
    this._proxy.stepOver();
    this.followPC = true;
  }

  handleStepOut() {
    if (!this._proxy) return;
    if (!this._proxy.isPaused()) {
      this._proxy.pause();
      return;
    }
    this._proxy.stepOut();
    this.followPC = true;
  }

  handleAddBreakpoint() {
    const input = this.elements.bpInput;
    const text = input.value.trim().replace(/^\$/, "").replace(/^0x/i, "");
    const addr = parseInt(text, 16);
    if (isNaN(addr) || addr < 0 || addr > 0xFFFF) return;

    this.breakpointManager.add(addr);
    input.value = "";
    this.renderBreakpointList();
    if (this._disasmCache) this.renderDisassemblyFromCache();
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
      if (!isNaN(val) && this._proxy) {
        const regMap = {
          "AF": "AF", "BC": "BC", "DE": "DE", "HL": "HL",
          "IX": "IX", "IY": "IY", "SP": "SP", "PC": "PC",
          "I": "I", "R": "R",
        };
        const reg = regMap[regName];
        if (reg) {
          this._proxy.setRegister(reg, val);
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

  // ============================================================================
  // CPU breakpoint conditions
  // ============================================================================

  _loadConditions() {
    try {
      const saved = localStorage.getItem("zxspec-bp-conditions");
      if (saved) {
        const data = JSON.parse(saved);
        for (const item of data) {
          this._bpConditions.set(item.addr, {
            condition: item.condition || null,
            conditionRules: item.conditionRules || null,
          });
        }
      }
    } catch (e) { /* ignore */ }
  }

  _saveConditions() {
    try {
      const data = [];
      for (const [addr, cond] of this._bpConditions) {
        if (cond.condition) {
          data.push({ addr, ...cond });
        }
      }
      localStorage.setItem("zxspec-bp-conditions", JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  _getBpCondition(addr) {
    return this._bpConditions.get(addr) || { condition: null, conditionRules: null };
  }

  _setBpCondition(addr, condition, conditionRules) {
    if (condition) {
      this._bpConditions.set(addr, { condition, conditionRules });
    } else {
      this._bpConditions.delete(addr);
    }
    this._saveConditions();
    this.renderBreakpointList();
  }

  _showCpuBreakpointContextMenu(x, y, addr) {
    this._dismissCpuContextMenu();

    const menu = document.createElement("div");
    menu.className = "rule-context-menu";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const cond = this._getBpCondition(addr);
    const hasCond = !!cond.condition;

    const editItem = document.createElement("div");
    editItem.className = "rule-context-menu-item";
    editItem.textContent = hasCond ? "Edit Condition..." : "Add Condition...";
    editItem.addEventListener("click", () => {
      this._dismissCpuContextMenu();
      this._editCpuBreakpointCondition(addr);
    });
    menu.appendChild(editItem);

    if (hasCond) {
      const clearItem = document.createElement("div");
      clearItem.className = "rule-context-menu-item";
      clearItem.textContent = "Clear Condition";
      clearItem.addEventListener("click", () => {
        this._dismissCpuContextMenu();
        this._setBpCondition(addr, null, null);
      });
      menu.appendChild(clearItem);
    }

    const sep = document.createElement("div");
    sep.className = "rule-context-menu-separator";
    menu.appendChild(sep);

    const removeItem = document.createElement("div");
    removeItem.className = "rule-context-menu-item danger";
    removeItem.textContent = "Remove Breakpoint";
    removeItem.addEventListener("click", () => {
      this._dismissCpuContextMenu();
      this.breakpointManager.remove(addr);
      this._bpConditions.delete(addr);
      this._saveConditions();
      this.renderBreakpointList();
      if (this._disasmCache) this.renderDisassemblyFromCache();
    });
    menu.appendChild(removeItem);

    document.body.appendChild(menu);
    this._cpuContextMenu = menu;
    this._cpuContextMenuDismiss = (e) => {
      if (!menu.contains(e.target)) this._dismissCpuContextMenu();
    };
    setTimeout(() => document.addEventListener("click", this._cpuContextMenuDismiss), 0);
  }

  _dismissCpuContextMenu() {
    if (this._cpuContextMenu) {
      this._cpuContextMenu.remove();
      this._cpuContextMenu = null;
    }
    if (this._cpuContextMenuDismiss) {
      document.removeEventListener("click", this._cpuContextMenuDismiss);
      this._cpuContextMenuDismiss = null;
    }
  }

  _editCpuBreakpointCondition(addr) {
    if (!this.ruleBuilderWindow) return;
    const addrStr = "$" + addr.toString(16).toUpperCase().padStart(4, "0");
    const key = `cpu:${addr}`;
    const entry = this._getBpCondition(addr);
    this.ruleBuilderWindow.editBreakpoint(
      key, entry, addrStr,
      (k, condition, conditionRules) => {
        const a = parseInt(k.replace("cpu:", ""), 10);
        this._setBpCondition(a, condition, conditionRules);
      }
    );
  }

  update(proxy) {
    if (!proxy) return;
    this._proxy = proxy;

    if (!this.elements) {
      this.cacheElements();
    }

    // Sync breakpoints to proxy on first update
    if (!this.proxySynced) {
      this.proxySynced = true;
      this.breakpointManager.syncToProxy(proxy);
      this._loadBeamBreakpoints();
    }

    const emulator = window.zxspec;
    const running = emulator?.isRunning() ?? false;
    const paused = proxy.isPaused();

    // Throttle updates: when paused, only update when state changes (stepping);
    // when running, throttle to ~60 updates per second.
    const now = performance.now();
    if (paused) {
      const pc = proxy.getPC();
      if (pc === this._lastPausedPC && this._pausedUpdated) return;
      // Track the previous PC so we can show actual T-states on the just-executed instruction
      this._lastSteppedPC = this._lastPausedPC;
      this._lastPausedPC = pc;
      this._pausedUpdated = true;
    } else if (running) {
      if (now - this.lastUpdateTime < this.updateInterval) return;
      this._pausedUpdated = false;
    } else {
      this._pausedUpdated = false;
    }
    this.lastUpdateTime = now;

    this.updateStatus(proxy, running);
    this.updateRegisters(proxy);
    this._updateBeam(proxy, paused);
    this._checkBeamBreakpointHit(proxy, paused);

    // Only request disassembly when PC changes or in manual scroll mode
    const pc = proxy.getPC();
    if (pc !== this.prevPC || !this.followPC) {
      this.prevPC = pc;
      this.requestDisassemblyMemory();
    }
  }

  _checkBeamBreakpointHit(proxy, paused) {
    if (!paused || this.beamBreakpoints.length === 0) {
      // Clear any hit highlights when running
      if (!paused && this._beamHitId !== undefined) {
        this._beamHitId = undefined;
        this._renderBeamList();
      }
      return;
    }
    proxy.isBeamBreakpointHit().then(result => {
      if (!result || !result.hit) return;
      if (this._beamHitId === result.hitId) return;
      this._beamHitId = result.hitId;
      this._renderBeamList();
      // Highlight the hit item
      const list = this.elements.beamList;
      if (list) {
        const item = list.querySelector(`.cpu-beam-item[data-id="${result.hitId}"]`);
        if (item) item.classList.add("hit");
      }
    });
  }

  _cacheBeamElements() {
    this._beamEls = {
      scan: this.contentElement.querySelector("#beam-scan"),
      hTs: this.contentElement.querySelector("#beam-hts"),
      badge: this.contentElement.querySelector("#beam-badge"),
    };
  }

  _updateBeam(proxy, paused) {
    if (!this._beamEls) this._cacheBeamElements();
    const els = this._beamEls;
    if (!els.scan) return;

    proxy.getBeamPosition().then(pos => {
      if (!pos) return;
      els.scan.textContent = pos.scanline;
      els.hTs.textContent = pos.hTs;

      const badge = els.badge;
      if (pos.inVBL) {
        badge.textContent = "VBL";
        badge.className = "beam-badge beam-badge-vbl";
      } else if (pos.inHBLANK) {
        badge.textContent = "HBLANK";
        badge.className = "beam-badge beam-badge-hblank";
      } else {
        badge.textContent = "VISIBLE";
        badge.className = "beam-badge beam-badge-visible";
      }
    });
  }

  // ---- Beam Breakpoints ----

  _updateBeamInputVisibility() {
    const mode = this.elements.beamModeSelect.value;
    const scanInput = this.elements.beamScanInput;
    const htsInput = this.elements.beamHtsInput;

    switch (mode) {
      case "vbl":
      case "hblank":
        scanInput.style.display = "none";
        htsInput.style.display = "none";
        break;
      case "scanline":
        scanInput.style.display = "";
        scanInput.placeholder = "Scanline";
        htsInput.style.display = "none";
        break;
      case "hts":
        scanInput.style.display = "none";
        htsInput.style.display = "";
        htsInput.placeholder = "H T-state";
        break;
      case "scanhts":
        scanInput.style.display = "";
        scanInput.placeholder = "Scanline";
        htsInput.style.display = "";
        htsInput.placeholder = "H T-state";
        break;
    }
  }

  async _handleAddBeamBreakpoint() {
    if (!this._proxy) return;
    const mode = this.elements.beamModeSelect.value;
    let scanline = -1;
    let hTs = -1;

    switch (mode) {
      case "vbl":
        scanline = 0;
        hTs = 0;
        break;
      case "hblank":
        scanline = -1;
        hTs = 176;  // TOTAL_WIDTH / 2 = start of HBLANK
        break;
      case "scanline":
        scanline = parseInt(this.elements.beamScanInput.value, 10);
        if (isNaN(scanline) || scanline < 0) return;
        hTs = -1;
        break;
      case "hts":
        scanline = -1;
        hTs = parseInt(this.elements.beamHtsInput.value, 10);
        if (isNaN(hTs) || hTs < 0) return;
        break;
      case "scanhts":
        scanline = parseInt(this.elements.beamScanInput.value, 10);
        hTs = parseInt(this.elements.beamHtsInput.value, 10);
        if (isNaN(scanline) || isNaN(hTs) || scanline < 0 || hTs < 0) return;
        break;
    }

    const id = await this._proxy.addBeamBreakpoint(scanline, hTs);
    if (id < 0) return;

    this.beamBreakpoints.push({ id, scanline, hTs, enabled: true, mode });
    this._saveBeamBreakpoints();
    this._renderBeamList();
    this.elements.beamScanInput.value = "";
    this.elements.beamHtsInput.value = "";
  }

  _renderBeamList() {
    const list = this.elements.beamList;
    if (!list) return;

    if (this.beamBreakpoints.length === 0) {
      list.innerHTML = '<div class="cpu-dbg-empty-state">No beam breakpoints set</div>';
    } else {
      list.innerHTML = this.beamBreakpoints.map(bp => {
        const { typeLabel, typeClass, detail } = this._beamBpDisplay(bp);
        return `
          <div class="cpu-beam-item" data-id="${bp.id}">
            <span class="beam-enable"><input type="checkbox" ${bp.enabled ? "checked" : ""}></span>
            <span class="beam-type ${typeClass}">${typeLabel}</span>
            <span class="beam-detail">${detail}</span>
            <button class="beam-remove" title="Remove">&times;</button>
          </div>`;
      }).join("");

      list.querySelectorAll(".beam-enable input").forEach(cb => {
        cb.addEventListener("change", (e) => {
          const item = e.target.closest(".cpu-beam-item");
          const id = parseInt(item.dataset.id, 10);
          const bp = this.beamBreakpoints.find(b => b.id === id);
          if (bp) {
            bp.enabled = e.target.checked;
            this._proxy.enableBeamBreakpoint(id, bp.enabled);
            this._saveBeamBreakpoints();
          }
        });
      });

      list.querySelectorAll(".beam-remove").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const item = e.target.closest(".cpu-beam-item");
          const id = parseInt(item.dataset.id, 10);
          this._proxy.removeBeamBreakpoint(id);
          this.beamBreakpoints = this.beamBreakpoints.filter(b => b.id !== id);
          this._saveBeamBreakpoints();
          this._renderBeamList();
        });
      });
    }

    const count = this.elements.beamTabCount;
    if (count) {
      count.textContent = this.beamBreakpoints.length;
      count.classList.toggle("has-items", this.beamBreakpoints.length > 0);
    }
  }

  _beamBpDisplay(bp) {
    switch (bp.mode) {
      case "vbl":
        return { typeLabel: "VBL", typeClass: "beam-type-vbl", detail: "Scanline 0" };
      case "hblank":
        return { typeLabel: "HBL", typeClass: "beam-type-hbl", detail: `HTs ${bp.hTs}` };
      case "scanline":
        return { typeLabel: "SCAN", typeClass: "beam-type-scan", detail: `Row ${bp.scanline}` };
      case "hts":
        return { typeLabel: "HTs", typeClass: "beam-type-hts", detail: `HTs ${bp.hTs}` };
      case "scanhts":
        return { typeLabel: "S+H", typeClass: "beam-type-sh", detail: `Row ${bp.scanline}, HTs ${bp.hTs}` };
      default:
        return { typeLabel: "?", typeClass: "", detail: "" };
    }
  }

  _saveBeamBreakpoints() {
    const data = this.beamBreakpoints.map(bp => ({
      scanline: bp.scanline, hTs: bp.hTs, enabled: bp.enabled, mode: bp.mode
    }));
    localStorage.setItem("zxspec-beam-breakpoints", JSON.stringify(data));
  }

  async _loadBeamBreakpoints() {
    if (!this._proxy) return;
    const raw = localStorage.getItem("zxspec-beam-breakpoints");
    if (!raw) {
      this._renderBeamList();
      return;
    }
    try {
      const saved = JSON.parse(raw);
      for (const bp of saved) {
        const id = await this._proxy.addBeamBreakpoint(bp.scanline, bp.hTs);
        if (id >= 0) {
          this.beamBreakpoints.push({ id, scanline: bp.scanline, hTs: bp.hTs, enabled: bp.enabled, mode: bp.mode });
          if (!bp.enabled) {
            this._proxy.enableBeamBreakpoint(id, false);
          }
        }
      }
    } catch (e) { /* ignore corrupt data */ }
    this._renderBeamList();
  }

  async _resyncBeamBreakpoints() {
    if (!this._proxy) return;
    for (let i = 0; i < this.beamBreakpoints.length; i++) {
      const bp = this.beamBreakpoints[i];
      const id = await this._proxy.addBeamBreakpoint(bp.scanline, bp.hTs);
      if (id >= 0) {
        bp.id = id;
        if (!bp.enabled) this._proxy.enableBeamBreakpoint(id, false);
      }
    }
  }
}
