/*
 * z80_opcodes_dd.cpp - Z80 DD prefix opcodes (IX register operations)
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

void Z80::ADD_IX_BC(uint8_t opcode)
{
    // Handle contention
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIX, m_CPURegisters.reg_pairs.regBC);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_IX_DE(uint8_t opcode)
{
    // Handle contention
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIX, m_CPURegisters.reg_pairs.regDE);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IX_nn(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = z80MemRead(m_CPURegisters.regPC++);
    m_CPURegisters.regs.regIXh = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_nn_IX(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemWrite(m_MEMPTR++, m_CPURegisters.regs.regIXl);
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::INC_IX(uint8_t opcode)
{
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regIX++;
}

//-----------------------------------------------------------------------------------------

void Z80::INC_IXh(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_IXh(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_n(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_IX_IX(uint8_t opcode)
{
    // Handle contention
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIX, m_CPURegisters.reg_pairs.regIX);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IX_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regs.regIXl = z80MemRead(m_MEMPTR++);
    m_CPURegisters.regs.regIXh = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_IX(uint8_t opcode)
{
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regIX--;
}

//-----------------------------------------------------------------------------------------

void Z80::INC_IXl(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_IXl(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_n(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------

void Z80::INC_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t temp = z80MemRead(m_MEMPTR);
    z80NoMreqContention(m_MEMPTR, 1);
    Inc(temp);
    z80MemWrite(m_MEMPTR, temp);
}

//-----------------------------------------------------------------------------------------

void Z80::DEC_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t temp = z80MemRead(m_MEMPTR);
    z80NoMreqContention(m_MEMPTR, 1);
    Dec(temp);
    z80MemWrite(m_MEMPTR, temp);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_n(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    uint8_t val = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, val);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_IX_SP(uint8_t opcode)
{
    // Handle contention
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80NoMreqContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regIX, m_CPURegisters.regSP);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_B_IXh(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regIXh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_B_IXl(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regIXl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_B_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    m_CPURegisters.regs.regB = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_C_IXh(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regIXh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_C_IXl(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regIXl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_C_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    m_CPURegisters.regs.regC = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_D_IXh(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regIXh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_D_IXl(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regIXl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_D_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    m_CPURegisters.regs.regD = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_E_IXh(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regIXh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_E_IXl(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regIXl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_E_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    m_CPURegisters.regs.regE = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_B(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_C(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_D(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_E(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_IXh(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = m_CPURegisters.regs.regIXh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_IXl(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = m_CPURegisters.regs.regIXl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_H_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    m_CPURegisters.regs.regH = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXh_A(uint8_t opcode)
{
    m_CPURegisters.regs.regIXh = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_B(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_C(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_D(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_E(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_IXh(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = m_CPURegisters.regs.regIXh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_IXl(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = m_CPURegisters.regs.regIXl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_L_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    m_CPURegisters.regs.regL = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_IXl_A(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_B(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_C(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_D(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_E(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_H(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_L(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_IX_d_A(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_IXh(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regIXh;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_IXl(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regIXl;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    m_CPURegisters.regs.regA = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_A_IXh(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_A_IXl(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::ADD_A_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    Add8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_A_IXh(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_A_IXl(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_A_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    Adc8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::SUB_A_IXh(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::SUB_A_IXl(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::SUB_A_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    Sub8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_A_IXh(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_A_IXl(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_A_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    Sbc8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::AND_IXh(uint8_t opcode)
{
    And(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::AND_IXl(uint8_t opcode)
{
    And(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::AND_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    And(t);
}

//-----------------------------------------------------------------------------------------

void Z80::XOR_IXh(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::XOR_IXl(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::XOR_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    Xor(t);
}

//-----------------------------------------------------------------------------------------

void Z80::OR_IXh(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::OR_IXl(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::OR_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    Or(t);
}

//-----------------------------------------------------------------------------------------

void Z80::CP_IXh(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regIXh);
}

//-----------------------------------------------------------------------------------------

void Z80::CP_IXl(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::CP_off_IX_d(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC++);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    z80NoMreqContention(m_CPURegisters.regPC - 1, 1);
    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;
    uint8_t t = z80MemRead(m_MEMPTR);
    Cp(t);
}

//-----------------------------------------------------------------------------------------

void Z80::POP_IX(uint8_t opcode)
{
    m_CPURegisters.regs.regIXl = z80MemRead(m_CPURegisters.regSP++);
    m_CPURegisters.regs.regIXh = z80MemRead(m_CPURegisters.regSP++);
}

//-----------------------------------------------------------------------------------------

void Z80::EX_off_SP_IX(uint8_t opcode)
{
    uint8_t tl = z80MemRead(m_CPURegisters.regSP + 0);
    uint8_t th = z80MemRead(m_CPURegisters.regSP + 1);
    z80NoMreqContention(m_CPURegisters.regSP + 1, 1);
    z80MemWrite(m_CPURegisters.regSP + 1, m_CPURegisters.regs.regIXh);
    z80MemWrite(m_CPURegisters.regSP + 0, m_CPURegisters.regs.regIXl);
    z80NoMreqContention(m_CPURegisters.regSP, 1);
    z80NoMreqContention(m_CPURegisters.regSP, 1);
    m_CPURegisters.regs.regIXh = th;
    m_CPURegisters.regs.regIXl = tl;

    m_MEMPTR = m_CPURegisters.reg_pairs.regIX;
}

//-----------------------------------------------------------------------------------------

void Z80::PUSH_IX(uint8_t opcode)
{
    z80NoMreqContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regIXh);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regIXl);
}

//-----------------------------------------------------------------------------------------

void Z80::JP_off_IX(uint8_t opcode)
{
    m_CPURegisters.regPC = m_CPURegisters.reg_pairs.regIX;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_SP_IX(uint8_t opcode)
{
    z80NoMreqContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80NoMreqContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    m_CPURegisters.regSP = m_CPURegisters.reg_pairs.regIX;
}

//-----------------------------------------------------------------------------------------

} // namespace zxspec
