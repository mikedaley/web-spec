/*
 * z80_assembler.cpp - Multi-pass Z80 assembler
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80_assembler.hpp"
#include "z80_tables.hpp"
#include <algorithm>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <map>
#include <sstream>
#include <string>

namespace zxspec {

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

static std::string toUpper(const std::string& s) {
    std::string r = s;
    for (auto& c : r) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
    return r;
}

static std::string trim(const std::string& s) {
    size_t start = s.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) return "";
    size_t end = s.find_last_not_of(" \t\r\n");
    return s.substr(start, end - start + 1);
}

// Strip trailing comment (;) respecting quoted strings
static std::string stripComment(const std::string& line) {
    bool inQuote = false;
    for (size_t i = 0; i < line.size(); i++) {
        if (line[i] == '"' || line[i] == '\'') inQuote = !inQuote;
        if (line[i] == ';' && !inQuote) return line.substr(0, i);
    }
    return line;
}

// ---------------------------------------------------------------------------
// Reverse lookup helpers using shared tables
// ---------------------------------------------------------------------------

// Returns 0-7 for B,C,D,E,H,L,(HL),A or -1
static int reg8Index(const std::string& name) {
    for (int i = 0; i < 8; i++) {
        if (name == REG8_NAMES[i]) return i;
    }
    return -1;
}

// Returns 0-3 for BC,DE,HL,SP or -1
static int reg16Index(const std::string& name) {
    for (int i = 0; i < 4; i++) {
        if (name == REG16_NAMES[i]) return i;
    }
    return -1;
}

// Returns 0-3 for BC,DE,HL,AF or -1
static int reg16AFIndex(const std::string& name) {
    for (int i = 0; i < 4; i++) {
        if (name == REG16AF_NAMES[i]) return i;
    }
    return -1;
}

// Returns 0-7 for NZ,Z,NC,C,PO,PE,P,M or -1
static int condIndex(const std::string& name) {
    for (int i = 0; i < 8; i++) {
        if (name == COND_NAMES[i]) return i;
    }
    return -1;
}

// Returns 0-7 for ALU ops or -1
static int aluOpIndex(const std::string& name) {
    // Match without trailing operand punctuation
    // ALU_OP_NAMES: "ADD A,", "ADC A,", "SUB ", "SBC A,", "AND ", "XOR ", "OR ", "CP "
    static const char* NAMES[] = { "ADD", "ADC", "SUB", "SBC", "AND", "XOR", "OR", "CP" };
    for (int i = 0; i < 8; i++) {
        if (name == NAMES[i]) return i;
    }
    return -1;
}

// Returns 0-7 for CB ops or -1
static int cbOpIndex(const std::string& name) {
    for (int i = 0; i < 8; i++) {
        if (name == CB_OP_NAMES[i]) return i;
    }
    return -1;
}

// Look up ED table: mnemonic (uppercase, with %w placeholder replaced by dummy) -> code
// Returns the ED opcode byte or -1
static int edReverseLookup(const std::string& mnemonic) {
    for (int i = 0; i < ED_TABLE_SIZE; i++) {
        // Compare without any %w placeholder
        std::string entry(ED_TABLE[i].mnem);
        auto pos = entry.find("%w");
        if (pos != std::string::npos) continue; // skip parameterised entries
        if (toUpper(entry) == mnemonic) return ED_TABLE[i].code;
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Parsed line
// ---------------------------------------------------------------------------

struct ParsedLine {
    std::string label;
    std::string mnemonic;
    std::string operands;   // raw operand string
    std::string source;     // original source
    int lineNum;            // 1-based
};

// Split operands by comma, respecting parentheses and quoted strings
static std::vector<std::string> splitOperands(const std::string& ops) {
    std::vector<std::string> result;
    if (ops.empty()) return result;
    int depth = 0;
    bool inQuote = false;
    char quoteChar = 0;
    std::string current;
    for (char c : ops) {
        if (!inQuote) {
            if (c == '"' || c == '\'') { inQuote = true; quoteChar = c; }
            else if (c == '(') depth++;
            else if (c == ')') depth--;
            else if (c == ',' && depth == 0) {
                result.push_back(trim(current));
                current.clear();
                continue;
            }
        } else if (c == quoteChar) {
            inQuote = false;
        }
        current += c;
    }
    result.push_back(trim(current));
    return result;
}

// ---------------------------------------------------------------------------
// Expression evaluator (supports labels, hex ($xx, 0xNN, NNh), binary (%NN),
// decimal, +, -, *, /, unary -, parentheses, and $ for current address)
// ---------------------------------------------------------------------------

struct ExprContext {
    const std::map<std::string, int32_t>* symbols;
    uint16_t currentAddr;
    bool pass1;                 // true = first pass (unresolved labels OK)
    bool hasUnresolved = false; // set if any symbol was unknown
};

static int32_t parseExpr(const std::string& expr, ExprContext& ctx);

// Parse a number literal: $FF, 0xFF, FFh, %10101010, 0b101, or decimal
static bool parseNumber(const std::string& token, int32_t& out) {
    if (token.empty()) return false;

    std::string s = token;

    // $ prefix hex
    if (s[0] == '$') {
        char* end;
        out = static_cast<int32_t>(strtol(s.c_str() + 1, &end, 16));
        return *end == '\0';
    }
    // 0x prefix hex
    if (s.size() > 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) {
        char* end;
        out = static_cast<int32_t>(strtol(s.c_str() + 2, &end, 16));
        return *end == '\0';
    }
    // h suffix hex (must start with digit)
    if (s.size() > 1 && (s.back() == 'h' || s.back() == 'H') &&
        std::isxdigit(static_cast<unsigned char>(s[0]))) {
        char* end;
        out = static_cast<int32_t>(strtol(s.c_str(), &end, 16));
        return end == s.c_str() + s.size() - 1;
    }
    // % prefix binary
    if (s[0] == '%') {
        char* end;
        out = static_cast<int32_t>(strtol(s.c_str() + 1, &end, 2));
        return *end == '\0';
    }
    // 0b prefix binary
    if (s.size() > 2 && s[0] == '0' && (s[1] == 'b' || s[1] == 'B')) {
        char* end;
        out = static_cast<int32_t>(strtol(s.c_str() + 2, &end, 2));
        return *end == '\0';
    }
    // Decimal
    if (std::isdigit(static_cast<unsigned char>(s[0]))) {
        char* end;
        out = static_cast<int32_t>(strtol(s.c_str(), &end, 10));
        return *end == '\0';
    }
    return false;
}

// Tokenize expression into atoms
static int32_t evalAtom(const char*& p, ExprContext& ctx);
static int32_t evalMul(const char*& p, ExprContext& ctx);
static int32_t evalAdd(const char*& p, ExprContext& ctx);

static void skipWS(const char*& p) {
    while (*p == ' ' || *p == '\t') p++;
}

static int32_t evalAtom(const char*& p, ExprContext& ctx) {
    skipWS(p);

    // Unary minus
    if (*p == '-') {
        p++;
        return -evalAtom(p, ctx);
    }
    // Unary plus
    if (*p == '+') {
        p++;
        return evalAtom(p, ctx);
    }
    // Unary NOT (~)
    if (*p == '~') {
        p++;
        return ~evalAtom(p, ctx);
    }
    // Parenthesised sub-expression
    if (*p == '(') {
        p++;
        int32_t val = evalAdd(p, ctx);
        skipWS(p);
        if (*p == ')') p++;
        return val;
    }
    // Current address ($)
    if (*p == '$' && !std::isxdigit(static_cast<unsigned char>(p[1]))) {
        p++;
        return ctx.currentAddr;
    }
    // $ hex prefix
    if (*p == '$' && std::isxdigit(static_cast<unsigned char>(p[1]))) {
        const char* start = p + 1;
        p++;
        while (std::isxdigit(static_cast<unsigned char>(*p))) p++;
        std::string tok(start, p);
        int32_t v;
        parseNumber(std::string("$") + tok, v);
        return v;
    }
    // % binary prefix
    if (*p == '%' && (*((p)+1) == '0' || *((p)+1) == '1')) {
        const char* start = p;
        p++;
        while (*p == '0' || *p == '1') p++;
        std::string tok(start, p);
        int32_t v;
        parseNumber(tok, v);
        return v;
    }
    // 0x or 0b prefix
    if (*p == '0' && (p[1] == 'x' || p[1] == 'X' || p[1] == 'b' || p[1] == 'B')) {
        const char* start = p;
        p += 2;
        while (std::isxdigit(static_cast<unsigned char>(*p)) || *p == '_') p++;
        std::string tok(start, p);
        int32_t v;
        parseNumber(tok, v);
        return v;
    }
    // Number (decimal or hex with h suffix)
    if (std::isdigit(static_cast<unsigned char>(*p))) {
        const char* start = p;
        while (std::isalnum(static_cast<unsigned char>(*p)) || *p == '_') p++;
        std::string tok(start, p);
        // Remove underscores
        tok.erase(std::remove(tok.begin(), tok.end(), '_'), tok.end());
        int32_t v;
        if (parseNumber(tok, v)) return v;
        return 0;
    }
    // Label/symbol
    if (std::isalpha(static_cast<unsigned char>(*p)) || *p == '_' || *p == '.') {
        const char* start = p;
        while (std::isalnum(static_cast<unsigned char>(*p)) || *p == '_' || *p == '.') p++;
        std::string name(start, p);
        std::string upper = toUpper(name);
        auto it = ctx.symbols->find(upper);
        if (it != ctx.symbols->end()) return it->second;
        ctx.hasUnresolved = true;
        return 0;
    }

    return 0;
}

static int32_t evalMul(const char*& p, ExprContext& ctx) {
    int32_t val = evalAtom(p, ctx);
    for (;;) {
        skipWS(p);
        if (*p == '*') { p++; val *= evalAtom(p, ctx); }
        else if (*p == '/') { p++; int32_t d = evalAtom(p, ctx); val = d ? val / d : 0; }
        else if (*p == '&') { p++; val &= evalAtom(p, ctx); }
        else if (*p == '|') { p++; val |= evalAtom(p, ctx); }
        else if (*p == '^') { p++; val ^= evalAtom(p, ctx); }
        else break;
    }
    return val;
}

static int32_t evalAdd(const char*& p, ExprContext& ctx) {
    int32_t val = evalMul(p, ctx);
    for (;;) {
        skipWS(p);
        if (*p == '+') { p++; val += evalMul(p, ctx); }
        else if (*p == '-') { p++; val -= evalMul(p, ctx); }
        else break;
    }
    return val;
}

static int32_t parseExpr(const std::string& expr, ExprContext& ctx) {
    const char* p = expr.c_str();
    int32_t result = evalAdd(p, ctx);
    return result;
}

// ---------------------------------------------------------------------------
// Operand classification
// ---------------------------------------------------------------------------

enum class OpKind {
    None,
    Reg8,       // A, B, C, D, E, H, L
    IndHL,      // (HL)
    IndBC,      // (BC)
    IndDE,      // (DE)
    IndSP,      // (SP)
    Reg16,      // BC, DE, HL, SP
    RegAF,      // AF
    RegAFPrime, // AF'
    RegIX,      // IX
    RegIY,      // IY
    RegIXH,     // IXH
    RegIXL,     // IXL
    RegIYH,     // IYH
    RegIYL,     // IYL
    IndIX,      // (IX+d)
    IndIY,      // (IY+d)
    RegI,       // I
    RegR,       // R
    Imm8,       // 8-bit immediate
    Imm16,      // 16-bit immediate / label
    IndMem,     // (nn) - memory indirect
    PortC,      // (C) for IN/OUT
    Cond,       // NZ, Z, NC, C, PO, PE, P, M
};

struct Operand {
    OpKind kind = OpKind::None;
    int reg = -1;           // register index for Reg8/Reg16/Cond
    int32_t value = 0;      // immediate value, displacement, or address
    std::string raw;        // raw operand text (for error messages)
    bool hasUnresolved = false;
};

static Operand classifyOperand(const std::string& rawOp, ExprContext& ctx) {
    Operand op;
    op.raw = rawOp;
    if (rawOp.empty()) return op;

    std::string s = toUpper(trim(rawOp));

    // Check for condition codes first (but not single 'C' which is also a register)
    if (s == "NZ" || s == "Z" || s == "NC" || s == "PO" || s == "PE" || s == "P" || s == "M") {
        op.kind = OpKind::Cond;
        op.reg = condIndex(s);
        return op;
    }

    // Registers
    if (s == "A") { op.kind = OpKind::Reg8; op.reg = 7; return op; }
    if (s == "B") { op.kind = OpKind::Reg8; op.reg = 0; return op; }
    if (s == "C") { op.kind = OpKind::Reg8; op.reg = 1; return op; }
    if (s == "D") { op.kind = OpKind::Reg8; op.reg = 2; return op; }
    if (s == "E") { op.kind = OpKind::Reg8; op.reg = 3; return op; }
    if (s == "H") { op.kind = OpKind::Reg8; op.reg = 4; return op; }
    if (s == "L") { op.kind = OpKind::Reg8; op.reg = 5; return op; }
    if (s == "I") { op.kind = OpKind::RegI; return op; }
    if (s == "R") { op.kind = OpKind::RegR; return op; }
    if (s == "BC") { op.kind = OpKind::Reg16; op.reg = 0; return op; }
    if (s == "DE") { op.kind = OpKind::Reg16; op.reg = 1; return op; }
    if (s == "HL") { op.kind = OpKind::Reg16; op.reg = 2; return op; }
    if (s == "SP") { op.kind = OpKind::Reg16; op.reg = 3; return op; }
    if (s == "AF'") { op.kind = OpKind::RegAFPrime; return op; }
    if (s == "AF") { op.kind = OpKind::RegAF; return op; }
    if (s == "IX") { op.kind = OpKind::RegIX; return op; }
    if (s == "IY") { op.kind = OpKind::RegIY; return op; }
    if (s == "IXH" || s == "HX" || s == "XH") { op.kind = OpKind::RegIXH; return op; }
    if (s == "IXL" || s == "LX" || s == "XL") { op.kind = OpKind::RegIXL; return op; }
    if (s == "IYH" || s == "HY" || s == "YH") { op.kind = OpKind::RegIYH; return op; }
    if (s == "IYL" || s == "LY" || s == "YL") { op.kind = OpKind::RegIYL; return op; }

    // Indirect modes
    if (s.front() == '(' && s.back() == ')') {
        std::string inner = trim(s.substr(1, s.size() - 2));

        if (inner == "HL") { op.kind = OpKind::IndHL; return op; }
        if (inner == "BC") { op.kind = OpKind::IndBC; return op; }
        if (inner == "DE") { op.kind = OpKind::IndDE; return op; }
        if (inner == "SP") { op.kind = OpKind::IndSP; return op; }
        if (inner == "C") { op.kind = OpKind::PortC; return op; }

        // (IX+d) / (IX-d) / (IX)
        if (inner.substr(0, 2) == "IX") {
            op.kind = OpKind::IndIX;
            std::string rest = inner.substr(2);
            if (rest.empty()) {
                op.value = 0;
            } else {
                op.value = parseExpr(rest, ctx);
                op.hasUnresolved = ctx.hasUnresolved;
            }
            return op;
        }
        if (inner.substr(0, 2) == "IY") {
            op.kind = OpKind::IndIY;
            std::string rest = inner.substr(2);
            if (rest.empty()) {
                op.value = 0;
            } else {
                op.value = parseExpr(rest, ctx);
                op.hasUnresolved = ctx.hasUnresolved;
            }
            return op;
        }

        // (nn) - memory indirect
        op.kind = OpKind::IndMem;
        ctx.hasUnresolved = false;
        op.value = parseExpr(inner, ctx);
        op.hasUnresolved = ctx.hasUnresolved;
        return op;
    }

    // Must be an immediate value or label
    ctx.hasUnresolved = false;
    int32_t val = parseExpr(s, ctx);
    op.hasUnresolved = ctx.hasUnresolved;

    // Determine if 8-bit or 16-bit based on value range
    // During pass 1 with unresolved labels, assume 16-bit
    if (ctx.hasUnresolved) {
        op.kind = OpKind::Imm16;
    } else if (val >= -128 && val <= 255) {
        op.kind = OpKind::Imm8;
    } else {
        op.kind = OpKind::Imm16;
    }
    op.value = val;
    return op;
}

// ---------------------------------------------------------------------------
// Assembler context
// ---------------------------------------------------------------------------

struct AsmCtx {
    std::map<std::string, int32_t> symbols;
    std::vector<AsmError> errors;
    std::vector<uint8_t> output;
    std::vector<AsmListingEntry> listing;
    uint16_t org = 0x8000;
    uint16_t pc = 0x8000;
    bool pass1 = true;
    int currentLine = 0;
    std::string currentSource;

    void emit(uint8_t b) {
        output.push_back(b);
        pc++;
    }
    void emit16(uint16_t w) {
        emit(w & 0xFF);
        emit((w >> 8) & 0xFF);
    }
    void error(const std::string& msg) {
        errors.push_back({currentLine, msg});
    }

    ExprContext exprCtx() {
        return { &symbols, pc, pass1 };
    }
};

// ---------------------------------------------------------------------------
// Parse a single source line
// ---------------------------------------------------------------------------

static ParsedLine parseLine(const std::string& rawLine, int lineNum) {
    ParsedLine pl;
    pl.source = rawLine;
    pl.lineNum = lineNum;

    std::string line = stripComment(rawLine);
    line = trim(line);
    if (line.empty()) return pl;

    size_t pos = 0;

    // Extract the first token to check if it's a label
    size_t tokEnd = 0;
    while (tokEnd < line.size() &&
           (std::isalnum(static_cast<unsigned char>(line[tokEnd])) ||
            line[tokEnd] == '_' || line[tokEnd] == '.')) {
        tokEnd++;
    }

    bool isLabel = false;
    if (tokEnd > 0) {
        // Label if: followed by ':', or starts at column 0 of raw line and is not a known mnemonic
        if (tokEnd < line.size() && line[tokEnd] == ':') {
            isLabel = true;
        } else if (!std::isspace(static_cast<unsigned char>(rawLine[0])) && rawLine[0] != ';') {
            // Starts at column 0 — treat as label unless it looks like a mnemonic/directive
            // (Labels at column 0 don't require a colon in traditional Z80 assemblers)
            std::string firstTok = toUpper(line.substr(0, tokEnd));
            // Check if it's a known directive/mnemonic — if so, don't treat as label
            static const char* DIRECTIVES[] = {
                "ORG", "EQU", "DB", "DEFB", "DM", "DEFM", "DW", "DEFW", "DS", "DEFS",
                "ALIGN", "INCBIN", "NOP", "HALT", "RET", "DI", "EI", "EXX", "NEG", "RETN",
                "RETI", "RRD", "RLD", "DAA", "CPL", "SCF", "CCF", "RLCA", "RRCA", "RLA", "RRA",
                "LDI", "CPI", "INI", "OUTI", "LDD", "CPD", "IND", "OUTD",
                "LDIR", "CPIR", "INIR", "OTIR", "LDDR", "CPDR", "INDR", "OTDR",
                "LD", "ADD", "ADC", "SUB", "SBC", "AND", "XOR", "OR", "CP",
                "INC", "DEC", "PUSH", "POP", "JP", "JR", "CALL", "DJNZ", "RST",
                "EX", "IM", "IN", "OUT", "BIT", "SET", "RES",
                "RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL",
                nullptr
            };
            bool isMnemonic = false;
            for (int i = 0; DIRECTIVES[i]; i++) {
                if (firstTok == DIRECTIVES[i]) { isMnemonic = true; break; }
            }
            if (!isMnemonic) isLabel = true;
        }
    }

    if (isLabel) {
        pl.label = line.substr(0, tokEnd);
        pos = tokEnd;
        if (pos < line.size() && line[pos] == ':') pos++; // skip colon
    }

    // Skip whitespace after label
    while (pos < line.size() && std::isspace(static_cast<unsigned char>(line[pos]))) pos++;
    if (pos >= line.size()) return pl;

    // Extract mnemonic/directive
    size_t mnemStart = pos;
    while (pos < line.size() && !std::isspace(static_cast<unsigned char>(line[pos]))) pos++;
    pl.mnemonic = toUpper(line.substr(mnemStart, pos - mnemStart));

    // Rest is operands
    while (pos < line.size() && std::isspace(static_cast<unsigned char>(line[pos]))) pos++;
    if (pos < line.size()) {
        pl.operands = trim(line.substr(pos));
    }

    return pl;
}

// ---------------------------------------------------------------------------
// Instruction encoding
// ---------------------------------------------------------------------------

// Helper: is this an IX-related operand?
static bool isIXOperand(OpKind k) {
    return k == OpKind::RegIX || k == OpKind::RegIXH || k == OpKind::RegIXL || k == OpKind::IndIX;
}
static bool isIYOperand(OpKind k) {
    return k == OpKind::RegIY || k == OpKind::RegIYH || k == OpKind::RegIYL || k == OpKind::IndIY;
}

// Get DD/FD prefix for IX/IY, 0 if neither
static uint8_t ixiyPrefix(const Operand& op1, const Operand& op2) {
    if (isIXOperand(op1.kind) || isIXOperand(op2.kind)) return 0xDD;
    if (isIYOperand(op1.kind) || isIYOperand(op2.kind)) return 0xFD;
    return 0;
}

// Map IXH/IXL/IYH/IYL/IndIX/IndIY to reg8 index (4=H, 5=L, 6=(HL))
static int ixiyReg8(OpKind k) {
    if (k == OpKind::RegIXH || k == OpKind::RegIYH) return 4;
    if (k == OpKind::RegIXL || k == OpKind::RegIYL) return 5;
    if (k == OpKind::IndIX || k == OpKind::IndIY) return 6;
    return -1;
}

static void assembleInstruction(AsmCtx& ctx, const ParsedLine& pl) {
    const std::string& mn = pl.mnemonic;
    auto ops = splitOperands(pl.operands);

    auto exCtx = ctx.exprCtx();

    // Classify operands
    Operand op1, op2;
    if (ops.size() >= 1) op1 = classifyOperand(ops[0], exCtx);
    if (ops.size() >= 2) op2 = classifyOperand(ops[1], exCtx);

    // For context-dependent "C": in JP/CALL/RET/JR, treat as condition
    auto condOrRegC = [&](Operand& o) -> bool {
        if (o.kind == OpKind::Reg8 && o.reg == 1) {
            // It's register C, but in branch context it's condition C (index 3)
            o.kind = OpKind::Cond;
            o.reg = 3;
            return true;
        }
        return o.kind == OpKind::Cond;
    };

    // Helper to force operand to Imm16 for addresses
    auto forceImm16 = [&](Operand& o) {
        if (o.kind == OpKind::Imm8) o.kind = OpKind::Imm16;
    };

    // -----------------------------------------------------------------------
    // Directives
    // -----------------------------------------------------------------------
    if (mn == "ORG") {
        if (ops.empty()) { ctx.error("ORG requires an address"); return; }
        int32_t addr = parseExpr(toUpper(ops[0]), exCtx);
        ctx.org = static_cast<uint16_t>(addr);
        ctx.pc = ctx.org;
        if (ctx.output.empty()) {
            // First ORG sets the base
        }
        return;
    }
    if (mn == "EQU") {
        // Label should have been set, value in operands
        if (ops.empty()) { ctx.error("EQU requires a value"); return; }
        int32_t val = parseExpr(toUpper(ops[0]), exCtx);
        if (!pl.label.empty()) {
            ctx.symbols[toUpper(pl.label)] = val;
        }
        return;
    }
    if (mn == "DB" || mn == "DEFB" || mn == "DM" || mn == "DEFM") {
        for (auto& o : ops) {
            std::string trimmed = trim(o);
            if (trimmed.empty()) continue;
            // String literal
            if ((trimmed.front() == '"' && trimmed.back() == '"') ||
                (trimmed.front() == '\'' && trimmed.back() == '\'')) {
                for (size_t i = 1; i < trimmed.size() - 1; i++) {
                    ctx.emit(static_cast<uint8_t>(trimmed[i]));
                }
            } else {
                exCtx = ctx.exprCtx();
                int32_t val = parseExpr(toUpper(trimmed), exCtx);
                ctx.emit(static_cast<uint8_t>(val & 0xFF));
            }
        }
        return;
    }
    if (mn == "DW" || mn == "DEFW") {
        for (auto& o : ops) {
            exCtx = ctx.exprCtx();
            int32_t val = parseExpr(toUpper(trim(o)), exCtx);
            ctx.emit16(static_cast<uint16_t>(val));
        }
        return;
    }
    if (mn == "DS" || mn == "DEFS") {
        if (ops.empty()) { ctx.error("DS requires a size"); return; }
        exCtx = ctx.exprCtx();
        int32_t count = parseExpr(toUpper(ops[0]), exCtx);
        uint8_t fill = 0;
        if (ops.size() >= 2) {
            exCtx = ctx.exprCtx();
            fill = static_cast<uint8_t>(parseExpr(toUpper(ops[1]), exCtx));
        }
        for (int32_t i = 0; i < count; i++) ctx.emit(fill);
        return;
    }
    if (mn == "ALIGN") {
        if (ops.empty()) { ctx.error("ALIGN requires alignment value"); return; }
        exCtx = ctx.exprCtx();
        int32_t alignment = parseExpr(toUpper(ops[0]), exCtx);
        if (alignment > 0) {
            while (ctx.pc % alignment) ctx.emit(0);
        }
        return;
    }
    if (mn == "INCBIN") {
        ctx.error("INCBIN not supported in browser assembler");
        return;
    }

    // -----------------------------------------------------------------------
    // NOP, HALT, and simple single-byte instructions
    // -----------------------------------------------------------------------
    if (mn == "NOP") { ctx.emit(0x00); return; }
    if (mn == "HALT") { ctx.emit(0x76); return; }
    if (mn == "RLCA") { ctx.emit(0x07); return; }
    if (mn == "RRCA") { ctx.emit(0x0F); return; }
    if (mn == "RLA") { ctx.emit(0x17); return; }
    if (mn == "RRA") { ctx.emit(0x1F); return; }
    if (mn == "DAA") { ctx.emit(0x27); return; }
    if (mn == "CPL") { ctx.emit(0x2F); return; }
    if (mn == "SCF") { ctx.emit(0x37); return; }
    if (mn == "CCF") { ctx.emit(0x3F); return; }
    if (mn == "EXX") { ctx.emit(0xD9); return; }
    if (mn == "DI") { ctx.emit(0xF3); return; }
    if (mn == "EI") { ctx.emit(0xFB); return; }
    if (mn == "NEG") { ctx.emit(0xED); ctx.emit(0x44); return; }
    if (mn == "RETN") { ctx.emit(0xED); ctx.emit(0x45); return; }
    if (mn == "RETI") { ctx.emit(0xED); ctx.emit(0x4D); return; }
    if (mn == "RRD") { ctx.emit(0xED); ctx.emit(0x67); return; }
    if (mn == "RLD") { ctx.emit(0xED); ctx.emit(0x6F); return; }
    if (mn == "LDI") { ctx.emit(0xED); ctx.emit(0xA0); return; }
    if (mn == "CPI") { ctx.emit(0xED); ctx.emit(0xA1); return; }
    if (mn == "INI") { ctx.emit(0xED); ctx.emit(0xA2); return; }
    if (mn == "OUTI") { ctx.emit(0xED); ctx.emit(0xA3); return; }
    if (mn == "LDD") { ctx.emit(0xED); ctx.emit(0xA8); return; }
    if (mn == "CPD") { ctx.emit(0xED); ctx.emit(0xA9); return; }
    if (mn == "IND") { ctx.emit(0xED); ctx.emit(0xAA); return; }
    if (mn == "OUTD") { ctx.emit(0xED); ctx.emit(0xAB); return; }
    if (mn == "LDIR") { ctx.emit(0xED); ctx.emit(0xB0); return; }
    if (mn == "CPIR") { ctx.emit(0xED); ctx.emit(0xB1); return; }
    if (mn == "INIR") { ctx.emit(0xED); ctx.emit(0xB2); return; }
    if (mn == "OTIR") { ctx.emit(0xED); ctx.emit(0xB3); return; }
    if (mn == "LDDR") { ctx.emit(0xED); ctx.emit(0xB8); return; }
    if (mn == "CPDR") { ctx.emit(0xED); ctx.emit(0xB9); return; }
    if (mn == "INDR") { ctx.emit(0xED); ctx.emit(0xBA); return; }
    if (mn == "OTDR") { ctx.emit(0xED); ctx.emit(0xBB); return; }

    // -----------------------------------------------------------------------
    // EX
    // -----------------------------------------------------------------------
    if (mn == "EX") {
        if (op1.kind == OpKind::RegAF && op2.kind == OpKind::RegAFPrime) {
            ctx.emit(0x08); return;
        }
        if (op1.kind == OpKind::Reg16 && op1.reg == 1 && // DE
            op2.kind == OpKind::Reg16 && op2.reg == 2) {  // HL
            ctx.emit(0xEB); return;
        }
        if (op1.kind == OpKind::IndSP) {
            if (op2.kind == OpKind::Reg16 && op2.reg == 2) { // HL
                ctx.emit(0xE3); return;
            }
            if (op2.kind == OpKind::RegIX) { ctx.emit(0xDD); ctx.emit(0xE3); return; }
            if (op2.kind == OpKind::RegIY) { ctx.emit(0xFD); ctx.emit(0xE3); return; }
        }
        ctx.error("Invalid EX operands");
        return;
    }

    // -----------------------------------------------------------------------
    // IM
    // -----------------------------------------------------------------------
    if (mn == "IM") {
        if (ops.empty()) { ctx.error("IM requires mode (0, 1, or 2)"); return; }
        exCtx = ctx.exprCtx();
        int32_t mode = parseExpr(toUpper(ops[0]), exCtx);
        ctx.emit(0xED);
        if (mode == 0) ctx.emit(0x46);
        else if (mode == 1) ctx.emit(0x56);
        else if (mode == 2) ctx.emit(0x5E);
        else ctx.error("Invalid IM mode");
        return;
    }

    // -----------------------------------------------------------------------
    // RST
    // -----------------------------------------------------------------------
    if (mn == "RST") {
        if (ops.empty()) { ctx.error("RST requires a vector"); return; }
        exCtx = ctx.exprCtx();
        int32_t vec = parseExpr(toUpper(ops[0]), exCtx);
        if (vec == 0x00 || vec == 0x08 || vec == 0x10 || vec == 0x18 ||
            vec == 0x20 || vec == 0x28 || vec == 0x30 || vec == 0x38) {
            ctx.emit(0xC7 | static_cast<uint8_t>(vec));
            return;
        }
        // Also accept 0-7
        if (vec >= 0 && vec <= 7) {
            ctx.emit(0xC7 | static_cast<uint8_t>(vec << 3));
            return;
        }
        ctx.error("Invalid RST vector");
        return;
    }

    // -----------------------------------------------------------------------
    // DJNZ
    // -----------------------------------------------------------------------
    if (mn == "DJNZ") {
        if (ops.empty()) { ctx.error("DJNZ requires a target"); return; }
        forceImm16(op1);
        int32_t target = op1.value;
        int32_t offset = target - (ctx.pc + 2);
        if (!ctx.pass1 && (offset < -128 || offset > 127)) {
            ctx.error("DJNZ target out of range");
        }
        ctx.emit(0x10);
        ctx.emit(static_cast<uint8_t>(offset & 0xFF));
        return;
    }

    // -----------------------------------------------------------------------
    // JR
    // -----------------------------------------------------------------------
    if (mn == "JR") {
        if (ops.empty()) { ctx.error("JR requires a target"); return; }

        // JR cc,nn or JR nn
        if (ops.size() == 2) {
            condOrRegC(op1);
            if (op1.kind != OpKind::Cond) { ctx.error("Invalid JR condition"); return; }
            // JR only supports NZ, Z, NC, C (indices 0-3)
            if (op1.reg > 3) { ctx.error("JR only supports NZ, Z, NC, C"); return; }
            forceImm16(op2);
            int32_t target = op2.value;
            int32_t offset = target - (ctx.pc + 2);
            if (!ctx.pass1 && (offset < -128 || offset > 127)) {
                ctx.error("JR target out of range");
            }
            ctx.emit(0x20 | (op1.reg << 3));
            ctx.emit(static_cast<uint8_t>(offset & 0xFF));
            return;
        }

        // JR nn
        forceImm16(op1);
        int32_t target = op1.value;
        int32_t offset = target - (ctx.pc + 2);
        if (!ctx.pass1 && (offset < -128 || offset > 127)) {
            ctx.error("JR target out of range");
        }
        ctx.emit(0x18);
        ctx.emit(static_cast<uint8_t>(offset & 0xFF));
        return;
    }

    // -----------------------------------------------------------------------
    // JP
    // -----------------------------------------------------------------------
    if (mn == "JP") {
        if (ops.empty()) { ctx.error("JP requires a target"); return; }

        // JP (HL), JP (IX), JP (IY)
        if (op1.kind == OpKind::IndHL) { ctx.emit(0xE9); return; }
        if (op1.kind == OpKind::RegIX || (op1.kind == OpKind::IndIX && op1.value == 0)) {
            ctx.emit(0xDD); ctx.emit(0xE9); return;
        }
        if (op1.kind == OpKind::RegIY || (op1.kind == OpKind::IndIY && op1.value == 0)) {
            ctx.emit(0xFD); ctx.emit(0xE9); return;
        }

        // JP cc,nn
        if (ops.size() == 2) {
            condOrRegC(op1);
            if (op1.kind != OpKind::Cond) { ctx.error("Invalid JP condition"); return; }
            forceImm16(op2);
            ctx.emit(0xC2 | (op1.reg << 3));
            ctx.emit16(static_cast<uint16_t>(op2.value));
            return;
        }

        // JP nn
        forceImm16(op1);
        ctx.emit(0xC3);
        ctx.emit16(static_cast<uint16_t>(op1.value));
        return;
    }

    // -----------------------------------------------------------------------
    // CALL
    // -----------------------------------------------------------------------
    if (mn == "CALL") {
        if (ops.empty()) { ctx.error("CALL requires a target"); return; }

        // CALL cc,nn
        if (ops.size() == 2) {
            condOrRegC(op1);
            if (op1.kind != OpKind::Cond) { ctx.error("Invalid CALL condition"); return; }
            forceImm16(op2);
            ctx.emit(0xC4 | (op1.reg << 3));
            ctx.emit16(static_cast<uint16_t>(op2.value));
            return;
        }

        // CALL nn
        forceImm16(op1);
        ctx.emit(0xCD);
        ctx.emit16(static_cast<uint16_t>(op1.value));
        return;
    }

    // -----------------------------------------------------------------------
    // RET
    // -----------------------------------------------------------------------
    if (mn == "RET") {
        if (ops.empty()) { ctx.emit(0xC9); return; }
        condOrRegC(op1);
        if (op1.kind == OpKind::Cond) {
            ctx.emit(0xC0 | (op1.reg << 3));
            return;
        }
        ctx.error("Invalid RET operand");
        return;
    }

    // -----------------------------------------------------------------------
    // PUSH / POP
    // -----------------------------------------------------------------------
    if (mn == "PUSH" || mn == "POP") {
        bool isPush = (mn == "PUSH");
        uint8_t base = isPush ? 0xC5 : 0xC1;

        if (op1.kind == OpKind::RegIX) { ctx.emit(0xDD); ctx.emit(isPush ? 0xE5 : 0xE1); return; }
        if (op1.kind == OpKind::RegIY) { ctx.emit(0xFD); ctx.emit(isPush ? 0xE5 : 0xE1); return; }

        // AF or BC/DE/HL
        int idx = -1;
        if (op1.kind == OpKind::RegAF) idx = 3;
        else if (op1.kind == OpKind::Reg16 && op1.reg <= 2) idx = op1.reg;
        if (idx >= 0) {
            ctx.emit(base | (idx << 4));
            return;
        }
        ctx.error("Invalid " + mn + " operand");
        return;
    }

    // -----------------------------------------------------------------------
    // INC / DEC
    // -----------------------------------------------------------------------
    if (mn == "INC" || mn == "DEC") {
        bool isInc = (mn == "INC");

        // 16-bit: INC BC / INC DE / INC HL / INC SP
        if (op1.kind == OpKind::Reg16) {
            ctx.emit((isInc ? 0x03 : 0x0B) | (op1.reg << 4));
            return;
        }
        // INC IX / INC IY
        if (op1.kind == OpKind::RegIX) { ctx.emit(0xDD); ctx.emit(isInc ? 0x23 : 0x2B); return; }
        if (op1.kind == OpKind::RegIY) { ctx.emit(0xFD); ctx.emit(isInc ? 0x23 : 0x2B); return; }

        // 8-bit: INC r / DEC r
        int r = -1;
        uint8_t prefix = 0;
        if (op1.kind == OpKind::Reg8) r = op1.reg;
        else if (op1.kind == OpKind::IndHL) r = 6;
        else if (op1.kind == OpKind::IndIX) { prefix = 0xDD; r = 6; }
        else if (op1.kind == OpKind::IndIY) { prefix = 0xFD; r = 6; }
        else if (op1.kind == OpKind::RegIXH) { prefix = 0xDD; r = 4; }
        else if (op1.kind == OpKind::RegIXL) { prefix = 0xDD; r = 5; }
        else if (op1.kind == OpKind::RegIYH) { prefix = 0xFD; r = 4; }
        else if (op1.kind == OpKind::RegIYL) { prefix = 0xFD; r = 5; }

        if (r >= 0) {
            if (prefix) ctx.emit(prefix);
            ctx.emit((isInc ? 0x04 : 0x05) | (r << 3));
            if ((op1.kind == OpKind::IndIX || op1.kind == OpKind::IndIY)) {
                ctx.emit(static_cast<uint8_t>(op1.value & 0xFF));
            }
            return;
        }
        ctx.error("Invalid " + mn + " operand");
        return;
    }

    // -----------------------------------------------------------------------
    // ALU: ADD, ADC, SUB, SBC, AND, XOR, OR, CP
    // -----------------------------------------------------------------------
    int aluIdx = aluOpIndex(mn);
    if (aluIdx >= 0) {
        // ADD HL,rr / ADD IX,rr / ADD IY,rr
        if (mn == "ADD" && ops.size() == 2) {
            if (op1.kind == OpKind::Reg16 && op1.reg == 2 && op2.kind == OpKind::Reg16) {
                // ADD HL,rr
                ctx.emit(0x09 | (op2.reg << 4));
                return;
            }
            if (op1.kind == OpKind::RegIX && op2.kind == OpKind::Reg16) {
                ctx.emit(0xDD);
                int rr = op2.reg;
                if (rr == 2) rr = 2; // IX maps to HL slot
                ctx.emit(0x09 | (rr << 4));
                return;
            }
            if (op1.kind == OpKind::RegIX && op2.kind == OpKind::RegIX) {
                ctx.emit(0xDD); ctx.emit(0x29); return;
            }
            if (op1.kind == OpKind::RegIY && op2.kind == OpKind::Reg16) {
                ctx.emit(0xFD);
                ctx.emit(0x09 | (op2.reg << 4));
                return;
            }
            if (op1.kind == OpKind::RegIY && op2.kind == OpKind::RegIY) {
                ctx.emit(0xFD); ctx.emit(0x29); return;
            }
        }

        // ADC HL,rr / SBC HL,rr (ED prefix)
        if ((mn == "ADC" || mn == "SBC") && ops.size() == 2 &&
            op1.kind == OpKind::Reg16 && op1.reg == 2 && op2.kind == OpKind::Reg16) {
            ctx.emit(0xED);
            ctx.emit((mn == "ADC" ? 0x4A : 0x42) | (op2.reg << 4));
            return;
        }

        // 8-bit ALU: op A,r or op r (A is implicit for SUB/AND/XOR/OR/CP)
        Operand& src = (ops.size() == 2) ? op2 : op1;
        if (ops.size() == 2 && !(op1.kind == OpKind::Reg8 && op1.reg == 7)) {
            // First operand should be A for 8-bit ALU
            if (mn != "ADD" && mn != "ADC" && mn != "SBC") {
                // SUB/AND/XOR/OR/CP don't normally take A, as first operand
                // but some assemblers accept it
            }
        }

        // Register source
        if (src.kind == OpKind::Reg8) {
            ctx.emit(0x80 | (aluIdx << 3) | src.reg);
            return;
        }
        if (src.kind == OpKind::IndHL) {
            ctx.emit(0x80 | (aluIdx << 3) | 6);
            return;
        }
        // IX/IY indexed
        if (src.kind == OpKind::IndIX || src.kind == OpKind::IndIY) {
            ctx.emit(src.kind == OpKind::IndIX ? 0xDD : 0xFD);
            ctx.emit(0x80 | (aluIdx << 3) | 6);
            ctx.emit(static_cast<uint8_t>(src.value & 0xFF));
            return;
        }
        // IXH/IXL/IYH/IYL
        if (src.kind == OpKind::RegIXH || src.kind == OpKind::RegIXL) {
            ctx.emit(0xDD);
            ctx.emit(0x80 | (aluIdx << 3) | ixiyReg8(src.kind));
            return;
        }
        if (src.kind == OpKind::RegIYH || src.kind == OpKind::RegIYL) {
            ctx.emit(0xFD);
            ctx.emit(0x80 | (aluIdx << 3) | ixiyReg8(src.kind));
            return;
        }
        // Immediate
        if (src.kind == OpKind::Imm8 || src.kind == OpKind::Imm16) {
            ctx.emit(0xC6 | (aluIdx << 3));
            ctx.emit(static_cast<uint8_t>(src.value & 0xFF));
            return;
        }
        ctx.error("Invalid " + mn + " operand");
        return;
    }

    // -----------------------------------------------------------------------
    // CB-prefix: RLC, RRC, RL, RR, SLA, SRA, SLL, SRL
    // -----------------------------------------------------------------------
    int cbIdx = cbOpIndex(mn);
    if (cbIdx >= 0) {
        if (ops.empty()) { ctx.error(mn + " requires an operand"); return; }

        // (IX+d) / (IY+d)
        if (op1.kind == OpKind::IndIX || op1.kind == OpKind::IndIY) {
            ctx.emit(op1.kind == OpKind::IndIX ? 0xDD : 0xFD);
            ctx.emit(0xCB);
            ctx.emit(static_cast<uint8_t>(op1.value & 0xFF));
            ctx.emit(static_cast<uint8_t>((cbIdx << 3) | 6));
            return;
        }

        int r = -1;
        if (op1.kind == OpKind::Reg8) r = op1.reg;
        else if (op1.kind == OpKind::IndHL) r = 6;

        if (r >= 0) {
            ctx.emit(0xCB);
            ctx.emit(static_cast<uint8_t>((cbIdx << 3) | r));
            return;
        }
        ctx.error("Invalid " + mn + " operand");
        return;
    }

    // -----------------------------------------------------------------------
    // BIT, SET, RES
    // -----------------------------------------------------------------------
    if (mn == "BIT" || mn == "SET" || mn == "RES") {
        if (ops.size() < 2) { ctx.error(mn + " requires bit number and register"); return; }
        exCtx = ctx.exprCtx();
        int32_t bit = parseExpr(toUpper(ops[0]), exCtx);
        if (bit < 0 || bit > 7) { if (!ctx.pass1) ctx.error("Bit number must be 0-7"); }

        int group = (mn == "BIT") ? 1 : (mn == "RES") ? 2 : 3;

        // (IX+d) / (IY+d)
        if (op2.kind == OpKind::IndIX || op2.kind == OpKind::IndIY) {
            ctx.emit(op2.kind == OpKind::IndIX ? 0xDD : 0xFD);
            ctx.emit(0xCB);
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            ctx.emit(static_cast<uint8_t>((group << 6) | (bit << 3) | 6));
            return;
        }

        int r = -1;
        if (op2.kind == OpKind::Reg8) r = op2.reg;
        else if (op2.kind == OpKind::IndHL) r = 6;

        if (r >= 0) {
            ctx.emit(0xCB);
            ctx.emit(static_cast<uint8_t>((group << 6) | (bit << 3) | r));
            return;
        }
        ctx.error("Invalid " + mn + " operand");
        return;
    }

    // -----------------------------------------------------------------------
    // LD - the big one
    // -----------------------------------------------------------------------
    if (mn == "LD") {
        if (ops.size() < 2) { ctx.error("LD requires two operands"); return; }

        // LD r,r' (including (HL) and IX/IY indexed)
        // LD r,n (8-bit immediate)
        // LD rr,nn (16-bit immediate)
        // LD (BC),A / LD (DE),A / LD A,(BC) / LD A,(DE)
        // LD (nn),A / LD A,(nn)
        // LD (nn),HL / LD HL,(nn) / LD (nn),rr / LD rr,(nn) [ED prefix]
        // LD SP,HL / LD SP,IX / LD SP,IY
        // LD I,A / LD A,I / LD R,A / LD A,R

        // LD I,A / LD A,I / LD R,A / LD A,R
        if (op1.kind == OpKind::RegI && op2.kind == OpKind::Reg8 && op2.reg == 7) {
            ctx.emit(0xED); ctx.emit(0x47); return; // LD I,A
        }
        if (op1.kind == OpKind::RegR && op2.kind == OpKind::Reg8 && op2.reg == 7) {
            ctx.emit(0xED); ctx.emit(0x4F); return; // LD R,A
        }
        if (op1.kind == OpKind::Reg8 && op1.reg == 7 && op2.kind == OpKind::RegI) {
            ctx.emit(0xED); ctx.emit(0x57); return; // LD A,I
        }
        if (op1.kind == OpKind::Reg8 && op1.reg == 7 && op2.kind == OpKind::RegR) {
            ctx.emit(0xED); ctx.emit(0x5F); return; // LD A,R
        }

        // LD SP,HL / LD SP,IX / LD SP,IY
        if (op1.kind == OpKind::Reg16 && op1.reg == 3) { // SP
            if (op2.kind == OpKind::Reg16 && op2.reg == 2) { ctx.emit(0xF9); return; } // LD SP,HL
            if (op2.kind == OpKind::RegIX) { ctx.emit(0xDD); ctx.emit(0xF9); return; }
            if (op2.kind == OpKind::RegIY) { ctx.emit(0xFD); ctx.emit(0xF9); return; }
        }

        // LD (BC),A / LD (DE),A
        if (op1.kind == OpKind::IndBC && op2.kind == OpKind::Reg8 && op2.reg == 7) { ctx.emit(0x02); return; }
        if (op1.kind == OpKind::IndDE && op2.kind == OpKind::Reg8 && op2.reg == 7) { ctx.emit(0x12); return; }

        // LD A,(BC) / LD A,(DE)
        if (op1.kind == OpKind::Reg8 && op1.reg == 7 && op2.kind == OpKind::IndBC) { ctx.emit(0x0A); return; }
        if (op1.kind == OpKind::Reg8 && op1.reg == 7 && op2.kind == OpKind::IndDE) { ctx.emit(0x1A); return; }

        // LD (nn),A / LD A,(nn)
        if (op1.kind == OpKind::IndMem && op2.kind == OpKind::Reg8 && op2.reg == 7) {
            ctx.emit(0x32);
            ctx.emit16(static_cast<uint16_t>(op1.value));
            return;
        }
        if (op1.kind == OpKind::Reg8 && op1.reg == 7 && op2.kind == OpKind::IndMem) {
            ctx.emit(0x3A);
            ctx.emit16(static_cast<uint16_t>(op2.value));
            return;
        }

        // LD (nn),HL / LD HL,(nn) - direct encoding (not ED)
        if (op1.kind == OpKind::IndMem && op2.kind == OpKind::Reg16 && op2.reg == 2) {
            ctx.emit(0x22);
            ctx.emit16(static_cast<uint16_t>(op1.value));
            return;
        }
        if (op1.kind == OpKind::Reg16 && op1.reg == 2 && op2.kind == OpKind::IndMem) {
            ctx.emit(0x2A);
            ctx.emit16(static_cast<uint16_t>(op2.value));
            return;
        }

        // LD (nn),IX / LD IX,(nn)
        if (op1.kind == OpKind::IndMem && op2.kind == OpKind::RegIX) {
            ctx.emit(0xDD); ctx.emit(0x22); ctx.emit16(static_cast<uint16_t>(op1.value)); return;
        }
        if (op1.kind == OpKind::RegIX && op2.kind == OpKind::IndMem) {
            ctx.emit(0xDD); ctx.emit(0x2A); ctx.emit16(static_cast<uint16_t>(op2.value)); return;
        }
        // LD (nn),IY / LD IY,(nn)
        if (op1.kind == OpKind::IndMem && op2.kind == OpKind::RegIY) {
            ctx.emit(0xFD); ctx.emit(0x22); ctx.emit16(static_cast<uint16_t>(op1.value)); return;
        }
        if (op1.kind == OpKind::RegIY && op2.kind == OpKind::IndMem) {
            ctx.emit(0xFD); ctx.emit(0x2A); ctx.emit16(static_cast<uint16_t>(op2.value)); return;
        }

        // LD (nn),rr / LD rr,(nn) - ED prefix (BC, DE, SP)
        if (op1.kind == OpKind::IndMem && op2.kind == OpKind::Reg16 && op2.reg != 2) {
            ctx.emit(0xED);
            ctx.emit(0x43 | (op2.reg << 4));
            ctx.emit16(static_cast<uint16_t>(op1.value));
            return;
        }
        if (op1.kind == OpKind::Reg16 && op1.reg != 2 && op2.kind == OpKind::IndMem) {
            ctx.emit(0xED);
            ctx.emit(0x4B | (op1.reg << 4));
            ctx.emit16(static_cast<uint16_t>(op2.value));
            return;
        }

        // LD rr,nn (16-bit immediate)
        if (op1.kind == OpKind::Reg16 && (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(0x01 | (op1.reg << 4));
            ctx.emit16(static_cast<uint16_t>(op2.value));
            return;
        }
        // LD IX,nn / LD IY,nn
        if (op1.kind == OpKind::RegIX && (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(0xDD); ctx.emit(0x21); ctx.emit16(static_cast<uint16_t>(op2.value)); return;
        }
        if (op1.kind == OpKind::RegIY && (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(0xFD); ctx.emit(0x21); ctx.emit16(static_cast<uint16_t>(op2.value)); return;
        }

        // LD r,(IX+d) / LD r,(IY+d) / LD (IX+d),r / LD (IY+d),r
        if (op1.kind == OpKind::Reg8 && (op2.kind == OpKind::IndIX || op2.kind == OpKind::IndIY)) {
            ctx.emit(op2.kind == OpKind::IndIX ? 0xDD : 0xFD);
            ctx.emit(0x46 | (op1.reg << 3));
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            return;
        }
        if ((op1.kind == OpKind::IndIX || op1.kind == OpKind::IndIY) && op2.kind == OpKind::Reg8) {
            ctx.emit(op1.kind == OpKind::IndIX ? 0xDD : 0xFD);
            ctx.emit(0x70 | op2.reg);
            ctx.emit(static_cast<uint8_t>(op1.value & 0xFF));
            return;
        }

        // LD (IX+d),n / LD (IY+d),n
        if ((op1.kind == OpKind::IndIX || op1.kind == OpKind::IndIY) &&
            (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(op1.kind == OpKind::IndIX ? 0xDD : 0xFD);
            ctx.emit(0x36);
            ctx.emit(static_cast<uint8_t>(op1.value & 0xFF));
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            return;
        }

        // LD r,IXH/IXL/IYH/IYL and reverse
        if (op1.kind == OpKind::Reg8 &&
            (op2.kind == OpKind::RegIXH || op2.kind == OpKind::RegIXL ||
             op2.kind == OpKind::RegIYH || op2.kind == OpKind::RegIYL)) {
            ctx.emit((op2.kind == OpKind::RegIXH || op2.kind == OpKind::RegIXL) ? 0xDD : 0xFD);
            ctx.emit(0x40 | (op1.reg << 3) | ixiyReg8(op2.kind));
            return;
        }
        if ((op1.kind == OpKind::RegIXH || op1.kind == OpKind::RegIXL ||
             op1.kind == OpKind::RegIYH || op1.kind == OpKind::RegIYL) && op2.kind == OpKind::Reg8) {
            ctx.emit((op1.kind == OpKind::RegIXH || op1.kind == OpKind::RegIXL) ? 0xDD : 0xFD);
            ctx.emit(0x40 | (ixiyReg8(op1.kind) << 3) | op2.reg);
            return;
        }
        // LD IXH,IXH / IXH,IXL etc.
        if ((op1.kind == OpKind::RegIXH || op1.kind == OpKind::RegIXL) &&
            (op2.kind == OpKind::RegIXH || op2.kind == OpKind::RegIXL)) {
            ctx.emit(0xDD);
            ctx.emit(0x40 | (ixiyReg8(op1.kind) << 3) | ixiyReg8(op2.kind));
            return;
        }
        if ((op1.kind == OpKind::RegIYH || op1.kind == OpKind::RegIYL) &&
            (op2.kind == OpKind::RegIYH || op2.kind == OpKind::RegIYL)) {
            ctx.emit(0xFD);
            ctx.emit(0x40 | (ixiyReg8(op1.kind) << 3) | ixiyReg8(op2.kind));
            return;
        }

        // LD IXH,n / LD IXL,n / LD IYH,n / LD IYL,n
        if ((op1.kind == OpKind::RegIXH || op1.kind == OpKind::RegIXL) &&
            (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(0xDD);
            ctx.emit(0x06 | (ixiyReg8(op1.kind) << 3));
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            return;
        }
        if ((op1.kind == OpKind::RegIYH || op1.kind == OpKind::RegIYL) &&
            (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(0xFD);
            ctx.emit(0x06 | (ixiyReg8(op1.kind) << 3));
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            return;
        }

        // LD r,r' (basic 8-bit register to register, including (HL))
        {
            int dst = -1, src = -1;
            if (op1.kind == OpKind::Reg8) dst = op1.reg;
            else if (op1.kind == OpKind::IndHL) dst = 6;
            if (op2.kind == OpKind::Reg8) src = op2.reg;
            else if (op2.kind == OpKind::IndHL) src = 6;

            if (dst >= 0 && src >= 0) {
                if (dst == 6 && src == 6) {
                    ctx.error("LD (HL),(HL) is not valid (use HALT)");
                    return;
                }
                ctx.emit(0x40 | (dst << 3) | src);
                return;
            }
        }

        // LD r,n (8-bit immediate)
        if (op1.kind == OpKind::Reg8 && (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(0x06 | (op1.reg << 3));
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            return;
        }
        // LD (HL),n
        if (op1.kind == OpKind::IndHL && (op2.kind == OpKind::Imm8 || op2.kind == OpKind::Imm16)) {
            ctx.emit(0x36);
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            return;
        }

        ctx.error("Invalid LD operands");
        return;
    }

    // -----------------------------------------------------------------------
    // IN / OUT
    // -----------------------------------------------------------------------
    if (mn == "IN") {
        if (ops.size() < 2) { ctx.error("IN requires two operands"); return; }

        // IN A,(n)
        if (op1.kind == OpKind::Reg8 && op1.reg == 7 && op2.kind == OpKind::IndMem) {
            ctx.emit(0xDB);
            ctx.emit(static_cast<uint8_t>(op2.value & 0xFF));
            return;
        }
        // IN r,(C)
        if (op2.kind == OpKind::PortC) {
            int r = -1;
            if (op1.kind == OpKind::Reg8) r = op1.reg;
            if (r >= 0) {
                ctx.emit(0xED);
                ctx.emit(0x40 | (r << 3));
                return;
            }
            // IN F,(C)
            std::string op1upper = toUpper(trim(ops[0]));
            if (op1upper == "F") {
                ctx.emit(0xED); ctx.emit(0x70);
                return;
            }
        }
        ctx.error("Invalid IN operands");
        return;
    }

    if (mn == "OUT") {
        if (ops.size() < 2) { ctx.error("OUT requires two operands"); return; }

        // OUT (n),A
        if (op1.kind == OpKind::IndMem && op2.kind == OpKind::Reg8 && op2.reg == 7) {
            ctx.emit(0xD3);
            ctx.emit(static_cast<uint8_t>(op1.value & 0xFF));
            return;
        }
        // OUT (C),r
        if (op1.kind == OpKind::PortC) {
            if (op2.kind == OpKind::Reg8) {
                ctx.emit(0xED);
                ctx.emit(0x41 | (op2.reg << 3));
                return;
            }
            // OUT (C),0
            exCtx = ctx.exprCtx();
            std::string op2upper = toUpper(trim(ops[1]));
            int32_t val;
            if (parseNumber(op2upper, val) && val == 0) {
                ctx.emit(0xED); ctx.emit(0x71);
                return;
            }
        }
        ctx.error("Invalid OUT operands");
        return;
    }

    // -----------------------------------------------------------------------
    // Unknown mnemonic
    // -----------------------------------------------------------------------
    ctx.error("Unknown mnemonic: " + mn);
}

// ---------------------------------------------------------------------------
// Main assembler entry point
// ---------------------------------------------------------------------------

AsmResult z80Assemble(const char* source, uint16_t defaultOrg) {
    AsmCtx ctx;
    ctx.org = defaultOrg;
    ctx.pc = defaultOrg;

    // Split source into lines
    std::vector<std::string> lines;
    {
        std::istringstream ss(source);
        std::string line;
        while (std::getline(ss, line)) {
            lines.push_back(line);
        }
    }

    // Parse all lines
    std::vector<ParsedLine> parsed;
    for (size_t i = 0; i < lines.size(); i++) {
        parsed.push_back(parseLine(lines[i], static_cast<int>(i + 1)));
    }

    // Pass 1: determine label addresses
    ctx.pass1 = true;
    ctx.pc = ctx.org;
    ctx.output.clear();

    for (auto& pl : parsed) {
        ctx.currentLine = pl.lineNum;
        ctx.currentSource = pl.source;

        // Handle label definitions (except EQU which is handled in assembleInstruction)
        if (!pl.label.empty() && pl.mnemonic != "EQU") {
            ctx.symbols[toUpper(pl.label)] = ctx.pc;
        }

        if (!pl.mnemonic.empty()) {
            size_t before = ctx.output.size();
            assembleInstruction(ctx, pl);
            (void)before;
        }
    }

    // Pass 2: generate final output with resolved labels
    ctx.pass1 = false;
    ctx.pc = ctx.org;
    ctx.output.clear();
    ctx.errors.clear();
    ctx.listing.clear();

    for (auto& pl : parsed) {
        ctx.currentLine = pl.lineNum;
        ctx.currentSource = pl.source;

        // Re-define labels at their (now stable) addresses
        if (!pl.label.empty() && pl.mnemonic != "EQU") {
            ctx.symbols[toUpper(pl.label)] = ctx.pc;
        }

        uint16_t instrAddr = ctx.pc;
        size_t before = ctx.output.size();

        if (!pl.mnemonic.empty()) {
            assembleInstruction(ctx, pl);
        }

        // Build listing entry
        AsmListingEntry entry;
        entry.line = pl.lineNum;
        entry.address = instrAddr;
        entry.source = pl.source;
        for (size_t i = before; i < ctx.output.size(); i++) {
            entry.bytes.push_back(ctx.output[i]);
        }
        ctx.listing.push_back(entry);
    }

    AsmResult result;
    result.success = ctx.errors.empty();
    result.origin = ctx.org;
    result.output = std::move(ctx.output);
    result.errors = std::move(ctx.errors);
    result.listing = std::move(ctx.listing);
    return result;
}

} // namespace zxspec
