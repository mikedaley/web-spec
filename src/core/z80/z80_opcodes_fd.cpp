/*
 * z80_opcodes_fd.cpp - Z80 FD prefix opcodes (IY register operations)
 *
 * Ported and modernized from SpectREMCPP by Mike Daley
 * Original: CZ80Core by Mike Daley
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80.hpp"

namespace zxspec {

//-----------------------------------------------------------------------------------------

void Z80::ADD_IY_BC(uint8_t opcode)
{
    // Handle contention
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIY, m_CPURegisters.reg_pairs.regBC);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_IY_DE(uint8_t opcode)
{
    // Handle contention
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIY, m_CPURegisters.reg_pairs.regDE);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IY_nn(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = z80MemRead(m_CPURegisters.regPC++);
    m_CPURegisters.regs.regIYh = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_nn_IY(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemWrite(m_MEMPTR++, m_CPURegisters.regs.regIYl);
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::INC_IY(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regIY++;
}

//-----------------------------------------------------------------------------------------

void Z80::INC_IYh(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_IYh(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_n(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_IY_IY(uint8_t opcode)
{
    // Handle contention
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIY, m_CPURegisters.reg_pairs.regIY);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IY_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regs.regIYl = z80MemRead(m_MEMPTR++);
    m_CPURegisters.regs.regIYh = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_IY(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regIY--;
}

//-----------------------------------------------------------------------------------------

void Z80::INC_IYl(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_IYl(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_n(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------

void Z80::INC_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t temp = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    z80MemContention(m_CPURegisters.reg_pairs.regIY + offset, 1);
    Inc(temp);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, temp);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t temp = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    z80MemContention(m_CPURegisters.reg_pairs.regIY + offset, 1);
    Dec(temp);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, temp);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_n(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    uint8_t val = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, val);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_IY_SP(uint8_t opcode)
{
    // Handle contention
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIY, m_CPURegisters.regSP);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_B_IYh(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regIYh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_B_IYl(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regIYl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_B_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    m_CPURegisters.regs.regB = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_C_IYh(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regIYh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_C_IYl(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regIYl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_C_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    m_CPURegisters.regs.regC = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_D_IYh(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regIYh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_D_IYl(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regIYl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_D_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    m_CPURegisters.regs.regD = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_E_IYh(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regIYh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_E_IYl(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regIYl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_E_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    m_CPURegisters.regs.regE = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_B(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_C(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_D(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_E(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_IYh(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = m_CPURegisters.regs.regIYh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_IYl(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = m_CPURegisters.regs.regIYl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_H_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    m_CPURegisters.regs.regH = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYh_A(uint8_t opcode)
{
    m_CPURegisters.regs.regIYh = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_B(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_C(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_D(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_E(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_IYh(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = m_CPURegisters.regs.regIYh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_IYl(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = m_CPURegisters.regs.regIYl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_L_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    m_CPURegisters.regs.regL = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IYl_A(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_B(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_C(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_D(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_E(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_H(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_L(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IY_d_A(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regIY + offset, m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_IYh(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regIYh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_IYl(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regIYl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    m_CPURegisters.regs.regA = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_A_IYh(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_A_IYl(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_A_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    Add8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_A_IYh(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_A_IYl(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_A_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    Adc8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::SUB_A_IYh(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::SUB_A_IYl(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::SUB_A_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    Sub8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_A_IYh(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_A_IYl(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_A_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    Sbc8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::AND_IYh(uint8_t opcode)
{
    And(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::AND_IYl(uint8_t opcode)
{
    And(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::AND_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    And(t);
}

//-----------------------------------------------------------------------------------------

void Z80::XOR_IYh(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::XOR_IYl(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::XOR_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    Xor(t);
}

//-----------------------------------------------------------------------------------------

void Z80::OR_IYh(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::OR_IYl(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::OR_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    Or(t);
}

//-----------------------------------------------------------------------------------------

void Z80::CP_IYh(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regIYh);
}

//-----------------------------------------------------------------------------------------

void Z80::CP_IYl(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::CP_off_IY_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regIY + offset);
    Cp(t);
}

//-----------------------------------------------------------------------------------------

void Z80::POP_IY(uint8_t opcode)
{
    m_CPURegisters.regs.regIYl = z80MemRead(m_CPURegisters.regSP++);
    m_CPURegisters.regs.regIYh = z80MemRead(m_CPURegisters.regSP++);
}

//-----------------------------------------------------------------------------------------

void Z80::EX_off_SP_IY(uint8_t opcode)
{
    uint8_t tl = z80MemRead(m_CPURegisters.regSP + 0);
    uint8_t th = z80MemRead(m_CPURegisters.regSP + 1);
    z80MemContention(m_CPURegisters.regSP + 1, 1);
    z80MemWrite(m_CPURegisters.regSP + 1, m_CPURegisters.regs.regIYh);
    z80MemWrite(m_CPURegisters.regSP + 0, m_CPURegisters.regs.regIYl);
    z80MemContention(m_CPURegisters.regSP, 1);
    z80MemContention(m_CPURegisters.regSP, 1);
    m_CPURegisters.regs.regIYh = th;
    m_CPURegisters.regs.regIYl = tl;

    m_MEMPTR = m_CPURegisters.reg_pairs.regIY;
}

//-----------------------------------------------------------------------------------------

void Z80::PUSH_IY(uint8_t opcode)
{
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regIYh);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regIYl);
}

//-----------------------------------------------------------------------------------------

void Z80::JP_off_IY(uint8_t opcode)
{
    m_CPURegisters.regPC = m_CPURegisters.reg_pairs.regIY;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_SP_IY(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.regSP = m_CPURegisters.reg_pairs.regIY;
}

//-----------------------------------------------------------------------------------------

} // namespace zxspec
