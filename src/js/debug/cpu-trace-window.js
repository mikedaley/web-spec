/*
 * cpu-trace-window.js - CPU instruction trace window
 *
 * Records and displays the last 10,000 Z80 instructions with
 * full register state, flags, and disassembly.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/cpu-trace.css";

// ============================================================================
// Minimal Z80 disassembler (operates on raw bytes, no memory access needed)
// ============================================================================

const R8 = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];
const R16 = ["BC", "DE", "HL", "SP"];
const R16AF = ["BC", "DE", "HL", "AF"];
const CC = ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"];
const ALU = ["ADD A,", "ADC A,", "SUB", "SBC A,", "AND", "XOR", "OR", "CP"];

function hex8(v) { return v.toString(16).toUpperCase().padStart(2, "0") + "h"; }
function hex16(v) { return v.toString(16).toUpperCase().padStart(4, "0") + "h"; }
function signedOffset(v) {
  const s = (v & 0x80) ? v - 256 : v;
  return s >= 0 ? "+" + s : "" + s;
}

function disasmCB(b1) {
  const r = b1 & 7;
  const op = (b1 >> 3) & 7;
  const group = (b1 >> 6) & 3;
  if (group === 0) {
    const ops = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
    return { mn: `${ops[op]} ${R8[r]}`, len: 2 };
  } else if (group === 1) {
    return { mn: `BIT ${op},${R8[r]}`, len: 2 };
  } else if (group === 2) {
    return { mn: `RES ${op},${R8[r]}`, len: 2 };
  } else {
    return { mn: `SET ${op},${R8[r]}`, len: 2 };
  }
}

function disasmED(b1) {
  const edOps = {
    0x40: "IN B,(C)", 0x41: "OUT (C),B", 0x42: "SBC HL,BC", 0x43: null,
    0x44: "NEG", 0x45: "RETN", 0x46: "IM 0", 0x47: "LD I,A",
    0x48: "IN C,(C)", 0x49: "OUT (C),C", 0x4A: "ADC HL,BC", 0x4B: null,
    0x4C: "NEG", 0x4D: "RETI", 0x4E: "IM 0", 0x4F: "LD R,A",
    0x50: "IN D,(C)", 0x51: "OUT (C),D", 0x52: "SBC HL,DE", 0x53: null,
    0x56: "IM 1", 0x57: "LD A,I",
    0x58: "IN E,(C)", 0x59: "OUT (C),E", 0x5A: "ADC HL,DE", 0x5B: null,
    0x5E: "IM 2", 0x5F: "LD A,R",
    0x60: "IN H,(C)", 0x61: "OUT (C),H", 0x62: "SBC HL,HL",
    0x67: "RRD",
    0x68: "IN L,(C)", 0x69: "OUT (C),L", 0x6A: "ADC HL,HL",
    0x6F: "RLD",
    0x70: "IN F,(C)", 0x71: "OUT (C),0", 0x72: "SBC HL,SP", 0x73: null,
    0x78: "IN A,(C)", 0x79: "OUT (C),A", 0x7A: "ADC HL,SP", 0x7B: null,
    0xA0: "LDI", 0xA1: "CPI", 0xA2: "INI", 0xA3: "OUTI",
    0xA8: "LDD", 0xA9: "CPD", 0xAA: "IND", 0xAB: "OUTD",
    0xB0: "LDIR", 0xB1: "CPIR", 0xB2: "INIR", 0xB3: "OTIR",
    0xB8: "LDDR", 0xB9: "CPDR", 0xBA: "INDR", 0xBB: "OTDR",
  };
  if (edOps[b1] !== undefined) {
    if (edOps[b1] === null) return null; // needs operand
    return { mn: edOps[b1], len: 2 };
  }
  return null;
}

function disasmZ80(bytes, pc) {
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  const nn = b1 | (b2 << 8);
  const d = b1;

  // DD/FD prefix (IX/IY)
  if (b0 === 0xDD || b0 === 0xFD) {
    const ir = b0 === 0xDD ? "IX" : "IY";
    const irh = ir + "h";
    const irl = ir + "l";

    if (b1 === 0xCB) {
      // DDCB/FDCB: displacement at b2, opcode at b3
      const disp = signedOffset(b2);
      const op3 = b3;
      const group = (op3 >> 6) & 3;
      const bit = (op3 >> 3) & 7;
      if (group === 0) {
        const ops = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
        return { mn: `${ops[bit]} (${ir}${disp})`, len: 4 };
      } else if (group === 1) {
        return { mn: `BIT ${bit},(${ir}${disp})`, len: 4 };
      } else if (group === 2) {
        return { mn: `RES ${bit},(${ir}${disp})`, len: 4 };
      } else {
        return { mn: `SET ${bit},(${ir}${disp})`, len: 4 };
      }
    }

    // Common IX/IY instructions
    const ixOps = {
      0x09: `ADD ${ir},BC`, 0x19: `ADD ${ir},DE`, 0x29: `ADD ${ir},${ir}`, 0x39: `ADD ${ir},SP`,
      0x21: null, 0x22: null, 0x23: `INC ${ir}`, 0x2A: null, 0x2B: `DEC ${ir}`,
      0x34: null, 0x35: null, 0x36: null,
      0x24: `INC ${irh}`, 0x25: `DEC ${irh}`, 0x26: null,
      0x2C: `INC ${irl}`, 0x2D: `DEC ${irl}`, 0x2E: null,
      0xE1: `POP ${ir}`, 0xE3: `EX (SP),${ir}`, 0xE5: `PUSH ${ir}`,
      0xE9: `JP (${ir})`, 0xF9: `LD SP,${ir}`,
    };

    if (ixOps[b1] !== undefined) {
      if (ixOps[b1] === null) {
        // Needs operand handling
        if (b1 === 0x21) return { mn: `LD ${ir},${hex16(b2 | (b3 << 8))}`, len: 4 };
        if (b1 === 0x22) return { mn: `LD (${hex16(b2 | (b3 << 8))}),${ir}`, len: 4 };
        if (b1 === 0x2A) return { mn: `LD ${ir},(${hex16(b2 | (b3 << 8))})`, len: 4 };
        if (b1 === 0x26) return { mn: `LD ${irh},${hex8(b2)}`, len: 3 };
        if (b1 === 0x2E) return { mn: `LD ${irl},${hex8(b2)}`, len: 3 };
        if (b1 === 0x34) return { mn: `INC (${ir}${signedOffset(b2)})`, len: 3 };
        if (b1 === 0x35) return { mn: `DEC (${ir}${signedOffset(b2)})`, len: 3 };
        if (b1 === 0x36) return { mn: `LD (${ir}${signedOffset(b2)}),${hex8(b3)}`, len: 4 };
      } else {
        return { mn: ixOps[b1], len: 2 };
      }
    }

    // LD r,(IX+d) and LD (IX+d),r
    if ((b1 & 0xC0) === 0x40) {
      const dst = (b1 >> 3) & 7;
      const src = b1 & 7;
      if (src === 6 && dst !== 6) {
        return { mn: `LD ${R8[dst]},(${ir}${signedOffset(b2)})`, len: 3 };
      }
      if (dst === 6 && src !== 6) {
        return { mn: `LD (${ir}${signedOffset(b2)}),${R8[src]}`, len: 3 };
      }
    }

    // ALU with (IX+d)
    if ((b1 & 0xC0) === 0x80 && (b1 & 7) === 6) {
      const op = (b1 >> 3) & 7;
      return { mn: `${ALU[op]} (${ir}${signedOffset(b2)})`, len: 3 };
    }

    // Fall through: treat as NOP + main opcode
    return { mn: `NOP ; ${ir} prefix`, len: 2 };
  }

  // CB prefix
  if (b0 === 0xCB) return disasmCB(b1);

  // ED prefix
  if (b0 === 0xED) {
    const ed = disasmED(b1);
    if (ed) return ed;
    // ED with 16-bit operand
    if (b1 === 0x43) return { mn: `LD (${hex16(b2 | (b3 << 8))}),BC`, len: 4 };
    if (b1 === 0x4B) return { mn: `LD BC,(${hex16(b2 | (b3 << 8))})`, len: 4 };
    if (b1 === 0x53) return { mn: `LD (${hex16(b2 | (b3 << 8))}),DE`, len: 4 };
    if (b1 === 0x5B) return { mn: `LD DE,(${hex16(b2 | (b3 << 8))})`, len: 4 };
    if (b1 === 0x73) return { mn: `LD (${hex16(b2 | (b3 << 8))}),SP`, len: 4 };
    if (b1 === 0x7B) return { mn: `LD SP,(${hex16(b2 | (b3 << 8))})`, len: 4 };
    return { mn: `DB EDh,${hex8(b1)}`, len: 2 };
  }

  // Main opcode table
  const x = (b0 >> 6) & 3;
  const y = (b0 >> 3) & 7;
  const z = b0 & 7;

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { mn: "NOP", len: 1 };
      if (y === 1) return { mn: "EX AF,AF'", len: 1 };
      if (y === 2) return { mn: `DJNZ ${hex16((pc + 2 + ((d & 0x80) ? d - 256 : d)) & 0xFFFF)}`, len: 2 };
      if (y === 3) return { mn: `JR ${hex16((pc + 2 + ((d & 0x80) ? d - 256 : d)) & 0xFFFF)}`, len: 2 };
      return { mn: `JR ${CC[y - 4]},${hex16((pc + 2 + ((d & 0x80) ? d - 256 : d)) & 0xFFFF)}`, len: 2 };
    }
    if (z === 1) {
      if (y & 1) return { mn: `ADD HL,${R16[y >> 1]}`, len: 1 };
      return { mn: `LD ${R16[y >> 1]},${hex16(nn)}`, len: 3 };
    }
    if (z === 2) {
      const ops = [
        `LD (BC),A`, `LD A,(BC)`, `LD (DE),A`, `LD A,(DE)`,
        `LD (${hex16(nn)}),HL`, `LD HL,(${hex16(nn)})`,
        `LD (${hex16(nn)}),A`, `LD A,(${hex16(nn)})`,
      ];
      return { mn: ops[y], len: (y < 4) ? 1 : 3 };
    }
    if (z === 3) {
      return { mn: `${(y & 1) ? "DEC" : "INC"} ${R16[y >> 1]}`, len: 1 };
    }
    if (z === 4) return { mn: `INC ${R8[y]}`, len: 1 };
    if (z === 5) return { mn: `DEC ${R8[y]}`, len: 1 };
    if (z === 6) return { mn: `LD ${R8[y]},${hex8(d)}`, len: 2 };
    if (z === 7) {
      const ops7 = ["RLCA", "RRCA", "RLA", "RRA", "DAA", "CPL", "SCF", "CCF"];
      return { mn: ops7[y], len: 1 };
    }
  }

  if (x === 1) {
    if (y === 6 && z === 6) return { mn: "HALT", len: 1 };
    return { mn: `LD ${R8[y]},${R8[z]}`, len: 1 };
  }

  if (x === 2) {
    return { mn: `${ALU[y]} ${R8[z]}`, len: 1 };
  }

  // x === 3
  if (z === 0) return { mn: `RET ${CC[y]}`, len: 1 };
  if (z === 1) {
    if (y & 1) {
      if (y === 1) return { mn: "RET", len: 1 };
      if (y === 3) return { mn: "EXX", len: 1 };
      if (y === 5) return { mn: "JP (HL)", len: 1 };
      if (y === 7) return { mn: "LD SP,HL", len: 1 };
    }
    return { mn: `POP ${R16AF[y >> 1]}`, len: 1 };
  }
  if (z === 2) return { mn: `JP ${CC[y]},${hex16(nn)}`, len: 3 };
  if (z === 3) {
    if (y === 0) return { mn: `JP ${hex16(nn)}`, len: 3 };
    if (y === 2) return { mn: `OUT (${hex8(d)}),A`, len: 2 };
    if (y === 3) return { mn: `IN A,(${hex8(d)})`, len: 2 };
    if (y === 4) return { mn: "EX (SP),HL", len: 1 };
    if (y === 5) return { mn: "EX DE,HL", len: 1 };
    if (y === 6) return { mn: "DI", len: 1 };
    if (y === 7) return { mn: "EI", len: 1 };
  }
  if (z === 4) return { mn: `CALL ${CC[y]},${hex16(nn)}`, len: 3 };
  if (z === 5) {
    if (y & 1) return { mn: `CALL ${hex16(nn)}`, len: 3 };
    return { mn: `PUSH ${R16AF[y >> 1]}`, len: 1 };
  }
  if (z === 6) return { mn: `${ALU[y]} ${hex8(d)}`, len: 2 };
  if (z === 7) return { mn: `RST ${hex8(y * 8)}`, len: 1 };

  return { mn: `DB ${hex8(b0)}`, len: 1 };
}

// ============================================================================
// CPU Trace Window
// ============================================================================

const ROW_HEIGHT = 16;
const OVERSCAN = 10; // extra rows above/below viewport

export class CPUTraceWindow extends BaseWindow {
  constructor() {
    super({
      id: "cpu-trace",
      title: "CPU Trace",
      minWidth: 600,
      minHeight: 300,
      defaultWidth: 900,
      defaultHeight: 500,
      defaultPosition: { x: 100, y: 100 },
    });

    this._proxy = null;
    this._traceData = null;
    this._entryCount = 0;
    this._writeIndex = 0;
    this._entrySize = 32;
    this._maxEntries = 10000;
    this._enabled = false;
    this._autoScroll = true;
    this._fetchPending = false;
    this._lastFetchTime = 0;
    this._fetchInterval = 200; // ms between fetches
    this._scrollRAF = null;
    this._renderedStart = -1;
    this._renderedEnd = -1;
    this._rowPool = [];
  }

  renderContent() {
    return `
      <div class="cpu-trace">
        <div class="cpu-trace-toolbar">
          <button class="cpu-trace-btn" id="trace-toggle">Start</button>
          <button class="cpu-trace-btn" id="trace-clear">Clear</button>
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-secondary);cursor:pointer">
            <input type="checkbox" id="trace-autoscroll" checked> Auto-scroll
          </label>
          <span class="cpu-trace-status" id="trace-status">0 instructions</span>
        </div>
        <div class="cpu-trace-header">
          <span class="cpu-trace-col-num">#</span>
          <span class="cpu-trace-col-addr">Addr</span>
          <span class="cpu-trace-col-bytes">Bytes</span>
          <span class="cpu-trace-col-mnemonic">Instruction</span>
          <span class="cpu-trace-col-af">AF</span>
          <span class="cpu-trace-col-bc">BC</span>
          <span class="cpu-trace-col-de">DE</span>
          <span class="cpu-trace-col-hl">HL</span>
          <span class="cpu-trace-col-sp">SP</span>
          <span class="cpu-trace-col-ix">IX</span>
          <span class="cpu-trace-col-iy">IY</span>
          <span class="cpu-trace-col-flags">Flags</span>
        </div>
        <div class="cpu-trace-list" id="trace-list">
          <div class="cpu-trace-spacer" id="trace-spacer">
            <div class="cpu-trace-viewport" id="trace-viewport"></div>
          </div>
          <div class="cpu-trace-empty" id="trace-empty">Click "Start" to begin tracing</div>
        </div>
      </div>
    `;
  }

  getState() {
    const state = super.getState();
    state.autoScroll = this._autoScroll;
    return state;
  }

  restoreState(state) {
    if (state.autoScroll !== undefined) {
      this._autoScroll = state.autoScroll;
    }
    super.restoreState(state);
  }

  onContentRendered() {
    this._listEl = this.contentElement.querySelector("#trace-list");
    this._spacerEl = this.contentElement.querySelector("#trace-spacer");
    this._viewportEl = this.contentElement.querySelector("#trace-viewport");
    this._emptyEl = this.contentElement.querySelector("#trace-empty");
    this._statusEl = this.contentElement.querySelector("#trace-status");
    this._toggleBtn = this.contentElement.querySelector("#trace-toggle");
    this._clearBtn = this.contentElement.querySelector("#trace-clear");
    this._autoScrollCb = this.contentElement.querySelector("#trace-autoscroll");

    this._autoScrollCb.checked = this._autoScroll;

    this._toggleBtn.addEventListener("click", () => {
      this._enabled = !this._enabled;
      this._toggleBtn.textContent = this._enabled ? "Stop" : "Start";
      this._toggleBtn.classList.toggle("active", this._enabled);
      if (this._proxy) {
        this._proxy.traceEnable(this._enabled);
      }
    });

    this._clearBtn.addEventListener("click", () => {
      this._traceData = null;
      this._entryCount = 0;
      this._writeIndex = 0;
      this._renderedStart = -1;
      this._renderedEnd = -1;
      this._viewportEl.innerHTML = "";
      this._rowPool.length = 0;
      this._spacerEl.style.height = "0px";
      this._emptyEl.style.display = "";
      this._emptyEl.textContent = this._enabled ? "Recording..." : 'Click "Start" to begin tracing';
      this._statusEl.textContent = "0 instructions";
      // Re-enable tracing to reset the buffer on the C++ side
      if (this._proxy && this._enabled) {
        this._proxy.traceEnable(false);
        this._proxy.traceEnable(true);
      }
    });

    this._autoScrollCb.addEventListener("change", () => {
      this._autoScroll = this._autoScrollCb.checked;
    });

    this._listEl.addEventListener("scroll", () => {
      if (!this._scrollRAF) {
        this._scrollRAF = requestAnimationFrame(() => {
          this._scrollRAF = null;
          this._renderVisible();
        });
      }
    });
  }

  _readEntry(idx) {
    if (!this._traceData) return null;
    const off = idx * this._entrySize;
    if (off + this._entrySize > this._traceData.length) return null;
    const d = this._traceData;
    return {
      pc:  d[off]     | (d[off + 1] << 8),
      sp:  d[off + 2] | (d[off + 3] << 8),
      af:  d[off + 4] | (d[off + 5] << 8),
      bc:  d[off + 6] | (d[off + 7] << 8),
      de:  d[off + 8] | (d[off + 9] << 8),
      hl:  d[off + 10] | (d[off + 11] << 8),
      ix:  d[off + 12] | (d[off + 13] << 8),
      iy:  d[off + 14] | (d[off + 15] << 8),
      af_: d[off + 16] | (d[off + 17] << 8),
      bc_: d[off + 18] | (d[off + 19] << 8),
      de_: d[off + 20] | (d[off + 21] << 8),
      hl_: d[off + 22] | (d[off + 23] << 8),
      i:   d[off + 24],
      r:   d[off + 25],
      iff1: d[off + 26],
      im:  d[off + 27],
      bytes: [d[off + 28], d[off + 29], d[off + 30], d[off + 31]],
    };
  }

  _formatFlags(f) {
    let s = "";
    s += (f & 0x80) ? "S" : "-";
    s += (f & 0x40) ? "Z" : "-";
    s += (f & 0x10) ? "H" : "-";
    s += (f & 0x04) ? "P" : "-";
    s += (f & 0x02) ? "N" : "-";
    s += (f & 0x01) ? "C" : "-";
    return s;
  }

  _getOrderedIndex(i) {
    // Map display index i (0 = oldest) to circular buffer index
    const startIdx = this._entryCount >= this._maxEntries
      ? this._writeIndex
      : 0;
    return (startIdx + i) % this._maxEntries;
  }

  _createRow() {
    const row = document.createElement("div");
    row.className = "cpu-trace-row";
    // Pre-create spans with class names for column layout
    const cols = ["num", "addr", "bytes", "mnemonic", "af", "bc", "de", "hl", "sp", "ix", "iy", "flags"];
    const spans = {};
    for (const col of cols) {
      const span = document.createElement("span");
      span.className = `cpu-trace-col-${col}`;
      row.appendChild(span);
      spans[col] = span;
    }
    row._spans = spans;
    return row;
  }

  _updateRow(row, i) {
    const bufIdx = this._getOrderedIndex(i);
    const entry = this._readEntry(bufIdx);
    if (!entry) return;

    const disasm = disasmZ80(entry.bytes, entry.pc);
    const mn = disasm ? disasm.mn : "???";
    const instrLen = disasm ? disasm.len : 1;
    const bytesStr = entry.bytes.slice(0, instrLen)
      .map(b => b.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");

    const s = row._spans;
    s.num.textContent = (i + 1).toString();
    s.addr.textContent = entry.pc.toString(16).toUpperCase().padStart(4, "0");
    s.bytes.textContent = bytesStr;
    s.mnemonic.textContent = mn;
    s.af.textContent = entry.af.toString(16).toUpperCase().padStart(4, "0");
    s.bc.textContent = entry.bc.toString(16).toUpperCase().padStart(4, "0");
    s.de.textContent = entry.de.toString(16).toUpperCase().padStart(4, "0");
    s.hl.textContent = entry.hl.toString(16).toUpperCase().padStart(4, "0");
    s.sp.textContent = entry.sp.toString(16).toUpperCase().padStart(4, "0");
    s.ix.textContent = entry.ix.toString(16).toUpperCase().padStart(4, "0");
    s.iy.textContent = entry.iy.toString(16).toUpperCase().padStart(4, "0");
    s.flags.textContent = this._formatFlags(entry.af & 0xFF);

    // Alternate row shading based on display index
    row.style.background = (i & 1) ? "" : "var(--bg-secondary, var(--glass-bg))";
  }

  _renderVisible() {
    if (!this._traceData || this._entryCount === 0) return;

    const count = this._entryCount;
    const scrollTop = this._listEl.scrollTop;
    const viewHeight = this._listEl.clientHeight;

    // Determine which rows are visible
    let startRow = Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN;
    let endRow = Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN;
    if (startRow < 0) startRow = 0;
    if (endRow > count) endRow = count;

    // Skip re-render if the visible range hasn't changed
    if (startRow === this._renderedStart && endRow === this._renderedEnd) return;
    this._renderedStart = startRow;
    this._renderedEnd = endRow;

    const neededRows = endRow - startRow;

    // Grow or shrink the row pool
    while (this._rowPool.length < neededRows) {
      const row = this._createRow();
      this._rowPool.push(row);
    }

    // Update row content and position
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < neededRows; i++) {
      const row = this._rowPool[i];
      const displayIdx = startRow + i;
      this._updateRow(row, displayIdx);
      row.style.position = "absolute";
      row.style.top = (displayIdx * ROW_HEIGHT) + "px";
      row.style.width = "100%";
      fragment.appendChild(row);
    }

    this._viewportEl.innerHTML = "";
    this._viewportEl.appendChild(fragment);
  }

  _renderRows() {
    if (!this._traceData || this._entryCount === 0) return;

    const count = this._entryCount;
    const totalHeight = count * ROW_HEIGHT;

    // Update spacer to reflect total content height
    this._spacerEl.style.height = totalHeight + "px";
    this._emptyEl.style.display = "none";

    this._statusEl.textContent = `${count.toLocaleString()} instructions`;

    if (this._autoScroll) {
      this._listEl.scrollTop = totalHeight;
    }

    // Force re-render by invalidating cached range
    this._renderedStart = -1;
    this._renderedEnd = -1;
    this._renderVisible();
  }

  update(proxy) {
    if (!proxy) return;
    this._proxy = proxy;

    if (!this._enabled || this._fetchPending) return;

    const now = performance.now();
    if (now - this._lastFetchTime < this._fetchInterval) return;
    this._lastFetchTime = now;
    this._fetchPending = true;

    proxy.traceGetData().then((result) => {
      this._fetchPending = false;
      if (!result) return;
      this._traceData = result.data;
      this._entryCount = result.entryCount;
      this._writeIndex = result.writeIndex;
      this._entrySize = result.entrySize;
      this._maxEntries = result.maxEntries;
      this._renderRows();
    }).catch((err) => {
      this._fetchPending = false;
      console.error("[CPUTrace] traceGetData error:", err);
    });
  }
}
