/*
 * z80_opcodes_main.cpp - Z80 main opcode implementations (0x00-0xFF)
 *
 * Ported from SpectREMCPP by Mike Daley
 * Original: CZ80Core::MainOpcodes by Mike Daley
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80.hpp"

namespace zxspec {

//-----------------------------------------------------------------------------------------
// 0x00 - NOP
void Z80::NOP(uint8_t opcode)
{
    // Nothing to do...
}

//-----------------------------------------------------------------------------------------
// 0x01 - LD BC, nn
void Z80::LD_BC_nn(uint8_t opcode)
{
    m_CPURegisters.regs.regC = z80MemRead(m_CPURegisters.regPC++);
    m_CPURegisters.regs.regB = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x02 - LD (BC), A
void Z80::LD_off_BC_A(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regA);

    m_MEMPTR = (m_CPURegisters.reg_pairs.regBC + 1) & 0x00ff;
    m_MEMPTR |= m_CPURegisters.regs.regA << 8;
}

//-----------------------------------------------------------------------------------------
// 0x03 - INC BC
void Z80::INC_BC(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regBC++;
}

//-----------------------------------------------------------------------------------------
// 0x04 - INC B
void Z80::INC_B(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0x05 - DEC B
void Z80::DEC_B(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0x06 - LD B, n
void Z80::LD_B_n(uint8_t opcode)
{
    m_CPURegisters.regs.regB = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x07 - RLCA
void Z80::RLCA(uint8_t opcode)
{
    m_CPURegisters.regs.regA = (m_CPURegisters.regs.regA << 1) | (m_CPURegisters.regs.regA >> 7);
    m_CPURegisters.regs.regF = (m_CPURegisters.regs.regF & (FLAG_P | FLAG_Z | FLAG_S));
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & 0x01) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & (FLAG_3 | FLAG_5));
}

//-----------------------------------------------------------------------------------------
// 0x08 - EX AF, AF'
void Z80::EX_AF_AF_(uint8_t opcode)
{
    uint16_t t = m_CPURegisters.reg_pairs.regAF;
    m_CPURegisters.reg_pairs.regAF = m_CPURegisters.reg_pairs.regAF_;
    m_CPURegisters.reg_pairs.regAF_ = t;
}

//-----------------------------------------------------------------------------------------
// 0x09 - ADD HL, BC
void Z80::ADD_HL_BC(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regBC);
}

//-----------------------------------------------------------------------------------------
// 0x0A - LD A, (BC)
void Z80::LD_A_off_BC(uint8_t opcode)
{
    m_CPURegisters.regs.regA = z80MemRead(m_CPURegisters.reg_pairs.regBC);
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
}

//-----------------------------------------------------------------------------------------
// 0x0B - DEC BC
void Z80::DEC_BC(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regBC--;
}

//-----------------------------------------------------------------------------------------
// 0x0C - INC C
void Z80::INC_C(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0x0D - DEC C
void Z80::DEC_C(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0x0E - LD C, n
void Z80::LD_C_n(uint8_t opcode)
{
    m_CPURegisters.regs.regC = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x0F - RRCA
void Z80::RRCA(uint8_t opcode)
{
    m_CPURegisters.regs.regA = (m_CPURegisters.regs.regA >> 1) | (m_CPURegisters.regs.regA << 7);
    m_CPURegisters.regs.regF = (m_CPURegisters.regs.regF & (FLAG_P | FLAG_Z | FLAG_S));
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & 0x80) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & (FLAG_3 | FLAG_5));
}

//-----------------------------------------------------------------------------------------
// 0x10 - DJNZ off_PC_e
void Z80::DJNZ_off_PC_e(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    int8_t offset = z80MemRead(m_CPURegisters.regPC);

    m_CPURegisters.regs.regB--;

    if (m_CPURegisters.regs.regB != 0)
    {
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        m_CPURegisters.regPC += offset;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }

    m_CPURegisters.regPC++;
}

//-----------------------------------------------------------------------------------------
// 0x11 - LD DE, nn
void Z80::LD_DE_nn(uint8_t opcode)
{
    m_CPURegisters.regs.regE = z80MemRead(m_CPURegisters.regPC++);
    m_CPURegisters.regs.regD = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x12 - LD (DE), A
void Z80::LD_off_DE_A(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regDE, m_CPURegisters.regs.regA);

    m_MEMPTR = (m_CPURegisters.reg_pairs.regDE + 1) & 0x00ff;
    m_MEMPTR |= m_CPURegisters.regs.regA << 8;
}

//-----------------------------------------------------------------------------------------
// 0x13 - INC DE
void Z80::INC_DE(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regDE++;
}

//-----------------------------------------------------------------------------------------
// 0x14 - INC D
void Z80::INC_D(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0x15 - DEC D
void Z80::DEC_D(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0x16 - LD D, n
void Z80::LD_D_n(uint8_t opcode)
{
    m_CPURegisters.regs.regD = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x17 - RLA
void Z80::RLA(uint8_t opcode)
{
    uint8_t old_a = m_CPURegisters.regs.regA;
    m_CPURegisters.regs.regA = (m_CPURegisters.regs.regA << 1) | ((m_CPURegisters.regs.regF & FLAG_C) ? 0x01 : 0x00);
    m_CPURegisters.regs.regF = (m_CPURegisters.regs.regF & (FLAG_P | FLAG_Z | FLAG_S));
    m_CPURegisters.regs.regF |= ((old_a & 0x80) == 0x80) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & (FLAG_3 | FLAG_5));
}

//-----------------------------------------------------------------------------------------
// 0x18 - JR off_PC_e
void Z80::JR_off_PC_e(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC);

    z80MemContention(m_CPURegisters.regPC, 1);
    z80MemContention(m_CPURegisters.regPC, 1);
    z80MemContention(m_CPURegisters.regPC, 1);
    z80MemContention(m_CPURegisters.regPC, 1);
    z80MemContention(m_CPURegisters.regPC, 1);

    m_CPURegisters.regPC += offset;
    m_CPURegisters.regPC++;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0x19 - ADD HL, DE
void Z80::ADD_HL_DE(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regDE);
}

//-----------------------------------------------------------------------------------------
// 0x1A - LD A, (DE)
void Z80::LD_A_off_DE(uint8_t opcode)
{
    m_CPURegisters.regs.regA = z80MemRead(m_CPURegisters.reg_pairs.regDE);
    m_MEMPTR = m_CPURegisters.reg_pairs.regDE + 1;
}

//-----------------------------------------------------------------------------------------
// 0x1B - DEC DE
void Z80::DEC_DE(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regDE--;
}

//-----------------------------------------------------------------------------------------
// 0x1C - INC E
void Z80::INC_E(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0x1D - DEC E
void Z80::DEC_E(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0x1E - LD E, n
void Z80::LD_E_n(uint8_t opcode)
{
    m_CPURegisters.regs.regE = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x1F - RRA
void Z80::RRA(uint8_t opcode)
{
    uint8_t old_a = m_CPURegisters.regs.regA;
    m_CPURegisters.regs.regA = (m_CPURegisters.regs.regA >> 1) | ((m_CPURegisters.regs.regF & FLAG_C) ? 0x80 : 0x00);
    m_CPURegisters.regs.regF = (m_CPURegisters.regs.regF & (FLAG_P | FLAG_Z | FLAG_S));
    m_CPURegisters.regs.regF |= ((old_a & 0x01) == 0x01) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & (FLAG_3 | FLAG_5));
}

//-----------------------------------------------------------------------------------------
// 0x20 - JR NZ, off_PC_e
void Z80::JR_NZ_off_PC_e(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC);

    if ((m_CPURegisters.regs.regF & FLAG_Z) != FLAG_Z)
    {
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);

        m_CPURegisters.regPC += offset;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }

    m_CPURegisters.regPC++;
}

//-----------------------------------------------------------------------------------------
// 0x21 - LD HL, nn
void Z80::LD_HL_nn(uint8_t opcode)
{
    m_CPURegisters.regs.regL = z80MemRead(m_CPURegisters.regPC++);
    m_CPURegisters.regs.regH = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x22 - LD (nn), HL
void Z80::LD_off_nn_HL(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemWrite(m_MEMPTR++, m_CPURegisters.regs.regL);
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x23 - INC HL
void Z80::INC_HL(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regHL++;
}

//-----------------------------------------------------------------------------------------
// 0x24 - INC H
void Z80::INC_H(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x25 - DEC H
void Z80::DEC_H(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x26 - LD H, n
void Z80::LD_H_n(uint8_t opcode)
{
    m_CPURegisters.regs.regH = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x27 - DAA
void Z80::DAA(uint8_t opcode)
{
    uint8_t daa_value = 0;
    uint8_t flags = (m_CPURegisters.regs.regF & FLAG_C);

    if ((m_CPURegisters.regs.regA & 0x0f) > 0x09 || (m_CPURegisters.regs.regF & FLAG_H) == FLAG_H)
    {
        daa_value |= 0x06;
    }

    if (m_CPURegisters.regs.regA > 0x99)
    {
        flags = FLAG_C;
        daa_value |= 0x60;
    }
    else if ((m_CPURegisters.regs.regF & FLAG_C) == FLAG_C)
    {
        daa_value |= 0x60;
    }

    if ((m_CPURegisters.regs.regF & FLAG_N) == FLAG_N)
    {
        Sub8(daa_value);
    }
    else
    {
        Add8(daa_value);
    }

    m_CPURegisters.regs.regF &= ~(FLAG_C | FLAG_P);
    m_CPURegisters.regs.regF |= flags;
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regA];
}

//-----------------------------------------------------------------------------------------
// 0x28 - JR Z, off_PC_e
void Z80::JR_Z_off_PC_e(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC);

    if ((m_CPURegisters.regs.regF & FLAG_Z) == FLAG_Z)
    {
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);

        m_CPURegisters.regPC += offset;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }

    m_CPURegisters.regPC++;
}

//-----------------------------------------------------------------------------------------
// 0x29 - ADD HL, HL
void Z80::ADD_HL_HL(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x2A - LD HL, (nn)
void Z80::LD_HL_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regs.regL = z80MemRead(m_MEMPTR++);
    m_CPURegisters.regs.regH = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------
// 0x2B - DEC HL
void Z80::DEC_HL(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.reg_pairs.regHL--;
}

//-----------------------------------------------------------------------------------------
// 0x2C - INC L
void Z80::INC_L(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0x2D - DEC L
void Z80::DEC_L(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0x2E - LD L, n
void Z80::LD_L_n(uint8_t opcode)
{
    m_CPURegisters.regs.regL = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x2F - CPL
void Z80::CPL(uint8_t opcode)
{
    m_CPURegisters.regs.regA ^= 0xff;
    m_CPURegisters.regs.regF &= (FLAG_C | FLAG_P | FLAG_Z | FLAG_S);
    m_CPURegisters.regs.regF |= (FLAG_N | FLAG_H);
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & (FLAG_3 | FLAG_5));
}

//-----------------------------------------------------------------------------------------
// 0x30 - JR NC, off_PC_e
void Z80::JR_NC_off_PC_e(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC);

    if ((m_CPURegisters.regs.regF & FLAG_C) != FLAG_C)
    {
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);

        m_CPURegisters.regPC += offset;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }

    m_CPURegisters.regPC++;
}

//-----------------------------------------------------------------------------------------
// 0x31 - LD SP, nn
void Z80::LD_SP_nn(uint8_t opcode)
{
    uint8_t t1 = z80MemRead(m_CPURegisters.regPC++);
    uint8_t t2 = z80MemRead(m_CPURegisters.regPC++);

    m_CPURegisters.regSP = (((uint16_t)t2) << 8) | t1;
}

//-----------------------------------------------------------------------------------------
// 0x32 - LD (nn), A
void Z80::LD_off_nn_A(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemWrite(m_MEMPTR++, m_CPURegisters.regs.regA);

    m_MEMPTR &= 0x00ff;
    m_MEMPTR |= m_CPURegisters.regs.regA << 8;
}

//-----------------------------------------------------------------------------------------
// 0x33 - INC SP
void Z80::INC_SP(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.regSP++;
}

//-----------------------------------------------------------------------------------------
// 0x34 - INC (HL)
void Z80::INC_off_HL(uint8_t opcode)
{
    uint8_t temp = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Inc(temp);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, temp);
}

//-----------------------------------------------------------------------------------------
// 0x35 - DEC (HL)
void Z80::DEC_off_HL(uint8_t opcode)
{
    uint8_t temp = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Dec(temp);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, temp);
}

//-----------------------------------------------------------------------------------------
// 0x36 - LD (HL), n
void Z80::LD_off_HL_n(uint8_t opcode)
{
    uint8_t temp = z80MemRead(m_CPURegisters.regPC++);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, temp);
}

//-----------------------------------------------------------------------------------------
// 0x37 - SCF
void Z80::SCF(uint8_t opcode)
{
    if (m_PrevOpcodeFlags & OPCODEFLAG_AltersFlags)
    {
        m_CPURegisters.regs.regF &= (FLAG_P | FLAG_S | FLAG_Z);
    }
    else
    {
        m_CPURegisters.regs.regF &= (FLAG_P | FLAG_S | FLAG_Z | FLAG_3 | FLAG_5);
    }

    m_CPURegisters.regs.regF |= FLAG_C;
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & (FLAG_3 | FLAG_5));
}

//-----------------------------------------------------------------------------------------
// 0x38 - JR C, off_PC_e
void Z80::JR_C_off_PC_e(uint8_t opcode)
{
    int8_t offset = z80MemRead(m_CPURegisters.regPC);

    if ((m_CPURegisters.regs.regF & FLAG_C) == FLAG_C)
    {
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);
        z80MemContention(m_CPURegisters.regPC, 1);

        m_CPURegisters.regPC += offset;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }

    m_CPURegisters.regPC++;
}

//-----------------------------------------------------------------------------------------
// 0x39 - ADD HL, SP
void Z80::ADD_HL_SP(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Add16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regSP);
}

//-----------------------------------------------------------------------------------------
// 0x3A - LD A, (nn)
void Z80::LD_A_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regs.regA = z80MemRead(m_MEMPTR++);
}

//-----------------------------------------------------------------------------------------
// 0x3B - DEC SP
void Z80::DEC_SP(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.regSP--;
}

//-----------------------------------------------------------------------------------------
// 0x3C - INC A
void Z80::INC_A(uint8_t opcode)
{
    Inc(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0x3D - DEC A
void Z80::DEC_A(uint8_t opcode)
{
    Dec(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0x3E - LD A, n
void Z80::LD_A_n(uint8_t opcode)
{
    m_CPURegisters.regs.regA = z80MemRead(m_CPURegisters.regPC++);
}

//-----------------------------------------------------------------------------------------
// 0x3F - CCF
void Z80::CCF(uint8_t opcode)
{
    uint8_t tf = m_CPURegisters.regs.regF;

    if (m_PrevOpcodeFlags & OPCODEFLAG_AltersFlags)
    {
        m_CPURegisters.regs.regF &= (FLAG_P | FLAG_S | FLAG_Z);
    }
    else
    {
        m_CPURegisters.regs.regF &= (FLAG_P | FLAG_S | FLAG_Z | FLAG_3 | FLAG_5);
    }

    m_CPURegisters.regs.regF |= (tf & FLAG_C) ? FLAG_H : FLAG_C;
    m_CPURegisters.regs.regF |= (m_CPURegisters.regs.regA & (FLAG_3 | FLAG_5));
}

//-----------------------------------------------------------------------------------------
// 0x40 - LD B, B
void Z80::LD_B_B(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------
// 0x41 - LD B, C
void Z80::LD_B_C(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------
// 0x42 - LD B, D
void Z80::LD_B_D(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------
// 0x43 - LD B, E
void Z80::LD_B_E(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------
// 0x44 - LD B, H
void Z80::LD_B_H(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regH;
}

//-----------------------------------------------------------------------------------------
// 0x45 - LD B, L
void Z80::LD_B_L(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regL;
}

//-----------------------------------------------------------------------------------------
// 0x46 - LD B, (HL)
void Z80::LD_B_off_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regB = z80MemRead(m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x47 - LD B, A
void Z80::LD_B_A(uint8_t opcode)
{
    m_CPURegisters.regs.regB = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------
// 0x48 - LD C, B
void Z80::LD_C_B(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------
// 0x49 - LD C, C
void Z80::LD_C_C(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------
// 0x4A - LD C, D
void Z80::LD_C_D(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------
// 0x4B - LD C, E
void Z80::LD_C_E(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------
// 0x4C - LD C, H
void Z80::LD_C_H(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regH;
}

//-----------------------------------------------------------------------------------------
// 0x4D - LD C, L
void Z80::LD_C_L(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regL;
}

//-----------------------------------------------------------------------------------------
// 0x4E - LD C, (HL)
void Z80::LD_C_off_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regC = z80MemRead(m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x4F - LD C, A
void Z80::LD_C_A(uint8_t opcode)
{
    m_CPURegisters.regs.regC = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------
// 0x50 - LD D, B
void Z80::LD_D_B(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------
// 0x51 - LD D, C
void Z80::LD_D_C(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------
// 0x52 - LD D, D
void Z80::LD_D_D(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------
// 0x53 - LD D, E
void Z80::LD_D_E(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------
// 0x54 - LD D, H
void Z80::LD_D_H(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regH;
}

//-----------------------------------------------------------------------------------------
// 0x55 - LD D, L
void Z80::LD_D_L(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regL;
}

//-----------------------------------------------------------------------------------------
// 0x56 - LD D, (HL)
void Z80::LD_D_off_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regD = z80MemRead(m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x57 - LD D, A
void Z80::LD_D_A(uint8_t opcode)
{
    m_CPURegisters.regs.regD = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------
// 0x58 - LD E, B
void Z80::LD_E_B(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------
// 0x59 - LD E, C
void Z80::LD_E_C(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------
// 0x5A - LD E, D
void Z80::LD_E_D(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------
// 0x5B - LD E, E
void Z80::LD_E_E(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------
// 0x5C - LD E, H
void Z80::LD_E_H(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regH;
}

//-----------------------------------------------------------------------------------------
// 0x5D - LD E, L
void Z80::LD_E_L(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regL;
}

//-----------------------------------------------------------------------------------------
// 0x5E - LD E, (HL)
void Z80::LD_E_off_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regE = z80MemRead(m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x5F - LD E, A
void Z80::LD_E_A(uint8_t opcode)
{
    m_CPURegisters.regs.regE = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------
// 0x60 - LD H, B
void Z80::LD_H_B(uint8_t opcode)
{
    m_CPURegisters.regs.regH = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------
// 0x61 - LD H, C
void Z80::LD_H_C(uint8_t opcode)
{
    m_CPURegisters.regs.regH = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------
// 0x62 - LD H, D
void Z80::LD_H_D(uint8_t opcode)
{
    m_CPURegisters.regs.regH = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------
// 0x63 - LD H, E
void Z80::LD_H_E(uint8_t opcode)
{
    m_CPURegisters.regs.regH = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------
// 0x64 - LD H, H
void Z80::LD_H_H(uint8_t opcode)
{
    m_CPURegisters.regs.regH = m_CPURegisters.regs.regH;
}

//-----------------------------------------------------------------------------------------
// 0x65 - LD H, L
void Z80::LD_H_L(uint8_t opcode)
{
    m_CPURegisters.regs.regH = m_CPURegisters.regs.regL;
}

//-----------------------------------------------------------------------------------------
// 0x66 - LD H, (HL)
void Z80::LD_H_off_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regH = z80MemRead(m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x67 - LD H, A
void Z80::LD_H_A(uint8_t opcode)
{
    m_CPURegisters.regs.regH = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------
// 0x68 - LD L, B
void Z80::LD_L_B(uint8_t opcode)
{
    m_CPURegisters.regs.regL = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------
// 0x69 - LD L, C
void Z80::LD_L_C(uint8_t opcode)
{
    m_CPURegisters.regs.regL = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------
// 0x6A - LD L, D
void Z80::LD_L_D(uint8_t opcode)
{
    m_CPURegisters.regs.regL = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------
// 0x6B - LD L, E
void Z80::LD_L_E(uint8_t opcode)
{
    m_CPURegisters.regs.regL = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------
// 0x6C - LD L, H
void Z80::LD_L_H(uint8_t opcode)
{
    m_CPURegisters.regs.regL = m_CPURegisters.regs.regH;
}

//-----------------------------------------------------------------------------------------
// 0x6D - LD L, L
void Z80::LD_L_L(uint8_t opcode)
{
    m_CPURegisters.regs.regL = m_CPURegisters.regs.regL;
}

//-----------------------------------------------------------------------------------------
// 0x6E - LD L, (HL)
void Z80::LD_L_off_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regL = z80MemRead(m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x6F - LD L, A
void Z80::LD_L_A(uint8_t opcode)
{
    m_CPURegisters.regs.regL = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------
// 0x70 - LD (HL), B
void Z80::LD_off_HL_B(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0x71 - LD (HL), C
void Z80::LD_off_HL_C(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0x72 - LD (HL), D
void Z80::LD_off_HL_D(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0x73 - LD (HL), E
void Z80::LD_off_HL_E(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0x74 - LD (HL), H
void Z80::LD_off_HL_H(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x75 - LD (HL), L
void Z80::LD_off_HL_L(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0x76 - HALT
void Z80::HALT(uint8_t opcode)
{
    m_CPURegisters.Halted = 1;
    m_CPURegisters.regPC--;
}

//-----------------------------------------------------------------------------------------
// 0x77 - LD (HL), A
void Z80::LD_off_HL_A(uint8_t opcode)
{
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0x78 - LD A, B
void Z80::LD_A_B(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regB;
}

//-----------------------------------------------------------------------------------------
// 0x79 - LD A, C
void Z80::LD_A_C(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regC;
}

//-----------------------------------------------------------------------------------------
// 0x7A - LD A, D
void Z80::LD_A_D(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regD;
}

//-----------------------------------------------------------------------------------------
// 0x7B - LD A, E
void Z80::LD_A_E(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regE;
}

//-----------------------------------------------------------------------------------------
// 0x7C - LD A, H
void Z80::LD_A_H(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regH;
}

//-----------------------------------------------------------------------------------------
// 0x7D - LD A, L
void Z80::LD_A_L(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regL;
}

//-----------------------------------------------------------------------------------------
// 0x7E - LD A, (HL)
void Z80::LD_A_off_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regA = z80MemRead(m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------
// 0x7F - LD A, A
void Z80::LD_A_A(uint8_t opcode)
{
    m_CPURegisters.regs.regA = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------
// 0x80 - ADD A, B
void Z80::ADD_A_B(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0x81 - ADD A, C
void Z80::ADD_A_C(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0x82 - ADD A, D
void Z80::ADD_A_D(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0x83 - ADD A, E
void Z80::ADD_A_E(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0x84 - ADD A, H
void Z80::ADD_A_H(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x85 - ADD A, L
void Z80::ADD_A_L(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0x86 - ADD A, (HL)
void Z80::ADD_A_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    Add8(t);
}

//-----------------------------------------------------------------------------------------
// 0x87 - ADD A, A
void Z80::ADD_A_A(uint8_t opcode)
{
    Add8(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0x88 - ADC A, B
void Z80::ADC_A_B(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0x89 - ADC A, C
void Z80::ADC_A_C(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0x8A - ADC A, D
void Z80::ADC_A_D(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0x8B - ADC A, E
void Z80::ADC_A_E(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0x8C - ADC A, H
void Z80::ADC_A_H(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x8D - ADC A, L
void Z80::ADC_A_L(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0x8E - ADC A, (HL)
void Z80::ADC_A_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    Adc8(t);
}

//-----------------------------------------------------------------------------------------
// 0x8F - ADC A, A
void Z80::ADC_A_A(uint8_t opcode)
{
    Adc8(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0x90 - SUB A, B
void Z80::SUB_A_B(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0x91 - SUB A, C
void Z80::SUB_A_C(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0x92 - SUB A, D
void Z80::SUB_A_D(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0x93 - SUB A, E
void Z80::SUB_A_E(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0x94 - SUB A, H
void Z80::SUB_A_H(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x95 - SUB A, L
void Z80::SUB_A_L(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0x96 - SUB A, (HL)
void Z80::SUB_A_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    Sub8(t);
}

//-----------------------------------------------------------------------------------------
// 0x97 - SUB A, A
void Z80::SUB_A_A(uint8_t opcode)
{
    Sub8(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0x98 - SBC A, B
void Z80::SBC_A_B(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0x99 - SBC A, C
void Z80::SBC_A_C(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0x9A - SBC A, D
void Z80::SBC_A_D(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0x9B - SBC A, E
void Z80::SBC_A_E(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0x9C - SBC A, H
void Z80::SBC_A_H(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0x9D - SBC A, L
void Z80::SBC_A_L(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0x9E - SBC A, (HL)
void Z80::SBC_A_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    Sbc8(t);
}

//-----------------------------------------------------------------------------------------
// 0x9F - SBC A, A
void Z80::SBC_A_A(uint8_t opcode)
{
    Sbc8(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0xA0 - AND B
void Z80::AND_B(uint8_t opcode)
{
    And(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0xA1 - AND C
void Z80::AND_C(uint8_t opcode)
{
    And(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0xA2 - AND D
void Z80::AND_D(uint8_t opcode)
{
    And(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0xA3 - AND E
void Z80::AND_E(uint8_t opcode)
{
    And(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0xA4 - AND H
void Z80::AND_H(uint8_t opcode)
{
    And(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0xA5 - AND L
void Z80::AND_L(uint8_t opcode)
{
    And(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0xA6 - AND (HL)
void Z80::AND_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    And(t);
}

//-----------------------------------------------------------------------------------------
// 0xA7 - AND A
void Z80::AND_A(uint8_t opcode)
{
    And(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0xA8 - XOR B
void Z80::XOR_B(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0xA9 - XOR C
void Z80::XOR_C(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0xAA - XOR D
void Z80::XOR_D(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0xAB - XOR E
void Z80::XOR_E(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0xAC - XOR H
void Z80::XOR_H(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0xAD - XOR L
void Z80::XOR_L(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0xAE - XOR (HL)
void Z80::XOR_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    Xor(t);
}

//-----------------------------------------------------------------------------------------
// 0xAF - XOR A
void Z80::XOR_A(uint8_t opcode)
{
    Xor(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0xB0 - OR B
void Z80::OR_B(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0xB1 - OR C
void Z80::OR_C(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0xB2 - OR D
void Z80::OR_D(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0xB3 - OR E
void Z80::OR_E(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0xB4 - OR H
void Z80::OR_H(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0xB5 - OR L
void Z80::OR_L(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0xB6 - OR (HL)
void Z80::OR_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    Or(t);
}

//-----------------------------------------------------------------------------------------
// 0xB7 - OR A
void Z80::OR_A(uint8_t opcode)
{
    Or(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0xB8 - CP B
void Z80::CP_B(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------
// 0xB9 - CP C
void Z80::CP_C(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0xBA - CP D
void Z80::CP_D(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------
// 0xBB - CP E
void Z80::CP_E(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0xBC - CP H
void Z80::CP_H(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------
// 0xBD - CP L
void Z80::CP_L(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0xBE - CP (HL)
void Z80::CP_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    Cp(t);
}

//-----------------------------------------------------------------------------------------
// 0xBF - CP A
void Z80::CP_A(uint8_t opcode)
{
    Cp(m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------
// 0xC0 - RET NZ
void Z80::RET_NZ(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_Z) != FLAG_Z)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xC1 - POP BC
void Z80::POP_BC(uint8_t opcode)
{
    m_CPURegisters.regs.regC = z80MemRead(m_CPURegisters.regSP++);
    m_CPURegisters.regs.regB = z80MemRead(m_CPURegisters.regSP++);
}

//-----------------------------------------------------------------------------------------
// 0xC2 - JP NZ, (nn)
void Z80::JP_NZ_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_Z) != FLAG_Z)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xC3 - JP (nn)
void Z80::JP_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regPC = m_MEMPTR;
}

//-----------------------------------------------------------------------------------------
// 0xC4 - CALL NZ, (nn)
void Z80::CALL_NZ_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_Z) != FLAG_Z)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xC5 - PUSH BC
void Z80::PUSH_BC(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regB);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------
// 0xC6 - ADD A, n
void Z80::ADD_A_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    Add8(t);
}

//-----------------------------------------------------------------------------------------
// 0xC7 - RST 00H
void Z80::RST_0H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0000;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0xC8 - RET Z
void Z80::RET_Z(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_Z) == FLAG_Z)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xC9 - RET
void Z80::RET(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

    m_CPURegisters.regPC = m_MEMPTR;
}

//-----------------------------------------------------------------------------------------
// 0xCA - JP Z, (nn)
void Z80::JP_Z_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_Z) == FLAG_Z)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xCB prefix is handled by the CB opcode table dispatch, not here

//-----------------------------------------------------------------------------------------
// 0xCC - CALL Z, (nn)
void Z80::CALL_Z_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_Z) == FLAG_Z)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xCD - CALL (nn)
void Z80::CALL_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

    m_CPURegisters.regPC = m_MEMPTR;
}

//-----------------------------------------------------------------------------------------
// 0xCE - ADC A, n
void Z80::ADC_A_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    Adc8(t);
}

//-----------------------------------------------------------------------------------------
// 0xCF - RST 08H
void Z80::RST_8H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0008;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0xD0 - RET NC
void Z80::RET_NC(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_C) != FLAG_C)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xD1 - POP DE
void Z80::POP_DE(uint8_t opcode)
{
    m_CPURegisters.regs.regE = z80MemRead(m_CPURegisters.regSP++);
    m_CPURegisters.regs.regD = z80MemRead(m_CPURegisters.regSP++);
}

//-----------------------------------------------------------------------------------------
// 0xD2 - JP NC, (nn)
void Z80::JP_NC_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_C) != FLAG_C)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xD3 - OUT (n), A
void Z80::OUT_off_n_A(uint8_t opcode)
{
    uint16_t address = (((uint16_t)m_CPURegisters.regs.regA) << 8) | z80MemRead(m_CPURegisters.regPC++);
    z80IOWrite(address, m_CPURegisters.regs.regA);

    m_MEMPTR = (m_CPURegisters.regs.regA << 8) + ((address + 1) & 0xff);
}

//-----------------------------------------------------------------------------------------
// 0xD4 - CALL NC, (nn)
void Z80::CALL_NC_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_C) != FLAG_C)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xD5 - PUSH DE
void Z80::PUSH_DE(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regD);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------
// 0xD6 - SUB A, n
void Z80::SUB_A_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    Sub8(t);
}

//-----------------------------------------------------------------------------------------
// 0xD7 - RST 10H
void Z80::RST_10H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0010;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0xD8 - RET C
void Z80::RET_C(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_C) == FLAG_C)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xD9 - EXX
void Z80::EXX(uint8_t opcode)
{
    uint16_t t = m_CPURegisters.reg_pairs.regBC;
    m_CPURegisters.reg_pairs.regBC = m_CPURegisters.reg_pairs.regBC_;
    m_CPURegisters.reg_pairs.regBC_ = t;

    t = m_CPURegisters.reg_pairs.regDE;
    m_CPURegisters.reg_pairs.regDE = m_CPURegisters.reg_pairs.regDE_;
    m_CPURegisters.reg_pairs.regDE_ = t;

    t = m_CPURegisters.reg_pairs.regHL;
    m_CPURegisters.reg_pairs.regHL = m_CPURegisters.reg_pairs.regHL_;
    m_CPURegisters.reg_pairs.regHL_ = t;
}

//-----------------------------------------------------------------------------------------
// 0xDA - JP C, (nn)
void Z80::JP_C_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_C) == FLAG_C)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xDB - IN A, (n)
void Z80::IN_A_off_n(uint8_t opcode)
{
    m_MEMPTR = (((uint16_t)m_CPURegisters.regs.regA) << 8) | z80MemRead(m_CPURegisters.regPC++);
    m_CPURegisters.regs.regA = z80IORead(m_MEMPTR++);
}

//-----------------------------------------------------------------------------------------
// 0xDC - CALL C, (nn)
void Z80::CALL_C_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_C) == FLAG_C)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xDD prefix is handled by the DD opcode table dispatch, not here

//-----------------------------------------------------------------------------------------
// 0xDE - SBC A, n
void Z80::SBC_A_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    Sbc8(t);
}

//-----------------------------------------------------------------------------------------
// 0xDF - RST 18H
void Z80::RST_18H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0018;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0xE0 - RET PO
void Z80::RET_PO(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_P) != FLAG_P)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xE1 - POP HL
void Z80::POP_HL(uint8_t opcode)
{
    m_CPURegisters.regs.regL = z80MemRead(m_CPURegisters.regSP++);
    m_CPURegisters.regs.regH = z80MemRead(m_CPURegisters.regSP++);
}

//-----------------------------------------------------------------------------------------
// 0xE2 - JP PO, (nn)
void Z80::JP_PO_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_P) != FLAG_P)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xE3 - EX (SP), HL
void Z80::EX_off_SP_HL(uint8_t opcode)
{
    uint8_t tl = z80MemRead(m_CPURegisters.regSP + 0);
    uint8_t th = z80MemRead(m_CPURegisters.regSP + 1);
    z80MemContention(m_CPURegisters.regSP + 1, 1);
    z80MemWrite(m_CPURegisters.regSP + 1, m_CPURegisters.regs.regH);
    z80MemWrite(m_CPURegisters.regSP + 0, m_CPURegisters.regs.regL);
    z80MemContention(m_CPURegisters.regSP, 1);
    z80MemContention(m_CPURegisters.regSP, 1);
    m_CPURegisters.regs.regH = th;
    m_CPURegisters.regs.regL = tl;

    m_MEMPTR = m_CPURegisters.reg_pairs.regHL;
}

//-----------------------------------------------------------------------------------------
// 0xE4 - CALL PO, (nn)
void Z80::CALL_PO_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_P) != FLAG_P)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xE5 - PUSH HL
void Z80::PUSH_HL(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regH);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------
// 0xE6 - AND n
void Z80::AND_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    And(t);
}

//-----------------------------------------------------------------------------------------
// 0xE7 - RST 20H
void Z80::RST_20H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0020;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0xE8 - RET PE
void Z80::RET_PE(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_P) == FLAG_P)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xE9 - JP (HL)
void Z80::JP_off_HL(uint8_t opcode)
{
    m_CPURegisters.regPC = m_CPURegisters.reg_pairs.regHL;
}

//-----------------------------------------------------------------------------------------
// 0xEA - JP PE, (nn)
void Z80::JP_PE_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_P) == FLAG_P)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xEB - EX DE, HL
void Z80::EX_DE_HL(uint8_t opcode)
{
    uint16_t t = m_CPURegisters.reg_pairs.regHL;
    m_CPURegisters.reg_pairs.regHL = m_CPURegisters.reg_pairs.regDE;
    m_CPURegisters.reg_pairs.regDE = t;
}

//-----------------------------------------------------------------------------------------
// 0xEC - CALL PE, (nn)
void Z80::CALL_PE_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_P) == FLAG_P)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xED prefix is handled by the ED opcode table dispatch, not here

//-----------------------------------------------------------------------------------------
// 0xEE - XOR n
void Z80::XOR_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    Xor(t);
}

//-----------------------------------------------------------------------------------------
// 0xEF - RST 28H
void Z80::RST_28H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0028;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0xF0 - RET P
void Z80::RET_P(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_S) != FLAG_S)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xF1 - POP AF
void Z80::POP_AF(uint8_t opcode)
{
    m_CPURegisters.regs.regF = z80MemRead(m_CPURegisters.regSP++);
    m_CPURegisters.regs.regA = z80MemRead(m_CPURegisters.regSP++);
}

//-----------------------------------------------------------------------------------------
// 0xF2 - JP P, (nn)
void Z80::JP_P_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_S) != FLAG_S)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xF3 - DI
void Z80::DI(uint8_t opcode)
{
    m_CPURegisters.IFF1 = 0;
    m_CPURegisters.IFF2 = 0;
}

//-----------------------------------------------------------------------------------------
// 0xF4 - CALL P, (nn)
void Z80::CALL_P_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_S) != FLAG_S)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xF5 - PUSH AF
void Z80::PUSH_AF(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regA);
    z80MemWrite(--m_CPURegisters.regSP, m_CPURegisters.regs.regF);
}

//-----------------------------------------------------------------------------------------
// 0xF6 - OR n
void Z80::OR_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    Or(t);
}

//-----------------------------------------------------------------------------------------
// 0xF7 - RST 30H
void Z80::RST_30H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0030;

    m_MEMPTR = m_CPURegisters.regPC;
}

//-----------------------------------------------------------------------------------------
// 0xF8 - RET M
void Z80::RET_M(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    if ((m_CPURegisters.regs.regF & FLAG_S) == FLAG_S)
    {
        m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
        m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xF9 - LD SP, HL
void Z80::LD_SP_HL(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    m_CPURegisters.regSP = m_CPURegisters.reg_pairs.regHL;
}

//-----------------------------------------------------------------------------------------
// 0xFA - JP M, (nn)
void Z80::JP_M_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_S) == FLAG_S)
    {
        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xFB - EI
void Z80::EI(uint8_t opcode)
{
    m_CPURegisters.IFF1 = 1;
    m_CPURegisters.IFF2 = 1;
    m_CPURegisters.EIHandled = true;
}

//-----------------------------------------------------------------------------------------
// 0xFC - CALL M, (nn)
void Z80::CALL_M_off_nn(uint8_t opcode)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    if ((m_CPURegisters.regs.regF & FLAG_S) == FLAG_S)
    {
        z80MemContention(m_CPURegisters.regPC - 1, 1);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

        m_CPURegisters.regPC = m_MEMPTR;
    }
}

//-----------------------------------------------------------------------------------------
// 0xFD prefix is handled by the FD opcode table dispatch, not here

//-----------------------------------------------------------------------------------------
// 0xFE - CP n
void Z80::CP_n(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.regPC++);
    Cp(t);
}

//-----------------------------------------------------------------------------------------
// 0xFF - RST 38H
void Z80::RST_38H(uint8_t opcode)
{
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
    z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);
    m_CPURegisters.regPC = 0x0038;

    m_MEMPTR = m_CPURegisters.regPC;
}

} // namespace zxspec
