/*
 * sna_loader.cpp - SNA snapshot format loader
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sna_loader.hpp"
#include "emulator.hpp"
#include <cstring>

namespace zxspec {

bool SNALoader::load(Emulator& emulator, const uint8_t* data, uint32_t size)
{
    if (size != SNA_48K_SIZE) return false;

    // SNA header layout (27 bytes):
    //  0: I
    //  1-2: HL', 3-4: DE', 5-6: BC', 7-8: AF'
    //  9-10: HL, 11-12: DE, 13-14: BC
    //  15-16: IY, 17-18: IX
    //  19: IFF2 (bit 2)
    //  20: R
    //  21-22: AF
    //  23-24: SP
    //  25: IM
    //  26: Border color

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

    uint16_t sp = data[23] | (data[24] << 8);
    z80->setRegister(Z80::WordReg::SP, sp);

    z80->setIMMode(data[25]);

    emulator.borderColor_ = data[26] & 0x07;

    // Copy 48KB RAM to 0x4000-0xFFFF
    std::memcpy(emulator.memory_.data() + RAM_START, data + HEADER_SIZE, RAM_SIZE);

    // Recover PC from stack (PC is not stored in the SNA header)
    uint16_t pc = emulator.memory_[sp] | (emulator.memory_[sp + 1] << 8);
    z80->setRegister(Z80::WordReg::PC, pc);
    sp += 2;
    z80->setRegister(Z80::WordReg::SP, sp);

    // Reset audio and keyboard state
    emulator.audio_.reset();
    emulator.keyboardMatrix_.fill(0xBF);

    return true;
}

} // namespace zxspec
