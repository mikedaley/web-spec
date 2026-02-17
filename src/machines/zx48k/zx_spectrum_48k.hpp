/*
 * zx_spectrum_48k.hpp - ZX Spectrum 48K machine variant
 *
 * Inherits from ZXSpectrum base class, overriding only the 7 core
 * memory/IO virtual methods for 48K-specific behavior.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../zx_spectrum.hpp"
#include <cstdint>

namespace zxspec::zx48k {

class ZXSpectrum48 : public ZXSpectrum {
public:
    ZXSpectrum48();
    ~ZXSpectrum48() override;

    // Machine interface
    void init() override;
    void reset() override;

    // Snapshot loaders (48K-specific formats)
    void loadSNA(const uint8_t* data, uint32_t size) override;
    void loadZ80(const uint8_t* data, uint32_t size) override;
    void loadTZX(const uint8_t* data, uint32_t size) override;
    void loadTAP(const uint8_t* data, uint32_t size) override;

    // Core virtual overrides — the 7 machine-specific methods
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

private:
    void setupPaging();

    // Page pointers for fast address translation
    uint8_t* pageRead_[4]{};
    uint8_t* pageWrite_[4]{};
};

} // namespace zxspec::zx48k
