/*
 * sinclair_basic_writer.cpp - Write tokenized BASIC program to machine memory
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sinclair_basic_writer.hpp"
#include "sinclair_basic.hpp"
#include "../zx_spectrum.hpp"

namespace zxspec {
namespace basic {

// Helper to write a 16-bit little-endian value via coreDebugWrite
static void writeWord(ZXSpectrum& machine, uint16_t addr, uint16_t val) {
    machine.coreDebugWrite(addr, val & 0xFF);
    machine.coreDebugWrite(addr + 1, (val >> 8) & 0xFF);
}

// Helper to read a 16-bit little-endian value via readMemory
static uint16_t readWord(const ZXSpectrum& machine, uint16_t addr) {
    return machine.readMemory(addr) |
           (static_cast<uint16_t>(machine.readMemory(addr + 1)) << 8);
}

void writeProgramToMemory(ZXSpectrum& machine, const uint8_t* data, size_t length) {
    uint16_t progAddr = readWord(machine, sys::PROG);

    // Calculate addresses for the new memory layout
    uint16_t varsAddr = progAddr + static_cast<uint16_t>(length);
    uint16_t eLineAddr = varsAddr + 1;   // after 0x80 end marker
    uint16_t workspAddr = eLineAddr + 2; // after 0x0D + 0x80

    // Write program data
    for (size_t i = 0; i < length; i++) {
        machine.coreDebugWrite((progAddr + i) & 0xFFFF, data[i]);
    }

    // Write end markers
    machine.coreDebugWrite(varsAddr, 0x80);         // VARS end marker
    machine.coreDebugWrite(eLineAddr, 0x0D);        // Edit line: ENTER
    machine.coreDebugWrite(eLineAddr + 1, 0x80);    // Edit line: end marker

    // Update system variables
    writeWord(machine, sys::VARS, varsAddr);
    writeWord(machine, sys::NXTLIN, progAddr);
    writeWord(machine, sys::DATADD, varsAddr);
    writeWord(machine, sys::E_LINE, eLineAddr);
    writeWord(machine, sys::K_CUR, eLineAddr);
    writeWord(machine, sys::CH_ADD, eLineAddr - 1);
    writeWord(machine, sys::WORKSP, workspAddr);
    writeWord(machine, sys::STKBOT, workspAddr);
    writeWord(machine, sys::STKEND, workspAddr);
}

} // namespace basic
} // namespace zxspec
