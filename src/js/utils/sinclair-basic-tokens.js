/*
 * sinclair-basic-tokens.js - Sinclair BASIC token tables and system variable constants
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Sinclair BASIC tokens: byte 0xA5-0xFF -> keyword string
// Reference: ZX Spectrum ROM disassembly
export const TOKENS = {
  0xA5: "RND",
  0xA6: "INKEY$",
  0xA7: "PI",
  0xA8: "FN",
  0xA9: "POINT",
  0xAA: "SCREEN$",
  0xAB: "ATTR",
  0xAC: "AT",
  0xAD: "TAB",
  0xAE: "VAL$",
  0xAF: "CODE",
  0xB0: "VAL",
  0xB1: "LEN",
  0xB2: "SIN",
  0xB3: "COS",
  0xB4: "TAN",
  0xB5: "ASN",
  0xB6: "ACS",
  0xB7: "ATN",
  0xB8: "LN",
  0xB9: "EXP",
  0xBA: "INT",
  0xBB: "SQR",
  0xBC: "SGN",
  0xBD: "ABS",
  0xBE: "PEEK",
  0xBF: "IN",
  0xC0: "USR",
  0xC1: "STR$",
  0xC2: "CHR$",
  0xC3: "NOT",
  0xC4: "BIN",
  0xC5: "OR",
  0xC6: "AND",
  0xC7: "<=",
  0xC8: ">=",
  0xC9: "<>",
  0xCA: "LINE",
  0xCB: "THEN",
  0xCC: "TO",
  0xCD: "STEP",
  0xCE: "DEF FN",
  0xCF: "CAT",
  0xD0: "FORMAT",
  0xD1: "MOVE",
  0xD2: "ERASE",
  0xD3: "OPEN #",
  0xD4: "CLOSE #",
  0xD5: "MERGE",
  0xD6: "VERIFY",
  0xD7: "BEEP",
  0xD8: "CIRCLE",
  0xD9: "INK",
  0xDA: "PAPER",
  0xDB: "FLASH",
  0xDC: "BRIGHT",
  0xDD: "INVERSE",
  0xDE: "OVER",
  0xDF: "OUT",
  0xE0: "LPRINT",
  0xE1: "LLIST",
  0xE2: "STOP",
  0xE3: "READ",
  0xE4: "DATA",
  0xE5: "RESTORE",
  0xE6: "NEW",
  0xE7: "BORDER",
  0xE8: "CONTINUE",
  0xE9: "DIM",
  0xEA: "REM",
  0xEB: "FOR",
  0xEC: "GO TO",
  0xED: "GO SUB",
  0xEE: "INPUT",
  0xEF: "LOAD",
  0xF0: "LIST",
  0xF1: "LET",
  0xF2: "PAUSE",
  0xF3: "NEXT",
  0xF4: "POKE",
  0xF5: "PRINT",
  0xF6: "PLOT",
  0xF7: "RUN",
  0xF8: "SAVE",
  0xF9: "RANDOMIZE",
  0xFA: "IF",
  0xFB: "CLS",
  0xFC: "DRAW",
  0xFD: "CLEAR",
  0xFE: "RETURN",
  0xFF: "COPY",
};

// Reverse map: keyword -> token byte (longest-match ordering built in)
export const KEYWORD_TO_TOKEN = {};
for (const [byte, keyword] of Object.entries(TOKENS)) {
  KEYWORD_TO_TOKEN[keyword] = parseInt(byte, 10);
}

// Keywords sorted by length descending for longest-match tokenization
export const KEYWORDS_BY_LENGTH = Object.keys(KEYWORD_TO_TOKEN).sort(
  (a, b) => b.length - a.length,
);

// Keyword categories for syntax highlighting
export const KEYWORD_CATEGORIES = {
  flow: [
    "GO TO", "GO SUB", "RETURN", "IF", "THEN", "STOP", "CONTINUE",
    "RUN", "LIST", "NEW",
  ],
  loop: ["FOR", "TO", "STEP", "NEXT"],
  io: [
    "PRINT", "LPRINT", "INPUT", "INKEY$", "LLIST",
    "LOAD", "SAVE", "VERIFY", "MERGE", "DATA", "READ", "RESTORE",
    "OPEN #", "CLOSE #",
  ],
  graphics: [
    "PLOT", "DRAW", "CIRCLE", "POINT", "SCREEN$", "ATTR",
    "INK", "PAPER", "FLASH", "BRIGHT", "INVERSE", "OVER",
    "BORDER", "CLS", "AT", "TAB", "COPY",
  ],
  memory: [
    "PEEK", "POKE", "IN", "OUT", "USR", "CLEAR", "DIM",
    "DEF FN", "FN", "LET", "PAUSE", "BEEP", "RANDOMIZE",
    "CAT", "FORMAT", "MOVE", "ERASE",
  ],
  functions: [
    "RND", "PI", "SIN", "COS", "TAN", "ASN", "ACS", "ATN",
    "LN", "EXP", "INT", "SQR", "SGN", "ABS", "LEN",
    "VAL", "VAL$", "STR$", "CHR$", "CODE", "BIN",
    "NOT", "AND", "OR",
  ],
  misc: ["REM", "LINE", "<=", ">=", "<>"],
};

// Build a reverse lookup: keyword -> category
export const KEYWORD_TO_CATEGORY = {};
for (const [cat, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
  for (const kw of keywords) {
    KEYWORD_TO_CATEGORY[kw] = cat;
  }
}

// ZX Spectrum system variable addresses
export const SYS = {
  KSTATE: 0x5C00,
  LAST_K: 0x5C08,
  REPDEL: 0x5C09,
  REPPER: 0x5C0A,
  DEFADD: 0x5C0B,
  K_DATA: 0x5C0D,
  TVDATA: 0x5C0E,
  STRMS: 0x5C10,
  CHARS: 0x5C36,
  RASP: 0x5C38,
  PIP: 0x5C39,
  ERR_NR: 0x5C3A,
  FLAGS: 0x5C3B,
  TV_FLAG: 0x5C3C,
  ERR_SP: 0x5C3D,
  LIST_SP: 0x5C3F,
  MODE: 0x5C41,
  NEWPPC: 0x5C42,
  NSPPC: 0x5C44,
  PPC: 0x5C45,
  SUBPPC: 0x5C47,
  BORDCR: 0x5C48,
  E_PPC: 0x5C49,
  VARS: 0x5C4B,
  DEST: 0x5C4D,
  CHANS: 0x5C4F,
  CURCHL: 0x5C51,
  PROG: 0x5C53,
  NXTLIN: 0x5C55,
  DATADD: 0x5C57,
  E_LINE: 0x5C59,
  K_CUR: 0x5C5B,
  CH_ADD: 0x5C5D,
  X_PTR: 0x5C5F,
  WORKSP: 0x5C61,
  STKBOT: 0x5C63,
  STKEND: 0x5C65,
  BREG: 0x5C67,
  MEM: 0x5C68,
  FLAGS2: 0x5C6A,
  DF_SZ: 0x5C6B,
  S_TOP: 0x5C6C,
  OLDPPC: 0x5C6E,
  OSPPC: 0x5C70,
  FLAGX: 0x5C71,
  STRLEN: 0x5C72,
  T_ADDR: 0x5C74,
  SEED: 0x5C76,
  FRAMES: 0x5C78,
  UDG: 0x5C7B,
  COORDS_X: 0x5C7D,
  COORDS_Y: 0x5C7E,
  P_POSN: 0x5C7F,
  PR_CC: 0x5C80,
  ECHO_E: 0x5C82,
  DF_CC: 0x5C84,
  DF_CCL: 0x5C86,
  S_POSN: 0x5C88,
  SPOSNL: 0x5C8A,
  SCR_CT: 0x5C8C,
  ATTR_P: 0x5C8D,
  MASK_P: 0x5C8E,
  ATTR_T: 0x5C8F,
  MASK_T: 0x5C90,
  P_FLAG: 0x5C91,
  MEMBOT: 0x5C92,
  RAMTOP: 0x5CAA,
  P_RAMT: 0x5CB2,
};

// Number marker byte - precedes 5-byte floating point representation in BASIC lines
export const NUMBER_MARKER = 0x0E;
