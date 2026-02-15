/*
 * z80-disassembler.js - Z80 instruction disassembler for debugger
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Main opcode mnemonics (0x00-0xFF), null means prefix byte handled separately
const MAIN = [
  "NOP",        "LD BC,%w",   "LD (BC),A",  "INC BC",     "INC B",      "DEC B",      "LD B,%b",    "RLCA",
  "EX AF,AF'",  "ADD HL,BC",  "LD A,(BC)",  "DEC BC",     "INC C",      "DEC C",      "LD C,%b",    "RRCA",
  "DJNZ %r",    "LD DE,%w",   "LD (DE),A",  "INC DE",     "INC D",      "DEC D",      "LD D,%b",    "RLA",
  "JR %r",      "ADD HL,DE",  "LD A,(DE)",  "DEC DE",     "INC E",      "DEC E",      "LD E,%b",    "RRA",
  "JR NZ,%r",   "LD HL,%w",   "LD (%w),HL", "INC HL",     "INC H",      "DEC H",      "LD H,%b",    "DAA",
  "JR Z,%r",    "ADD HL,HL",  "LD HL,(%w)", "DEC HL",     "INC L",      "DEC L",      "LD L,%b",    "CPL",
  "JR NC,%r",   "LD SP,%w",   "LD (%w),A",  "INC SP",     "INC (HL)",   "DEC (HL)",   "LD (HL),%b", "SCF",
  "JR C,%r",    "ADD HL,SP",  "LD A,(%w)",  "DEC SP",     "INC A",      "DEC A",      "LD A,%b",    "CCF",
];

// 0x40-0x7F: LD register block
const LD_REGS = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];

// 0x80-0xBF: ALU operations
const ALU_OPS = ["ADD A,", "ADC A,", "SUB ", "SBC A,", "AND ", "XOR ", "OR ", "CP "];

// 0xC0-0xFF misc block
const MISC = [
  "RET NZ",     "POP BC",     "JP NZ,%w",   "JP %w",      "CALL NZ,%w", "PUSH BC",    "ADD A,%b",   "RST 00h",
  "RET Z",      "RET",        "JP Z,%w",    null,         "CALL Z,%w",  "CALL %w",    "ADC A,%b",   "RST 08h",
  "RET NC",     "POP DE",     "JP NC,%w",   "OUT (%b),A", "CALL NC,%w", "PUSH DE",    "SUB %b",     "RST 10h",
  "RET C",      "EXX",        "JP C,%w",    "IN A,(%b)",  "CALL C,%w",  null,         "SBC A,%b",   "RST 18h",
  "RET PO",     "POP HL",     "JP PO,%w",   "EX (SP),HL", "CALL PO,%w","PUSH HL",    "AND %b",     "RST 20h",
  "RET PE",     "JP (HL)",    "JP PE,%w",   "EX DE,HL",  "CALL PE,%w", null,         "XOR %b",     "RST 28h",
  "RET P",      "POP AF",     "JP P,%w",    "DI",         "CALL P,%w",  "PUSH AF",    "OR %b",      "RST 30h",
  "RET M",      "LD SP,HL",   "JP M,%w",    "EI",         "CALL M,%w",  null,         "CP %b",      "RST 38h",
];

// CB prefix: bit operations
const CB_OPS = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"];
const BIT_REGS = ["B", "C", "D", "E", "H", "L", "(HL)", "A"];

// ED prefix opcodes (sparse)
const ED = {};
const ed_entries = [
  [0x40,"IN B,(C)"],  [0x41,"OUT (C),B"], [0x42,"SBC HL,BC"], [0x43,"LD (%w),BC"],
  [0x44,"NEG"],       [0x45,"RETN"],      [0x46,"IM 0"],      [0x47,"LD I,A"],
  [0x48,"IN C,(C)"],  [0x49,"OUT (C),C"], [0x4A,"ADC HL,BC"], [0x4B,"LD BC,(%w)"],
  [0x4C,"NEG"],       [0x4D,"RETI"],      [0x4E,"IM 0"],      [0x4F,"LD R,A"],
  [0x50,"IN D,(C)"],  [0x51,"OUT (C),D"], [0x52,"SBC HL,DE"], [0x53,"LD (%w),DE"],
  [0x54,"NEG"],       [0x55,"RETN"],      [0x56,"IM 1"],      [0x57,"LD A,I"],
  [0x58,"IN E,(C)"],  [0x59,"OUT (C),E"], [0x5A,"ADC HL,DE"], [0x5B,"LD DE,(%w)"],
  [0x5C,"NEG"],       [0x5D,"RETN"],      [0x5E,"IM 2"],      [0x5F,"LD A,R"],
  [0x60,"IN H,(C)"],  [0x61,"OUT (C),H"], [0x62,"SBC HL,HL"], [0x63,"LD (%w),HL"],
  [0x64,"NEG"],       [0x65,"RETN"],      [0x67,"RRD"],
  [0x68,"IN L,(C)"],  [0x69,"OUT (C),L"], [0x6A,"ADC HL,HL"], [0x6B,"LD HL,(%w)"],
  [0x6C,"NEG"],       [0x6D,"RETN"],      [0x6F,"RLD"],
  [0x70,"IN F,(C)"],  [0x71,"OUT (C),0"], [0x72,"SBC HL,SP"], [0x73,"LD (%w),SP"],
  [0x74,"NEG"],       [0x75,"RETN"],
  [0x78,"IN A,(C)"],  [0x79,"OUT (C),A"], [0x7A,"ADC HL,SP"], [0x7B,"LD SP,(%w)"],
  [0x7C,"NEG"],       [0x7D,"RETN"],
  [0xA0,"LDI"],       [0xA1,"CPI"],       [0xA2,"INI"],       [0xA3,"OUTI"],
  [0xA8,"LDD"],       [0xA9,"CPD"],       [0xAA,"IND"],       [0xAB,"OUTD"],
  [0xB0,"LDIR"],      [0xB1,"CPIR"],      [0xB2,"INIR"],      [0xB3,"OTIR"],
  [0xB8,"LDDR"],      [0xB9,"CPDR"],      [0xBA,"INDR"],      [0xBB,"OTDR"],
];
for (const [code, mnem] of ed_entries) ED[code] = mnem;

function formatByte(b) {
  return b.toString(16).toUpperCase().padStart(2, "0") + "h";
}

function formatWord(w) {
  return w.toString(16).toUpperCase().padStart(4, "0") + "h";
}

function formatRelative(pc, offset) {
  const target = (pc + 2 + ((offset << 24) >> 24)) & 0xFFFF;
  return target.toString(16).toUpperCase().padStart(4, "0") + "h";
}

function resolveFormat(fmt, readByte, pc, bytesOut) {
  let result = fmt;
  let offset = 0;

  // Replace %w (16-bit word - little endian)
  if (result.includes("%w")) {
    const lo = readByte((pc + offset) & 0xFFFF);
    const hi = readByte((pc + offset + 1) & 0xFFFF);
    bytesOut.push(lo, hi);
    result = result.replace("%w", formatWord((hi << 8) | lo));
    offset += 2;
  }
  // Replace %b (8-bit byte)
  if (result.includes("%b")) {
    const b = readByte((pc + offset) & 0xFFFF);
    bytesOut.push(b);
    result = result.replace("%b", formatByte(b));
    offset += 1;
  }
  // Replace %r (relative jump)
  if (result.includes("%r")) {
    const b = readByte((pc + offset) & 0xFFFF);
    bytesOut.push(b);
    // pc here is the address of the operand byte; relative jump is from start of instruction
    // The base for relative jumps: start_addr + 2
    result = result.replace("%r", formatRelative(pc - 1 - offset, b));
    offset += 1;
  }

  return { mnemonic: result, extraBytes: offset };
}

/**
 * Disassemble a single Z80 instruction at the given address.
 * @param {number} addr - Start address
 * @param {function} readByte - Function(addr) => byte value
 * @returns {{ mnemonic: string, length: number, bytes: number[] }}
 */
