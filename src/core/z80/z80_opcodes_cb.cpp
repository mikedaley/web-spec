/*
 * z80_opcodes_cb.cpp - Z80 CB prefix opcodes (bit operations)
 *
 * Ported from SpectREMCPP by Mike Daley
 * Original: CZ80Core CB Opcodes by Mike Daley
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80.hpp"

namespace zxspec {

// =============================================================================
// RLC - Rotate Left Circular (0x00-0x07)
// =============================================================================

void Z80::RLC_B(uint8_t opcode)
{
    RLC(m_CPURegisters.regs.regB);
}

void Z80::RLC_C(uint8_t opcode)
{
    RLC(m_CPURegisters.regs.regC);
}

void Z80::RLC_D(uint8_t opcode)
{
    RLC(m_CPURegisters.regs.regD);
}

void Z80::RLC_E(uint8_t opcode)
{
    RLC(m_CPURegisters.regs.regE);
}

void Z80::RLC_H(uint8_t opcode)
{
    RLC(m_CPURegisters.regs.regH);
}

void Z80::RLC_L(uint8_t opcode)
{
    RLC(m_CPURegisters.regs.regL);
}

void Z80::RLC_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    RLC(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RLC_A(uint8_t opcode)
{
    RLC(m_CPURegisters.regs.regA);
}

// =============================================================================
// RRC - Rotate Right Circular (0x08-0x0F)
// =============================================================================

void Z80::RRC_B(uint8_t opcode)
{
    RRC(m_CPURegisters.regs.regB);
}

void Z80::RRC_C(uint8_t opcode)
{
    RRC(m_CPURegisters.regs.regC);
}

void Z80::RRC_D(uint8_t opcode)
{
    RRC(m_CPURegisters.regs.regD);
}

void Z80::RRC_E(uint8_t opcode)
{
    RRC(m_CPURegisters.regs.regE);
}

void Z80::RRC_H(uint8_t opcode)
{
    RRC(m_CPURegisters.regs.regH);
}

void Z80::RRC_L(uint8_t opcode)
{
    RRC(m_CPURegisters.regs.regL);
}

void Z80::RRC_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    RRC(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RRC_A(uint8_t opcode)
{
    RRC(m_CPURegisters.regs.regA);
}

// =============================================================================
// RL - Rotate Left (0x10-0x17)
// =============================================================================

void Z80::RL_B(uint8_t opcode)
{
    RL(m_CPURegisters.regs.regB);
}

void Z80::RL_C(uint8_t opcode)
{
    RL(m_CPURegisters.regs.regC);
}

void Z80::RL_D(uint8_t opcode)
{
    RL(m_CPURegisters.regs.regD);
}

void Z80::RL_E(uint8_t opcode)
{
    RL(m_CPURegisters.regs.regE);
}

void Z80::RL_H(uint8_t opcode)
{
    RL(m_CPURegisters.regs.regH);
}

void Z80::RL_L(uint8_t opcode)
{
    RL(m_CPURegisters.regs.regL);
}

void Z80::RL_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    RL(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RL_A(uint8_t opcode)
{
    RL(m_CPURegisters.regs.regA);
}

// =============================================================================
// RR - Rotate Right (0x18-0x1F)
// =============================================================================

void Z80::RR_B(uint8_t opcode)
{
    RR(m_CPURegisters.regs.regB);
}

void Z80::RR_C(uint8_t opcode)
{
    RR(m_CPURegisters.regs.regC);
}

void Z80::RR_D(uint8_t opcode)
{
    RR(m_CPURegisters.regs.regD);
}

void Z80::RR_E(uint8_t opcode)
{
    RR(m_CPURegisters.regs.regE);
}

void Z80::RR_H(uint8_t opcode)
{
    RR(m_CPURegisters.regs.regH);
}

void Z80::RR_L(uint8_t opcode)
{
    RR(m_CPURegisters.regs.regL);
}

void Z80::RR_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    RR(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RR_A(uint8_t opcode)
{
    RR(m_CPURegisters.regs.regA);
}

// =============================================================================
// SLA - Shift Left Arithmetic (0x20-0x27)
// =============================================================================

void Z80::SLA_B(uint8_t opcode)
{
    SLA(m_CPURegisters.regs.regB);
}

void Z80::SLA_C(uint8_t opcode)
{
    SLA(m_CPURegisters.regs.regC);
}

void Z80::SLA_D(uint8_t opcode)
{
    SLA(m_CPURegisters.regs.regD);
}

void Z80::SLA_E(uint8_t opcode)
{
    SLA(m_CPURegisters.regs.regE);
}

void Z80::SLA_H(uint8_t opcode)
{
    SLA(m_CPURegisters.regs.regH);
}

void Z80::SLA_L(uint8_t opcode)
{
    SLA(m_CPURegisters.regs.regL);
}

void Z80::SLA_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    SLA(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SLA_A(uint8_t opcode)
{
    SLA(m_CPURegisters.regs.regA);
}

// =============================================================================
// SRA - Shift Right Arithmetic (0x28-0x2F)
// =============================================================================

void Z80::SRA_B(uint8_t opcode)
{
    SRA(m_CPURegisters.regs.regB);
}

void Z80::SRA_C(uint8_t opcode)
{
    SRA(m_CPURegisters.regs.regC);
}

void Z80::SRA_D(uint8_t opcode)
{
    SRA(m_CPURegisters.regs.regD);
}

void Z80::SRA_E(uint8_t opcode)
{
    SRA(m_CPURegisters.regs.regE);
}

void Z80::SRA_H(uint8_t opcode)
{
    SRA(m_CPURegisters.regs.regH);
}

void Z80::SRA_L(uint8_t opcode)
{
    SRA(m_CPURegisters.regs.regL);
}

void Z80::SRA_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    SRA(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SRA_A(uint8_t opcode)
{
    SRA(m_CPURegisters.regs.regA);
}

// =============================================================================
// SLL - Shift Left Logical (undocumented) (0x30-0x37)
// =============================================================================

void Z80::SLL_B(uint8_t opcode)
{
    SLL(m_CPURegisters.regs.regB);
}

void Z80::SLL_C(uint8_t opcode)
{
    SLL(m_CPURegisters.regs.regC);
}

void Z80::SLL_D(uint8_t opcode)
{
    SLL(m_CPURegisters.regs.regD);
}

void Z80::SLL_E(uint8_t opcode)
{
    SLL(m_CPURegisters.regs.regE);
}

void Z80::SLL_H(uint8_t opcode)
{
    SLL(m_CPURegisters.regs.regH);
}

void Z80::SLL_L(uint8_t opcode)
{
    SLL(m_CPURegisters.regs.regL);
}

void Z80::SLL_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    SLL(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SLL_A(uint8_t opcode)
{
    SLL(m_CPURegisters.regs.regA);
}

// =============================================================================
// SRL - Shift Right Logical (0x38-0x3F)
// =============================================================================

void Z80::SRL_B(uint8_t opcode)
{
    SRL(m_CPURegisters.regs.regB);
}

void Z80::SRL_C(uint8_t opcode)
{
    SRL(m_CPURegisters.regs.regC);
}

void Z80::SRL_D(uint8_t opcode)
{
    SRL(m_CPURegisters.regs.regD);
}

void Z80::SRL_E(uint8_t opcode)
{
    SRL(m_CPURegisters.regs.regE);
}

void Z80::SRL_H(uint8_t opcode)
{
    SRL(m_CPURegisters.regs.regH);
}

void Z80::SRL_L(uint8_t opcode)
{
    SRL(m_CPURegisters.regs.regL);
}

void Z80::SRL_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    SRL(t);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SRL_A(uint8_t opcode)
{
    SRL(m_CPURegisters.regs.regA);
}

// =============================================================================
// BIT 0 (0x40-0x47)
// =============================================================================

void Z80::BIT_0_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 0);
}

void Z80::BIT_0_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 0);
}

void Z80::BIT_0_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 0);
}

void Z80::BIT_0_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 0);
}

void Z80::BIT_0_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 0);
}

void Z80::BIT_0_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 0);
}

void Z80::BIT_0_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 0);
}

void Z80::BIT_0_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 0);
}

// =============================================================================
// BIT 1 (0x48-0x4F)
// =============================================================================

void Z80::BIT_1_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 1);
}

void Z80::BIT_1_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 1);
}

void Z80::BIT_1_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 1);
}

void Z80::BIT_1_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 1);
}

void Z80::BIT_1_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 1);
}

void Z80::BIT_1_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 1);
}

void Z80::BIT_1_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 1);
}

void Z80::BIT_1_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 1);
}

// =============================================================================
// BIT 2 (0x50-0x57)
// =============================================================================

void Z80::BIT_2_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 2);
}

void Z80::BIT_2_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 2);
}

void Z80::BIT_2_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 2);
}

void Z80::BIT_2_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 2);
}

void Z80::BIT_2_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 2);
}

void Z80::BIT_2_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 2);
}

void Z80::BIT_2_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 2);
}

void Z80::BIT_2_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 2);
}

// =============================================================================
// BIT 3 (0x58-0x5F)
// =============================================================================

void Z80::BIT_3_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 3);
}

void Z80::BIT_3_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 3);
}

void Z80::BIT_3_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 3);
}

void Z80::BIT_3_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 3);
}

void Z80::BIT_3_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 3);
}

void Z80::BIT_3_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 3);
}

void Z80::BIT_3_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 3);
}

void Z80::BIT_3_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 3);
}

// =============================================================================
// BIT 4 (0x60-0x67)
// =============================================================================

void Z80::BIT_4_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 4);
}

void Z80::BIT_4_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 4);
}

void Z80::BIT_4_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 4);
}

void Z80::BIT_4_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 4);
}

void Z80::BIT_4_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 4);
}

void Z80::BIT_4_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 4);
}

void Z80::BIT_4_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 4);
}

void Z80::BIT_4_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 4);
}

// =============================================================================
// BIT 5 (0x68-0x6F)
// =============================================================================

void Z80::BIT_5_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 5);
}

void Z80::BIT_5_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 5);
}

void Z80::BIT_5_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 5);
}

void Z80::BIT_5_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 5);
}

void Z80::BIT_5_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 5);
}

void Z80::BIT_5_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 5);
}

void Z80::BIT_5_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 5);
}

void Z80::BIT_5_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 5);
}

// =============================================================================
// BIT 6 (0x70-0x77)
// =============================================================================

void Z80::BIT_6_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 6);
}

void Z80::BIT_6_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 6);
}

void Z80::BIT_6_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 6);
}

void Z80::BIT_6_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 6);
}

void Z80::BIT_6_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 6);
}

void Z80::BIT_6_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 6);
}

void Z80::BIT_6_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 6);
}

void Z80::BIT_6_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 6);
}

// =============================================================================
// BIT 7 (0x78-0x7F)
// =============================================================================

void Z80::BIT_7_B(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regB, 7);
}

void Z80::BIT_7_C(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regC, 7);
}

void Z80::BIT_7_D(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regD, 7);
}

void Z80::BIT_7_E(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regE, 7);
}

void Z80::BIT_7_H(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regH, 7);
}

void Z80::BIT_7_L(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regL, 7);
}

void Z80::BIT_7_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    BitWithMemptr(t, 7);
}

void Z80::BIT_7_A(uint8_t opcode)
{
    Bit(m_CPURegisters.regs.regA, 7);
}

// =============================================================================
// RES 0 (0x80-0x87)
// =============================================================================

void Z80::RES_0_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 0);
}

void Z80::RES_0_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 0);
}

void Z80::RES_0_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 0);
}

void Z80::RES_0_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 0);
}

void Z80::RES_0_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 0);
}

void Z80::RES_0_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 0);
}

void Z80::RES_0_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 0);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_0_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 0);
}

// =============================================================================
// RES 1 (0x88-0x8F)
// =============================================================================

void Z80::RES_1_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 1);
}

void Z80::RES_1_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 1);
}

void Z80::RES_1_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 1);
}

void Z80::RES_1_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 1);
}

void Z80::RES_1_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 1);
}

void Z80::RES_1_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 1);
}

void Z80::RES_1_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_1_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 1);
}

// =============================================================================
// RES 2 (0x90-0x97)
// =============================================================================

void Z80::RES_2_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 2);
}

void Z80::RES_2_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 2);
}

void Z80::RES_2_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 2);
}

void Z80::RES_2_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 2);
}

void Z80::RES_2_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 2);
}

void Z80::RES_2_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 2);
}

void Z80::RES_2_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 2);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_2_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 2);
}

// =============================================================================
// RES 3 (0x98-0x9F)
// =============================================================================

void Z80::RES_3_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 3);
}

void Z80::RES_3_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 3);
}

void Z80::RES_3_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 3);
}

void Z80::RES_3_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 3);
}

void Z80::RES_3_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 3);
}

void Z80::RES_3_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 3);
}

void Z80::RES_3_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 3);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_3_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 3);
}

// =============================================================================
// RES 4 (0xA0-0xA7)
// =============================================================================

void Z80::RES_4_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 4);
}

void Z80::RES_4_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 4);
}

void Z80::RES_4_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 4);
}

void Z80::RES_4_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 4);
}

void Z80::RES_4_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 4);
}

void Z80::RES_4_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 4);
}

void Z80::RES_4_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 4);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_4_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 4);
}

// =============================================================================
// RES 5 (0xA8-0xAF)
// =============================================================================

void Z80::RES_5_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 5);
}

void Z80::RES_5_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 5);
}

void Z80::RES_5_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 5);
}

void Z80::RES_5_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 5);
}

void Z80::RES_5_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 5);
}

void Z80::RES_5_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 5);
}

void Z80::RES_5_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 5);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_5_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 5);
}

// =============================================================================
// RES 6 (0xB0-0xB7)
// =============================================================================

void Z80::RES_6_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 6);
}

void Z80::RES_6_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 6);
}

void Z80::RES_6_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 6);
}

void Z80::RES_6_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 6);
}

void Z80::RES_6_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 6);
}

void Z80::RES_6_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 6);
}

void Z80::RES_6_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 6);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_6_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 6);
}

// =============================================================================
// RES 7 (0xB8-0xBF)
// =============================================================================

void Z80::RES_7_B(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regB, 7);
}

void Z80::RES_7_C(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regC, 7);
}

void Z80::RES_7_D(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regD, 7);
}

void Z80::RES_7_E(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regE, 7);
}

void Z80::RES_7_H(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regH, 7);
}

void Z80::RES_7_L(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regL, 7);
}

void Z80::RES_7_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Res(t, 7);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::RES_7_A(uint8_t opcode)
{
    Res(m_CPURegisters.regs.regA, 7);
}

// =============================================================================
// SET 0 (0xC0-0xC7)
// =============================================================================

void Z80::SET_0_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 0);
}

void Z80::SET_0_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 0);
}

void Z80::SET_0_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 0);
}

void Z80::SET_0_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 0);
}

void Z80::SET_0_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 0);
}

void Z80::SET_0_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 0);
}

void Z80::SET_0_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 0);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_0_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 0);
}

// =============================================================================
// SET 1 (0xC8-0xCF)
// =============================================================================

void Z80::SET_1_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 1);
}

void Z80::SET_1_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 1);
}

void Z80::SET_1_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 1);
}

void Z80::SET_1_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 1);
}

void Z80::SET_1_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 1);
}

void Z80::SET_1_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 1);
}

void Z80::SET_1_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_1_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 1);
}

// =============================================================================
// SET 2 (0xD0-0xD7)
// =============================================================================

void Z80::SET_2_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 2);
}

void Z80::SET_2_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 2);
}

void Z80::SET_2_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 2);
}

void Z80::SET_2_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 2);
}

void Z80::SET_2_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 2);
}

void Z80::SET_2_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 2);
}

void Z80::SET_2_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 2);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_2_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 2);
}

// =============================================================================
// SET 3 (0xD8-0xDF)
// =============================================================================

void Z80::SET_3_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 3);
}

void Z80::SET_3_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 3);
}

void Z80::SET_3_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 3);
}

void Z80::SET_3_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 3);
}

void Z80::SET_3_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 3);
}

void Z80::SET_3_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 3);
}

void Z80::SET_3_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 3);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_3_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 3);
}

// =============================================================================
// SET 4 (0xE0-0xE7)
// =============================================================================

void Z80::SET_4_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 4);
}

void Z80::SET_4_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 4);
}

void Z80::SET_4_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 4);
}

void Z80::SET_4_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 4);
}

void Z80::SET_4_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 4);
}

void Z80::SET_4_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 4);
}

void Z80::SET_4_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 4);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_4_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 4);
}

// =============================================================================
// SET 5 (0xE8-0xEF)
// =============================================================================

void Z80::SET_5_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 5);
}

void Z80::SET_5_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 5);
}

void Z80::SET_5_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 5);
}

void Z80::SET_5_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 5);
}

void Z80::SET_5_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 5);
}

void Z80::SET_5_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 5);
}

void Z80::SET_5_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 5);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_5_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 5);
}

// =============================================================================
// SET 6 (0xF0-0xF7)
// =============================================================================

void Z80::SET_6_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 6);
}

void Z80::SET_6_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 6);
}

void Z80::SET_6_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 6);
}

void Z80::SET_6_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 6);
}

void Z80::SET_6_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 6);
}

void Z80::SET_6_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 6);
}

void Z80::SET_6_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 6);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_6_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 6);
}

// =============================================================================
// SET 7 (0xF8-0xFF)
// =============================================================================

void Z80::SET_7_B(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regB, 7);
}

void Z80::SET_7_C(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regC, 7);
}

void Z80::SET_7_D(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regD, 7);
}

void Z80::SET_7_E(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regE, 7);
}

void Z80::SET_7_H(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regH, 7);
}

void Z80::SET_7_L(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regL, 7);
}

void Z80::SET_7_off_HL(uint8_t opcode)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    Set(t, 7);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
}

void Z80::SET_7_A(uint8_t opcode)
{
    Set(m_CPURegisters.regs.regA, 7);
}

} // namespace zxspec
