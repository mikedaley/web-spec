/*
 * z80_loader.cpp - Z80 snapshot format loader for ZX Spectrum
 *
 * Ported from SpectREMCPP Snapshot.cpp
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80_loader.hpp"
#include "../zx_spectrum.hpp"
#include <cstring>

namespace zxspec {

bool Z80Loader::load(ZXSpectrum& machine, const uint8_t* data, uint32_t size)
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

    Z80* z80 = machine.getCPU();

    // Common 30-byte header
    z80->setRegister(Z80::ByteReg::A, data[0]);
    z80->setRegister(Z80::ByteReg::F, data[1]);
    z80->setRegister(Z80::WordReg::BC, data[2] | (data[3] << 8));
    z80->setRegister(Z80::WordReg::HL, data[4] | (data[5] << 8));
    z80->setRegister(Z80::WordReg::PC, pc);
    z80->setRegister(Z80::WordReg::SP, data[8] | (data[9] << 8));
    z80->setRegister(Z80::ByteReg::I, data[10]);

    uint8_t byte12 = data[12];
    if (byte12 == 255) byte12 = 1;

    z80->setRegister(Z80::ByteReg::R, (data[11] & 0x7F) | ((byte12 & 1) << 7));

    machine.setBorderColor((byte12 >> 1) & 0x07);

    bool v1Compressed = (byte12 & 0x20) != 0;

    z80->setRegister(Z80::WordReg::DE, data[13] | (data[14] << 8));
    z80->setRegister(Z80::WordReg::AltBC, data[15] | (data[16] << 8));
    z80->setRegister(Z80::WordReg::AltDE, data[17] | (data[18] << 8));
    z80->setRegister(Z80::WordReg::AltHL, data[19] | (data[20] << 8));

    z80->setRegister(Z80::ByteReg::AltA, data[21]);
    z80->setRegister(Z80::ByteReg::AltF, data[22]);

    z80->setRegister(Z80::WordReg::IY, data[23] | (data[24] << 8));
    z80->setRegister(Z80::WordReg::IX, data[25] | (data[26] << 8));

    z80->setIFF1(data[27] & 1);
    z80->setIFF2(data[28] & 1);
    z80->setIMMode(data[29] & 3);

    switch (version)
    {
    case 1:
    {
        // Decompress to temp buffer, then write via writeMemory
        uint8_t tempBuf[0xC000];
        extractMemoryBlock(data, size, tempBuf, 30, v1Compressed, RAM_48K);
        for (uint32_t i = 0; i < RAM_48K; i++)
        {
            machine.writeMemory(0x4000 + i, tempBuf[i]);
        }
        break;
    }

    case 2:
    case 3:
    {
        if (size < 35) return false;
        uint8_t hardwareType = data[34];

        bool is48K = false;
        if (version == 2)
        {
            is48K = (hardwareType == V2_HW_48K || hardwareType == V2_HW_48K_IF1);
        }
        else
        {
            is48K = (hardwareType == V3_HW_48K || hardwareType == V3_HW_48K_IF1 || hardwareType == V3_HW_48K_MGT);
        }

        if (!is48K) return false;

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

            // Decompress each page to temp buffer, then write via writeMemory
            uint16_t baseAddr = 0;
            switch (pageId)
            {
            case 8: baseAddr = 0x4000; break;
            case 4: baseAddr = 0x8000; break;
            case 5: baseAddr = 0xC000; break;
            default: break;
            }

            if (baseAddr != 0)
            {
                uint8_t pageBuf[MEM_PAGE_SIZE];
                extractMemoryBlock(data, size, pageBuf, offset + 3, isCompressed, MEM_PAGE_SIZE);
                for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
                {
                    machine.writeMemory(baseAddr + i, pageBuf[i]);
                }
            }

            offset += compressedLength + 3;
        }

        break;
    }
    }

    return true;
}

void Z80Loader::extractMemoryBlock(const uint8_t* data, uint32_t dataSize,
                                   uint8_t* dest, uint32_t fileOffset,
                                   bool isCompressed, uint32_t unpackedLength)
{
    uint32_t filePtr = fileOffset;
    uint32_t destPtr = 0;
    uint32_t destEnd = unpackedLength;

    if (!isCompressed)
    {
        while (destPtr < destEnd && filePtr < dataSize)
        {
            dest[destPtr++] = data[filePtr++];
        }
    }
    else
    {
        while (destPtr < destEnd && filePtr < dataSize)
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
                        for (uint8_t i = 0; i < count && destPtr < destEnd; i++)
                        {
                            dest[destPtr++] = value;
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

            dest[destPtr++] = data[filePtr++];
        }
    }
}

} // namespace zxspec
