/*
 * tape_block.hpp - Tape block data structure shared across machines
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <vector>

namespace zxspec {

struct TapeBlock {
    std::vector<uint8_t> data;
    uint16_t pilotPulse = 2168;
    uint16_t sync1 = 667;
    uint16_t sync2 = 735;
    uint16_t zeroPulse = 855;
    uint16_t onePulse = 1710;
    uint16_t pilotCount = 0;       // 0 = auto based on flag byte
    uint8_t  usedBitsLastByte = 8;
    uint16_t pauseMs = 1000;
    bool     hasPilot = true;      // false for pure data blocks
};

} // namespace zxspec
