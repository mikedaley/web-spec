/*
 * ula_contention.hpp - ULA memory and IO contention timing for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../types.hpp"
#include <array>
#include <cstdint>

namespace zxspec {

class Z80;

class ULAContention {
public:
    void init(int tsPerFrame, int tsPerScanline, int tsToOrigin);

    // Look up the contention delay for the current tstate position
    uint32_t memoryContention(uint32_t tstates) const;
    uint32_t ioContention(uint32_t tstates) const;

    // Apply the full IO contention pattern to the Z80 based on port address
    void applyIOContention(Z80& z80, uint16_t address, MachineType machineType) const;

private:
    void buildContentionTable();

    // ULA contention delay values indexed by (tstate % 8)
    static constexpr uint32_t ULA_CONTENTION_VALUES[] = { 6, 5, 4, 3, 2, 1, 0, 0 };

    int tsPerFrame_ = TSTATES_PER_FRAME;
    int tsPerScanline_ = TSTATES_PER_SCANLINE;
    int tsToOrigin_ = 14335;

    // Pre-built lookup tables indexed by tstate within frame (max size for 128K)
    std::array<uint32_t, TSTATES_PER_FRAME_128K + 1> memoryContentionTable_{};
    std::array<uint32_t, TSTATES_PER_FRAME_128K + 1> ioContentionTable_{};
};

} // namespace zxspec
