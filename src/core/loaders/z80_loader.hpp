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
    // Load a Z80 snapshot (v1/v2/v3) into the emulator.
    // Only 48K snapshots are supported; returns false for 128K or invalid data.
    static bool load(Emulator& emulator, const uint8_t* data, uint32_t size);

private:
    static void extractMemoryBlock(Emulator& emulator, const uint8_t* data, uint32_t dataSize,
                                   uint32_t memAddr, uint32_t fileOffset,
                                   bool isCompressed, uint32_t unpackedLength);

    // Minimum size: 30-byte header
    static constexpr uint32_t MIN_HEADER_SIZE = 30;
    static constexpr uint32_t RAM_48K = 0xC000;  // 48KB

    // V2/V3 48K hardware types
    static constexpr uint8_t V2_HW_48K = 0;
    static constexpr uint8_t V2_HW_48K_IF1 = 1;
    static constexpr uint8_t V3_HW_48K = 0;
    static constexpr uint8_t V3_HW_48K_IF1 = 1;
    static constexpr uint8_t V3_HW_48K_MGT = 3;
};

} // namespace zxspec
