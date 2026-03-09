/*
 * z80_disassembler.cpp - Z80 instruction disassembler
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80_disassembler.hpp"
#include "z80_tables.hpp"
#include <cstdio>
#include <cstring>
#include <cstdlib>

namespace zxspec {

// Main opcode mnemonics (0x00-0x3F), nullptr means prefix byte handled separately
static const char* MAIN[] = {
    "NOP",        "LD BC,%w",   "LD (BC),A",  "INC BC",     "INC B",      "DEC B",      "LD B,%b",    "RLCA",
    "EX AF,AF'",  "ADD HL,BC",  "LD A,(BC)",  "DEC BC",     "INC C",      "DEC C",      "LD C,%b",    "RRCA",
    "DJNZ %r",    "LD DE,%w",   "LD (DE),A",  "INC DE",     "INC D",      "DEC D",      "LD D,%b",    "RLA",
    "JR %r",      "ADD HL,DE",  "LD A,(DE)",  "DEC DE",     "INC E",      "DEC E",      "LD E,%b",    "RRA",
    "JR NZ,%r",   "LD HL,%w",   "LD (%w),HL", "INC HL",     "INC H",      "DEC H",      "LD H,%b",    "DAA",
    "JR Z,%r",    "ADD HL,HL",  "LD HL,(%w)", "DEC HL",     "INC L",      "DEC L",      "LD L,%b",    "CPL",
    "JR NC,%r",   "LD SP,%w",   "LD (%w),A",  "INC SP",     "INC (HL)",   "DEC (HL)",   "LD (HL),%b", "SCF",
    "JR C,%r",    "ADD HL,SP",  "LD A,(%w)",  "DEC SP",     "INC A",      "DEC A",      "LD A,%b",    "CCF",
};

// 0xC0-0xFF misc block
static const char* MISC[] = {
    "RET NZ",     "POP BC",     "JP NZ,%w",   "JP %w",      "CALL NZ,%w", "PUSH BC",    "ADD A,%b",   "RST 00h",
    "RET Z",      "RET",        "JP Z,%w",    nullptr,       "CALL Z,%w",  "CALL %w",    "ADC A,%b",   "RST 08h",
    "RET NC",     "POP DE",     "JP NC,%w",   "OUT (%b),A", "CALL NC,%w", "PUSH DE",    "SUB %b",     "RST 10h",
    "RET C",      "EXX",        "JP C,%w",    "IN A,(%b)",  "CALL C,%w",  nullptr,       "SBC A,%b",   "RST 18h",
    "RET PO",     "POP HL",     "JP PO,%w",   "EX (SP),HL", "CALL PO,%w","PUSH HL",    "AND %b",     "RST 20h",
    "RET PE",     "JP (HL)",    "JP PE,%w",   "EX DE,HL",  "CALL PE,%w", nullptr,       "XOR %b",     "RST 28h",
    "RET P",      "POP AF",     "JP P,%w",    "DI",         "CALL P,%w",  "PUSH AF",    "OR %b",      "RST 30h",
    "RET M",      "LD SP,HL",   "JP M,%w",    "EI",         "CALL M,%w",  nullptr,       "CP %b",      "RST 38h",
};

// Formatting helpers
static void formatByte(char* buf, uint8_t b)
{
    snprintf(buf, 8, "%02Xh", b);
}

static void formatWord(char* buf, uint16_t w)
{
    snprintf(buf, 8, "%04Xh", w);
}

static void formatRelative(char* buf, uint16_t instrAddr, uint8_t offset)
{
    uint16_t target = (instrAddr + 2 + static_cast<int8_t>(offset)) & 0xFFFF;
    snprintf(buf, 8, "%04Xh", target);
}

// Replace first occurrence of pattern in str with replacement
static std::string replaceFirst(const std::string& str, const char* pattern, const char* replacement)
{
    auto pos = str.find(pattern);
    if (pos == std::string::npos) return str;
    std::string result = str;
    result.replace(pos, strlen(pattern), replacement);
    return result;
}

struct ResolveResult {
    std::string mnemonic;
    int extraBytes;
};

static ResolveResult resolveFormat(const char* fmt, ReadByteFunc readByte, void* ctx,
                                    uint16_t pc, uint16_t instrAddr,
                                    uint8_t* bytesOut, int& bytesOutCount)
{
    std::string result(fmt);
    int offset = 0;

    // Replace %w (16-bit word - little endian)
    if (result.find("%w") != std::string::npos) {
        uint8_t lo = readByte((pc + offset) & 0xFFFF, ctx);
        uint8_t hi = readByte((pc + offset + 1) & 0xFFFF, ctx);
        bytesOut[bytesOutCount++] = lo;
        bytesOut[bytesOutCount++] = hi;
        char buf[8];
        formatWord(buf, (hi << 8) | lo);
        result = replaceFirst(result, "%w", buf);
        offset += 2;
    }
    // Replace %b (8-bit byte)
    if (result.find("%b") != std::string::npos) {
        uint8_t b = readByte((pc + offset) & 0xFFFF, ctx);
        bytesOut[bytesOutCount++] = b;
        char buf[8];
        formatByte(buf, b);
        result = replaceFirst(result, "%b", buf);
        offset += 1;
    }
    // Replace %r (relative jump)
    if (result.find("%r") != std::string::npos) {
        uint8_t b = readByte((pc + offset) & 0xFFFF, ctx);
        bytesOut[bytesOutCount++] = b;
        char buf[8];
        formatRelative(buf, instrAddr, b);
        result = replaceFirst(result, "%r", buf);
        offset += 1;
    }

    return { result, offset };
}

static DisasmResult makeResult(const char* mnemonic, uint8_t* bytes, int byteCount)
{
    DisasmResult r;
    r.mnemonic = mnemonic;
    r.length = static_cast<uint8_t>(byteCount);
    memset(r.bytes, 0, sizeof(r.bytes));
    for (int i = 0; i < byteCount && i < 4; i++) {
        r.bytes[i] = bytes[i];
    }
    return r;
}

static DisasmResult makeResult(const std::string& mnemonic, uint8_t* bytes, int byteCount)
{
    DisasmResult r;
    r.mnemonic = mnemonic;
    r.length = static_cast<uint8_t>(byteCount);
    memset(r.bytes, 0, sizeof(r.bytes));
    for (int i = 0; i < byteCount && i < 4; i++) {
        r.bytes[i] = bytes[i];
    }
    return r;
}

// Forward declaration for DD/FD handler
static DisasmResult disasmDDFD(uint8_t op2, const char* reg16, const char* rh, const char* rl,
                                uint16_t pc, ReadByteFunc readByte, void* ctx,
                                uint8_t* bytes, int byteCount, uint16_t startAddr);

DisasmResult z80Disassemble(uint16_t addr, ReadByteFunc readByte, void* ctx)
{
    uint8_t bytes[4] = {};
    int byteCount = 0;
    uint16_t pc = addr;

    uint8_t opcode = readByte(pc, ctx);
    bytes[byteCount++] = opcode;
    pc = (pc + 1) & 0xFFFF;

    // CB prefix
    if (opcode == 0xCB) {
        uint8_t op2 = readByte(pc, ctx);
        bytes[byteCount++] = op2;

        const char* reg = REG8_NAMES[op2 & 7];
        int group = (op2 >> 6) & 3;
        int bit = (op2 >> 3) & 7;

        char mnemonic[32];
        if (group == 0) {
            snprintf(mnemonic, sizeof(mnemonic), "%s %s", CB_OP_NAMES[bit], reg);
        } else if (group == 1) {
            snprintf(mnemonic, sizeof(mnemonic), "BIT %d,%s", bit, reg);
        } else if (group == 2) {
            snprintf(mnemonic, sizeof(mnemonic), "RES %d,%s", bit, reg);
        } else {
            snprintf(mnemonic, sizeof(mnemonic), "SET %d,%s", bit, reg);
        }
        return makeResult(mnemonic, bytes, byteCount);
    }

    // DD/FD prefix (IX/IY)
    if (opcode == 0xDD || opcode == 0xFD) {
        const char* reg16 = (opcode == 0xDD) ? "IX" : "IY";
        const char* rh = (opcode == 0xDD) ? "IXh" : "IYh";
        const char* rl = (opcode == 0xDD) ? "IXl" : "IYl";

        uint8_t op2 = readByte(pc, ctx);
        bytes[byteCount++] = op2;
        pc = (pc + 1) & 0xFFFF;

        // DDCB/FDCB prefix
        if (op2 == 0xCB) {
            uint8_t d = readByte(pc, ctx);
            bytes[byteCount++] = d;
            pc = (pc + 1) & 0xFFFF;
            uint8_t op3 = readByte(pc, ctx);
            bytes[byteCount++] = op3;

            int8_t offset = static_cast<int8_t>(d);
            char sign = offset >= 0 ? '+' : '-';
            int absOff = abs(offset);
            char memRef[24];
            snprintf(memRef, sizeof(memRef), "(%s%c%Xh)", reg16, sign, absOff);

            int group = (op3 >> 6) & 3;
            int bit = (op3 >> 3) & 7;
            const char* dstReg = REG8_NAMES[op3 & 7];

            char mnemonic[48];
            if (group == 0) {
                const char* op = CB_OP_NAMES[bit];
                if ((op3 & 7) == 6) {
                    snprintf(mnemonic, sizeof(mnemonic), "%s %s", op, memRef);
                } else {
                    snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s %s", dstReg, op, memRef);
                }
            } else if (group == 1) {
                snprintf(mnemonic, sizeof(mnemonic), "BIT %d,%s", bit, memRef);
            } else if (group == 2) {
                if ((op3 & 7) == 6) {
                    snprintf(mnemonic, sizeof(mnemonic), "RES %d,%s", bit, memRef);
                } else {
                    snprintf(mnemonic, sizeof(mnemonic), "LD %s,RES %d,%s", dstReg, bit, memRef);
                }
            } else {
                if ((op3 & 7) == 6) {
                    snprintf(mnemonic, sizeof(mnemonic), "SET %d,%s", bit, memRef);
                } else {
                    snprintf(mnemonic, sizeof(mnemonic), "LD %s,SET %d,%s", dstReg, bit, memRef);
                }
            }
            return makeResult(mnemonic, bytes, byteCount);
        }

        // Regular DD/FD opcodes
        return disasmDDFD(op2, reg16, rh, rl, pc, readByte, ctx, bytes, byteCount, addr);
    }

    // ED prefix
    if (opcode == 0xED) {
        uint8_t op2 = readByte(pc, ctx);
        bytes[byteCount++] = op2;
        pc = (pc + 1) & 0xFFFF;

        const char* fmt = edLookup(op2);
        if (!fmt) {
            return makeResult("NOP*", bytes, byteCount);
        }

        std::string fmtStr(fmt);
        if (fmtStr.find("%w") != std::string::npos) {
            uint8_t lo = readByte(pc, ctx);
            uint8_t hi = readByte((pc + 1) & 0xFFFF, ctx);
            bytes[byteCount++] = lo;
            bytes[byteCount++] = hi;
            char buf[8];
            formatWord(buf, (hi << 8) | lo);
            return makeResult(replaceFirst(fmtStr, "%w", buf), bytes, byteCount);
        }

        return makeResult(fmt, bytes, byteCount);
    }

    // Main opcodes 0x00-0x3F
    if (opcode < 0x40) {
        const char* fmt = MAIN[opcode];
        if (!fmt) {
            return makeResult("???", bytes, byteCount);
        }

        auto [mnemonic, extraBytes] = resolveFormat(fmt, readByte, ctx, pc, addr, bytes, byteCount);
        return makeResult(mnemonic, bytes, byteCount);
    }

    // 0x40-0x7F: LD block + HALT
    if (opcode < 0x80) {
        if (opcode == 0x76) {
            return makeResult("HALT", bytes, byteCount);
        }
        const char* dst = REG8_NAMES[(opcode >> 3) & 7];
        const char* src = REG8_NAMES[opcode & 7];
        char mnemonic[24];
        snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", dst, src);
        return makeResult(mnemonic, bytes, byteCount);
    }

    // 0x80-0xBF: ALU operations
    if (opcode < 0xC0) {
        const char* op = ALU_OP_NAMES[(opcode >> 3) & 7];
        const char* reg = REG8_NAMES[opcode & 7];
        char mnemonic[24];
        snprintf(mnemonic, sizeof(mnemonic), "%s%s", op, reg);
        return makeResult(mnemonic, bytes, byteCount);
    }

    // 0xC0-0xFF: misc
    const char* fmt = MISC[opcode - 0xC0];
    if (!fmt) {
        return makeResult("???", bytes, byteCount);
    }

    auto [mnemonic, extraBytes] = resolveFormat(fmt, readByte, ctx, pc, addr, bytes, byteCount);
    return makeResult(mnemonic, bytes, byteCount);
}

// DD/FD prefix handler
static DisasmResult disasmDDFD(uint8_t op2, const char* reg16, const char* rh, const char* rl,
                                uint16_t pc, ReadByteFunc readByte, void* ctx,
                                uint8_t* bytes, int byteCount, uint16_t startAddr)
{
    // Helper to read displacement and create (IX+d) / (IY+d) string
    auto memRef = [&](char* buf, size_t bufSize) {
        uint8_t d = readByte(pc, ctx);
        bytes[byteCount++] = d;
        pc = (pc + 1) & 0xFFFF;
        int8_t offset = static_cast<int8_t>(d);
        char sign = offset >= 0 ? '+' : '-';
        snprintf(buf, bufSize, "(%s%c%Xh)", reg16, sign, abs(offset));
    };

    char mnemonic[48];
    char mem[24];

    if (op2 < 0x40) {
        if (op2 == 0x09) { snprintf(mnemonic, sizeof(mnemonic), "ADD %s,BC", reg16); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x19) { snprintf(mnemonic, sizeof(mnemonic), "ADD %s,DE", reg16); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x21) {
            uint8_t lo = readByte(pc, ctx); uint8_t hi = readByte((pc + 1) & 0xFFFF, ctx);
            bytes[byteCount++] = lo; bytes[byteCount++] = hi;
            char buf[8]; formatWord(buf, (hi << 8) | lo);
            snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", reg16, buf);
            return makeResult(mnemonic, bytes, byteCount);
        }
        if (op2 == 0x22) {
            uint8_t lo = readByte(pc, ctx); uint8_t hi = readByte((pc + 1) & 0xFFFF, ctx);
            bytes[byteCount++] = lo; bytes[byteCount++] = hi;
            char buf[8]; formatWord(buf, (hi << 8) | lo);
            snprintf(mnemonic, sizeof(mnemonic), "LD (%s),%s", buf, reg16);
            return makeResult(mnemonic, bytes, byteCount);
        }
        if (op2 == 0x23) { snprintf(mnemonic, sizeof(mnemonic), "INC %s", reg16); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x24) { snprintf(mnemonic, sizeof(mnemonic), "INC %s", rh); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x25) { snprintf(mnemonic, sizeof(mnemonic), "DEC %s", rh); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x26) {
            uint8_t b = readByte(pc, ctx); bytes[byteCount++] = b;
            char buf[8]; formatByte(buf, b);
            snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", rh, buf);
            return makeResult(mnemonic, bytes, byteCount);
        }
        if (op2 == 0x29) { snprintf(mnemonic, sizeof(mnemonic), "ADD %s,%s", reg16, reg16); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x2A) {
            uint8_t lo = readByte(pc, ctx); uint8_t hi = readByte((pc + 1) & 0xFFFF, ctx);
            bytes[byteCount++] = lo; bytes[byteCount++] = hi;
            char buf[8]; formatWord(buf, (hi << 8) | lo);
            snprintf(mnemonic, sizeof(mnemonic), "LD %s,(%s)", reg16, buf);
            return makeResult(mnemonic, bytes, byteCount);
        }
        if (op2 == 0x2B) { snprintf(mnemonic, sizeof(mnemonic), "DEC %s", reg16); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x2C) { snprintf(mnemonic, sizeof(mnemonic), "INC %s", rl); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x2D) { snprintf(mnemonic, sizeof(mnemonic), "DEC %s", rl); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x2E) {
            uint8_t b = readByte(pc, ctx); bytes[byteCount++] = b;
            char buf[8]; formatByte(buf, b);
            snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", rl, buf);
            return makeResult(mnemonic, bytes, byteCount);
        }
        if (op2 == 0x34) { memRef(mem, sizeof(mem)); snprintf(mnemonic, sizeof(mnemonic), "INC %s", mem); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x35) { memRef(mem, sizeof(mem)); snprintf(mnemonic, sizeof(mnemonic), "DEC %s", mem); return makeResult(mnemonic, bytes, byteCount); }
        if (op2 == 0x36) {
            memRef(mem, sizeof(mem));
            uint8_t b = readByte(pc, ctx); bytes[byteCount++] = b;
            char buf[8]; formatByte(buf, b);
            snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", mem, buf);
            return makeResult(mnemonic, bytes, byteCount);
        }
        if (op2 == 0x39) { snprintf(mnemonic, sizeof(mnemonic), "ADD %s,SP", reg16); return makeResult(mnemonic, bytes, byteCount); }

        return makeResult("NOP*", bytes, byteCount);
    }

    // 0x40-0x7F: LD block with IX/IY substitutions
    if (op2 < 0x80) {
        if (op2 == 0x76) return makeResult("HALT", bytes, byteCount);

        int dst = (op2 >> 3) & 7;
        int src = op2 & 7;

        if (dst == 6 || src == 6) {
            if (dst == 6 && src == 6) return makeResult("HALT", bytes, byteCount);
            memRef(mem, sizeof(mem));
            if (dst == 6) {
                snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", mem, REG8_NAMES[src]);
            } else {
                snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", REG8_NAMES[dst], mem);
            }
            return makeResult(mnemonic, bytes, byteCount);
        }

        const char* dstName = REG8_NAMES[dst];
        const char* srcName = REG8_NAMES[src];
        if (dst == 4) dstName = rh;
        if (dst == 5) dstName = rl;
        if (src == 4) srcName = rh;
        if (src == 5) srcName = rl;

        snprintf(mnemonic, sizeof(mnemonic), "LD %s,%s", dstName, srcName);
        return makeResult(mnemonic, bytes, byteCount);
    }

    // 0x80-0xBF: ALU with (IX+d) or IXh/IXl
    if (op2 < 0xC0) {
        const char* op = ALU_OP_NAMES[(op2 >> 3) & 7];
        int src = op2 & 7;
        if (src == 6) {
            memRef(mem, sizeof(mem));
            snprintf(mnemonic, sizeof(mnemonic), "%s%s", op, mem);
            return makeResult(mnemonic, bytes, byteCount);
        }
        const char* srcName = REG8_NAMES[src];
        if (src == 4) srcName = rh;
        if (src == 5) srcName = rl;
        snprintf(mnemonic, sizeof(mnemonic), "%s%s", op, srcName);
        return makeResult(mnemonic, bytes, byteCount);
    }

    // 0xC0-0xFF misc
    if (op2 == 0xE1) { snprintf(mnemonic, sizeof(mnemonic), "POP %s", reg16); return makeResult(mnemonic, bytes, byteCount); }
    if (op2 == 0xE3) { snprintf(mnemonic, sizeof(mnemonic), "EX (SP),%s", reg16); return makeResult(mnemonic, bytes, byteCount); }
    if (op2 == 0xE5) { snprintf(mnemonic, sizeof(mnemonic), "PUSH %s", reg16); return makeResult(mnemonic, bytes, byteCount); }
    if (op2 == 0xE9) { snprintf(mnemonic, sizeof(mnemonic), "JP (%s)", reg16); return makeResult(mnemonic, bytes, byteCount); }
    if (op2 == 0xF9) { snprintf(mnemonic, sizeof(mnemonic), "LD SP,%s", reg16); return makeResult(mnemonic, bytes, byteCount); }

    return makeResult("NOP*", bytes, byteCount);
}

uint8_t z80InstructionLength(uint16_t addr, ReadByteFunc readByte, void* ctx)
{
    return z80Disassemble(addr, readByte, ctx).length;
}

} // namespace zxspec
