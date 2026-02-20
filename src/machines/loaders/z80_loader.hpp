/*
 * z80_loader.hpp - Z80 snapshot format loader for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

class ZXSpectrum;

class Z80Loader {
public:
    static bool load(ZXSpectrum& machine, const uint8_t* data, uint32_t size);

private:
    static void extractMemoryBlock(const uint8_t* data, uint32_t dataSize,
                                   uint8_t* dest, uint32_t fileOffset,
                                   bool isCompressed, uint32_t unpackedLength);

    static constexpr uint32_t MIN_HEADER_SIZE = 30;
    static constexpr uint32_t RAM_48K = 0xC000;  // 48KB

    // V2/V3 48K hardware types
    static constexpr uint8_t V2_HW_48K = 0;
    static constexpr uint8_t V2_HW_48K_IF1 = 1;
    static constexpr uint8_t V3_HW_48K = 0;
    static constexpr uint8_t V3_HW_48K_IF1 = 1;
    static constexpr uint8_t V3_HW_48K_MGT = 3;

    // V2/V3 128K hardware types
    static constexpr uint8_t V2_HW_128K = 3;
    static constexpr uint8_t V2_HW_128K_IF1 = 4;
    static constexpr uint8_t V3_HW_128K = 4;
    static constexpr uint8_t V3_HW_128K_IF1 = 5;
    static constexpr uint8_t V3_HW_128K_MGT = 6;

    // V3 additional 128K-compatible hardware types
    static constexpr uint8_t V3_HW_PLUS3 = 7;
    static constexpr uint8_t V3_HW_PLUS3_ALT = 8;
    static constexpr uint8_t V3_HW_PLUS2 = 12;
    static constexpr uint8_t V3_HW_PLUS2A = 13;
};

} // namespace zxspec
