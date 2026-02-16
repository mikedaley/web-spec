/*
 * z80_loader.hpp - Z80 snapshot format loader
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

class Emulator;

class Z80Loader {
public:
    static bool load(Emulator& emulator, const uint8_t* data, uint32_t size);

private:
    static void extractMemoryBlock(Emulator& emulator, const uint8_t* data, uint32_t dataSize,
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
    static constexpr uint8_t V3_HW_128K_2 = 12;
};

} // namespace zxspec
