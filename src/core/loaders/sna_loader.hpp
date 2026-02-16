/*
 * sna_loader.hpp - SNA snapshot format loader
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

class Emulator;

class SNALoader {
public:
    static bool load(Emulator& emulator, const uint8_t* data, uint32_t size);

private:
    static bool load48K(Emulator& emulator, const uint8_t* data, uint32_t size);
    static bool load128K(Emulator& emulator, const uint8_t* data, uint32_t size);
    static void loadRegisters(Emulator& emulator, const uint8_t* data);

    static constexpr uint32_t SNA_48K_SIZE = 49179;   // 27 header + 49152 RAM
    static constexpr uint32_t SNA_128K_MIN_SIZE = 49183; // 49179 + 4 extra bytes
    static constexpr uint32_t HEADER_SIZE = 27;
    static constexpr uint32_t RAM_SIZE = 49152;
    static constexpr uint16_t RAM_START = 0x4000;
};

} // namespace zxspec
