/*
 * contention.cpp - ULA memory and IO contention timing (shared across machines)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "contention.hpp"
#include "../core/z80/z80.hpp"

namespace zxspec {

void ULAContention::init(const MachineInfo& info)
{
    tsPerFrame_ = info.tsPerFrame;
    tsPerScanline_ = info.tsPerLine;

    // Contention begins 1 T-state before the ULA starts its screen data fetch.
    // This is because the ULA must arbitrate bus access before the fetch cycle
    // begins, so the CPU sees the delay one T-state early.
    cpuTsToContention_ = info.ulaTsToDisplay - 1;

    altContention_ = info.altContention;
    buildContentionTable();
}

// Pre-calculate the contention delay for every T-state in the frame.
//
// Contention only occurs during the 192 visible scanlines, and only during the
// 128 T-states of each scanline where the ULA is actively fetching screen data
// (the paper area). Outside these regions the CPU has uncontested bus access.
//
// Within the contended region, the delay follows a repeating 8-T-state pattern
// (see ULA_CONTENTION_VALUES in machine_info.hpp) determined by where in the
// ULA's fetch cycle the CPU access falls.
void ULAContention::buildContentionTable()
{
    for (uint32_t i = 0; i <= tsPerFrame_; i++)
    {
        memoryContentionTable_[i] = 0;
        ioContentionTable_[i] = 0;

        if (i >= cpuTsToContention_)
        {
            // Convert absolute T-state to scanline number and position within the line,
            // relative to where contention begins
            uint32_t line = (i - cpuTsToContention_) / tsPerScanline_;
            uint32_t ts = (i - cpuTsToContention_) % tsPerScanline_;

            // Only contend during the paper area: 192 visible lines, 128 T-states of
            // active screen fetch per line
            if (line < SCREEN_HEIGHT && ts < TS_HORIZONTAL_DISPLAY)
            {
                // Look up the delay from the 8-T-state repeating pattern
                memoryContentionTable_[i] = ULA_CONTENTION_VALUES[ts & 0x07];
                ioContentionTable_[i] = ULA_CONTENTION_VALUES[ts & 0x07];
            }
        }
    }
}

uint32_t ULAContention::memoryContention(uint32_t tstates) const
{
    // Wrap around frame boundary so contention works across frame edges
    return memoryContentionTable_[tstates % tsPerFrame_];
}

uint32_t ULAContention::ioContention(uint32_t tstates) const
{
    return ioContentionTable_[tstates % tsPerFrame_];
}

// Apply I/O contention to the Z80 for a port access.
//
// I/O contention depends on two factors:
//   1. Whether the port address falls in contended memory (bit 14 set = slot 1)
//   2. Whether the port is even (bit 0 = 0, ULA-owned) or odd
//
// This produces four distinct timing patterns, documented in the Spectrum
// technical reference as:
//
//   Contended address + even port:  C:1, C:3   (contend, 1ts, contend, 3ts)
//   Contended address + odd port:   C:1, C:1, C:1, C:1  (four contend+1ts pairs)
//   Uncontended address + even port: N:1, C:3  (1ts, contend, 3ts)
//   Uncontended address + odd port:  N:4       (just 4 T-states, no contention)
//
// "C" = apply contention delay at current T-state, "N" = no contention.
// The number after the colon is the T-states to advance.
void ULAContention::applyIOContention(Z80& z80, uint16_t address, bool contended) const
{
    bool evenPort = (address & 0x01) == 0;

    if (contended)
    {
        if (evenPort)
        {
            // Contended + even (ULA) port: C:1, C:3
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(1);
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(3);
        }
        else
        {
            // Contended + odd port: C:1, C:1, C:1, C:1
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(1);
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(1);
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(1);
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(1);
        }
    }
    else
    {
        if (evenPort)
        {
            // Uncontended + even (ULA) port: N:1, C:3
            // The ULA still applies contention on the data phase even though
            // the address is not in contended RAM, because even ports belong
            // to the ULA and it must arbitrate the data bus.
            z80.addTStates(1);
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(3);
        }
        else
        {
            // Uncontended + odd port: N:4
            // No ULA involvement at all — just the standard 4 T-state I/O cycle.
            z80.addTStates(4);
        }
    }
}

} // namespace zxspec
