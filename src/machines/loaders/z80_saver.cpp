/*
 * z80_saver.cpp - Z80 v3 snapshot format writer for ZX Spectrum
 *
 * Writes a Z80 v3 format snapshot. Memory pages are stored uncompressed
 * (compressedLength = 0xFFFF) for simplicity and reliability.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80_saver.hpp"
#include "../zx_spectrum.hpp"
#include "../machine_info.hpp"
#include <cstring>

namespace zxspec {

static void writeLE16(uint8_t* dst, uint16_t value)
{
    dst[0] = value & 0xFF;
    dst[1] = (value >> 8) & 0xFF;
}

uint32_t Z80Saver::save(const ZXSpectrum& machine, uint8_t* buffer, uint32_t bufferSize)
{
    const Z80* cpu = machine.getCPU();
    if (!cpu) return 0;

    int machineId = machine.getId();
    bool is128K = machineId != eZXSpectrum48;
    bool isPlus2AOrPlus3 = (machineId == eZXSpectrum128_2A || machineId == eZXSpectrum128_3);

    // +2A/+3 use a 55-byte additional header (extra byte for port 0x1FFD)
    uint32_t additionalHeaderSize = isPlus2AOrPlus3 ? ADDITIONAL_HEADER_SIZE_PLUS3 : ADDITIONAL_HEADER_SIZE_STD;
    uint32_t totalHeaderSize = MAIN_HEADER_SIZE + 2 + additionalHeaderSize;

    // Calculate required size: header + pages
    // Each page: 3 bytes header + 16384 bytes data (uncompressed)
    uint32_t pageCount = is128K ? 8 : 3;
    uint32_t requiredSize = totalHeaderSize + pageCount * (3 + MEM_PAGE_SIZE);
    if (requiredSize > bufferSize) return 0;

    std::memset(buffer, 0, totalHeaderSize);

    // --- Main 30-byte header ---
    uint16_t af = machine.getAF();
    buffer[0] = (af >> 8) & 0xFF;   // A
    buffer[1] = af & 0xFF;          // F

    writeLE16(buffer + 2, machine.getBC());
    writeLE16(buffer + 4, machine.getHL());

    // PC = 0 signals v2/v3 format
    writeLE16(buffer + 6, 0);

    writeLE16(buffer + 8, machine.getSP());

    buffer[10] = machine.getI();

    uint8_t r = machine.getR();
    buffer[11] = r & 0x7F;

    // Byte 12: bit 0 = R bit 7, bits 1-3 = border colour, bit 5 = 0 (uncompressed pages)
    uint8_t byte12 = (r >> 7) & 0x01;
    byte12 |= (machine.getBorderColor() << 1) & 0x0E;
    buffer[12] = byte12;

    writeLE16(buffer + 13, machine.getDE());

    uint16_t altAf = machine.getAltAF();
    uint16_t altBc = machine.getAltBC();
    uint16_t altDe = machine.getAltDE();
    uint16_t altHl = machine.getAltHL();

    writeLE16(buffer + 15, altBc);
    writeLE16(buffer + 17, altDe);
    writeLE16(buffer + 19, altHl);

    buffer[21] = (altAf >> 8) & 0xFF;  // Alt A
    buffer[22] = altAf & 0xFF;          // Alt F

    writeLE16(buffer + 23, machine.getIY());
    writeLE16(buffer + 25, machine.getIX());

    buffer[27] = machine.getIFF1() ? 1 : 0;
    buffer[28] = machine.getIFF2() ? 1 : 0;
    buffer[29] = machine.getIM() & 3;

    // --- Additional header (v3, 54 or 55 bytes) ---
    writeLE16(buffer + 30, additionalHeaderSize);  // Additional header length
    writeLE16(buffer + 32, machine.getPC());          // Actual PC

    // Hardware type: v3 encoding
    uint8_t hwType = 0;
    switch (machineId)
    {
    case eZXSpectrum48:     hwType = 0;  break;
    case eZXSpectrum128:    hwType = 4;  break;
    case eZXSpectrum128_2:  hwType = 12; break;
    case eZXSpectrum128_2A: hwType = 13; break;
    case eZXSpectrum128_3:  hwType = 7;  break;
    default:                hwType = 0;  break;
    }
    buffer[34] = hwType;

    // Paging register (128K+ only)
    buffer[35] = machine.getPagingRegister();

    // Port 0x1FFD for +2A/+3: stored at byte 86 (last byte of 55-byte additional header)
    // This is the standard Z80 v3 location for the +3 paging register
    if (isPlus2AOrPlus3)
    {
        buffer[86] = machine.getPagingRegister1FFD();
    }

    // AY-3-8912 state: bytes 37-52 = registers 0-15, byte 53 = selected register
    const AY3_8912& ay = machine.getAY();
    for (int i = 0; i < 16; i++)
    {
        buffer[37 + i] = ay.getRegister(i);
    }
    buffer[53] = ay.getSelectedRegister();

    // T-states within current frame: standard .z80 v3 encoding
    // Bytes 55-56 = T-state counter mod (tsPerFrame/4), byte 57 bits 0-1 = quarter
    uint32_t currentTs = machine.getTStates();
    uint32_t quarter = currentTs / 17727u;
    uint32_t tsMod = currentTs % 17727u;
    buffer[54] = 0;  // unused in standard format
    buffer[55] = tsMod & 0xFF;
    buffer[56] = (tsMod >> 8) & 0xFF;
    buffer[57] = quarter & 0x03;

    // Frame counter mod 32 (for attribute flash timing): byte 58
    buffer[58] = machine.getFrameCounter() & 0x1F;

    // Bytes 59-85: zeros (unused) - already zeroed by memset

    // --- Memory pages ---
    uint32_t offset = totalHeaderSize;

    if (is128K)
    {
        // 128K: 8 pages, pageId 3-10 = RAM banks 0-7
        for (uint8_t bank = 0; bank < 8; bank++)
        {
            writeLE16(buffer + offset, 0xFFFF);  // Uncompressed marker
            buffer[offset + 2] = bank + 3;        // Page ID
            offset += 3;

            for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
            {
                buffer[offset + i] = machine.readRamBank(bank, static_cast<uint16_t>(i));
            }
            offset += MEM_PAGE_SIZE;
        }
    }
    else
    {
        // 48K: 3 pages using direct RAM access (no contention side effects)
        // Bank 0 in memoryRam_ = 0x4000-0x7FFF (Z80 page ID 8)
        // Bank 1 in memoryRam_ = 0x8000-0xBFFF (Z80 page ID 4)
        // Bank 2 in memoryRam_ = 0xC000-0xFFFF (Z80 page ID 5)
        struct PageDef { uint8_t pageId; uint8_t ramBank; };
        const PageDef pages[] = {
            { 8, 0 },
            { 4, 1 },
            { 5, 2 },
        };

        for (const auto& page : pages)
        {
            writeLE16(buffer + offset, 0xFFFF);  // Uncompressed marker
            buffer[offset + 2] = page.pageId;
            offset += 3;

            for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
            {
                buffer[offset + i] = machine.readRamBank(page.ramBank, static_cast<uint16_t>(i));
            }
            offset += MEM_PAGE_SIZE;
        }
    }

    return offset;
}

} // namespace zxspec
