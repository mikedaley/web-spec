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
    if (size != SNA_48K_SIZE) return false;

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
