/*
 * contention.hpp - ULA memory and IO contention timing (shared across machines)
 *
 * On the ZX Spectrum, the ULA and CPU share the same 16K RAM bank (0x4000-0x7FFF).
 * During the 192 visible scanlines, the ULA periodically locks the CPU out of this
 * RAM while it fetches screen data. This causes the CPU to "stall" for 0-6 extra
 * T-states depending on when in the ULA's 8-T-state fetch cycle the access occurs.
 *
 * This class pre-calculates contention delay lookup tables for every T-state in a
 * frame, so the hot path only needs a single array lookup per memory/IO access.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "machine_info.hpp"
#include <cstdint>

namespace zxspec {

class Z80;

class ULAContention {
public:
    void init(const MachineInfo& info);

    // Look up the contention delay for a memory access at the given T-state.
    // Returns 0 when no contention applies (outside the paper area, or at a
    // non-contended point in the ULA fetch cycle).
    uint32_t memoryContention(uint32_t tstates) const;

    // Look up the contention delay for an I/O access at the given T-state.
    // Uses the same underlying table as memory contention.
    uint32_t ioContention(uint32_t tstates) const;

    // Apply the full I/O contention pattern for a port access. The pattern
    // depends on whether the port address falls in contended memory and
    // whether the port is even (ULA-owned) or odd. See contention.cpp for
    // the four possible patterns.
    void applyIOContention(Z80& z80, uint16_t address, bool contended) const;

private:
    void buildContentionTable();

    uint32_t tsPerFrame_ = 0;
    uint32_t tsPerScanline_ = 0;
    uint32_t cpuTsToContention_ = 0;    // T-state when contention begins (ulaTsToDisplay - 1)
    bool altContention_ = false;         // +2A/+3 use a different contention model

    // Pre-calculated delay for every T-state in the frame. Indexed by absolute
    // T-state within the frame; value is the number of extra T-states the CPU
    // must wait (0-6).
    uint32_t memoryContentionTable_[MAX_TSTATES_PER_FRAME + 1]{};
    uint32_t ioContentionTable_[MAX_TSTATES_PER_FRAME + 1]{};
};

} // namespace zxspec
