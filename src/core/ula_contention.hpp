/*
 * ula_contention.hpp - ULA memory and IO contention timing for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "types.hpp"
#include <array>
#include <cstdint>

namespace zxspec {

class Z80;

class ULAContention {
public:
    void init();

    // Look up the contention delay for the current tstate position
    uint32_t memoryContention(uint32_t tstates) const;
    uint32_t ioContention(uint32_t tstates) const;

    // Apply the full IO contention pattern to the Z80 based on port address
    void applyIOContention(Z80& z80, uint16_t address) const;

private:
    void buildContentionTable();

    // 48K ULA contention delay values indexed by (tstate % 8)
    static constexpr uint32_t ULA_CONTENTION_VALUES[] = { 6, 5, 4, 3, 2, 1, 0, 0 };

    // 48K timing: tstate offset to first pixel of display origin
    static constexpr uint32_t TS_TO_ORIGIN = 14335;

    // Pre-built lookup tables indexed by tstate within frame
    std::array<uint32_t, TSTATES_PER_FRAME> memoryContentionTable_{};
    std::array<uint32_t, TSTATES_PER_FRAME> ioContentionTable_{};
};

} // namespace zxspec
