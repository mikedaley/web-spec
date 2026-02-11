/*
 * ula_contention.cpp - ULA memory and IO contention timing for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "ula_contention.hpp"
#include "../z80/z80.hpp"

namespace zxspec {

void ULAContention::init()
{
    buildContentionTable();
}

void ULAContention::buildContentionTable()
{
    for (int i = 0; i < TSTATES_PER_FRAME; i++)
    {
        memoryContentionTable_[i] = 0;
        ioContentionTable_[i] = 0;

        if (i >= static_cast<int>(TS_TO_ORIGIN))
        {
            uint32_t line = (i - TS_TO_ORIGIN) / TSTATES_PER_SCANLINE;
            uint32_t ts = (i - TS_TO_ORIGIN) % TSTATES_PER_SCANLINE;

            // Contention only during active display: 192 lines, first 128 tstates per line
            if (line < static_cast<uint32_t>(SCREEN_HEIGHT) && ts < 128)
            {
                memoryContentionTable_[i] = ULA_CONTENTION_VALUES[ts & 0x07];
                ioContentionTable_[i] = ULA_CONTENTION_VALUES[ts & 0x07];
            }
        }
    }
}

uint32_t ULAContention::memoryContention(uint32_t tstates) const
{
    return memoryContentionTable_[tstates % TSTATES_PER_FRAME];
}

uint32_t ULAContention::ioContention(uint32_t tstates) const
{
    return ioContentionTable_[tstates % TSTATES_PER_FRAME];
}

// IO contention pattern (from ZX Spectrum technical documentation):
//
//  High byte in   | Low bit | Pattern
//  0x40-0x7F?     | (even)  |
//  ---------------+---------+---------------------------
//  No             | Reset   | N:1, C:3
//  No             | Set     | N:4
//  Yes            | Reset   | C:1, C:3
//  Yes            | Set     | C:1, C:1, C:1, C:1
//
//  N:x = no contention, just add x tstates
//  C:x = apply contention lookup, then add x tstates

void ULAContention::applyIOContention(Z80& z80, uint16_t address) const
{
    bool contended = (address & 0xC000) == 0x4000;
    bool evenPort = (address & 0x01) == 0;

    if (contended)
    {
        if (evenPort)
        {
            // C:1, C:3
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(1);
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(3);
        }
        else
        {
            // C:1, C:1, C:1, C:1
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
            // N:1, C:3
            z80.addTStates(1);
            z80.addContentionTStates(ioContention(z80.getTStates()));
            z80.addTStates(3);
        }
        else
        {
            // N:4
            z80.addTStates(4);
        }
    }
}

} // namespace zxspec
