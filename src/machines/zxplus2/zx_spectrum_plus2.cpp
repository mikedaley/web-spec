/*
 * zx_spectrum_plus2.cpp - ZX Spectrum 128K +2 machine variant
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx_spectrum_plus2.hpp"
#include <cstring>

#include "roms.cpp"

namespace zxspec::zxplus2 {

void ZXSpectrumPlus2::init()
{
    // Set machine configuration from the +2 data table entry
    machineInfo_ = machines[eZXSpectrum128_2];

    // Base class allocates memory and wires up Z80
    baseInit();

    // Load +2 ROMs (ROM 0 = 128K editor, ROM 1 = 48K BASIC)
    if (roms::ROM_PLUS2_0_SIZE > 0 && roms::ROM_PLUS2_0_SIZE <= MEM_PAGE_SIZE)
    {
        std::memcpy(memoryRom_.data(), roms::ROM_PLUS2_0, roms::ROM_PLUS2_0_SIZE);
    }
    if (roms::ROM_PLUS2_1_SIZE > 0 && roms::ROM_PLUS2_1_SIZE <= MEM_PAGE_SIZE)
    {
        std::memcpy(memoryRom_.data() + MEM_PAGE_SIZE, roms::ROM_PLUS2_1, roms::ROM_PLUS2_1_SIZE);
    }

    // Load Spectranet ROM into flash if available
    if (roms::ROM_SPECTRANET_SIZE > 0)
    {
        spectranet_.loadROM(roms::ROM_SPECTRANET, static_cast<uint32_t>(roms::ROM_SPECTRANET_SIZE));
    }

    // Default paging: ROM 0, RAM bank 0 at slot 3, screen bank 5
    setPagingRegister(0);
}

void ZXSpectrumPlus2::reloadSpectranetROM()
{
    if (roms::ROM_SPECTRANET_SIZE > 0) {
        spectranet_.loadROM(roms::ROM_SPECTRANET, static_cast<uint32_t>(roms::ROM_SPECTRANET_SIZE));
    }
}

} // namespace zxspec::zxplus2
