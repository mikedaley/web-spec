/*
 * sna_loader.cpp - SNA snapshot format loader
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sna_loader.hpp"
#include "../emulator.hpp"
#include <cstring>

namespace zxspec {

bool SNALoader::load(Emulator& emulator, const uint8_t* data, uint32_t size)
{
    if (size > SNA_48K_SIZE)
        return load128K(emulator, data, size);
    if (size == SNA_48K_SIZE)
        return load48K(emulator, data, size);
    return false;
}

void SNALoader::loadRegisters(Emulator& emulator, const uint8_t* data)
{
    Z80* z80 = emulator.z80_.get();

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

    emulator.borderColor_ = data[26] & 0x07;
}

bool SNALoader::load48K(Emulator& emulator, const uint8_t* data, uint32_t size)
{
    if (size != SNA_48K_SIZE) return false;

    emulator.setMachineType(MachineType::Spectrum48K);
    loadRegisters(emulator, data);

    // Copy 48KB RAM: first 16KB to page 5, next 16KB to page 2, last 16KB to page 0
    std::memcpy(&emulator.ram_[5 * MEM_PAGE_SIZE], data + HEADER_SIZE, MEM_PAGE_SIZE);
    std::memcpy(&emulator.ram_[2 * MEM_PAGE_SIZE], data + HEADER_SIZE + MEM_PAGE_SIZE, MEM_PAGE_SIZE);
    std::memcpy(&emulator.ram_[0 * MEM_PAGE_SIZE], data + HEADER_SIZE + 2 * MEM_PAGE_SIZE, MEM_PAGE_SIZE);

    emulator.updatePaging();

    // Recover PC from stack
    Z80* z80 = emulator.z80_.get();
    uint16_t sp = z80->getRegister(Z80::WordReg::SP);
    uint16_t pc = emulator.readMemory(sp) | (emulator.readMemory(sp + 1) << 8);
    z80->setRegister(Z80::WordReg::PC, pc);
    sp += 2;
    z80->setRegister(Z80::WordReg::SP, sp);

    return true;
}

bool SNALoader::load128K(Emulator& emulator, const uint8_t* data, uint32_t size)
{
    if (size < SNA_128K_MIN_SIZE) return false;

    loadRegisters(emulator, data);

    // The first 48KB after header goes into RAM pages at slots 1,2,3
    // Slot 1 = page 5, slot 2 = page 2, slot 3 = determined by port7FFD
    // We load these after we know port7FFD

    // Read extra 128K fields after the 48KB block
    uint32_t extraOffset = HEADER_SIZE + RAM_SIZE;
    if (extraOffset + 4 > size) return false;

    uint16_t pc = data[extraOffset] | (data[extraOffset + 1] << 8);
    uint8_t port7FFD = data[extraOffset + 2];
    // byte 3 is TR-DOS flag (ignored)

    // Set machine type to 128K
    emulator.setMachineType(MachineType::Spectrum128K);

    // Apply port7FFD
    emulator.port7FFD_ = port7FFD;
    emulator.pagingDisabled_ = (port7FFD & 0x20) != 0;
    emulator.updatePaging();

    // Load the 48KB into RAM pages 5, 2, and the page selected by port7FFD bits 0-2
    int slot3Page = port7FFD & 0x07;
    std::memcpy(&emulator.ram_[5 * MEM_PAGE_SIZE], data + HEADER_SIZE, MEM_PAGE_SIZE);
    std::memcpy(&emulator.ram_[2 * MEM_PAGE_SIZE], data + HEADER_SIZE + MEM_PAGE_SIZE, MEM_PAGE_SIZE);
    std::memcpy(&emulator.ram_[slot3Page * MEM_PAGE_SIZE], data + HEADER_SIZE + 2 * MEM_PAGE_SIZE, MEM_PAGE_SIZE);

    // Load remaining 5 RAM pages (those not already loaded: skip pages 5, 2, and slot3Page)
    uint32_t fileOffset = extraOffset + 4;
    for (int page = 0; page < 8; page++)
    {
        if (page == 5 || page == 2 || page == slot3Page)
            continue;
        if (fileOffset + MEM_PAGE_SIZE > size)
            break;
        std::memcpy(&emulator.ram_[page * MEM_PAGE_SIZE], data + fileOffset, MEM_PAGE_SIZE);
        fileOffset += MEM_PAGE_SIZE;
    }

    Z80* z80 = emulator.z80_.get();
    z80->setRegister(Z80::WordReg::PC, pc);

    return true;
}

} // namespace zxspec
