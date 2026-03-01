/*
 * zx_spectrum_128k.hpp - ZX Spectrum 128K machine variant
 *
 * Inherits from ZXSpectrum base class, overriding the 7 core
 * memory/IO virtual methods for 128K-specific behavior including
 * memory paging (port 0x7FFD) and built-in AY-3-8912.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../zx_spectrum.hpp"
#include <cstdint>

namespace zxspec::zx128k {

class ZXSpectrum128 : public ZXSpectrum {
public:
    ZXSpectrum128();
    ~ZXSpectrum128() override;

    // Machine interface
    void init() override;
    void reset() override;

    // Snapshot loaders (128K-specific formats)
    void loadSNA(const uint8_t* data, uint32_t size) override;
    void loadZ80(const uint8_t* data, uint32_t size) override;
    void loadTZX(const uint8_t* data, uint32_t size) override;
    void loadTAP(const uint8_t* data, uint32_t size) override;
    void loadTZXTape(const uint8_t* data, uint32_t size) override;

    // Core virtual overrides -- the 7 machine-specific methods
    uint8_t coreMemoryRead(uint16_t address) override;
    void coreMemoryWrite(uint16_t address, uint8_t data) override;
    void coreMemoryContention(uint16_t address, uint32_t tstates) override;
    void coreNoMreqContention(uint16_t address, uint32_t tstates) override;
    uint8_t coreIORead(uint16_t address) override;
    void coreIOWrite(uint16_t address, uint8_t data) override;
    uint8_t coreDebugRead(uint16_t address) const override;
    void coreDebugWrite(uint16_t address, uint8_t data) override;

    // Screen memory for display rendering
    uint8_t* getScreenMemory() override;
    const uint8_t* getScreenMemory() const override;

    // 128K paging state (exposed for debug/snapshot loaders)
    uint8_t getPagingRegister() const override { return pagingRegister_; }
    void setPagingRegister(uint8_t value) override;
    void writeRamBank(uint8_t bank, uint16_t offset, uint8_t data) override;
    uint8_t readRamBank(uint8_t bank, uint16_t offset) const override;

    // ROM-dependent BASIC breakpoint addresses:
    // When ROM 0 (128K BASIC) is paged in, use 128K-specific addresses;
    // when ROM 1 (48K BASIC) is paged in, use the standard 48K addresses.
    uint16_t getStmtLoopAddr() const override {
        return (pagingRegister_ & 0x10) ? 0x1B29 : 0x17C1;
    }
    uint16_t getMainReportAddr() const override {
        // ROM 1 (48K BASIC): MAIN-4 at $1303 is HALT (single-byte opcode).
        // ROM 0 (128K BASIC): error handler at $0321 is LD SP,(nn) ($ED $7B),
        // an ED-prefixed instruction. The opcode callback fires after the ED
        // prefix is consumed, so the reported address is $0322 not $0321.
        return (pagingRegister_ & 0x10) ? 0x1303 : 0x0322;
    }

private:
    void updatePaging();

    // Page pointers for fast address translation
    uint8_t* pageRead_[4]{};
    uint8_t* pageWrite_[4]{};

    // 128K paging state
    uint8_t pagingRegister_ = 0;    // Last value written to port 0x7FFD
    bool pagingDisabled_ = false;   // Bit 5 latches paging off until reset
};

} // namespace zxspec::zx128k
