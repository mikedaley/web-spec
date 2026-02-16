/*
 * tzx_loader.cpp - TZX tape image format loader (ROM trap + pulse playback)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "tzx_loader.hpp"
#include "../emulator.hpp"
#include <cstring>

namespace zxspec {

uint16_t TZXLoader::readWord(const uint8_t* data)
{
    return data[0] | (data[1] << 8);
}

uint32_t TZXLoader::readTriple(const uint8_t* data)
{
    return data[0] | (data[1] << 8) | (data[2] << 16);
}

bool TZXLoader::load(Emulator& emulator, const uint8_t* data, uint32_t size)
{
    if (size < TZX_HEADER_SIZE) return false;
    if (std::memcmp(data, "ZXTape!\x1A", 8) != 0) return false;

    std::vector<TapeBlock> blocks;
    if (!parseBlocks(data, size, blocks)) return false;
    if (blocks.empty()) return false;

    // Generate pulse sequences for EAR bit playback
    std::vector<uint32_t> pulses;
    std::vector<size_t> blockPulseStarts;
    generatePulses(blocks, pulses, blockPulseStarts);

    // Store in emulator
    emulator.tapeBlocks_ = std::move(blocks);
    emulator.tapeBlockIndex_ = 0;
    emulator.tapeActive_ = true;
    emulator.tapePulses_ = std::move(pulses);
    emulator.tapePulseBlockStarts_ = std::move(blockPulseStarts);
    emulator.tapePulseIndex_ = 0;
    emulator.tapePulseRemaining_ = 0;
    emulator.tapeEarLevel_ = false;
    emulator.tapePulseActive_ = true;
    emulator.lastTapeReadTs_ = 0;

    emulator.installOpcodeCallback();

    return true;
}

void TZXLoader::generatePulses(const std::vector<TapeBlock>& blocks,
                               std::vector<uint32_t>& pulses,
                               std::vector<size_t>& blockPulseStarts)
{
    for (size_t bi = 0; bi < blocks.size(); bi++)
    {
        const auto& block = blocks[bi];
        blockPulseStarts.push_back(pulses.size());

        if (block.data.empty()) continue;

        // Pilot tone
        if (block.hasPilot)
        {
            uint16_t pilotCount = block.pilotCount;
            if (pilotCount == 0)
            {
                // Auto: header blocks (flag < 128) get long pilot, data blocks get short
                pilotCount = (block.data[0] < 128) ? 8063 : 3223;
            }
            for (uint16_t i = 0; i < pilotCount; i++)
                pulses.push_back(block.pilotPulse);

            // Sync pulses
            pulses.push_back(block.sync1);
            pulses.push_back(block.sync2);
        }

        // Data bits
        size_t totalBytes = block.data.size();
        for (size_t b = 0; b < totalBytes; b++)
        {
            uint8_t byte = block.data[b];
            int bits = (b == totalBytes - 1) ? block.usedBitsLastByte : 8;
            for (int bit = 7; bit >= 8 - bits; bit--)
            {
                uint32_t pulse = (byte & (1 << bit)) ? block.onePulse : block.zeroPulse;
                pulses.push_back(pulse);
                pulses.push_back(pulse);
            }
        }

        // Pause after block (convert ms to T-states: 3500 T-states per ms)
        if (block.pauseMs > 0)
        {
            uint32_t pauseTs = static_cast<uint32_t>(block.pauseMs) * 3500;
            pulses.push_back(pauseTs);
        }
    }

    // Record the end sentinel
    blockPulseStarts.push_back(pulses.size());
}

bool TZXLoader::parseBlocks(const uint8_t* data, uint32_t size, std::vector<TapeBlock>& blocks)
{
    uint32_t offset = TZX_HEADER_SIZE;

    while (offset < size)
    {
        uint8_t blockType = data[offset++];

        switch (blockType)
        {
            case TZX_BLOCK_STANDARD:  // 0x10
            {
                if (offset + 4 > size) return false;
                uint16_t pauseMs = readWord(data + offset);
                uint16_t dataLen = readWord(data + offset + 2);
                offset += 4;
                if (offset + dataLen > size) return false;

                TapeBlock tb;
                tb.data.assign(data + offset, data + offset + dataLen);
                tb.pauseMs = pauseMs;
                tb.hasPilot = true;
                // Standard timings (defaults)
                blocks.push_back(std::move(tb));
                offset += dataLen;
                break;
            }

            case TZX_BLOCK_TURBO:  // 0x11
            {
                if (offset + 0x12 > size) return false;

                TapeBlock tb;
                tb.pilotPulse = readWord(data + offset + 0x00);
                tb.sync1      = readWord(data + offset + 0x02);
                tb.sync2      = readWord(data + offset + 0x04);
                tb.zeroPulse  = readWord(data + offset + 0x06);
                tb.onePulse   = readWord(data + offset + 0x08);
                tb.pilotCount = readWord(data + offset + 0x0A);
                tb.usedBitsLastByte = data[offset + 0x0C];
                tb.pauseMs    = readWord(data + offset + 0x0D);
                tb.hasPilot   = true;

                uint32_t dataLen = readTriple(data + offset + 0x0F);
                offset += 0x12;
                if (offset + dataLen > size) return false;

                tb.data.assign(data + offset, data + offset + dataLen);
                blocks.push_back(std::move(tb));
                offset += dataLen;
                break;
            }

            case TZX_BLOCK_PURE_TONE:  // 0x12
                if (offset + 4 > size) return false;
                offset += 4;
                break;

            case TZX_BLOCK_PULSE_SEQ:  // 0x13
            {
                if (offset + 1 > size) return false;
                uint8_t n = data[offset];
                offset += 1 + n * 2;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_PURE_DATA:  // 0x14
            {
                if (offset + 0x0A > size) return false;

                TapeBlock tb;
                tb.zeroPulse  = readWord(data + offset + 0x00);
                tb.onePulse   = readWord(data + offset + 0x02);
                tb.usedBitsLastByte = data[offset + 0x04];
                tb.pauseMs    = readWord(data + offset + 0x05);
                tb.hasPilot   = false;

                uint32_t dataLen = readTriple(data + offset + 0x07);
                offset += 0x0A;
                if (offset + dataLen > size) return false;

                tb.data.assign(data + offset, data + offset + dataLen);
                blocks.push_back(std::move(tb));
                offset += dataLen;
                break;
            }

            case TZX_BLOCK_DIRECT_REC:  // 0x15
            {
                if (offset + 8 > size) return false;
                uint32_t dataLen = readTriple(data + offset + 0x05);
                offset += 0x08 + dataLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_CSW:  // 0x18
            case TZX_BLOCK_GENERALIZED:  // 0x19
            {
                if (offset + 4 > size) return false;
                uint32_t blockLen = data[offset] | (data[offset+1] << 8) |
                                    (data[offset+2] << 16) | (data[offset+3] << 24);
                offset += 4 + blockLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_PAUSE:  // 0x20
                if (offset + 2 > size) return false;
                offset += 2;
                break;

            case TZX_BLOCK_GROUP_START:  // 0x21
            {
                if (offset + 1 > size) return false;
                uint8_t len = data[offset];
                offset += 1 + len;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_GROUP_END:  // 0x22
            case TZX_BLOCK_LOOP_END:   // 0x25
            case TZX_BLOCK_RETURN:     // 0x27
                break;

            case TZX_BLOCK_JUMP:       // 0x23
            case TZX_BLOCK_LOOP_START: // 0x24
                if (offset + 2 > size) return false;
                offset += 2;
                break;

            case TZX_BLOCK_CALL_SEQ:  // 0x26
            {
                if (offset + 2 > size) return false;
                uint16_t n = readWord(data + offset);
                offset += 2 + n * 2;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_SELECT:  // 0x28
            {
                if (offset + 2 > size) return false;
                uint16_t blockLen = readWord(data + offset);
                offset += 2 + blockLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_STOP_48K:  // 0x2A
                if (offset + 4 > size) return false;
                offset += 4;
                break;

            case TZX_BLOCK_SET_SIGNAL:  // 0x2B
                if (offset + 5 > size) return false;
                offset += 5;
                break;

            case TZX_BLOCK_TEXT_DESC:  // 0x30
            {
                if (offset + 1 > size) return false;
                uint8_t len = data[offset];
                offset += 1 + len;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_MESSAGE:  // 0x31
            {
                if (offset + 2 > size) return false;
                uint8_t len = data[offset + 1];
                offset += 2 + len;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_ARCHIVE:  // 0x32
            {
                if (offset + 2 > size) return false;
                uint16_t blockLen = readWord(data + offset);
                offset += 2 + blockLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_HW_TYPE:  // 0x33
            {
                if (offset + 1 > size) return false;
                uint8_t n = data[offset];
                offset += 1 + n * 3;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_CUSTOM:  // 0x35
            {
                if (offset + 0x14 > size) return false;
                uint32_t blockLen = data[offset+0x10] | (data[offset+0x11] << 8) |
                                    (data[offset+0x12] << 16) | (data[offset+0x13] << 24);
                offset += 0x14 + blockLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_GLUE:  // 0x5A
                if (offset + 9 > size) return false;
                offset += 9;
                break;

            default:
                return true;
        }
    }

    return true;
}

} // namespace zxspec
