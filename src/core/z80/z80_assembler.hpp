/*
 * z80_assembler.hpp - Multi-pass Z80 assembler
 *
 * Assembles Z80 source code into machine code, supporting labels with
 * forward references, ORG/EQU/DB/DW/DS directives, and all Z80 instructions
 * including undocumented IX/IY half-register operations.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace zxspec {

struct AsmError {
    int line;               // 1-based line number
    std::string message;
};

struct AsmListingEntry {
    int line;               // 1-based source line number
    uint16_t address;
    std::vector<uint8_t> bytes;
    std::string source;     // Original source line
};

struct AsmResult {
    bool success;
    uint16_t origin;        // Start address
    std::vector<uint8_t> output;
    std::vector<AsmError> errors;
    std::vector<AsmListingEntry> listing;
};

// Assemble Z80 source code. defaultOrg is used if no ORG directive is found.
AsmResult z80Assemble(const char* source, uint16_t defaultOrg = 0x8000);

} // namespace zxspec