export function z80Disassemble(addr, readByte) {
  const bytes = [];
  let pc = addr;
  const opcode = readByte(pc);
  bytes.push(opcode);
  pc = (pc + 1) & 0xFFFF;

  // CB prefix
  if (opcode === 0xCB) {
    const op2 = readByte(pc);
    bytes.push(op2);
    pc = (pc + 1) & 0xFFFF;

    const reg = BIT_REGS[op2 & 7];
    const group = (op2 >> 6) & 3;
    const bit = (op2 >> 3) & 7;

    let mnemonic;
    if (group === 0) {
      mnemonic = `${CB_OPS[bit]} ${reg}`;
    } else if (group === 1) {
      mnemonic = `BIT ${bit},${reg}`;
    } else if (group === 2) {
      mnemonic = `RES ${bit},${reg}`;
    } else {
      mnemonic = `SET ${bit},${reg}`;
    }
    return { mnemonic, length: bytes.length, bytes };
  }

  // DD/FD prefix (IX/IY)
  if (opcode === 0xDD || opcode === 0xFD) {
    const reg16 = opcode === 0xDD ? "IX" : "IY";
    const op2 = readByte(pc);
    bytes.push(op2);
    pc = (pc + 1) & 0xFFFF;

    // DDCB/FDCB prefix
    if (op2 === 0xCB) {
      const d = readByte(pc);
      bytes.push(d);
      pc = (pc + 1) & 0xFFFF;
      const op3 = readByte(pc);
      bytes.push(op3);
      pc = (pc + 1) & 0xFFFF;

      const offset = ((d << 24) >> 24);
      const sign = offset >= 0 ? "+" : "-";
      const absOff = Math.abs(offset);
      const memRef = `(${reg16}${sign}${absOff.toString(16).toUpperCase()}h)`;

      const group = (op3 >> 6) & 3;
      const bit = (op3 >> 3) & 7;
      const dstReg = BIT_REGS[op3 & 7];

      let mnemonic;
      if (group === 0) {
        const op = CB_OPS[bit];
        mnemonic = (op3 & 7) === 6 ? `${op} ${memRef}` : `LD ${dstReg},${op} ${memRef}`;
      } else if (group === 1) {
        mnemonic = `BIT ${bit},${memRef}`;
      } else if (group === 2) {
        mnemonic = (op3 & 7) === 6 ? `RES ${bit},${memRef}` : `LD ${dstReg},RES ${bit},${memRef}`;
      } else {
        mnemonic = (op3 & 7) === 6 ? `SET ${bit},${memRef}` : `LD ${dstReg},SET ${bit},${memRef}`;
      }
      return { mnemonic, length: bytes.length, bytes };
    }

    // Regular DD/FD opcodes - substitute HL->IX/IY, H->IXh/IYh, L->IXl/IYl, (HL)->offset
    return disasmDDFD(op2, reg16, pc, readByte, bytes, addr);
  }

  // ED prefix
  if (opcode === 0xED) {
    const op2 = readByte(pc);
    bytes.push(op2);
    pc = (pc + 1) & 0xFFFF;

    const fmt = ED[op2];
    if (!fmt) {
      return { mnemonic: "NOP*", length: bytes.length, bytes };
    }

    if (fmt.includes("%w")) {
      const lo = readByte(pc);
      const hi = readByte((pc + 1) & 0xFFFF);
      bytes.push(lo, hi);
      const w = (hi << 8) | lo;
      return { mnemonic: fmt.replace("%w", formatWord(w)), length: bytes.length, bytes };
    }

    return { mnemonic: fmt, length: bytes.length, bytes };
  }

  // Main opcodes 0x00-0x3F
  if (opcode < 0x40) {
    const fmt = MAIN[opcode];
    if (!fmt) {
      return { mnemonic: "???", length: 1, bytes };
    }

    const extraBytes = [];
    const { mnemonic, extraBytes: count } = resolveFormat(fmt, readByte, pc, extraBytes);
    bytes.push(...extraBytes);
    return { mnemonic, length: bytes.length, bytes };
  }

  // 0x40-0x7F: LD block + HALT
  if (opcode < 0x80) {
    if (opcode === 0x76) {
      return { mnemonic: "HALT", length: 1, bytes };
    }
    const dst = LD_REGS[(opcode >> 3) & 7];
    const src = LD_REGS[opcode & 7];
    return { mnemonic: `LD ${dst},${src}`, length: 1, bytes };
  }

  // 0x80-0xBF: ALU operations
  if (opcode < 0xC0) {
    const op = ALU_OPS[(opcode >> 3) & 7];
    const reg = LD_REGS[opcode & 7];
    return { mnemonic: `${op}${reg}`, length: 1, bytes };
  }

  // 0xC0-0xFF: misc
  const fmt = MISC[opcode - 0xC0];
  if (!fmt) {
    return { mnemonic: "???", length: 1, bytes };
  }

  const extraBytes = [];
  const { mnemonic } = resolveFormat(fmt, readByte, pc, extraBytes);
  bytes.push(...extraBytes);
  return { mnemonic, length: bytes.length, bytes };
}

