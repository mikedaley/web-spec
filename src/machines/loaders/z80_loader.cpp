/*
 * z80_loader.cpp - Z80 snapshot format loader for ZX Spectrum
 *
 * Ported from SpectREMCPP Snapshot.cpp
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80_loader.hpp"
#include "sna_loader.hpp"
#include "../zx_spectrum.hpp"
#include "../ay.hpp"
#include <cstring>
#include <vector>

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
        std::vector<uint8_t> tempBuf(RAM_48K);
        extractMemoryBlock(data, size, tempBuf.data(), 30, v1Compressed, RAM_48K);
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
        bool is128K = false;
        if (version == 2)
        {
            is48K = (hardwareType == V2_HW_48K || hardwareType == V2_HW_48K_IF1);
            is128K = (hardwareType == V2_HW_128K || hardwareType == V2_HW_128K_IF1);
        }
        else
        {
            is48K = (hardwareType == V3_HW_48K || hardwareType == V3_HW_48K_IF1 || hardwareType == V3_HW_48K_MGT);
            is128K = (hardwareType == V3_HW_128K || hardwareType == V3_HW_128K_IF1 || hardwareType == V3_HW_128K_MGT
                    || hardwareType == V3_HW_PLUS3 || hardwareType == V3_HW_PLUS3_ALT
                    || hardwareType == V3_HW_PLUS2 || hardwareType == V3_HW_PLUS2A);
        }

        if (!is48K && !is128K) return false;

        // Restore port 0x7FFD for 128K snapshots (byte 35 in header)
        if (is128K && size > 35)
        {
            machine.setPagingRegister(data[35]);
        }

        // Restore port 0x1FFD for +2A/+3 snapshots.
        // In the Z80 v3 format with a 55-byte additional header, the 0x1FFD
        // value is stored in the last byte of the additional header (byte 86),
        // NOT byte 36. Byte 36 is the IF1 paging register in the standard spec.
        // For 54-byte headers, fall back to byte 36 for compatibility.
        bool isPlus2AOrPlus3 = (version == 3) &&
            (hardwareType == V3_HW_PLUS2A || hardwareType == V3_HW_PLUS3 || hardwareType == V3_HW_PLUS3_ALT);
        if (isPlus2AOrPlus3)
        {
            uint8_t port1FFD = 0;
            if (additionalHeaderLength == 55 && size > 86)
            {
                port1FFD = data[86];
            }
            else if (size > 36)
            {
                port1FFD = data[36];
            }
            machine.setPagingRegister1FFD(port1FFD);
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

            if (is48K)
            {
                // 48K: page IDs map to fixed addresses
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
                        machine.writeMemory(baseAddr + i, pageBuf[i]);
                }
            }
            else
            {
                // 128K: page IDs 3-10 map to RAM banks 0-7
                if (pageId >= 3 && pageId <= 10)
                {
                    uint8_t bank = pageId - 3;
                    uint8_t pageBuf[MEM_PAGE_SIZE];
                    extractMemoryBlock(data, size, pageBuf, offset + 3, isCompressed, MEM_PAGE_SIZE);
                    SNALoader::loadRamBank(machine, bank, pageBuf);
                }
            }

            offset += compressedLength + 3;
        }

        // Restore AY-3-8912 state from bytes 37-53 (our extension to unused v3 header area)
        // Only restore if at least one AY register is non-zero (external Z80 files leave these as 0)
        if (version == 3 && size > 53)
        {
            bool hasAYData = false;
            for (int i = 0; i < 16; i++)
            {
                if (data[37 + i] != 0) { hasAYData = true; break; }
            }
            if (hasAYData)
            {
                machine.getAY().restoreRegisters(data + 37, data[53]);
            }
        }

        // Restore T-states within frame from bytes 55-57.
        // Standard .z80 v3 format: bytes 55-56 = T-state counter mod
        // (tsPerFrame/4), byte 57 bits 0-1 = which quarter of the frame.
        // Our own saved snapshots store a full LE32 at bytes 54-57, but
        // valid values are always < tsPerFrame (~70000), so the same
        // decode works for both: we reconstruct from the standard fields
        // and ignore byte 54 (which in standard files is the last AY
        // register, and in ours is the low byte of a small LE32).
        if (version == 3 && size > 57)
        {
            uint16_t tsMod = data[55] | (data[56] << 8);
            uint8_t  tsQuarter = data[57] & 0x03;
            // tsPerFrame/4 ≈ 17472 (48K) or 17727 (128K); use 17727 as
            // a safe upper bound — clamping below handles any overshoot.
            uint32_t savedTs = static_cast<uint32_t>(tsQuarter) * 17727u + tsMod;
            // Clamp to a valid frame position (max tsPerFrame for 128K = 70908)
            if (savedTs > 0 && savedTs < 71000)
            {
                machine.getCPU()->setTStates(savedTs);
            }
        }

        // Restore frame counter mod 32 from byte 58 (attribute flash timing)
        if (version == 3 && size > 58 && data[58] != 0)
        {
            machine.setFrameCounter(data[58] & 0x1F);
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
