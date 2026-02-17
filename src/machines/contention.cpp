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
    tsToOrigin_ = info.tsToOrigin;
    altContention_ = info.altContention;
    buildContentionTable();
}

void ULAContention::buildContentionTable()
{
    for (uint32_t i = 0; i <= tsPerFrame_; i++)
    {
        memoryContentionTable_[i] = 0;
        ioContentionTable_[i] = 0;

        if (i >= tsToOrigin_)
        {
            uint32_t line = (i - tsToOrigin_) / tsPerScanline_;
            uint32_t ts = (i - tsToOrigin_) % tsPerScanline_;

            if (line < SCREEN_HEIGHT && ts < TS_HORIZONTAL_DISPLAY)
            {
                memoryContentionTable_[i] = ULA_CONTENTION_VALUES[ts & 0x07];
                ioContentionTable_[i] = ULA_CONTENTION_VALUES[ts & 0x07];
            }
        }
    }
}

uint32_t ULAContention::memoryContention(uint32_t tstates) const
{
    return memoryContentionTable_[tstates % tsPerFrame_];
}

uint32_t ULAContention::ioContention(uint32_t tstates) const
{
    return ioContentionTable_[tstates % tsPerFrame_];
}

void ULAContention::applyIOContention(Z80& z80, uint16_t address, bool contended) const
{
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
