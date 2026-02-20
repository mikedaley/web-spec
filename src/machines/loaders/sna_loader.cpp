/*
 * sna_loader.cpp - SNA snapshot format loader for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sna_loader.hpp"
#include "../zx_spectrum.hpp"

namespace zxspec {

bool SNALoader::load(ZXSpectrum& machine, const uint8_t* data, uint32_t size)
{
    if (size == SNA_48K_SIZE)
    {
        return load48K(machine, data, size);
    }
    else if (size == SNA_128K_SIZE)
    {
        return load128K(machine, data, size);
    }
    return false;
}

bool SNALoader::load48K(ZXSpectrum& machine, const uint8_t* data, uint32_t /*size*/)
{
    loadRegisters(machine, data);

    // Write 48KB RAM via writeMemory (routes through variant's virtual method)
    for (uint32_t i = 0; i < RAM_SIZE; i++)
    {
        machine.writeMemory(RAM_START + i, data[HEADER_SIZE + i]);
    }

    // Recover PC from stack
    Z80* z80 = machine.getCPU();
    uint16_t sp = z80->getRegister(Z80::WordReg::SP);
    uint16_t pc = machine.readMemory(sp) | (machine.readMemory(sp + 1) << 8);
    z80->setRegister(Z80::WordReg::PC, pc);
    sp += 2;
    z80->setRegister(Z80::WordReg::SP, sp);

    return true;
}

bool SNALoader::load128K(ZXSpectrum& machine, const uint8_t* data, uint32_t /*size*/)
{
    loadRegisters(machine, data);

    // The 128K SNA format stores the 48KB visible RAM (banks 5, 2, and the
    // currently paged bank) at offset 27, just like the 48K format.
    // After that comes: PC (2 bytes), port 0x7FFD (1 byte), TR-DOS flag (1 byte),
    // then the remaining 5 RAM banks (5 * 16384 bytes).

    // First, read the paging register to know which bank is at slot 3
    uint32_t extraOffset = HEADER_SIZE + RAM_SIZE;
    uint16_t pc128 = data[extraOffset] | (data[extraOffset + 1] << 8);
    uint8_t pagingReg = data[extraOffset + 2];
    // data[extraOffset + 3] is TR-DOS flag (ignored)

    uint8_t currentBank = pagingReg & 0x07;

    // Write banks 5, 2, and current bank from the initial 48KB
    const uint8_t* ramData = data + HEADER_SIZE;

    // Bank 5 (slot 1, 0x4000-0x7FFF)
    for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
    {
        machine.writeRamBank(5, i, ramData[i]);
    }
    // Bank 2 (slot 2, 0x8000-0xBFFF)
    for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
    {
        machine.writeRamBank(2, i, ramData[MEM_PAGE_SIZE + i]);
    }
    // Current bank (slot 3, 0xC000-0xFFFF)
    for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
    {
        machine.writeRamBank(currentBank, i, ramData[2 * MEM_PAGE_SIZE + i]);
    }

    // Now load the remaining 5 banks from offset extraOffset + 4
    // Banks are stored in ascending order 0-7, skipping 5, 2, and currentBank
    uint32_t bankOffset = extraOffset + 4;
    for (uint8_t bank = 0; bank < 8; bank++)
    {
        if (bank == 5 || bank == 2 || bank == currentBank) continue;

        for (uint32_t i = 0; i < MEM_PAGE_SIZE; i++)
        {
            machine.writeRamBank(bank, i, data[bankOffset + i]);
        }
        bankOffset += MEM_PAGE_SIZE;
    }

    // Set the paging register and PC
    machine.setPagingRegister(pagingReg);

    Z80* z80 = machine.getCPU();
    z80->setRegister(Z80::WordReg::PC, pc128);

    return true;
}

void SNALoader::loadRegisters(ZXSpectrum& machine, const uint8_t* data)
{
    Z80* z80 = machine.getCPU();

    z80->setRegister(Z80::ByteReg::I, data[0]);

    z80->setRegister(Z80::WordReg::AltHL, data[1] | (data[2] << 8));
    z80->setRegister(Z80::WordReg::AltDE, data[3] | (data[4] << 8));
    z80->setRegister(Z80::WordReg::AltBC, data[5] | (data[6] << 8));
    z80->setRegister(Z80::WordReg::AltAF, data[7] | (data[8] << 8));

    z80->setRegister(Z80::WordReg::HL, data[9] | (data[10] << 8));
    z80->setRegister(Z80::WordReg::DE, data[11] | (data[12] << 8));
    z80->setRegister(Z80::WordReg::BC, data[13] | (data[14] << 8));
    z80->setRegister(Z80::WordReg::IY, data[15] | (data[16] << 8));
    z80->setRegister(Z80::WordReg::IX, data[17] | (data[18] << 8));

    uint8_t iff2 = (data[19] & 0x04) ? 1 : 0;
    z80->setIFF1(iff2);
    z80->setIFF2(iff2);

    z80->setRegister(Z80::ByteReg::R, data[20]);

    z80->setRegister(Z80::WordReg::AF, data[21] | (data[22] << 8));

    z80->setRegister(Z80::WordReg::SP, data[23] | (data[24] << 8));

    z80->setIMMode(data[25]);

    machine.setBorderColor(data[26]);
}

} // namespace zxspec
