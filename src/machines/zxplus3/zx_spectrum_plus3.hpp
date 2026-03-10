/*
 * zx_spectrum_plus3.hpp - ZX Spectrum +3 machine variant
 *
 * Hardware-identical to the +2A (same ASIC, timing, paging, contention)
 * but with different ROMs and a floppy disk controller (µPD765A).
 *
 * FDC I/O ports:
 *   0x2FFD (read)       - FDC Main Status Register
 *   0x3FFD (read/write) - FDC Data Register
 *   0x1FFD bit 3        - FDC motor on/off
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../zxplus2a/zx_spectrum_plus2a.hpp"
#include "../fdc/upd765a.hpp"
#include "../fdc/disk_image.hpp"

namespace zxspec::zxplus3 {

class ZXSpectrumPlus3 : public zxplus2a::ZXSpectrumPlus2A {
public:
    ZXSpectrumPlus3();
    ~ZXSpectrumPlus3() override;

    void init() override;
    void reset() override;
    void reloadSpectranetROM() override;

    // Override IO to add FDC port handling
    uint8_t coreIORead(uint16_t address) override;
    void coreIOWrite(uint16_t address, uint8_t data) override;

    // Disk drive interface
    UPD765A& getFDC() { return fdc_; }
    const UPD765A& getFDC() const { return fdc_; }

    // Disk image management
    void insertDisk(int drive, const uint8_t* data, uint32_t size);
    void insertEmptyDisk(int drive);
    void ejectDisk(int drive);
    bool hasDisk(int drive) const;
    bool isDiskModified(int drive) const;
    void setDiskWriteProtected(int drive, bool wp);
    bool isDiskWriteProtected(int drive) const;

    // Export disk image data (for save/download)
    const uint8_t* exportDiskData(int drive);
    uint32_t exportDiskDataSize(int drive) const;

private:
    UPD765A fdc_;
    DiskImage diskA_;
    DiskImage diskB_;

    // Cached export data
    std::vector<uint8_t> exportBuffer_;
};

} // namespace zxspec::zxplus3
