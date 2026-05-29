/*
 * asm-highlight.js - Z80 assembly syntax highlighter for the assembler window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const MNEMONICS = new Set([
  "ADC", "ADD", "AND", "BIT", "CALL", "CCF", "CP", "CPD", "CPDR", "CPI", "CPIR",
  "CPL", "DAA", "DEC", "DI", "DJNZ", "EI", "EX", "EXX", "HALT", "IM", "IN",
  "INC", "IND", "INDR", "INI", "INIR", "JP", "JR", "LD", "LDD", "LDDR", "LDI",
  "LDIR", "NEG", "NOP", "OR", "OTDR", "OTIR", "OUT", "OUTD", "OUTI", "POP",
  "PUSH", "RES", "RET", "RETI", "RETN", "RL", "RLA", "RLC", "RLCA", "RLD", "RR",
  "RRA", "RRC", "RRCA", "RRD", "RST", "SBC", "SCF", "SET", "SLA", "SLL", "SRA",
  "SRL", "SUB", "XOR",
]);

const REGISTERS = new Set([
  "A", "B", "C", "D", "E", "H", "L", "I", "R",
  "AF", "BC", "DE", "HL", "SP", "IX", "IY", "PC",
  "IXH", "IXL", "IYH", "IYL", "HX", "HY", "LX", "LY", "XH", "XL", "YH", "YL",
  "AF'",
]);

const CONDITIONS = new Set(["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"]);

const DIRECTIVES = new Set([
  "ORG", "EQU", "DB", "DW", "DEFB", "DEFW", "DEFM", "DEFS", "DM", "DS",
  "ALIGN", "INCBIN", "INCLUDE", "END", "EQU:", "MACRO", "ENDM", "IF", "ELSE",
  "ENDIF",
]);

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(cls, text) {
  return `<span class="${cls}">${esc(text)}</span>`;
}

// Classify a bare word (letters/digits/_/'). Mnemonic wins over register so
// that "AND", "OR", "XOR", "CP" etc. render as instructions rather than as
// the homonymous condition codes.
function classifyWord(word) {
  const u = word.toUpperCase();
  if (MNEMONICS.has(u)) return "asm-mnemonic";
  if (DIRECTIVES.has(u)) return "asm-directive";
  if (REGISTERS.has(u)) return "asm-register";
  if (CONDITIONS.has(u)) return "asm-condition";
  return null;
}

export function highlightAsmLine(line) {
  let out = "";
  let i = 0;
  const n = line.length;

  // Optional leading label: identifier at column 0 followed by ':'.
  if (n > 0 && /[A-Za-z_.]/.test(line[0])) {
    let j = 0;
    while (j < n && /[A-Za-z0-9_.]/.test(line[j])) j++;
    if (j < n && line[j] === ":") {
      out += span("asm-label", line.substring(0, j + 1));
      i = j + 1;
    }
  }

  while (i < n) {
    const ch = line[i];

    // Comment to end of line.
    if (ch === ";") {
      out += span("asm-comment", line.substring(i));
      return out;
    }

    // Whitespace passes through unchanged (preserves layout).
    if (ch === " " || ch === "\t") {
      let j = i;
      while (j < n && (line[j] === " " || line[j] === "\t")) j++;
      out += esc(line.substring(i, j));
      i = j;
      continue;
    }

    // String literal (single or double quote).
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && line[j] !== quote) j++;
      if (j < n) j++; // include closing quote
      out += span("asm-string", line.substring(i, j));
      i = j;
      continue;
    }

    // Numbers: $hex, %binary, 0xhex, decimal, trailing-H hex, trailing-B binary.
    if (ch === "$" && i + 1 < n && /[0-9A-Fa-f]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < n && /[0-9A-Fa-f]/.test(line[j])) j++;
      out += span("asm-number", line.substring(i, j));
      i = j;
      continue;
    }
    if (ch === "%" && i + 1 < n && /[01]/.test(line[i + 1])) {
      let j = i + 1;
      while (j < n && /[01_]/.test(line[j])) j++;
      out += span("asm-number", line.substring(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      // 0x hex
      if (line[j] === "0" && (line[j + 1] === "x" || line[j + 1] === "X")) {
        j += 2;
        while (j < n && /[0-9A-Fa-f_]/.test(line[j])) j++;
      } else {
        while (j < n && /[0-9A-Fa-f_]/.test(line[j])) j++;
        // optional H/B suffix
        if (j < n && (line[j] === "h" || line[j] === "H" || line[j] === "b" || line[j] === "B" || line[j] === "d" || line[j] === "D")) j++;
      }
      out += span("asm-number", line.substring(i, j));
      i = j;
      continue;
    }

    // Bare word (identifier or mnemonic/register/directive/condition).
    if (/[A-Za-z_.]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_.']/.test(line[j])) j++;
      const word = line.substring(i, j);
      const cls = classifyWord(word);
      out += cls ? span(cls, word) : esc(word);
      i = j;
      continue;
    }

    // Punctuation / operators pass through unstyled.
    out += esc(ch);
    i++;
  }

  return out;
}

export function highlightAsm(text) {
  return text.split("\n").map(highlightAsmLine).join("\n");
}

// Canonical column for the mnemonic / directive after an optional label.
export const ASM_INDENT = "        "; // 8 spaces
// Column where an inline comment (after code) is anchored.
const ASM_COMMENT_COL = 32;

// Split a line into { label, body, comment } without breaking strings or
// touching `;` inside quotes.
function splitParts(line) {
  let codeEnd = line.length;
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === ";") {
      codeEnd = i;
      break;
    }
  }
  const codePart = line.substring(0, codeEnd).replace(/\s+$/, "");
  const comment = line.substring(codeEnd); // includes the ';' or empty
  return { codePart, comment };
}

// Reformat one source line to: [label:] [ASM_INDENT][mnemonic operands] [; comment].
// Pure blank lines stay blank. Pure-comment lines keep their comment (indented
// to the mnemonic column so trailing comments stack with mnemonic lines).
export function formatAsmLine(line) {
  const { codePart, comment } = splitParts(line);
  const code = codePart.trim();

  if (!code) {
    if (!comment) return "";
    return comment;
  }

  let label = "";
  let body = code;
  const m = code.match(/^([A-Za-z_.][A-Za-z0-9_.]*):\s*(.*)$/);
  if (m) {
    label = m[1] + ":";
    body = m[2].trim();
  } else {
    // Colonless column-0 label: traditional Z80 syntax allows e.g.
    // "SCREEN EQU $4000" or "start LD A,1". If the first token isn't a known
    // mnemonic/directive but the second token is, treat the first as a label.
    const m2 = code.match(/^([A-Za-z_.][A-Za-z0-9_.]*)\s+(\S.*)$/);
    if (m2) {
      const first = m2[1].toUpperCase();
      const rest = m2[2].trim();
      const restFirst = rest.split(/\s+/)[0].toUpperCase();
      const firstIsOp = MNEMONICS.has(first) || DIRECTIVES.has(first);
      const restIsOp = MNEMONICS.has(restFirst) || DIRECTIVES.has(restFirst);
      if (!firstIsOp && restIsOp) {
        label = m2[1];
        body = rest;
      }
    }
  }

  // Normalise whitespace between mnemonic and operands to a single space.
  let formattedBody = "";
  if (body) {
    const wsIdx = body.search(/\s/);
    if (wsIdx === -1) {
      formattedBody = body;
    } else {
      const mnem = body.substring(0, wsIdx);
      const operands = body.substring(wsIdx).trim();
      formattedBody = operands ? `${mnem} ${operands}` : mnem;
    }
  }

  let out;
  if (label) {
    // If the label fits inside the indent column, pad to ASM_INDENT;
    // otherwise let it overflow with a single space separator.
    if (label.length < ASM_INDENT.length) {
      out = label + " ".repeat(ASM_INDENT.length - label.length) + formattedBody;
    } else {
      out = formattedBody ? `${label} ${formattedBody}` : label;
    }
  } else {
    out = ASM_INDENT + formattedBody;
  }

  if (comment) {
    out = out.replace(/\s+$/, "");
    const pad = out.length < ASM_COMMENT_COL
      ? " ".repeat(ASM_COMMENT_COL - out.length)
      : "  ";
    out += pad + comment;
  }
  return out.replace(/\s+$/, "");
}
