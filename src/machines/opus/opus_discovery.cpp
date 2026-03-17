/*
 * opus_discovery.cpp - Opus Discovery disk interface peripheral
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "opus_discovery.hpp"

namespace zxspec {

OpusDiscovery::OpusDiscovery()
{
    rom_.fill(0xFF);
    ram_.fill(0);
    reset();
}

void OpusDiscovery::reset()
{
    // Opus is paged in at boot — its ROM runs first, then pages out
    // to start the Spectrum normally (just like real hardware on power-on)
    pagedIn_ = true;
    controlLatch_ = 0;
    ram_.fill(0);
    fdc_.reset();

    // Initialize PIA to match what REP_RAM sets:
    // (3001) CRA = 0x07: bit 0 = IC 6116 initialized, bit 1 = present, bit 2 = data mode
    // (3000) DRA = 0xC0: bits 7,6 = DD + side, bits 0-1 = no drive selected
    piaDataA_ = 0xC0;
    piaControlA_ = 0x07;
    piaDataB_ = 0;
    piaControlB_ = 0;

    // Pre-initialize RAM tables from ROM (equivalent to INIT_RAM2)
    initRAMTables();

    // Reconnect disk images to FDC (they persist across reset)
    fdc_.insertDisk(0, &diskA_);
    fdc_.insertDisk(1, &diskB_);
}

void OpusDiscovery::loadROM(const uint8_t* data, uint32_t size)
{
    if (!data || size == 0) return;
    rom_.fill(0xFF);
    uint32_t copySize = (size < ROM_SIZE) ? size : ROM_SIZE;
    std::memcpy(rom_.data(), data, copySize);

    // Re-initialize RAM tables from the new ROM
    initRAMTables();
}

void OpusDiscovery::initRAMTables()
{
    // Equivalent to INIT_RAM2/INIT_RAM3 in the Opus ROM:
    //   LDIR from ROM 0x18AD to RAM 0x2000, length 0x89 bytes
    //   Then patch RAM[0x0013] = 0x23, RAM[0x0014] = 0x20
    //   (points subtable #0A to 0x2023)
    // Both the standard Opus 2.22 and QuickDOS ROMs share this
    // table layout (with minor offset differences in jump targets).
    static constexpr uint16_t TABLE_SRC = 0x18AD;
    static constexpr uint16_t TABLE_LEN = 0x0089;

    if (TABLE_SRC + TABLE_LEN <= ROM_SIZE) {
        std::memcpy(ram_.data(), &rom_[TABLE_SRC], TABLE_LEN);
    }

    // Patch from REP_RAM: LD HL,+2023; LD (2013),HL
    // This sets the subtable #0A pointer to 0x2023
    // RAM offset 0x0013 = address 0x2013
    if (0x0014 < RAM_SIZE) {
        ram_[0x0013] = 0x23;  // low byte
        ram_[0x0014] = 0x20;  // high byte
    }
}

// ============================================================================
// Memory access (full 0x0000-0x3FFF overlay when paged in)
// ============================================================================

uint8_t OpusDiscovery::memoryRead(uint16_t address)
{
    if (address < ROM_SIZE) {
        // 0x0000-0x1FFF: Opus ROM
        return rom_[address];
    }
    else if (address < ROM_SIZE + RAM_SIZE) {
        // 0x2000-0x27FF: Opus RAM (IC 6116)
        return ram_[address - ROM_SIZE];
    }
    else if (address < 0x3000) {
        // 0x2800-0x2FFF: WD1770 FDC registers (memory-mapped)
        // Bits 0-1 of address select the register
        return fdc_.readRegister(address & 0x03);
    }
    else if (address < 0x3800) {
        // 0x3000-0x37FF: 6821 PIA registers (memory-mapped)
        // Even addresses: data registers, odd addresses: control registers
        // The ROM reads 0x3001 (control reg A) to check IC 6116 status
        if (address & 0x01) {
            return piaControlA_;  // Control register A (IC 6116 status bits)
        } else {
            return piaDataA_;     // Port A data
        }
    }
    // 0x3800-0x3FFF: Undefined
    return 0xFF;
}

uint8_t OpusDiscovery::debugRead(uint16_t address) const
{
    if (address < ROM_SIZE) {
        return rom_[address];
    }
    else if (address < ROM_SIZE + RAM_SIZE) {
        return ram_[address - ROM_SIZE];
    }
    else if (address < 0x3800) {
        // PIA registers (no side effects)
        if (address >= 0x3000) {
            return (address & 0x01) ? piaControlA_ : piaDataA_;
        }
        // FDC area — return 0xFF to avoid side effects
        return 0xFF;
    }
    return 0xFF;
}

void OpusDiscovery::memoryWrite(uint16_t address, uint8_t data)
{
    if (address >= ROM_SIZE && address < ROM_SIZE + RAM_SIZE) {
        // 0x2000-0x27FF: Opus RAM (writable)
        ram_[address - ROM_SIZE] = data;
    }
    else if (address >= 0x2800 && address < 0x3000) {
        // 0x2800-0x2FFF: WD1770 FDC registers
        fdc_.writeRegister(address & 0x03, data);
    }
    else if (address >= 0x3000 && address < 0x3800) {
        // 0x3000-0x37FF: 6821 PIA registers (simplified)
        // Even addresses (0x3000, 0x3002): data/DDR registers
        // Odd addresses (0x3001, 0x3003): control registers
        if (address & 0x01) {
            // Control register write
            piaControlA_ = data;
        } else {
            // Port A data register write — decode drive/side select
            piaDataA_ = data;
            // Bit 0: Drive A select, Bit 1: Drive B select
            // Bit 4: Side select (0 = side 0, 1 = side 1)
            if (data & 0x02) {
                fdc_.selectDrive(1);
            } else {
                fdc_.selectDrive(0);
            }
            fdc_.selectSide((data >> 4) & 0x01);
        }
    }
    // ROM area (0x0000-0x1FFF) is read-only — writes are ignored
    // 0x3800-0x3FFF: Undefined — writes are ignored
}

// ============================================================================
// I/O port handling (legacy)
// ============================================================================

bool OpusDiscovery::isOpusPort(uint16_t address) const
{
    uint8_t lowByte = address & 0xFF;
    return lowByte >= 0xE0 && lowByte <= 0xE4;
}

uint8_t OpusDiscovery::ioRead(uint16_t address)
{
    uint8_t port = address & 0xFF;

    switch (port) {
    case 0xE0: return fdc_.readRegister(0);
    case 0xE1: return fdc_.readRegister(1);
    case 0xE2: return fdc_.readRegister(2);
    case 0xE3: return fdc_.readRegister(3);
    case 0xE4: return controlLatch_;
    default: return 0xFF;
    }
}

void OpusDiscovery::ioWrite(uint16_t address, uint8_t data)
{
    uint8_t port = address & 0xFF;

    switch (port) {
    case 0xE0:
        fdc_.writeRegister(0, data);
        break;
    case 0xE1:
        fdc_.writeRegister(1, data);
        break;
    case 0xE2:
        fdc_.writeRegister(2, data);
        break;
    case 0xE3:
        fdc_.writeRegister(3, data);
        break;
    case 0xE4:
        controlLatch_ = data;
        // Bit 0: drive select (0 = drive A, 1 = drive B)
        fdc_.selectDrive(data & 0x01);
        // Bit 4: side select
        fdc_.selectSide((data >> 4) & 0x01);
        break;
    }
}

// ============================================================================
// Paging mechanism
// ============================================================================

bool OpusDiscovery::shouldPageIn(uint16_t address) const
{
    // Page-in addresses matching Fuse emulator (POST-FETCH).
    // The opcode at the trigger address is fetched from the current
    // (Spectrum) ROM and executes normally. Paging only affects
    // subsequent fetches — so the NEXT instruction comes from Opus ROM.
    //
    // 0x0008: RST 8 — Spectrum ROM's LD HL,(CH_ADD) at 0x0008 executes
    //         (3 bytes), PC advances to 0x000B, next fetch = Opus ENTRY_1.
    // 0x0048: KEY_INT — both ROMs have PUSH BC at this address, then
    //         next fetch at 0x0049 comes from Opus ROM.
    // 0x1708: PAGE_IN — Spectrum ROM's INC HL executes, then Opus ROM's
    //         DEC HL at 0x1709 compensates (net zero change to HL).
    //
    // 0x0066 is NOT a page-in address (NMI is used for WD1770 DRQ).
    return address == 0x0008
        || address == 0x0048
        || address == 0x1708;
}

bool OpusDiscovery::shouldPageOut(uint16_t address) const
{
    // The real hardware detects address 0x1748 (PAGE_OUT) specifically.
    // This address contains just a RET instruction; the hardware pages
    // out the Opus ROM when this address is executed.
    return address == 0x1748;
}

// ============================================================================
// Disk image management
// ============================================================================

void OpusDiscovery::insertDisk(int drive, const uint8_t* data, uint32_t size)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->load(data, size);
}

void OpusDiscovery::insertEmptyDisk(int drive)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->createEmptyOPD();
}

void OpusDiscovery::ejectDisk(int drive)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->eject();
}

bool OpusDiscovery::hasDisk(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    return disk->isLoaded();
}

bool OpusDiscovery::isDiskModified(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    return disk->isModified();
}

void OpusDiscovery::setDiskWriteProtected(int drive, bool wp)
{
    DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    disk->setWriteProtected(wp);
}

bool OpusDiscovery::isDiskWriteProtected(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    return disk->isWriteProtected();
}

const uint8_t* OpusDiscovery::exportDiskData(int drive)
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    if (!disk->isLoaded()) return nullptr;

    exportBuffer_ = disk->exportDSK();
    return exportBuffer_.data();
}

uint32_t OpusDiscovery::exportDiskDataSize(int drive) const
{
    const DiskImage* disk = (drive == 0) ? &diskA_ : &diskB_;
    if (!disk->isLoaded()) return 0;

    return static_cast<uint32_t>(exportBuffer_.size());
}

} // namespace zxspec
