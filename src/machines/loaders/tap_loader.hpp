/*
 * tap_loader.hpp - TAP tape image format loader
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../tape_block.hpp"
#include <cstdint>
#include <string>
#include <vector>

namespace zxspec {

class ZXSpectrum;

struct TapeBlockInfo {
    uint8_t  flagByte;      // 0x00 = header, 0xFF = data
    uint8_t  headerType;    // For headers: 0=Program, 1=NumArray, 2=CharArray, 3=Code
    char     filename[11];  // 10 chars + null terminator
    uint16_t dataLength;    // Length of the data in the block (excluding flag/checksum)
    uint16_t param1;        // Program: autostart line; Code: start address
    uint16_t param2;        // Program: variable area offset; Code: unused (32768)
};

struct TapeMetadata {
    std::string format;
    uint8_t versionMajor = 0;
    uint8_t versionMinor = 0;
    uint32_t fileSize = 0;
    uint16_t blockCount = 0;
    uint32_t totalDataBytes = 0;
    // TZX Archive Info (block 0x32) fields
    std::string title;
    std::string publisher;
    std::string author;
    std::string year;
    std::string language;
    std::string type;
    std::string price;
    std::string protection;
    std::string origin;
    std::string comment;
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
