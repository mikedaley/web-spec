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
    this.elements = null;
    this.proxySynced = false;
    this.activeTab = "breakpoints";
    this.followPC = true;
    this.disasmBaseAddr = 0;
    this.lastUpdateTime = 0;
    this.updateInterval = 1000 / 5; // 5 updates per second
    this._proxy = null;
    this._disasmCache = null;
    this._memoryPending = false;
    this.ruleBuilderWindow = null; // set by main.js
    // condition/conditionRules per address: Map<addr, {condition, conditionRules}>
    this._bpConditions = new Map();
    this._loadConditions();
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
  }

  updateRegisters(proxy) {
    const regs = {
      af: proxy.getAF(), bc: proxy.getBC(), de: proxy.getDE(), hl: proxy.getHL(),
      ix: proxy.getIX(), iy: proxy.getIY(), sp: proxy.getSP(), pc: proxy.getPC(),
      i: proxy.getI(), r: proxy.getR(), im: proxy.getIM(),
      iff1: proxy.getIFF1(), iff2: proxy.getIFF2(), ts: proxy.getTStates(),
      "alt-af": proxy.getAltAF(), "alt-bc": proxy.getAltBC(),
      "alt-de": proxy.getAltDE(), "alt-hl": proxy.getAltHL(),
    };

    for (const [name, value] of Object.entries(regs)) {
      const el = this.contentElement.querySelector(`#reg-${name}`);
      if (!el) continue;
      const digits = parseInt(el.dataset.digits) || 4;
      const hex = value.toString(16).toUpperCase().padStart(digits, "0");
      const changed = this.prevValues[`reg-${name}`] !== undefined && this.prevValues[`reg-${name}`] !== value;
      el.textContent = hex;
      if (changed) {
        el.classList.remove("changed");
        void el.offsetWidth; // force reflow to restart animation
        el.classList.add("changed");
      }
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

    // Unpack binary buffer: 40 bytes per instruction
    // [0-1] addr LE, [2] length, [3-6] bytes[4], [7] mnemonicLen, [8-39] mnemonic[32]
    let html = "";
    let offset = 0;

    for (let i = 0; i < DISASM_LINES && offset + 40 <= data.length; i++) {
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
      offset += 40;

      const isCurrent = instrAddr === pc;
      const hasBp = this.breakpointManager.has(instrAddr);

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
    }

    const emulator = window.zxspec;
    const running = emulator?.isRunning() ?? false;
    const paused = proxy.isPaused();

    // Always update immediately when paused (stepping needs instant feedback),
    // otherwise throttle to 5 updates per second while running
    if (!paused && running) {
      const now = performance.now();
      if (now - this.lastUpdateTime < this.updateInterval) return;
      this.lastUpdateTime = now;
    }

    this.updateStatus(proxy, running);
    this.updateRegisters(proxy);
    this.requestDisassemblyMemory();
  }
}
