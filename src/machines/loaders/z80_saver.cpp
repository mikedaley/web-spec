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

    bool is128K = machine.getId() == 1;

    // Calculate required size: header + pages
    // Each page: 3 bytes header + 16384 bytes data (uncompressed)
    uint32_t pageCount = is128K ? 8 : 3;
    uint32_t requiredSize = TOTAL_HEADER_SIZE + pageCount * (3 + MEM_PAGE_SIZE);
    if (requiredSize > bufferSize) return 0;

    std::memset(buffer, 0, TOTAL_HEADER_SIZE);

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

    // --- Additional header (v3, 54 bytes) ---
    writeLE16(buffer + 30, ADDITIONAL_HEADER_SIZE);  // Additional header length
    writeLE16(buffer + 32, machine.getPC());          // Actual PC

    // Hardware type: v3 encoding
    buffer[34] = is128K ? 4 : 0;

    // Paging register (128K only)
    buffer[35] = machine.getPagingRegister();

    // Bytes 36-85: zeros (unused v3 fields) - already zeroed by memset

    // --- Memory pages ---
    uint32_t offset = TOTAL_HEADER_SIZE;

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
        // 48K: 3 pages
        // Page 8 = 0x4000-0x7FFF (RAM bank 5 equivalent)
        struct PageDef { uint8_t pageId; uint16_t baseAddr; };
        const PageDef pages[] = {
            { 8, 0x4000 },
            { 4, 0x8000 },
            { 5, 0xC000 },
        };

        for (const auto& page : pages)
        {
            writeLE16(buffer + offset, 0xFFFF);  // Uncompressed marker
            buffer[offset + 2] = page.pageId;
            offset += 3;

            for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
            {
                buffer[offset + i] = machine.readMemory(page.baseAddr + i);
            }
            offset += MEM_PAGE_SIZE;
        }
    }

    return offset;
}

} // namespace zxspec
