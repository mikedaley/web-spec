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
    // Load a 48K SNA snapshot into the emulator.
    // Returns true on success, false if the data is invalid.
    static bool load(Emulator& emulator, const uint8_t* data, uint32_t size);

private:
    static constexpr uint32_t SNA_48K_SIZE = 49179;  // 27 header + 49152 RAM
    static constexpr uint32_t HEADER_SIZE = 27;
    static constexpr uint32_t RAM_SIZE = 49152;
    static constexpr uint16_t RAM_START = 0x4000;
};

} // namespace zxspec
