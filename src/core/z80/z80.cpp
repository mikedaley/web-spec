/*
 * z80.cpp - Z80 CPU emulation core - execution engine, ALU, reset, register access
 *
 * Ported and modernized from SpectREMCPP by Mike Daley
 * Original: CZ80Core by Mike Daley
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "z80.hpp"

namespace zxspec {

Z80::Z80()
{
    m_PrevOpcodeFlags = 0;
    reset();
}

void Z80::initialise(MemReadFunc memRead, MemWriteFunc memWrite,
                     IoReadFunc ioRead, IoWriteFunc ioWrite,
                     ContentionFunc contention, void* param)
{
    m_Param = param;
    m_MemRead = memRead;
    m_MemWrite = memWrite;
    m_IORead = ioRead;
    m_IOWrite = ioWrite;
    m_MemContentionHandling = contention;

    for (int i = 0; i < 256; i++)
    {
        m_SZ35Table[i] = (i == 0) ? FLAG_Z : 0;
        m_SZ35Table[i] |= ((i & 0x80) == 0x80) ? FLAG_S : 0;
        m_SZ35Table[i] |= i & (FLAG_3 | FLAG_5);

        uint8_t parity = 0;
        uint8_t v = static_cast<uint8_t>(i);
        for (int b = 0; b < 8; b++)
        {
            parity ^= v & 1;
            v >>= 1;
        }

        m_ParityTable[i] = (parity ? 0 : FLAG_P);
    }
}

void Z80::registerOpcodeCallback(OpcodeCallback callback)
{
    m_OpcodeCallback = callback;
}

uint8_t Z80::z80MemRead(uint16_t address, uint32_t tstates)
{
    z80MemContention(address, tstates);

    if (m_MemRead)
    {
        return m_MemRead(address, m_Param);
    }

    return 0;
}

void Z80::z80MemWrite(uint16_t address, uint8_t data, uint32_t tstates)
{
    z80MemContention(address, tstates);

    if (m_MemWrite)
    {
        m_MemWrite(address, data, m_Param);
    }
}

uint8_t Z80::z80IORead(uint16_t address)
{
    if (m_IORead)
    {
        return m_IORead(address, m_Param);
    }

    return 0;
}

void Z80::z80IOWrite(uint16_t address, uint8_t data)
{
    if (m_IOWrite)
    {
        m_IOWrite(address, data, m_Param);
    }
}

void Z80::z80MemContention(uint16_t address, uint32_t tstates)
{
    if (m_MemContentionHandling)
    {
        m_MemContentionHandling(address, tstates, m_Param);
    }

    m_CPURegisters.TStates += tstates;
}

uint32_t Z80::execute(uint32_t numTStates, uint32_t intTStates)
{
    uint32_t tstates = m_CPURegisters.TStates;

    do
    {
        if (m_CPURegisters.NMIReq)
        {
            m_CPURegisters.NMIReq = false;
            m_CPURegisters.IFF1 = 0;
            if (!m_CPURegisters.IntReq)
            {
                m_CPURegisters.IFF2 = 0;
            }
            z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
            z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

            if (m_CPURegisters.Halted)
            {
                m_CPURegisters.Halted = false;
            }

            m_CPURegisters.regPC = 0x0066;
        }
        else if (m_CPURegisters.IntReq)
        {
            if (m_CPURegisters.EIHandled == false &&
                m_CPURegisters.DDFDmultiByte == false &&
                m_CPURegisters.IFF1 != 0 &&
                m_CPURegisters.TStates < intTStates)
            {
                if (m_Iff2_read && m_CPUType == CpuType::NMOS)
                {
                    m_CPURegisters.regs.regF &= ~FLAG_V;
                }

                if (m_CPURegisters.Halted)
                {
                    m_CPURegisters.Halted = false;
                    m_CPURegisters.regPC++;
                }

                m_CPURegisters.IFF1 = 0;
                m_CPURegisters.IFF2 = 0;
                m_CPURegisters.regR = (m_CPURegisters.regR & 0x80) | ((m_CPURegisters.regR + 1) & 0x7f);

                switch (m_CPURegisters.IM)
                {
                    case 0:
                    case 1:
                    default:
                        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
                        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

                        m_CPURegisters.regPC = 0x0038;
                        m_MEMPTR = m_CPURegisters.regPC;
                        m_CPURegisters.TStates += 7;
                        break;

                    case 2:
                        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 8) & 0xff);
                        z80MemWrite(--m_CPURegisters.regSP, (m_CPURegisters.regPC >> 0) & 0xff);

                        {
                            uint16_t address = (m_CPURegisters.regI << 8) | 0xff;
                            m_CPURegisters.regPC = z80MemRead(address + 0);
                            m_CPURegisters.regPC |= z80MemRead(address + 1) << 8;
                        }

                        m_MEMPTR = m_CPURegisters.regPC;
                        m_CPURegisters.TStates += 7;
                        break;
                }
            }
        }
        else if (m_CPURegisters.TStates > intTStates)
        {
            m_CPURegisters.IntReq = false;
        }

        m_CPURegisters.EIHandled = false;
        m_CPURegisters.DDFDmultiByte = false;
        m_Iff2_read = false;

        Z80OpcodeTable *table = &Main_Opcodes;

        uint8_t opcode = z80MemRead(m_CPURegisters.regPC, 4);

        m_CPURegisters.regPC++;
        m_CPURegisters.regR = (m_CPURegisters.regR & 0x80) | ((m_CPURegisters.regR + 1) & 0x7f);

        switch (opcode)
        {
            case 0xcb:
                table = &CB_Opcodes;

                opcode = z80MemRead(m_CPURegisters.regPC, 4);
                m_CPURegisters.regPC++;
                m_CPURegisters.regR = (m_CPURegisters.regR & 0x80) | ((m_CPURegisters.regR + 1) & 0x7f);
                break;

            case 0xdd:

                opcode = z80MemRead(m_CPURegisters.regPC, 4);
                m_CPURegisters.regPC++;
                m_CPURegisters.regR = (m_CPURegisters.regR & 0x80) | ((m_CPURegisters.regR + 1) & 0x7f);

                if (opcode == 0xcb)
                {
                    table = &DDCB_Opcodes;

                    int8_t offset = z80MemRead(m_CPURegisters.regPC);
                    m_CPURegisters.regPC++;
                    m_MEMPTR = m_CPURegisters.reg_pairs.regIX + offset;

                    opcode = z80MemRead(m_CPURegisters.regPC);
                    m_CPURegisters.regPC++;
                }
                else
                {
                    table = &DD_Opcodes;
                }
                break;

            case 0xed:
                table = &ED_Opcodes;

                opcode = z80MemRead(m_CPURegisters.regPC, 4);
                m_CPURegisters.regPC++;
                m_CPURegisters.regR = (m_CPURegisters.regR & 0x80) | ((m_CPURegisters.regR + 1) & 0x7f);
                break;

            case 0xfd:

                opcode = z80MemRead(m_CPURegisters.regPC, 4);
                m_CPURegisters.regPC++;
                m_CPURegisters.regR = (m_CPURegisters.regR & 0x80) | ((m_CPURegisters.regR + 1) & 0x7f);

                if (opcode == 0xcb)
                {
                    table = &FDCB_Opcodes;

                    int8_t offset = z80MemRead(m_CPURegisters.regPC);
                    m_CPURegisters.regPC++;
                    m_MEMPTR = m_CPURegisters.reg_pairs.regIY + offset;

                    opcode = z80MemRead(m_CPURegisters.regPC);
                    m_CPURegisters.regPC++;
                }
                else
                {
                    table = &FD_Opcodes;
                }
                break;
        }

        bool skip_instruction = false;

        if (m_OpcodeCallback)
        {
            skip_instruction = m_OpcodeCallback(opcode, m_CPURegisters.regPC - 1, m_Param);
        }

        if (!skip_instruction)
        {
            if (table->entries[opcode].function != nullptr)
            {
                (this->*table->entries[opcode].function)(opcode);

                m_PrevOpcodeFlags = table->entries[opcode].flags;
            }
            else
            {
                m_CPURegisters.DDFDmultiByte = true;
                m_CPURegisters.regPC--;
                m_CPURegisters.regR--;
                m_CPURegisters.TStates -= 4;
            }
        }

    } while (m_CPURegisters.TStates - tstates < numTStates);

    return m_CPURegisters.TStates - tstates;
}

void Z80::signalInterrupt()
{
    m_CPURegisters.IntReq = true;
}

void Z80::reset(bool hardReset)
{
    m_CPURegisters.regPC = 0x0000;
    m_CPURegisters.regR = 0;
    m_CPURegisters.regI = 0;

    m_CPURegisters.reg_pairs.regAF = 0xffff;
    m_CPURegisters.reg_pairs.regAF_ = 0xffff;
    m_CPURegisters.regSP = 0xffff;

    m_CPURegisters.IFF1 = 0;
    m_CPURegisters.IFF2 = 0;
    m_CPURegisters.IM = 0;
    m_CPURegisters.Halted = false;
    m_CPURegisters.EIHandled = false;
    m_CPURegisters.IntReq = false;
    m_CPURegisters.TStates = 0;

    if (hardReset)
    {
        m_CPURegisters.reg_pairs.regBC = 0x0000;
        m_CPURegisters.reg_pairs.regDE = 0x0000;
        m_CPURegisters.reg_pairs.regHL = 0x0000;
        m_CPURegisters.reg_pairs.regBC_ = 0x0000;
        m_CPURegisters.reg_pairs.regDE_ = 0x0000;
        m_CPURegisters.reg_pairs.regHL_ = 0x0000;
        m_CPURegisters.reg_pairs.regIX = 0x0000;
        m_CPURegisters.reg_pairs.regIY = 0x0000;
    }
}

uint8_t Z80::getRegister(ByteReg reg) const
{
    switch (reg)
    {
    case ByteReg::A:    return m_CPURegisters.regs.regA;
    case ByteReg::F:    return m_CPURegisters.regs.regF;
    case ByteReg::B:    return m_CPURegisters.regs.regB;
    case ByteReg::C:    return m_CPURegisters.regs.regC;
    case ByteReg::D:    return m_CPURegisters.regs.regD;
    case ByteReg::E:    return m_CPURegisters.regs.regE;
    case ByteReg::H:    return m_CPURegisters.regs.regH;
    case ByteReg::L:    return m_CPURegisters.regs.regL;
    case ByteReg::AltA: return m_CPURegisters.regs.regA_;
    case ByteReg::AltF: return m_CPURegisters.regs.regF_;
    case ByteReg::AltB: return m_CPURegisters.regs.regB_;
    case ByteReg::AltC: return m_CPURegisters.regs.regC_;
    case ByteReg::AltD: return m_CPURegisters.regs.regD_;
    case ByteReg::AltE: return m_CPURegisters.regs.regE_;
    case ByteReg::AltH: return m_CPURegisters.regs.regH_;
    case ByteReg::AltL: return m_CPURegisters.regs.regL_;
    case ByteReg::I:    return m_CPURegisters.regI;
    case ByteReg::R:    return m_CPURegisters.regR;
    }
    return 0;
}

uint16_t Z80::getRegister(WordReg reg) const
{
    switch (reg)
    {
    case WordReg::AF:    return m_CPURegisters.reg_pairs.regAF;
    case WordReg::HL:    return m_CPURegisters.reg_pairs.regHL;
    case WordReg::BC:    return m_CPURegisters.reg_pairs.regBC;
    case WordReg::DE:    return m_CPURegisters.reg_pairs.regDE;
    case WordReg::AltAF: return m_CPURegisters.reg_pairs.regAF_;
    case WordReg::AltHL: return m_CPURegisters.reg_pairs.regHL_;
    case WordReg::AltBC: return m_CPURegisters.reg_pairs.regBC_;
    case WordReg::AltDE: return m_CPURegisters.reg_pairs.regDE_;
    case WordReg::IX:    return m_CPURegisters.reg_pairs.regIX;
    case WordReg::IY:    return m_CPURegisters.reg_pairs.regIY;
    case WordReg::SP:    return m_CPURegisters.regSP;
    case WordReg::PC:    return m_CPURegisters.regPC;
    }
    return 0;
}

void Z80::setRegister(ByteReg reg, uint8_t data)
{
    switch (reg)
    {
    case ByteReg::A:    m_CPURegisters.regs.regA = data; break;
    case ByteReg::F:    m_CPURegisters.regs.regF = data; break;
    case ByteReg::B:    m_CPURegisters.regs.regB = data; break;
    case ByteReg::C:    m_CPURegisters.regs.regC = data; break;
    case ByteReg::D:    m_CPURegisters.regs.regD = data; break;
    case ByteReg::E:    m_CPURegisters.regs.regE = data; break;
    case ByteReg::H:    m_CPURegisters.regs.regH = data; break;
    case ByteReg::L:    m_CPURegisters.regs.regL = data; break;
    case ByteReg::AltA: m_CPURegisters.regs.regA_ = data; break;
    case ByteReg::AltF: m_CPURegisters.regs.regF_ = data; break;
    case ByteReg::AltB: m_CPURegisters.regs.regB_ = data; break;
    case ByteReg::AltC: m_CPURegisters.regs.regC_ = data; break;
    case ByteReg::AltD: m_CPURegisters.regs.regD_ = data; break;
    case ByteReg::AltE: m_CPURegisters.regs.regE_ = data; break;
    case ByteReg::AltH: m_CPURegisters.regs.regH_ = data; break;
    case ByteReg::AltL: m_CPURegisters.regs.regL_ = data; break;
    case ByteReg::I:    m_CPURegisters.regI = data; break;
    case ByteReg::R:    m_CPURegisters.regR = data; break;
    }
}

void Z80::setRegister(WordReg reg, uint16_t data)
{
    switch (reg)
    {
    case WordReg::AF:    m_CPURegisters.reg_pairs.regAF = data; break;
    case WordReg::HL:    m_CPURegisters.reg_pairs.regHL = data; break;
    case WordReg::BC:    m_CPURegisters.reg_pairs.regBC = data; break;
    case WordReg::DE:    m_CPURegisters.reg_pairs.regDE = data; break;
    case WordReg::AltAF: m_CPURegisters.reg_pairs.regAF_ = data; break;
    case WordReg::AltHL: m_CPURegisters.reg_pairs.regHL_ = data; break;
    case WordReg::AltBC: m_CPURegisters.reg_pairs.regBC_ = data; break;
    case WordReg::AltDE: m_CPURegisters.reg_pairs.regDE_ = data; break;
    case WordReg::IX:    m_CPURegisters.reg_pairs.regIX = data; break;
    case WordReg::IY:    m_CPURegisters.reg_pairs.regIY = data; break;
    case WordReg::SP:    m_CPURegisters.regSP = data; break;
    case WordReg::PC:    m_CPURegisters.regPC = data; break;
    }
}

// ALU Operations

void Z80::Inc(uint8_t& r)
{
    r++;

    m_CPURegisters.regs.regF = m_CPURegisters.regs.regF & FLAG_C;
    m_CPURegisters.regs.regF |= (r == 0x80) ? FLAG_V : 0;
    m_CPURegisters.regs.regF |= ((r & 0x0f) == 0x00) ? FLAG_H : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::Dec(uint8_t& r)
{
    m_CPURegisters.regs.regF = m_CPURegisters.regs.regF & FLAG_C;
    m_CPURegisters.regs.regF |= FLAG_N;
    m_CPURegisters.regs.regF |= ((r & 0x0f) == 0x00) ? FLAG_H : 0;

    r--;

    m_CPURegisters.regs.regF |= (r == 0x7f) ? FLAG_V : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::Add8(uint8_t& r)
{
    static uint8_t halfcarry_lookup[] = { 0, FLAG_H, FLAG_H, FLAG_H, 0, 0, 0, FLAG_H };
    static uint8_t overflow_lookup[] = { 0, 0, 0, FLAG_V, FLAG_V, 0, 0, 0 };

    uint16_t full_answer = m_CPURegisters.regs.regA + r;

    int lookup = ((m_CPURegisters.regs.regA & 0x88) >> 3) | ((r & 0x88) >> 2) | ((full_answer & 0x88) >> 1);
    m_CPURegisters.regs.regF = halfcarry_lookup[lookup & 7] | overflow_lookup[lookup >> 4];

    m_CPURegisters.regs.regA = (full_answer & 0xff);

    m_CPURegisters.regs.regF |= (full_answer & 0x100) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
}

void Z80::Adc8(uint8_t& r)
{
    static uint8_t halfcarry_lookup[] = { 0, FLAG_H, FLAG_H, FLAG_H, 0, 0, 0, FLAG_H };
    static uint8_t overflow_lookup[] = { 0, 0, 0, FLAG_V, FLAG_V, 0, 0, 0 };

    uint16_t full_answer = m_CPURegisters.regs.regA + r;
    full_answer += ((m_CPURegisters.regs.regF & FLAG_C) ? 1 : 0);

    int lookup = ((m_CPURegisters.regs.regA & 0x88) >> 3) | ((r & 0x88) >> 2) | ((full_answer & 0x88) >> 1);
    m_CPURegisters.regs.regF = halfcarry_lookup[lookup & 7] | overflow_lookup[lookup >> 4];

    m_CPURegisters.regs.regA = (full_answer & 0xff);

    m_CPURegisters.regs.regF |= (full_answer & 0x100) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
}

void Z80::Sub8(uint8_t& r)
{
    static uint8_t halfcarry_lookup[] = { 0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H };
    static uint8_t overflow_lookup[] = { 0, FLAG_V, 0, 0, 0, 0, FLAG_V, 0 };

    uint16_t full_answer = m_CPURegisters.regs.regA - r;

    int lookup = ((m_CPURegisters.regs.regA & 0x88) >> 3) | ((r & 0x88) >> 2) | ((full_answer & 0x88) >> 1);
    m_CPURegisters.regs.regF = halfcarry_lookup[lookup & 7] | overflow_lookup[lookup >> 4] | FLAG_N;

    m_CPURegisters.regs.regA = (full_answer & 0xff);

    m_CPURegisters.regs.regF |= (full_answer & 0x100) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
}

void Z80::Sbc8(uint8_t& r)
{
    static uint8_t halfcarry_lookup[] = { 0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H };
    static uint8_t overflow_lookup[] = { 0, FLAG_V, 0, 0, 0, 0, FLAG_V, 0 };

    uint16_t full_answer = m_CPURegisters.regs.regA - r;
    full_answer -= ((m_CPURegisters.regs.regF & FLAG_C) ? 1 : 0);

    int lookup = ((m_CPURegisters.regs.regA & 0x88) >> 3) | ((r & 0x88) >> 2) | ((full_answer & 0x88) >> 1);
    m_CPURegisters.regs.regF = halfcarry_lookup[lookup & 7] | overflow_lookup[lookup >> 4] | FLAG_N;

    m_CPURegisters.regs.regA = (full_answer & 0xff);

    m_CPURegisters.regs.regF |= (full_answer & 0x100) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
}

void Z80::Add16(uint16_t& r1, uint16_t& r2)
{
    static uint8_t halfcarry_lookup[] = { 0, FLAG_H, FLAG_H, FLAG_H, 0, 0, 0, FLAG_H };

    m_MEMPTR = r1 + 1;

    uint32_t full_answer = r1 + r2;

    int lookup = ((r1 & 0x0800) >> 11) | ((r2 & 0x0800) >> 10) | ((full_answer & 0x0800) >> 9);
    m_CPURegisters.regs.regF = (m_CPURegisters.regs.regF & (FLAG_P | FLAG_Z | FLAG_S)) | halfcarry_lookup[lookup];

    r1 = (full_answer & 0xffff);

    m_CPURegisters.regs.regF |= (full_answer & 0x10000) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= ((full_answer >> 8) & (FLAG_3 | FLAG_5));
}

void Z80::Adc16(uint16_t& r1, uint16_t& r2)
{
    static uint8_t halfcarry_lookup[] = { 0, FLAG_H, FLAG_H, FLAG_H, 0, 0, 0, FLAG_H };
    static uint8_t overflow_lookup[] = { 0, 0, 0, FLAG_V, FLAG_V, 0, 0, 0 };

    m_MEMPTR = r1 + 1;

    uint32_t full_answer = r1 + r2;
    full_answer += ((m_CPURegisters.regs.regF & FLAG_C) ? 1 : 0);

    int lookup = ((r1 & 0x8800) >> 11) | ((r2 & 0x8800) >> 10) | ((full_answer & 0x8800) >> 9);
    m_CPURegisters.regs.regF = halfcarry_lookup[lookup & 7] | overflow_lookup[lookup >> 4];

    r1 = (full_answer & 0xffff);

    m_CPURegisters.regs.regF |= (full_answer & 0x10000) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= (r1 >> 8) & (FLAG_3 | FLAG_5);
    m_CPURegisters.regs.regF |= ((r1 & 0x8000) == 0x8000) ? FLAG_S : 0;
    m_CPURegisters.regs.regF |= (r1 == 0x0000) ? FLAG_Z : 0;
}

void Z80::Sbc16(uint16_t& r1, uint16_t& r2)
{
    static uint8_t halfcarry_lookup[] = { 0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H };
    static uint8_t overflow_lookup[] = { 0, FLAG_V, 0, 0, 0, 0, FLAG_V, 0 };

    m_MEMPTR = r1 + 1;

    uint32_t full_answer = r1 - r2;
    full_answer -= ((m_CPURegisters.regs.regF & FLAG_C) ? 1 : 0);

    int lookup = ((r1 & 0x8800) >> 11) | ((r2 & 0x8800) >> 10) | ((full_answer & 0x8800) >> 9);
    m_CPURegisters.regs.regF = halfcarry_lookup[lookup & 7] | overflow_lookup[lookup >> 4] | FLAG_N;

    r1 = (full_answer & 0xffff);

    m_CPURegisters.regs.regF |= (full_answer & 0x10000) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= (r1 >> 8) & (FLAG_3 | FLAG_5);
    m_CPURegisters.regs.regF |= ((r1 & 0x8000) == 0x8000) ? FLAG_S : 0;
    m_CPURegisters.regs.regF |= (r1 == 0x0000) ? FLAG_Z : 0;
}

void Z80::And(uint8_t& r)
{
    m_CPURegisters.regs.regA &= r;
    m_CPURegisters.regs.regF = m_ParityTable[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA] | FLAG_H;
}

void Z80::Or(uint8_t& r)
{
    m_CPURegisters.regs.regA |= r;
    m_CPURegisters.regs.regF = m_ParityTable[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
}

void Z80::Xor(uint8_t& r)
{
    m_CPURegisters.regs.regA ^= r;
    m_CPURegisters.regs.regF = m_ParityTable[m_CPURegisters.regs.regA];
    m_CPURegisters.regs.regF |= m_SZ35Table[m_CPURegisters.regs.regA];
}

void Z80::Cp(uint8_t& r)
{
    static uint8_t halfcarry_lookup[] = { 0, 0, FLAG_H, 0, FLAG_H, 0, FLAG_H, FLAG_H };
    static uint8_t overflow_lookup[] = { 0, FLAG_V, 0, 0, 0, 0, FLAG_V, 0 };

    uint16_t full_answer = m_CPURegisters.regs.regA - r;

    int lookup = ((m_CPURegisters.regs.regA & 0x88) >> 3) | ((r & 0x88) >> 2) | ((full_answer & 0x88) >> 1);
    m_CPURegisters.regs.regF = halfcarry_lookup[lookup & 7] | overflow_lookup[lookup >> 4] | FLAG_N;

    m_CPURegisters.regs.regF |= (full_answer & 0x100) == 0 ? 0 : FLAG_C;
    m_CPURegisters.regs.regF |= (full_answer == 0x00) ? FLAG_Z : 0;
    m_CPURegisters.regs.regF |= ((full_answer & 0x80) == 0x80) ? FLAG_S : 0;
    m_CPURegisters.regs.regF |= (r & (FLAG_3 | FLAG_5));
}

void Z80::RLC(uint8_t& r)
{
    r = (r << 1) | (r >> 7);
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (r & 0x01) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::RRC(uint8_t& r)
{
    r = (r >> 1) | (r << 7);
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (r & 0x80) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::RL(uint8_t& r)
{
    uint8_t old_r = r;
    r = (r << 1) | ((m_CPURegisters.regs.regF & FLAG_C) ? 0x01 : 0x00);
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (old_r & 0x80) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::RR(uint8_t& r)
{
    uint8_t old_r = r;
    r = (r >> 1) | ((m_CPURegisters.regs.regF & FLAG_C) ? 0x80 : 0x00);
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (old_r & 0x01) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::SLA(uint8_t& r)
{
    uint8_t old_r = r;
    r = (r << 1);
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (old_r & 0x80) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::SRA(uint8_t& r)
{
    uint8_t old_r = r;
    r = (r & 0x80) | (r >> 1);
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (old_r & 0x01) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::SRL(uint8_t& r)
{
    uint8_t old_r = r;
    r = (r >> 1);
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (old_r & 0x01) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::SLL(uint8_t& r)
{
    uint8_t old_r = r;
    r = (r << 1) | 0x01;
    m_CPURegisters.regs.regF = m_ParityTable[r];
    m_CPURegisters.regs.regF |= (old_r & 0x80) ? FLAG_C : 0;
    m_CPURegisters.regs.regF |= m_SZ35Table[r];
}

void Z80::Bit(uint8_t& r, uint8_t b)
{
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= FLAG_H;
    m_CPURegisters.regs.regF |= (r & (FLAG_3 | FLAG_5));
    m_CPURegisters.regs.regF |= !(r & (1 << b)) ? (FLAG_Z | FLAG_P) : 0;
    m_CPURegisters.regs.regF |= (b == 7 && (r & 0x80)) ? FLAG_S : 0;
}

void Z80::BitWithMemptr(uint8_t& r, uint8_t b)
{
    m_CPURegisters.regs.regF &= FLAG_C;
    m_CPURegisters.regs.regF |= FLAG_H;
    m_CPURegisters.regs.regF |= (m_MEMPTR >> 8) & (FLAG_3 | FLAG_5);
    m_CPURegisters.regs.regF |= !(r & (1 << b)) ? (FLAG_Z | FLAG_P) : 0;
    m_CPURegisters.regs.regF |= (b == 7 && (r & 0x80)) ? FLAG_S : 0;
}

void Z80::Set(uint8_t& r, uint8_t b)
{
    r |= (1 << b);
}

void Z80::Res(uint8_t& r, uint8_t b)
{
    r &= ~(1 << b);
}

} // namespace zxspec
