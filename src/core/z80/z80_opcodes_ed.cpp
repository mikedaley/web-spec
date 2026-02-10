/*
 * z80_opcodes_ed.cpp - Z80 ED prefix opcodes (extended operations)
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

void Z80::IN_B_off_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    m_CPURegisters.regs.regB = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regB];
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regB];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_B(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_HL_BC(uint8_t)
{
    // Handle contention
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);
    z80MemContention(static_cast<uint16_t>((m_CPURegisters.regI << 8) | m_CPURegisters.regR), 1);

    Sbc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regBC);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_nn_BC(uint8_t)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemWrite(m_MEMPTR++, m_CPURegisters.regs.regC);
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regB);
}

//-----------------------------------------------------------------------------------------

void Z80::NEG(uint8_t)
{
    uint8_t t = m_CPURegisters.regs.regA;
    m_CPURegisters.regs.regA = 0;
    Sub8(t);
}

//-----------------------------------------------------------------------------------------

void Z80::RETN(uint8_t)
{
    m_CPURegisters.IFF1 = m_CPURegisters.IFF2;

    m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

    m_CPURegisters.regPC = m_MEMPTR;
}

//-----------------------------------------------------------------------------------------

void Z80::IM_0(uint8_t)
{
    m_CPURegisters.IM = 0;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_I_A(uint8_t)
{
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    m_CPURegisters.regI = m_CPURegisters.regs.regA;
    m_LD_I_A = true;
}

//-----------------------------------------------------------------------------------------

void Z80::IN_C_off_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    m_CPURegisters.regs.regC = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regC];
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regC];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regC);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_HL_BC(uint8_t)
{
    // Handle contention
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);

    Adc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regBC);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_BC_off_nn(uint8_t)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regs.regC = z80MemRead(m_MEMPTR++);
    m_CPURegisters.regs.regB = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::RETI(uint8_t)
{
    m_CPURegisters.IFF1 = m_CPURegisters.IFF2;

    m_MEMPTR = z80MemRead(m_CPURegisters.regSP++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regSP++) << 8;

    m_CPURegisters.regPC = m_MEMPTR;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_R_A(uint8_t)
{
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    m_CPURegisters.regR = m_CPURegisters.regs.regA;
}

//-----------------------------------------------------------------------------------------

void Z80::IN_D_off_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    m_CPURegisters.regs.regD = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regD];
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regD];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_D(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_HL_DE(uint8_t)
{
    // Handle contention
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);

    Sbc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regDE);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_nn_DE(uint8_t)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemWrite(m_MEMPTR++, m_CPURegisters.regs.regE);
    z80MemWrite(m_MEMPTR, m_CPURegisters.regs.regD);
}

//-----------------------------------------------------------------------------------------

void Z80::IM_1(uint8_t)
{
    m_CPURegisters.IM = 1;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_I(uint8_t)
{
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    m_CPURegisters.regs.regA = m_CPURegisters.regI;
    m_CPURegisters.regs.regF = (m_CPURegisters.regs.regF & FLAG_C);
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= (m_CPURegisters.IFF2 == 0) ? 0 : FLAG_V;

    m_Iff2_read = true;
    m_LD_I_A = true;
}

//-----------------------------------------------------------------------------------------

void Z80::IN_E_off_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    m_CPURegisters.regs.regE = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regE];
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regE];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_E(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regE);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_HL_DE(uint8_t)
{
    // Handle contention
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);

    Adc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regDE);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_DE_off_nn(uint8_t)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regs.regE = z80MemRead(m_MEMPTR++);
    m_CPURegisters.regs.regD = z80MemRead(m_MEMPTR);
}

//-----------------------------------------------------------------------------------------

void Z80::IM_2(uint8_t)
{
    m_CPURegisters.IM = 2;
}

//-----------------------------------------------------------------------------------------

void Z80::LD_A_R(uint8_t)
{
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    m_CPURegisters.regs.regA = m_CPURegisters.regR;
    m_CPURegisters.regs.regF = (m_CPURegisters.regs.regF & FLAG_C);
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= (m_CPURegisters.IFF2 == 0) ? 0 : FLAG_V;

    m_Iff2_read = true;
}

//-----------------------------------------------------------------------------------------

void Z80::IN_H_off_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    m_CPURegisters.regs.regH = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regH];
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regH];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_H(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regH);
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_HL_HL(uint8_t)
{
    // Handle contention
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);

    Sbc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------

void Z80::RRD(uint8_t)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, (m_CPURegisters.regs.regA << 4) | (t >> 4));
    m_CPURegisters.regs.regA = (m_CPURegisters.regs.regA & 0xf0) | (t & 0x0f);
    m_CPURegisters.regs.regF = m_CPURegisters.regs.regF & FLAG_C;
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];

    m_MEMPTR = m_CPURegisters.reg_pairs.regHL + 1;
}

//-----------------------------------------------------------------------------------------

void Z80::IN_L_off_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    m_CPURegisters.regs.regL = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regL];
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regL];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_L(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regL);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_HL_HL(uint8_t)
{
    // Handle contention
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);

    Adc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.reg_pairs.regHL);
}

//-----------------------------------------------------------------------------------------

void Z80::RLD(uint8_t)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, (m_CPURegisters.regs.regA & 0x0f) | (t << 4));
    m_CPURegisters.regs.regA = (m_CPURegisters.regs.regA & 0xf0) | (t >> 4);
    m_CPURegisters.regs.regF = m_CPURegisters.regs.regF & FLAG_C;
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];

    m_MEMPTR = m_CPURegisters.reg_pairs.regHL + 1;
}

//-----------------------------------------------------------------------------------------

void Z80::IN_F_off_C(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    uint8_t t = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[t];
    m_CPURegisters.regs.regF |= m_ParityTable[t];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_0(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    if (m_CPUType == CpuType::CMOS)
    {
        z80IOWrite(m_CPURegisters.reg_pairs.regBC, 0xff);
    }
    else
    {
        z80IOWrite(m_CPURegisters.reg_pairs.regBC, 0);
    }
}

//-----------------------------------------------------------------------------------------

void Z80::SBC_HL_SP(uint8_t)
{
    // Handle contention
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);

    Sbc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regSP);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_off_nn_SP(uint8_t)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    z80MemWrite(m_MEMPTR++, m_CPURegisters.regSP & 0xff);
    z80MemWrite(m_MEMPTR, (m_CPURegisters.regSP >> 8) & 0xff);
}

//-----------------------------------------------------------------------------------------

void Z80::IN_A_off_C(uint8_t)
{
    m_CPURegisters.regs.regA = z80IORead(m_CPURegisters.reg_pairs.regBC);
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= m_ParityTable[m_CPURegisters.regs.regA];
}

//-----------------------------------------------------------------------------------------

void Z80::OUT_off_C_A(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, m_CPURegisters.regs.regA);
}

//-----------------------------------------------------------------------------------------

void Z80::ADC_HL_SP(uint8_t)
{
    // Handle contention
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);

    Adc16(m_CPURegisters.reg_pairs.regHL, m_CPURegisters.regSP);
}

//-----------------------------------------------------------------------------------------

void Z80::LD_SP_off_nn(uint8_t)
{
    m_MEMPTR = z80MemRead(m_CPURegisters.regPC++);
    m_MEMPTR |= z80MemRead(m_CPURegisters.regPC++) << 8;

    m_CPURegisters.regSP = z80MemRead(m_MEMPTR++);
    m_CPURegisters.regSP |= (z80MemRead(m_MEMPTR) << 8);
}

//-----------------------------------------------------------------------------------------

void Z80::LDI(uint8_t)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemWrite(m_CPURegisters.reg_pairs.regDE, t);

    // Get the temp stuff for flags
    t += m_CPURegisters.regs.regA;

    z80MemContention(m_CPURegisters.reg_pairs.regDE, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regDE, 1);

    m_CPURegisters.reg_pairs.regDE++;
    m_CPURegisters.reg_pairs.regHL++;
    m_CPURegisters.reg_pairs.regBC--;

    m_CPURegisters.regs.regF &= (FLAG_C | FLAG_S | FLAG_Z);
    m_CPURegisters.regs.regF |= (m_CPURegisters.reg_pairs.regBC != 0) ? FLAG_V : 0;
    m_CPURegisters.regs.regF |= (t & (1 << 1)) ? FLAG_5 : 0;
    m_CPURegisters.regs.regF |= (t & (1 << 3)) ? FLAG_3 : 0;
}

//-----------------------------------------------------------------------------------------

void Z80::CPI(uint8_t)
{
    static uint8_t halfcarry_lookup[] = { 0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H };

    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    uint16_t full_answer = m_CPURegisters.regs.regA - t;

    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);

    m_CPURegisters.reg_pairs.regHL++;
    m_CPURegisters.reg_pairs.regBC--;

    int lookup = ((m_CPURegisters.regs.regA & 0x08) >> 3) | ((t & 0x08) >> 2) | ((full_answer & 0x08) >> 1);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= (full_answer == 0) ? FLAG_Z : 0;
    m_CPURegisters.regs.regF |= ((full_answer & 0x80) == 0x80) ? FLAG_S : 0;
    m_CPURegisters.regs.regF |= (halfcarry_lookup[lookup] | FLAG_N);
    m_CPURegisters.regs.regF |= (m_CPURegisters.reg_pairs.regBC != 0) ? FLAG_V : 0;

    if (m_CPURegisters.regs.regF & FLAG_H)
    {
        full_answer--;
    }

    m_CPURegisters.regs.regF |= (full_answer & (1 << 1)) ? FLAG_5 : 0;
    m_CPURegisters.regs.regF |= (full_answer & (1 << 3)) ? FLAG_3 : 0;

    m_MEMPTR++;
}

//-----------------------------------------------------------------------------------------

void Z80::INI(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;

    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    uint8_t t = z80IORead(m_CPURegisters.reg_pairs.regBC);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
    m_CPURegisters.reg_pairs.regHL++;
    m_CPURegisters.regs.regB--;

    uint16_t temp = ((m_CPURegisters.regs.regC + 1) & 0xff) + t;

    m_CPURegisters.regs.regF = m_SZ35Table[m_CPURegisters.regs.regB];
    m_CPURegisters.regs.regF |= ((t & 0x80) == 0x80) ? FLAG_N : 0;
    m_CPURegisters.regs.regF |= (temp > 255) ? (FLAG_H | FLAG_C) : 0;
    m_CPURegisters.regs.regF |= m_ParityTable[((temp & 7) ^ m_CPURegisters.regs.regB)];
}

//-----------------------------------------------------------------------------------------

void Z80::OUTI(uint8_t)
{
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    m_CPURegisters.regs.regB--;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, t);
    m_CPURegisters.reg_pairs.regHL++;

    uint16_t temp = m_CPURegisters.regs.regL + t;

    m_CPURegisters.regs.regF = m_SZ35Table[m_CPURegisters.regs.regB];
    m_CPURegisters.regs.regF |= ((t & 0x80) == 0x80) ? FLAG_N : 0;
    m_CPURegisters.regs.regF |= (temp > 255) ? (FLAG_H | FLAG_C) : 0;
    m_CPURegisters.regs.regF |= m_ParityTable[((temp & 7) ^ m_CPURegisters.regs.regB)];

    m_MEMPTR = m_CPURegisters.reg_pairs.regBC + 1;
}

//-----------------------------------------------------------------------------------------

void Z80::LDD(uint8_t)
{
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    z80MemWrite(m_CPURegisters.reg_pairs.regDE, t);

    // Add for flags
    t += m_CPURegisters.regs.regA;

    z80MemContention(m_CPURegisters.reg_pairs.regDE, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regDE, 1);

    m_CPURegisters.reg_pairs.regDE--;
    m_CPURegisters.reg_pairs.regHL--;
    m_CPURegisters.reg_pairs.regBC--;

    m_CPURegisters.regs.regF &= (FLAG_C | FLAG_S | FLAG_Z);
    m_CPURegisters.regs.regF |= (m_CPURegisters.reg_pairs.regBC != 0) ? FLAG_V : 0;
    m_CPURegisters.regs.regF |= (t & (1 << 1)) ? FLAG_5 : 0;
    m_CPURegisters.regs.regF |= (t & (1 << 3)) ? FLAG_3 : 0;
}

//-----------------------------------------------------------------------------------------

void Z80::CPD(uint8_t)
{
    static uint8_t halfcarry_lookup[] = { 0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H };

    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    uint16_t full_answer = m_CPURegisters.regs.regA - t;

    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);
    z80MemContention(m_CPURegisters.reg_pairs.regHL, 1);

    m_CPURegisters.reg_pairs.regHL--;
    m_CPURegisters.reg_pairs.regBC--;

    int lookup = ((m_CPURegisters.regs.regA & 0x08) >> 3) | ((t & 0x08) >> 2) | ((full_answer & 0x08) >> 1);
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= (full_answer == 0) ? FLAG_Z : 0;
    m_CPURegisters.regs.regF |= ((full_answer & 0x80) == 0x80) ? FLAG_S : 0;
    m_CPURegisters.regs.regF |= (halfcarry_lookup[lookup] | FLAG_N);
    m_CPURegisters.regs.regF |= (m_CPURegisters.reg_pairs.regBC != 0) ? FLAG_V : 0;

    if (m_CPURegisters.regs.regF & FLAG_H)
    {
        full_answer--;
    }

    m_CPURegisters.regs.regF |= (full_answer & (1 << 1)) ? FLAG_5 : 0;
    m_CPURegisters.regs.regF |= (full_answer & (1 << 3)) ? FLAG_3 : 0;

    m_MEMPTR--;
}

//-----------------------------------------------------------------------------------------

void Z80::IND(uint8_t)
{
    m_MEMPTR = m_CPURegisters.reg_pairs.regBC - 1;

    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    uint8_t t = z80IORead(m_CPURegisters.reg_pairs.regBC);
    z80MemWrite(m_CPURegisters.reg_pairs.regHL, t);
    m_CPURegisters.reg_pairs.regHL--;
    m_CPURegisters.regs.regB--;

    uint16_t temp = ((m_CPURegisters.regs.regC - 1) & 0xff) + t;

    m_CPURegisters.regs.regF = m_SZ35Table[m_CPURegisters.regs.regB];
    m_CPURegisters.regs.regF |= ((t & 0x80) == 0x80) ? FLAG_N : 0;
    m_CPURegisters.regs.regF |= (temp > 255) ? (FLAG_H | FLAG_C) : 0;
    m_CPURegisters.regs.regF |= m_ParityTable[((temp & 7) ^ m_CPURegisters.regs.regB)];
}

//-----------------------------------------------------------------------------------------

void Z80::OUTD(uint8_t)
{
    z80MemContention((m_CPURegisters.regI << 8) | m_CPURegisters.regR, 1);
    uint8_t t = z80MemRead(m_CPURegisters.reg_pairs.regHL);
    m_CPURegisters.regs.regB--;
    z80IOWrite(m_CPURegisters.reg_pairs.regBC, t);
    m_CPURegisters.reg_pairs.regHL--;

    uint16_t temp = m_CPURegisters.regs.regL + t;

    m_CPURegisters.regs.regF = m_SZ35Table[m_CPURegisters.regs.regB];
    m_CPURegisters.regs.regF |= ((t & 0x80) == 0x80) ? FLAG_N : 0;
    m_CPURegisters.regs.regF |= (temp > 255) ? (FLAG_H | FLAG_C) : 0;
    m_CPURegisters.regs.regF |= m_ParityTable[((temp & 7) ^ m_CPURegisters.regs.regB)];

    m_MEMPTR = m_CPURegisters.reg_pairs.regBC - 1;
}

//-----------------------------------------------------------------------------------------

void Z80::LDIR(uint8_t opcode)
{
    LDI(opcode);

    if (m_CPURegisters.reg_pairs.regBC != 0)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regDE - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE - 1, 1);
        m_CPURegisters.regPC -= 2;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }
}

//-----------------------------------------------------------------------------------------

void Z80::CPIR(uint8_t opcode)
{
    CPI(opcode);

    if (m_CPURegisters.reg_pairs.regBC != 0 && (m_CPURegisters.regs.regF & FLAG_Z) != FLAG_Z)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        m_CPURegisters.regPC -= 2;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }
}

//-----------------------------------------------------------------------------------------

void Z80::INIR(uint8_t opcode)
{
    INI(opcode);

    if (m_CPURegisters.regs.regB != 0)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL - 1, 1);
        m_CPURegisters.regPC -= 2;
    }
}

//-----------------------------------------------------------------------------------------

void Z80::OTIR(uint8_t opcode)
{
    OUTI(opcode);

    if (m_CPURegisters.regs.regB != 0)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        m_CPURegisters.regPC -= 2;
    }
}

//-----------------------------------------------------------------------------------------

void Z80::LDDR(uint8_t opcode)
{
    LDD(opcode);

    if (m_CPURegisters.reg_pairs.regBC != 0)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regDE + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regDE + 1, 1);
        m_CPURegisters.regPC -= 2;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }
}

//-----------------------------------------------------------------------------------------

void Z80::CPDR(uint8_t opcode)
{
    CPD(opcode);

    if (m_CPURegisters.reg_pairs.regBC != 0 && (m_CPURegisters.regs.regF & FLAG_Z) != FLAG_Z)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        m_CPURegisters.regPC -= 2;
        m_MEMPTR = m_CPURegisters.regPC + 1;
    }
}

//-----------------------------------------------------------------------------------------

void Z80::INDR(uint8_t opcode)
{
    IND(opcode);

    if (m_CPURegisters.regs.regB != 0)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regHL + 1, 1);
        m_CPURegisters.regPC -= 2;
    }
}

//-----------------------------------------------------------------------------------------

void Z80::OTDR(uint8_t opcode)
{
    OUTD(opcode);

    if (m_CPURegisters.regs.regB != 0)
    {
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        z80MemContention(m_CPURegisters.reg_pairs.regBC, 1);
        m_CPURegisters.regPC -= 2;
    }
}

//-----------------------------------------------------------------------------------------

} // namespace zxspec
