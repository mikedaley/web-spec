/*
 * z80_opcodes_ddcb.cpp - Z80 DDCB/FDCB prefix opcodes (IX/IY bit operations)
 *
 * Both DDCB and FDCB prefix opcodes share these implementations.
 * The execute loop sets m_MEMPTR to IX+d or IY+d BEFORE calling
 * the opcode method, so we just use m_MEMPTR for the address.
 *
 * Ported from SpectREMCPP by Mike Daley
 * Original: CZ80Core by Mike Daley
 */

#include "z80.hpp"

namespace zxspec {

// ---------------------------------------------------------------------------
// RLC (IX/IY+d) - Rotate Left Circular
// ---------------------------------------------------------------------------

void Z80::LD_B_RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RLC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RLC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RRC (IX/IY+d) - Rotate Right Circular
// ---------------------------------------------------------------------------

void Z80::LD_B_RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RRC_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RRC(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RL (IX/IY+d) - Rotate Left
// ---------------------------------------------------------------------------

void Z80::LD_B_RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RR (IX/IY+d) - Rotate Right
// ---------------------------------------------------------------------------

void Z80::LD_B_RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RR_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    RR(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SLA (IX/IY+d) - Shift Left Arithmetic
// ---------------------------------------------------------------------------

void Z80::LD_B_SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SLA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SRA (IX/IY+d) - Shift Right Arithmetic
// ---------------------------------------------------------------------------

void Z80::LD_B_SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SRA_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRA(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SLL (IX/IY+d) - Shift Left Logical (undocumented)
// ---------------------------------------------------------------------------

void Z80::LD_B_SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SLL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SLL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SRL (IX/IY+d) - Shift Right Logical
// ---------------------------------------------------------------------------

void Z80::LD_B_SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SRL_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    SRL(t);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// BIT b, (IX/IY+d) - Test Bit (uses BitWithMemptr)
// ---------------------------------------------------------------------------

void Z80::BIT_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 0);
}

void Z80::BIT_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 1);
}

void Z80::BIT_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 2);
}

void Z80::BIT_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 3);
}

void Z80::BIT_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 4);
}

void Z80::BIT_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 5);
}

void Z80::BIT_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 6);
}

void Z80::BIT_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    BitWithMemptr(t, 7);
}

// ---------------------------------------------------------------------------
// RES 0, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RES 1, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RES 2, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RES 3, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RES 4, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RES 5, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RES 6, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// RES 7, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_RES_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Res(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 0, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_0_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 0);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 1, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_1_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 1);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 2, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_2_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 2);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 3, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_3_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 3);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 4, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_4_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 4);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 5, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_5_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 5);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 6, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_6_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 6);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

// ---------------------------------------------------------------------------
// SET 7, (IX/IY+d)
// ---------------------------------------------------------------------------

void Z80::LD_B_SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regB = t;
}

void Z80::LD_C_SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regC = t;
}

void Z80::LD_D_SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regD = t;
}

void Z80::LD_E_SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regE = t;
}

void Z80::LD_H_SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regH = t;
}

void Z80::LD_L_SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regL = t;
}

void Z80::SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
}

void Z80::LD_A_SET_7_off_IX_IY_d(uint8_t opcode)
{
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    z80MemContention(m_CPURegisters.regPC - 1, 1);
    uint8_t t = z80MemRead(m_MEMPTR);
    z80MemContention(m_MEMPTR, 1);
    Set(t, 7);
    z80MemWrite(m_MEMPTR, t);
    m_CPURegisters.regs.regA = t;
}

} // namespace zxspec
