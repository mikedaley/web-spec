/*
 * tap_loader.hpp - TAP tape image format loader
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../tape_block.hpp"
#include <cstdint>
#include <vector>

namespace zxspec {

class ZXSpectrum;

struct TapeBlockInfo {
    uint8_t  flagByte;      // 0x00 = header, 0xFF = data
    uint8_t  headerType;    // For headers: 0=Program, 1=NumArray, 2=CharArray, 3=Code
    char     filename[11];  // 10 chars + null terminator
    uint16_t dataLength;    // Length of the data in the block (excluding flag/checksum)
};

class TAPLoader {
public:
    static bool load(ZXSpectrum& machine, const uint8_t* data, uint32_t size);

    static bool parseBlockInfo(const std::vector<TapeBlock>& blocks,
                               std::vector<TapeBlockInfo>& info);

private:
    static bool parseBlocks(const uint8_t* data, uint32_t size,
                            std::vector<TapeBlock>& blocks);
    static uint16_t readWord(const uint8_t* data);
};

} // namespace zxspec
