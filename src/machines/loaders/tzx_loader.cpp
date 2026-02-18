/*
 * tzx_loader.cpp - TZX tape image format loader (ROM trap + pulse playback)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "tzx_loader.hpp"
#include "../zx_spectrum.hpp"
#include <cstring>
#include <string>

namespace zxspec {

uint16_t TZXLoader::readWord(const uint8_t* data)
{
    return data[0] | (data[1] << 8);
}

uint32_t TZXLoader::readTriple(const uint8_t* data)
{
    return data[0] | (data[1] << 8) | (data[2] << 16);
}

bool TZXLoader::load(ZXSpectrum& machine, const uint8_t* data, uint32_t size)
{
    if (size < TZX_HEADER_SIZE) return false;
    if (std::memcmp(data, "ZXTape!\x1A", 8) != 0) return false;

    TapeMetadata metadata;
    metadata.format = "TZX";
    metadata.fileSize = size;
    metadata.versionMajor = data[8];
    metadata.versionMinor = data[9];

    std::vector<TapeBlock> blocks;
    if (!parseBlocks(data, size, blocks, metadata)) return false;
    if (blocks.empty()) return false;

    metadata.blockCount = static_cast<uint16_t>(blocks.size());
    metadata.totalDataBytes = 0;
    for (const auto& block : blocks) {
        metadata.totalDataBytes += static_cast<uint32_t>(block.data.size());
    }

    // Generate pulse sequences for EAR bit playback
    std::vector<uint32_t> pulses;
    std::vector<size_t> blockPulseStarts;
    generatePulses(blocks, pulses, blockPulseStarts);

    // Store in machine (base class members, accessed via friend)
    machine.tapeBlocks_ = std::move(blocks);
    machine.tapeBlockIndex_ = 0;
    machine.tapeActive_ = true;
    machine.tapePulses_ = std::move(pulses);
    machine.tapePulseBlockStarts_ = std::move(blockPulseStarts);
    machine.tapePulseIndex_ = 0;
    machine.tapePulseRemaining_ = 0;
    machine.tapeEarLevel_ = false;
    machine.tapePulseActive_ = true;
    machine.lastTapeReadTs_ = 0;
    machine.tapeMetadata_ = std::move(metadata);

    machine.installOpcodeCallback();

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
                pilotCount = (block.data[0] < 128) ? 8063 : 3223;
            }
            for (uint16_t i = 0; i < pilotCount; i++)
                pulses.push_back(block.pilotPulse);

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

        // Pause after block
        if (block.pauseMs > 0)
        {
            uint32_t pauseTs = static_cast<uint32_t>(block.pauseMs) * 3500;
            pulses.push_back(pauseTs);
        }
    }

    blockPulseStarts.push_back(pulses.size());
}

bool TZXLoader::parseBlocks(const uint8_t* data, uint32_t size,
                            std::vector<TapeBlock>& blocks, TapeMetadata& metadata)
{
    uint32_t offset = TZX_HEADER_SIZE;

    while (offset < size)
    {
        uint8_t blockType = data[offset++];

        switch (blockType)
        {
            case TZX_BLOCK_STANDARD:
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
                blocks.push_back(std::move(tb));
                offset += dataLen;
                break;
            }

            case TZX_BLOCK_TURBO:
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

            case TZX_BLOCK_PURE_TONE:
                if (offset + 4 > size) return false;
                offset += 4;
                break;

            case TZX_BLOCK_PULSE_SEQ:
            {
                if (offset + 1 > size) return false;
                uint8_t n = data[offset];
                offset += 1 + n * 2;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_PURE_DATA:
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

            case TZX_BLOCK_DIRECT_REC:
            {
                if (offset + 8 > size) return false;
                uint32_t dataLen = readTriple(data + offset + 0x05);
                offset += 0x08 + dataLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_CSW:
            case TZX_BLOCK_GENERALIZED:
            {
                if (offset + 4 > size) return false;
                uint32_t blockLen = data[offset] | (data[offset+1] << 8) |
                                    (data[offset+2] << 16) | (data[offset+3] << 24);
                offset += 4 + blockLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_PAUSE:
                if (offset + 2 > size) return false;
                offset += 2;
                break;

            case TZX_BLOCK_GROUP_START:
            {
                if (offset + 1 > size) return false;
                uint8_t len = data[offset];
                offset += 1 + len;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_GROUP_END:
            case TZX_BLOCK_LOOP_END:
            case TZX_BLOCK_RETURN:
                break;

            case TZX_BLOCK_JUMP:
            case TZX_BLOCK_LOOP_START:
                if (offset + 2 > size) return false;
                offset += 2;
                break;

            case TZX_BLOCK_CALL_SEQ:
            {
                if (offset + 2 > size) return false;
                uint16_t n = readWord(data + offset);
                offset += 2 + n * 2;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_SELECT:
            {
                if (offset + 2 > size) return false;
                uint16_t blockLen = readWord(data + offset);
                offset += 2 + blockLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_STOP_48K:
                if (offset + 4 > size) return false;
                offset += 4;
                break;

            case TZX_BLOCK_SET_SIGNAL:
                if (offset + 5 > size) return false;
                offset += 5;
                break;

            case TZX_BLOCK_TEXT_DESC:
            {
                if (offset + 1 > size) return false;
                uint8_t len = data[offset];
                offset += 1;
                if (offset + len > size) return false;
                std::string text(reinterpret_cast<const char*>(data + offset), len);
                if (!metadata.comment.empty()) {
                    metadata.comment += "\n";
                }
                metadata.comment += text;
                offset += len;
                break;
            }

            case TZX_BLOCK_MESSAGE:
            {
                if (offset + 2 > size) return false;
                uint8_t len = data[offset + 1];
                offset += 2 + len;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_ARCHIVE:
            {
                if (offset + 2 > size) return false;
                uint16_t blockLen = readWord(data + offset);
                uint32_t blockEnd = offset + 2 + blockLen;
                if (blockEnd > size) return false;
                offset += 2;
                if (offset < blockEnd) {
                    uint8_t numStrings = data[offset++];
                    for (uint8_t s = 0; s < numStrings && offset + 2 <= blockEnd; s++) {
                        uint8_t typeId = data[offset++];
                        uint8_t strLen = data[offset++];
                        if (offset + strLen > blockEnd) break;
                        std::string text(reinterpret_cast<const char*>(data + offset), strLen);
                        offset += strLen;
                        switch (typeId) {
                            case 0x00: metadata.title = text; break;
                            case 0x01: metadata.publisher = text; break;
                            case 0x02: metadata.author = text; break;
                            case 0x03: metadata.year = text; break;
                            case 0x04: metadata.language = text; break;
                            case 0x05: metadata.type = text; break;
                            case 0x06: metadata.price = text; break;
                            case 0x07: metadata.protection = text; break;
                            case 0x08: metadata.origin = text; break;
                            case 0xFF:
                                if (!metadata.comment.empty()) metadata.comment += "\n";
                                metadata.comment += text;
                                break;
                        }
                    }
                }
                offset = blockEnd;
                break;
            }

            case TZX_BLOCK_HW_TYPE:
            {
                if (offset + 1 > size) return false;
                uint8_t n = data[offset];
                offset += 1 + n * 3;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_CUSTOM:
            {
                if (offset + 0x14 > size) return false;
                uint32_t blockLen = data[offset+0x10] | (data[offset+0x11] << 8) |
                                    (data[offset+0x12] << 16) | (data[offset+0x13] << 24);
                offset += 0x14 + blockLen;
                if (offset > size) return false;
                break;
            }

            case TZX_BLOCK_GLUE:
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
