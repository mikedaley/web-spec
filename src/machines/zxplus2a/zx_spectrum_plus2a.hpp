/*
 * zx_spectrum_plus2a.hpp - ZX Spectrum 128K +2A machine variant
 *
 * Differs from the 128K/+2 in several key ways:
 *   - 64KB ROM (4 × 16KB banks) selected by combining 0x7FFD bit 4 + 0x1FFD bit 2
 *   - Port 0x1FFD for additional paging control (special all-RAM modes)
 *   - RAM banks 4-7 are contended (not odd-numbered banks)
 *   - Different interrupt length (32 T-states vs 36)
 *   - Alternative contention pattern
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../zx_spectrum.hpp"
#include <cstdint>

namespace zxspec::zxplus2a {

class ZXSpectrumPlus2A : public ZXSpectrum {
public:
    ZXSpectrumPlus2A();
    ~ZXSpectrumPlus2A() override;

    // Machine interface
    void init() override;
    void reset() override;

    // Snapshot loaders
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

    // Reload Spectranet ROM into flash (factory reset)
    void reloadSpectranetROM() override;

    // Reload Opus Discovery ROM (no-op on +2A)
    void reloadOpusROM() override {}

    // Public memory access (no UDG patching on +2A/+3)
    void writeMemory(uint16_t address, uint8_t data) override;

    // Screen memory for display rendering
    uint8_t* getScreenMemory() override;
    const uint8_t* getScreenMemory() const override;

    // Paging state (exposed for debug/snapshot loaders)
    uint8_t getPagingRegister() const override { return pagingRegister_; }
    void setPagingRegister(uint8_t value) override;
    uint8_t getPagingRegister1FFD() const override { return pagingRegister1FFD_; }
    void setPagingRegister1FFD(uint8_t value) override;
    void writeRamBank(uint8_t bank, uint16_t offset, uint8_t data) override;
    uint8_t readRamBank(uint8_t bank, uint16_t offset) const override;

    // ROM-dependent BASIC breakpoint addresses
    uint16_t getStmtLoopAddr() const override {
        return (pagingRegister_ & 0x10) ? 0x1B29 : 0x17C1;
    }
    uint16_t getMainReportAddr() const override {
        return (pagingRegister_ & 0x10) ? 0x1303 : 0x0322;
    }

private:
    void updatePaging();
    bool isRamBankContended(uint8_t bank) const;

    // Page pointers for fast address translation
    uint8_t* pageRead_[4]{};
    uint8_t* pageWrite_[4]{};

    // Paging state
    uint8_t pagingRegister_ = 0;    // Last value written to port 0x7FFD
    uint8_t pagingRegister1FFD_ = 0; // Last value written to port 0x1FFD
    bool pagingDisabled_ = false;    // Bit 5 of 0x7FFD latches paging off until reset
    bool specialPaging_ = false;     // Bit 0 of 0x1FFD enables special all-RAM mode
};

} // namespace zxspec::zxplus2a
