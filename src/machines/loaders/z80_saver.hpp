/*
 * z80_saver.hpp - Z80 v3 snapshot format writer for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

class ZXSpectrum;

class Z80Saver {
public:
    static uint32_t save(const ZXSpectrum& machine, uint8_t* buffer, uint32_t bufferSize);

private:
    static constexpr uint32_t MAIN_HEADER_SIZE = 30;
    static constexpr uint32_t ADDITIONAL_HEADER_SIZE_STD = 54;
    static constexpr uint32_t ADDITIONAL_HEADER_SIZE_PLUS3 = 55;  // +2A/+3: extra byte for 0x1FFD
};

} // namespace zxspec
