/*
 * tzx_loader.hpp - TZX tape image format loader (ROM trap + pulse playback)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <vector>

namespace zxspec {

class Emulator;

class TZXLoader {
public:
    struct TapeBlock {
        std::vector<uint8_t> data;
        uint16_t pilotPulse = 2168;
        uint16_t sync1 = 667;
        uint16_t sync2 = 735;
        uint16_t zeroPulse = 855;
        uint16_t onePulse = 1710;
        uint16_t pilotCount = 0;  // 0 = auto based on flag byte
        uint8_t usedBitsLastByte = 8;
        uint16_t pauseMs = 1000;
        bool hasPilot = true;     // false for pure data blocks
    };

    static bool load(Emulator& emulator, const uint8_t* data, uint32_t size);
    static void generatePulses(const std::vector<TapeBlock>& blocks,
                               std::vector<uint32_t>& pulses,
                               std::vector<size_t>& blockPulseStarts);

private:
    static bool parseBlocks(const uint8_t* data, uint32_t size, std::vector<TapeBlock>& blocks);
    static uint16_t readWord(const uint8_t* data);
    static uint32_t readTriple(const uint8_t* data);

    static constexpr uint8_t TZX_BLOCK_STANDARD    = 0x10;
    static constexpr uint8_t TZX_BLOCK_TURBO       = 0x11;
    static constexpr uint8_t TZX_BLOCK_PURE_TONE   = 0x12;
    static constexpr uint8_t TZX_BLOCK_PULSE_SEQ   = 0x13;
    static constexpr uint8_t TZX_BLOCK_PURE_DATA   = 0x14;
    static constexpr uint8_t TZX_BLOCK_DIRECT_REC  = 0x15;
    static constexpr uint8_t TZX_BLOCK_CSW         = 0x18;
    static constexpr uint8_t TZX_BLOCK_GENERALIZED = 0x19;
    static constexpr uint8_t TZX_BLOCK_PAUSE       = 0x20;
    static constexpr uint8_t TZX_BLOCK_GROUP_START = 0x21;
    static constexpr uint8_t TZX_BLOCK_GROUP_END   = 0x22;
    static constexpr uint8_t TZX_BLOCK_JUMP        = 0x23;
    static constexpr uint8_t TZX_BLOCK_LOOP_START  = 0x24;
    static constexpr uint8_t TZX_BLOCK_LOOP_END    = 0x25;
    static constexpr uint8_t TZX_BLOCK_CALL_SEQ    = 0x26;
    static constexpr uint8_t TZX_BLOCK_RETURN      = 0x27;
    static constexpr uint8_t TZX_BLOCK_SELECT      = 0x28;
    static constexpr uint8_t TZX_BLOCK_STOP_48K    = 0x2A;
    static constexpr uint8_t TZX_BLOCK_SET_SIGNAL  = 0x2B;
    static constexpr uint8_t TZX_BLOCK_TEXT_DESC   = 0x30;
    static constexpr uint8_t TZX_BLOCK_MESSAGE     = 0x31;
    static constexpr uint8_t TZX_BLOCK_ARCHIVE     = 0x32;
    static constexpr uint8_t TZX_BLOCK_HW_TYPE     = 0x33;
    static constexpr uint8_t TZX_BLOCK_CUSTOM      = 0x35;
    static constexpr uint8_t TZX_BLOCK_GLUE        = 0x5A;

    static constexpr uint32_t TZX_HEADER_SIZE = 10;
};

} // namespace zxspec
