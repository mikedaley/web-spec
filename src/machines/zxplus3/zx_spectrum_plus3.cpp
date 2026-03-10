/*
 * zx_spectrum_plus3.cpp - ZX Spectrum +3 machine variant
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx_spectrum_plus3.hpp"
#include <cstring>

#include "roms.cpp"

namespace zxspec::zxplus3 {

ZXSpectrumPlus3::ZXSpectrumPlus3() = default;
ZXSpectrumPlus3::~ZXSpectrumPlus3() = default;

void ZXSpectrumPlus3::init()
{
    // Set machine configuration from the +3 data table entry
    machineInfo_ = machines[eZXSpectrum128_3];

    // Base class allocates memory and wires up Z80
    baseInit();

    // Load all 4 ROM banks (64KB total)
    if (roms::ROM_PLUS3_SIZE > 0 && roms::ROM_PLUS3_SIZE <= 4 * MEM_PAGE_SIZE)
    {
        std::memcpy(memoryRom_.data(), roms::ROM_PLUS3, roms::ROM_PLUS3_SIZE);
    }

    // Load Spectranet ROM into flash if available
    if (roms::ROM_SPECTRANET_SIZE > 0)
    {
        spectranet_.loadROM(roms::ROM_SPECTRANET, static_cast<uint32_t>(roms::ROM_SPECTRANET_SIZE));
    }

    // Default paging state
    setPagingRegister(0);

    // Connect disk images to FDC
    fdc_.insertDisk(0, &diskA_);
    fdc_.insertDisk(1, &diskB_);
}

void ZXSpectrumPlus3::reset()
{
    zxplus2a::ZXSpectrumPlus2A::reset();
    fdc_.reset();

    // Reconnect disk images (they persist across reset)
    fdc_.insertDisk(0, &diskA_);
    fdc_.insertDisk(1, &diskB_);
}

void ZXSpectrumPlus3::reloadSpectranetROM()
{
    if (roms::ROM_SPECTRANET_SIZE > 0) {
        spectranet_.loadROM(roms::ROM_SPECTRANET, static_cast<uint32_t>(roms::ROM_SPECTRANET_SIZE));
    }
}

// ============================================================================
// IO Read - adds FDC ports to +2A port handling
// ============================================================================

uint8_t ZXSpectrumPlus3::coreIORead(uint16_t address)
{
    // FDC Main Status Register: port 0x2FFD
    if ((address & 0xF002) == 0x2000) {
        // Let the +2A base apply IO contention first, then return FDC data.
        // The base will treat this as an unmatched odd port returning 0xFF,
        // but we discard that and return the MSR instead.
        zxplus2a::ZXSpectrumPlus2A::coreIORead(address);
        return fdc_.readMSR();
    }

    // FDC Data Register: port 0x3FFD
    if ((address & 0xF002) == 0x3000) {
        zxplus2a::ZXSpectrumPlus2A::coreIORead(address);
        return fdc_.readData();
    }

    // All other ports handled by +2A base
    return zxplus2a::ZXSpectrumPlus2A::coreIORead(address);
}

// ============================================================================
// IO Write - adds FDC ports to +2A port handling
// ============================================================================

void ZXSpectrumPlus3::coreIOWrite(uint16_t address, uint8_t data)
{
    // FDC Data Register: port 0x3FFD (write)
    if ((address & 0xF002) == 0x3000) {
        fdc_.writeData(data);
    }

    // Port 0x1FFD also controls the FDC motor (bit 3)
    // The +2A base handles paging from 0x1FFD, but we also need the motor bit
    if ((address & 0xF002) == 0x1000) {
        fdc_.setMotor((data & 0x08) != 0);
    }

    // Let +2A handle all standard port writes (paging, AY, ULA, etc.)
    zxplus2a::ZXSpectrumPlus2A::coreIOWrite(address, data);
}

// ============================================================================
// Disk image management
// ============================================================================

void ZXSpectrumPlus3::insertDisk(int drive, const uint8_t* data, uint32_t size)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->load(data, size);
}

void ZXSpectrumPlus3::insertEmptyDisk(int drive)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->createEmpty();
}

void ZXSpectrumPlus3::ejectDisk(int drive)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->eject();
}

bool ZXSpectrumPlus3::hasDisk(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    return disk->isLoaded();
}

bool ZXSpectrumPlus3::isDiskModified(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    return disk->isModified();
}

void ZXSpectrumPlus3::setDiskWriteProtected(int drive, bool wp)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->setWriteProtected(wp);
}

bool ZXSpectrumPlus3::isDiskWriteProtected(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    return disk->isWriteProtected();
}

const uint8_t* ZXSpectrumPlus3::exportDiskData(int drive)
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    if (!disk->isLoaded()) return nullptr;

    exportBuffer_ = disk->exportDSK();
    return exportBuffer_.data();
}

uint32_t ZXSpectrumPlus3::exportDiskDataSize(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    if (!disk->isLoaded()) return 0;

    // We need to calculate without modifying state - return cached size
    // The actual size is computed during exportDiskData()
    return static_cast<uint32_t>(exportBuffer_.size());
}

} // namespace zxspec::zxplus3
