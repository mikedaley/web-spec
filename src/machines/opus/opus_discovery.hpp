/*
 * opus_discovery.hpp - Opus Discovery disk interface peripheral
 *
 * Emulates the Opus Discovery v2.2 disk interface that overlays
 * 0x0000-0x3FFF with its own hardware when paged in.
 *
 * Memory overlay (when paged in):
 *   0x0000-0x1FFF: 8KB Opus ROM (replaces Spectrum ROM)
 *   0x2000-0x27FF: 2KB Opus RAM (IC 6116)
 *   0x2800-0x2FFF: WD1770 FDC registers (memory-mapped, bits 0-1 select reg)
 *   0x3000-0x37FF: 6821 PIA registers (memory-mapped)
 *   0x3800-0x3FFF: Undefined (returns 0xFF)
 *
 * Paging mechanism (Opus Discovery v2.2, matching Fuse emulator):
 *   POST-FETCH paging: instruction at trigger address executes from
 *   the current ROM; paging only affects subsequent fetches.
 *
 *   Boots paged IN (ROM runs first at reset, then pages out to Spectrum)
 *   Pages IN at addresses detected by hardware:
 *     0x0008: RST 8 — LD HL,(CH_ADD) executes from Spectrum ROM,
 *             then ENTRY_1 at 0x000B fetches from Opus ROM
 *     0x0048: KEY_INT — both ROMs have PUSH BC here
 *     0x1708: PAGE_IN — Spectrum ROM's INC HL executes, Opus ROM's
 *             DEC HL at 0x1709 compensates
 *   Pages OUT at address 0x1748 (PAGE_OUT — RET from Opus ROM executes,
 *     then subsequent fetches come from Spectrum ROM)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "wd1770.hpp"
#include "../fdc/disk_image.hpp"
#include <cstdint>
#include <cstring>
#include <array>
#include <vector>

namespace zxspec {

class OpusDiscovery {
public:
    static constexpr uint32_t ROM_SIZE = 8192;   // 8KB ROM
    static constexpr uint32_t RAM_SIZE = 2048;    // 2KB RAM

    OpusDiscovery();

    void reset();

    // Load Opus ROM data and pre-initialize RAM tables
    void loadROM(const uint8_t* data, uint32_t size);

    // Memory access (full 0x0000-0x3FFF overlay when paged in)
    uint8_t memoryRead(uint16_t address);
    void memoryWrite(uint16_t address, uint8_t data);

    // Debug read — ROM/RAM only, no FDC side effects
    uint8_t debugRead(uint16_t address) const;

    // Check if address is in Opus overlay range (0x0000-0x3FFF)
    bool isOverlayAddress(uint16_t address) const { return address < 0x4000; }

    // I/O port handling (legacy, some software may use these)
    bool isOpusPort(uint16_t address) const;
    uint8_t ioRead(uint16_t address);
    void ioWrite(uint16_t address, uint8_t data);

    // Paging state
    bool isPagedIn() const { return pagedIn_; }
    void setPagedIn(bool paged) { pagedIn_ = paged; }

    // Check if address triggers page-in (0x0008, 0x0048, 0x1708)
    bool shouldPageIn(uint16_t address) const;

    // Check if address triggers page-out (0x1748)
    bool shouldPageOut(uint16_t address) const;

    // Page in/out
    void pageIn() { pagedIn_ = true; }
    void pageOut() { pagedIn_ = false; }

    // WD1770 FDC access
    WD1770& getFDC() { return fdc_; }
    const WD1770& getFDC() const { return fdc_; }

    // Disk image management (2 drives)
    void insertDisk(int drive, const uint8_t* data, uint32_t size);
    void insertEmptyDisk(int drive);
    void ejectDisk(int drive);
    bool hasDisk(int drive) const;
    bool isDiskModified(int drive) const;
    void setDiskWriteProtected(int drive, bool wp);
    bool isDiskWriteProtected(int drive) const;
    const uint8_t* exportDiskData(int drive);
    uint32_t exportDiskDataSize(int drive) const;

    // Status accessors for WASM/debug
    uint8_t getCurrentTrack() const { return fdc_.getCurrentTrack(); }
    uint8_t getStatus() const { return fdc_.getStatus(); }
    bool isMotorOn() const { return fdc_.isMotorOn(); }

private:
    // Initialize RAM tables from ROM (equivalent to INIT_RAM2)
    void initRAMTables();

    // ROM and RAM
    std::array<uint8_t, ROM_SIZE> rom_;
    std::array<uint8_t, RAM_SIZE> ram_;

    // WD1770 FDC
    WD1770 fdc_;

    // Disk images (owned by OpusDiscovery, connected to FDC)
    DiskImage diskA_;
    DiskImage diskB_;

    // Control latch state
    uint8_t controlLatch_ = 0;

    // 6821 PIA registers
    uint8_t piaDataA_ = 0;       // Port A data / DDR (at 0x3000)
    uint8_t piaControlA_ = 0;    // Port A control
    uint8_t piaDataB_ = 0;       // Port B data / DDR (at 0x3001)
    uint8_t piaControlB_ = 0;    // Port B control

    // Paging state
    bool pagedIn_ = false;

    // Export buffer (reused across calls, like +3)
    mutable std::vector<uint8_t> exportBuffer_;
};

} // namespace zxspec
