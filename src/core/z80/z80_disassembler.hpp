/*
 * z80_disassembler.hpp - Z80 instruction disassembler
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <string>

namespace zxspec {

struct DisasmResult {
    std::string mnemonic;
    uint8_t length;
    uint8_t bytes[4];
};

// Disassemble a single Z80 instruction at the given address.
// readByte(addr) provides memory access (should be side-effect-free).
using ReadByteFunc = uint8_t (*)(uint16_t addr, void* ctx);

DisasmResult z80Disassemble(uint16_t addr, ReadByteFunc readByte, void* ctx);

// Convenience: get just the instruction length at an address
uint8_t z80InstructionLength(uint16_t addr, ReadByteFunc readByte, void* ctx);

} // namespace zxspec
