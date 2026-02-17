/*
 * tap_loader.cpp - TAP tape image format loader
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "tap_loader.hpp"
#include "tzx_loader.hpp"
#include "../zx_spectrum.hpp"
#include <cstring>

namespace zxspec {

uint16_t TAPLoader::readWord(const uint8_t* data)
{
    return data[0] | (data[1] << 8);
}

bool TAPLoader::load(ZXSpectrum& machine, const uint8_t* data, uint32_t size)
{
    if (size < 2) return false;

    std::vector<TapeBlock> blocks;
    if (!parseBlocks(data, size, blocks)) return false;
    if (blocks.empty()) return false;

    // Extract block info for UI display
    std::vector<TapeBlockInfo> info;
    parseBlockInfo(blocks, info);

    // Generate pulse sequences reusing TZX standard timing
    std::vector<uint32_t> pulses;
    std::vector<size_t> blockPulseStarts;
    TZXLoader::generatePulses(blocks, pulses, blockPulseStarts);

    // Store in machine (base class members, accessed via friend)
    machine.tapeBlocks_ = std::move(blocks);
    machine.tapeBlockIndex_ = 0;
    machine.tapeActive_ = true;
    machine.tapePulses_ = std::move(pulses);
    machine.tapePulseBlockStarts_ = std::move(blockPulseStarts);
    machine.tapePulseIndex_ = 0;
    machine.tapePulseRemaining_ = 0;
    machine.tapeEarLevel_ = false;
    machine.tapePulseActive_ = false;  // Loaded but NOT playing
    machine.lastTapeReadTs_ = 0;

    // Store block info for UI
    machine.tapeBlockInfo_ = std::move(info);

    machine.installOpcodeCallback();

    return true;
}

bool TAPLoader::parseBlocks(const uint8_t* data, uint32_t size,
                            std::vector<TapeBlock>& blocks)
{
    uint32_t offset = 0;

    while (offset + 2 <= size)
    {
        uint16_t blockLen = readWord(data + offset);
        offset += 2;

        if (blockLen == 0) continue;
        if (offset + blockLen > size) return false;

        TapeBlock tb;
        tb.data.assign(data + offset, data + offset + blockLen);
        tb.pauseMs = 1000;
        tb.hasPilot = true;
        // Standard timing defaults are already set in TapeBlock
        blocks.push_back(std::move(tb));

        offset += blockLen;
    }

    return true;
}

bool TAPLoader::parseBlockInfo(const std::vector<TapeBlock>& blocks,
                               std::vector<TapeBlockInfo>& info)
{
    info.clear();
    info.reserve(blocks.size());

    for (const auto& block : blocks)
    {
        TapeBlockInfo bi{};

        if (block.data.empty())
        {
            info.push_back(bi);
            continue;
        }

        bi.flagByte = block.data[0];
        bi.dataLength = static_cast<uint16_t>(block.data.size() - 2); // minus flag and checksum

        // If this is a header block (flag byte 0x00) and has enough data
        if (bi.flagByte == 0x00 && block.data.size() >= 18)
        {
            bi.headerType = block.data[1];
            // Copy filename (bytes 2-11)
            std::memcpy(bi.filename, &block.data[2], 10);
            bi.filename[10] = '\0';
        }
        else
        {
            bi.headerType = 0xFF; // Not a header
            bi.filename[0] = '\0';
        }

        info.push_back(bi);
    }

    return true;
}

} // namespace zxspec