function disasmDDFD(op2, reg16, pc, readByte, bytes, startAddr) {
  const rh = `${reg16}h`;
  const rl = `${reg16}l`;

  // Handle (IX/IY+d) instructions - need displacement byte
  function memRef() {
    const d = readByte(pc);
    bytes.push(d);
    pc = (pc + 1) & 0xFFFF;
    const offset = ((d << 24) >> 24);
    const sign = offset >= 0 ? "+" : "-";
    return `(${reg16}${sign}${Math.abs(offset).toString(16).toUpperCase()}h)`;
  }

  // Map main opcodes with HL/H/L substitutions
  // Most DD/FD opcodes mirror main opcodes with IX/IY swapped for HL
  if (op2 < 0x40) {
    const mainFmt = MAIN[op2];
    if (mainFmt) {
      let fmt = mainFmt.replace(/\bHL\b/g, reg16);
      // Handle special cases with (HL) -> (IX+d)
      if (fmt.includes("(HL)")) {
        // Not applicable for < 0x40 except INC/DEC (HL) at 0x34, 0x35, 0x36
      }
      if (op2 === 0x09) return r(fmt);
      if (op2 === 0x19) return r(fmt.replace("DE", "DE"));
      if (op2 === 0x21) { // LD IX/IY,nn
        const lo = readByte(pc); const hi = readByte((pc+1)&0xFFFF);
        bytes.push(lo, hi);
        return r(`LD ${reg16},${formatWord((hi<<8)|lo)}`);
      }
      if (op2 === 0x22) { // LD (nn),IX/IY
        const lo = readByte(pc); const hi = readByte((pc+1)&0xFFFF);
        bytes.push(lo, hi);
        return r(`LD (${formatWord((hi<<8)|lo)}),${reg16}`);
      }
      if (op2 === 0x23) return r(`INC ${reg16}`);
      if (op2 === 0x24) return r(`INC ${rh}`);
      if (op2 === 0x25) return r(`DEC ${rh}`);
      if (op2 === 0x26) { const b = readByte(pc); bytes.push(b); return r(`LD ${rh},${formatByte(b)}`); }
      if (op2 === 0x29) return r(`ADD ${reg16},${reg16}`);
      if (op2 === 0x2A) { // LD IX/IY,(nn)
        const lo = readByte(pc); const hi = readByte((pc+1)&0xFFFF);
        bytes.push(lo, hi);
        return r(`LD ${reg16},(${formatWord((hi<<8)|lo)})`);
      }
      if (op2 === 0x2B) return r(`DEC ${reg16}`);
      if (op2 === 0x2C) return r(`INC ${rl}`);
      if (op2 === 0x2D) return r(`DEC ${rl}`);
      if (op2 === 0x2E) { const b = readByte(pc); bytes.push(b); return r(`LD ${rl},${formatByte(b)}`); }
      if (op2 === 0x34) { const m = memRef(); return r(`INC ${m}`); }
      if (op2 === 0x35) { const m = memRef(); return r(`DEC ${m}`); }
      if (op2 === 0x36) { const m = memRef(); const b = readByte(pc); bytes.push(b); return r(`LD ${m},${formatByte(b)}`); }
      if (op2 === 0x39) return r(`ADD ${reg16},SP`);
    }
    // Fall through to NOP for unrecognized
    return r("NOP*");
  }

  // 0x40-0x7F: LD block with IX/IY substitutions
  if (op2 < 0x80) {
    if (op2 === 0x76) return r("HALT");
    const dst = (op2 >> 3) & 7;
    const src = op2 & 7;

    let dstName = LD_REGS[dst];
    let srcName = LD_REGS[src];

    // (HL) -> (IX+d), H -> IXh, L -> IXl
    if (dst === 6 || src === 6) {
      // One operand is (HL) -> use displacement
      if (dst === 6 && src === 6) return r("HALT"); // shouldn't happen
      const m = memRef();
      if (dst === 6) {
        return r(`LD ${m},${srcName}`);
      } else {
        return r(`LD ${dstName},${m}`);
      }
    }

    // H/L substitutions (only when not (HL))
    if (dst === 4) dstName = rh;
    if (dst === 5) dstName = rl;
    if (src === 4) srcName = rh;
    if (src === 5) srcName = rl;

    return r(`LD ${dstName},${srcName}`);
  }

  // 0x80-0xBF: ALU with (IX+d) or IXh/IXl
  if (op2 < 0xC0) {
    const op = ALU_OPS[(op2 >> 3) & 7];
    const src = op2 & 7;
    if (src === 6) {
      const m = memRef();
      return r(`${op}${m}`);
    }
    let srcName = LD_REGS[src];
    if (src === 4) srcName = rh;
    if (src === 5) srcName = rl;
    return r(`${op}${srcName}`);
  }

  // 0xC0-0xFF misc
  if (op2 === 0xE1) return r(`POP ${reg16}`);
  if (op2 === 0xE3) return r(`EX (SP),${reg16}`);
  if (op2 === 0xE5) return r(`PUSH ${reg16}`);
  if (op2 === 0xE9) return r(`JP (${reg16})`);
  if (op2 === 0xF9) return r(`LD SP,${reg16}`);

  // Unrecognized DD/FD opcode - treat as NOP + retry
  return r("NOP*");

  function r(mnemonic) {
    return { mnemonic, length: bytes.length, bytes };
  }
}
