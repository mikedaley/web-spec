/*
 * z80_loader.cpp - Z80 snapshot format loader
 *
 * Ported from SpectREMCPP Snapshot.cpp
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80_loader.hpp"
#include "../emulator.hpp"
#include <cstring>

namespace zxspec {

bool Z80Loader::load(Emulator& emulator, const uint8_t* data, uint32_t size)
{
    if (size < MIN_HEADER_SIZE) return false;

    // Version detection: if PC (bytes 6-7) != 0, it's v1
    uint16_t pcFromHeader = data[6] | (data[7] << 8);
    uint16_t version;
    uint16_t pc;
    uint16_t additionalHeaderLength = 0;

    if (pcFromHeader != 0)
    {
        version = 1;
        pc = pcFromHeader;
    }
    else
    {
        // V2 or V3: read additional header length at offset 30
        if (size < 32) return false;
        additionalHeaderLength = data[30] | (data[31] << 8);

        switch (additionalHeaderLength)
        {
        case 23:
            version = 2;
            break;
        case 54:
        case 55:
            version = 3;
            break;
        default:
            return false;
        }

        if (size < 34) return false;
        pc = data[32] | (data[33] << 8);
    }

    Z80* z80 = emulator.z80_.get();

    // Common 30-byte header
    z80->setRegister(Z80::ByteReg::A, data[0]);
    z80->setRegister(Z80::ByteReg::F, data[1]);
    z80->setRegister(Z80::WordReg::BC, data[2] | (data[3] << 8));
    z80->setRegister(Z80::WordReg::HL, data[4] | (data[5] << 8));
    z80->setRegister(Z80::WordReg::PC, pc);
    z80->setRegister(Z80::WordReg::SP, data[8] | (data[9] << 8));
    z80->setRegister(Z80::ByteReg::I, data[10]);

    // R register: low 7 bits from byte 11, bit 7 from byte 12 bit 0
    uint8_t byte12 = data[12];
    // For compatibility, if byte 12 is 255 treat as 1
    if (byte12 == 255) byte12 = 1;

    z80->setRegister(Z80::ByteReg::R, (data[11] & 0x7F) | ((byte12 & 1) << 7));

    // Border colour from byte 12 bits 1-3
    emulator.borderColor_ = (byte12 >> 1) & 0x07;

    // Compressed flag (v1 only)
    bool v1Compressed = (byte12 & 0x20) != 0;

    z80->setRegister(Z80::WordReg::DE, data[13] | (data[14] << 8));
    z80->setRegister(Z80::WordReg::AltBC, data[15] | (data[16] << 8));
    z80->setRegister(Z80::WordReg::AltDE, data[17] | (data[18] << 8));
    z80->setRegister(Z80::WordReg::AltHL, data[19] | (data[20] << 8));

    // Alt A and F are stored as individual bytes
    z80->setRegister(Z80::ByteReg::AltA, data[21]);
    z80->setRegister(Z80::ByteReg::AltF, data[22]);

    z80->setRegister(Z80::WordReg::IY, data[23] | (data[24] << 8));
    z80->setRegister(Z80::WordReg::IX, data[25] | (data[26] << 8));

    z80->setIFF1(data[27] & 1);
    z80->setIFF2(data[28] & 1);
    z80->setIMMode(data[29] & 3);

    // Load memory based on version
    switch (version)
    {
    case 1:
        extractMemoryBlock(emulator, data, size, 0x4000, 30, v1Compressed, RAM_48K);
        break;

    case 2:
    case 3:
    {
        if (size < 35) return false;
        uint8_t hardwareType = data[34];

        // Only accept 48K hardware types
        if (version == 2)
        {
            if (hardwareType != V2_HW_48K && hardwareType != V2_HW_48K_IF1)
                return false;
        }
        else // v3
        {
            if (hardwareType != V3_HW_48K && hardwareType != V3_HW_48K_IF1 && hardwareType != V3_HW_48K_MGT)
                return false;
        }

        uint32_t offset = 32 + additionalHeaderLength;

        while (offset < size)
        {
            if (offset + 3 > size) break;

            uint16_t compressedLength = data[offset] | (data[offset + 1] << 8);
            bool isCompressed = true;

            if (compressedLength == 0xFFFF)
            {
                compressedLength = 0x4000;
                isCompressed = false;
            }

            uint8_t pageId = data[offset + 2];

            // 48K page mapping: page 4→0x8000, page 5→0xC000, page 8→0x4000
            switch (pageId)
            {
            case 4:
                extractMemoryBlock(emulator, data, size, 0x8000, offset + 3, isCompressed, 0x4000);
                break;
            case 5:
                extractMemoryBlock(emulator, data, size, 0xC000, offset + 3, isCompressed, 0x4000);
                break;
            case 8:
                extractMemoryBlock(emulator, data, size, 0x4000, offset + 3, isCompressed, 0x4000);
                break;
            default:
                break;
            }

            offset += compressedLength + 3;
        }
        break;
    }
    }

    return true;
}

void Z80Loader::extractMemoryBlock(Emulator& emulator, const uint8_t* data, uint32_t dataSize,
                                   uint32_t memAddr, uint32_t fileOffset,
                                   bool isCompressed, uint32_t unpackedLength)
{
    uint32_t filePtr = fileOffset;
    uint32_t memoryPtr = memAddr;
    uint32_t memEnd = memAddr + unpackedLength;

    if (!isCompressed)
    {
        while (memoryPtr < memEnd && filePtr < dataSize)
        {
            emulator.memory_[memoryPtr++] = data[filePtr++];
        }
    }
    else
    {
        while (memoryPtr < memEnd && filePtr < dataSize)
        {
            uint8_t byte1 = data[filePtr];

            if (byte1 == 0xED && filePtr + 1 < dataSize)
            {
                uint8_t byte2 = data[filePtr + 1];

                if (byte2 == 0xED)
                {
                    if (filePtr + 3 < dataSize)
                    {
                        uint8_t count = data[filePtr + 2];
                        uint8_t value = data[filePtr + 3];
                        for (uint8_t i = 0; i < count && memoryPtr < memEnd; i++)
                        {
                            emulator.memory_[memoryPtr++] = value;
                        }
                        filePtr += 4;
                        continue;
                    }
                    else
                    {
                        return;
                    }
                }
            }

            emulator.memory_[memoryPtr++] = data[filePtr++];
        }
    }
}

} // namespace zxspec
