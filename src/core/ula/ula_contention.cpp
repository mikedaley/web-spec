/*
 * ula_contention.cpp - ULA memory and IO contention timing for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "ula_contention.hpp"
#include "../z80/z80.hpp"

namespace zxspec {

void ULAContention::init(int tsPerFrame, int tsPerScanline, int tsToOrigin)
{
    tsPerFrame_ = tsPerFrame;
    tsPerScanline_ = tsPerScanline;
    tsToOrigin_ = tsToOrigin;
    buildContentionTable();
}

void ULAContention::buildContentionTable()
{
    for (int i = 0; i <= tsPerFrame_; i++)
    {
        memoryContentionTable_[i] = 0;
        ioContentionTable_[i] = 0;

        if (i >= tsToOrigin_)
        {
            uint32_t line = (i - tsToOrigin_) / tsPerScanline_;
            uint32_t ts = (i - tsToOrigin_) % tsPerScanline_;

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
    return memoryContentionTable_[tstates % tsPerFrame_];
}

uint32_t ULAContention::ioContention(uint32_t tstates) const
{
    return ioContentionTable_[tstates % tsPerFrame_];
}

void ULAContention::applyIOContention(Z80& z80, uint16_t address, MachineType machineType) const
{
    bool contended;
    if (machineType == MachineType::Spectrum48K)
    {
        contended = (address & 0xC000) == 0x4000;
    }
    else
    {
        // 128K: contended if address is in 0x4000-0x7FFF range
        // (slot 1 = page 5, always contended)
        // Also contended if slot 3 has an odd page, but IO contention
        // traditionally only checks the address high byte
        contended = (address & 0xC000) == 0x4000;
    }

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
