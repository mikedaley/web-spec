/*
 * z80.hpp - Z80 CPU emulation core
 *
 * Ported and modernized from SpectREMCPP by Mike Daley
 * Original: CZ80Core by Mike Daley
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <array>
#include <cstdint>
#include <functional>

namespace zxspec {

class Z80 {
public:
    // Register enums
    enum class ByteReg {
        A, F, B, C, D, E, H, L,
        AltA, AltF, AltB, AltC, AltD, AltE, AltH, AltL,
        I, R
    };

    enum class WordReg {
        AF, HL, BC, DE,
        AltAF, AltHL, AltBC, AltDE,
        IX, IY, SP, PC
    };

    enum class CpuType { CMOS, NMOS };

    // Flag constants
    static constexpr uint8_t FLAG_C = 0x01;
    static constexpr uint8_t FLAG_N = 0x02;
    static constexpr uint8_t FLAG_P = 0x04;
    static constexpr uint8_t FLAG_V = FLAG_P;
    static constexpr uint8_t FLAG_3 = 0x08;
    static constexpr uint8_t FLAG_H = 0x10;
    static constexpr uint8_t FLAG_5 = 0x20;
    static constexpr uint8_t FLAG_Z = 0x40;
    static constexpr uint8_t FLAG_S = 0x80;

    // Callback types
    using MemReadFunc = std::function<uint8_t(uint16_t address, void* param)>;
    using MemWriteFunc = std::function<void(uint16_t address, uint8_t data, void* param)>;
    using IoReadFunc = std::function<uint8_t(uint16_t address, void* param)>;
    using IoWriteFunc = std::function<void(uint16_t address, uint8_t data, void* param)>;
    using ContentionFunc = std::function<void(uint16_t address, uint32_t tstates, void* param)>;
    using OpcodeCallback = std::function<bool(uint8_t opcode, uint16_t address, void* param)>;

private:
    static constexpr uint32_t OPCODEFLAG_AltersFlags = (1 << 0);

    struct Z80State {
        union {
            struct {
                uint16_t regAF;
                uint16_t regBC;
                uint16_t regDE;
                uint16_t regHL;
                uint16_t regIX;
                uint16_t regIY;
                uint16_t regAF_;
                uint16_t regBC_;
                uint16_t regDE_;
                uint16_t regHL_;
            } reg_pairs;

            struct {
                uint8_t regF;
                uint8_t regA;
                uint8_t regC;
                uint8_t regB;
                uint8_t regE;
                uint8_t regD;
                uint8_t regL;
                uint8_t regH;
                uint8_t regIXl;
                uint8_t regIXh;
                uint8_t regIYl;
                uint8_t regIYh;
                uint8_t regF_;
                uint8_t regA_;
                uint8_t regC_;
                uint8_t regB_;
                uint8_t regE_;
                uint8_t regD_;
                uint8_t regL_;
                uint8_t regH_;
            } regs;
        };

        uint16_t regSP;
        uint16_t regPC;
        uint8_t regI;
        uint8_t regR;
        uint8_t IFF1;
        uint8_t IFF2;
        uint8_t IM;
        bool Halted;
        bool EIHandled;
        bool IntReq;
        bool NMIReq;
        bool DDFDmultiByte;
        uint32_t TStates;
    };

    struct Z80Opcode {
        void (Z80::*function)(uint8_t opcode);
        uint32_t flags;
        const char* format;
    };

    struct Z80OpcodeTable {
        Z80Opcode entries[256];
    };

public:
    Z80();
    ~Z80() = default;

    void initialise(MemReadFunc memRead, MemWriteFunc memWrite,
                    IoReadFunc ioRead, IoWriteFunc ioWrite,
                    ContentionFunc contention, ContentionFunc noMreqContention,
                    void* param);

    void reset(bool hardReset = true);
    uint32_t execute(uint32_t numTStates = 0, uint32_t intTStates = 32);

    void registerOpcodeCallback(OpcodeCallback callback);
    void signalInterrupt();

    bool isInterruptRequesting() const { return m_CPURegisters.IntReq; }

    uint8_t getRegister(ByteReg reg) const;
    uint16_t getRegister(WordReg reg) const;
    void setRegister(ByteReg reg, uint8_t data);
    void setRegister(WordReg reg, uint16_t data);

    void setIMMode(uint8_t im) { m_CPURegisters.IM = im; m_CPURegisters.IntReq = false; }
    uint8_t getIMMode() const { return m_CPURegisters.IM; }
    void setIFF1(uint8_t iff1) { m_CPURegisters.IFF1 = iff1; }
    uint8_t getIFF1() const { return m_CPURegisters.IFF1; }
    void setIFF2(uint8_t iff2) { m_CPURegisters.IFF2 = iff2; }
    uint8_t getIFF2() const { return m_CPURegisters.IFF2; }
    bool getHalted() const { return m_CPURegisters.Halted; }
    void setHalted(bool halted) { m_CPURegisters.Halted = halted; }
    void setNMIReq(bool nmi) { m_CPURegisters.NMIReq = nmi; }
    void setCpuType(CpuType type) { m_CPUType = type; }
    CpuType getCpuType() const { return m_CPUType; }

    bool isLD_I_A() const { return m_LD_I_A; }

    void addContentionTStates(uint32_t extra) { m_CPURegisters.TStates += extra; }
    void addTStates(uint32_t extra) { m_CPURegisters.TStates += extra; }
    uint32_t getTStates() const { return m_CPURegisters.TStates; }
    void resetTStates() { m_CPURegisters.TStates = 0; }
    void resetTStates(uint32_t tstatesPerFrame) { m_CPURegisters.TStates -= tstatesPerFrame; }

    uint8_t z80MemRead(uint16_t address, uint32_t tstates = 3);
    void z80MemWrite(uint16_t address, uint8_t data, uint32_t tstates = 3);
    uint8_t z80IORead(uint16_t address);
    void z80IOWrite(uint16_t address, uint8_t data);
    void z80MemContention(uint16_t address, uint32_t tstates);
    void z80NoMreqContention(uint16_t address, uint32_t tstates);

protected:
    // ALU operations
    void Inc(uint8_t& r);
    void Dec(uint8_t& r);
    void Add8(uint8_t& r);
    void Adc8(uint8_t& r);
    void Sub8(uint8_t& r);
    void Sbc8(uint8_t& r);
    void Add16(uint16_t& r1, uint16_t& r2);
    void Adc16(uint16_t& r1, uint16_t& r2);
    void Sbc16(uint16_t& r1, uint16_t& r2);
    void And(uint8_t& r);
    void Or(uint8_t& r);
    void Xor(uint8_t& r);
    void Cp(uint8_t& r);
    void RLC(uint8_t& r);
    void RRC(uint8_t& r);
    void RL(uint8_t& r);
    void RR(uint8_t& r);
    void SLA(uint8_t& r);
    void SRA(uint8_t& r);
    void SRL(uint8_t& r);
    void SLL(uint8_t& r);
    void Bit(uint8_t& r, uint8_t b);
    void BitWithMemptr(uint8_t& r, uint8_t b);
    void Set(uint8_t& r, uint8_t b);
    void Res(uint8_t& r, uint8_t b);

    // Main opcodes (0x00-0xFF)
    void NOP(uint8_t opcode);
    void LD_BC_nn(uint8_t opcode);
    void LD_off_BC_A(uint8_t opcode);
    void INC_BC(uint8_t opcode);
    void INC_B(uint8_t opcode);
    void DEC_B(uint8_t opcode);
    void LD_B_n(uint8_t opcode);
    void RLCA(uint8_t opcode);
    void EX_AF_AF_(uint8_t opcode);
    void ADD_HL_BC(uint8_t opcode);
    void LD_A_off_BC(uint8_t opcode);
    void DEC_BC(uint8_t opcode);
    void INC_C(uint8_t opcode);
    void DEC_C(uint8_t opcode);
    void LD_C_n(uint8_t opcode);
    void RRCA(uint8_t opcode);
    void DJNZ_off_PC_e(uint8_t opcode);
    void LD_DE_nn(uint8_t opcode);
    void LD_off_DE_A(uint8_t opcode);
    void INC_DE(uint8_t opcode);
    void INC_D(uint8_t opcode);
    void DEC_D(uint8_t opcode);
    void LD_D_n(uint8_t opcode);
    void RLA(uint8_t opcode);
    void JR_off_PC_e(uint8_t opcode);
    void ADD_HL_DE(uint8_t opcode);
    void LD_A_off_DE(uint8_t opcode);
    void DEC_DE(uint8_t opcode);
    void INC_E(uint8_t opcode);
    void DEC_E(uint8_t opcode);
    void LD_E_n(uint8_t opcode);
    void RRA(uint8_t opcode);
    void JR_NZ_off_PC_e(uint8_t opcode);
    void LD_HL_nn(uint8_t opcode);
    void LD_off_nn_HL(uint8_t opcode);
    void INC_HL(uint8_t opcode);
    void INC_H(uint8_t opcode);
    void DEC_H(uint8_t opcode);
    void LD_H_n(uint8_t opcode);
    void DAA(uint8_t opcode);
    void JR_Z_off_PC_e(uint8_t opcode);
    void ADD_HL_HL(uint8_t opcode);
    void LD_HL_off_nn(uint8_t opcode);
    void DEC_HL(uint8_t opcode);
    void INC_L(uint8_t opcode);
    void DEC_L(uint8_t opcode);
    void LD_L_n(uint8_t opcode);
    void CPL(uint8_t opcode);
    void JR_NC_off_PC_e(uint8_t opcode);
    void LD_SP_nn(uint8_t opcode);
    void LD_off_nn_A(uint8_t opcode);
    void INC_SP(uint8_t opcode);
    void INC_off_HL(uint8_t opcode);
    void DEC_off_HL(uint8_t opcode);
    void LD_off_HL_n(uint8_t opcode);
    void SCF(uint8_t opcode);
    void JR_C_off_PC_e(uint8_t opcode);
    void ADD_HL_SP(uint8_t opcode);
    void LD_A_off_nn(uint8_t opcode);
    void DEC_SP(uint8_t opcode);
    void INC_A(uint8_t opcode);
    void DEC_A(uint8_t opcode);
    void LD_A_n(uint8_t opcode);
    void CCF(uint8_t opcode);
    void LD_B_B(uint8_t opcode);
    void LD_B_C(uint8_t opcode);
    void LD_B_D(uint8_t opcode);
    void LD_B_E(uint8_t opcode);
    void LD_B_H(uint8_t opcode);
    void LD_B_L(uint8_t opcode);
    void LD_B_off_HL(uint8_t opcode);
    void LD_B_A(uint8_t opcode);
    void LD_C_B(uint8_t opcode);
    void LD_C_C(uint8_t opcode);
    void LD_C_D(uint8_t opcode);
    void LD_C_E(uint8_t opcode);
    void LD_C_H(uint8_t opcode);
    void LD_C_L(uint8_t opcode);
    void LD_C_off_HL(uint8_t opcode);
    void LD_C_A(uint8_t opcode);
    void LD_D_B(uint8_t opcode);
    void LD_D_C(uint8_t opcode);
    void LD_D_D(uint8_t opcode);
    void LD_D_E(uint8_t opcode);
    void LD_D_H(uint8_t opcode);
    void LD_D_L(uint8_t opcode);
    void LD_D_off_HL(uint8_t opcode);
    void LD_D_A(uint8_t opcode);
    void LD_E_B(uint8_t opcode);
    void LD_E_C(uint8_t opcode);
    void LD_E_D(uint8_t opcode);
    void LD_E_E(uint8_t opcode);
    void LD_E_H(uint8_t opcode);
    void LD_E_L(uint8_t opcode);
    void LD_E_off_HL(uint8_t opcode);
    void LD_E_A(uint8_t opcode);
    void LD_H_B(uint8_t opcode);
    void LD_H_C(uint8_t opcode);
    void LD_H_D(uint8_t opcode);
    void LD_H_E(uint8_t opcode);
    void LD_H_H(uint8_t opcode);
    void LD_H_L(uint8_t opcode);
    void LD_H_off_HL(uint8_t opcode);
    void LD_H_A(uint8_t opcode);
    void LD_L_B(uint8_t opcode);
    void LD_L_C(uint8_t opcode);
    void LD_L_D(uint8_t opcode);
    void LD_L_E(uint8_t opcode);
    void LD_L_H(uint8_t opcode);
    void LD_L_L(uint8_t opcode);
    void LD_L_off_HL(uint8_t opcode);
    void LD_L_A(uint8_t opcode);
    void LD_off_HL_B(uint8_t opcode);
    void LD_off_HL_C(uint8_t opcode);
    void LD_off_HL_D(uint8_t opcode);
    void LD_off_HL_E(uint8_t opcode);
    void LD_off_HL_H(uint8_t opcode);
    void LD_off_HL_L(uint8_t opcode);
    void HALT(uint8_t opcode);
    void LD_off_HL_A(uint8_t opcode);
    void LD_A_B(uint8_t opcode);
    void LD_A_C(uint8_t opcode);
    void LD_A_D(uint8_t opcode);
    void LD_A_E(uint8_t opcode);
    void LD_A_H(uint8_t opcode);
    void LD_A_L(uint8_t opcode);
    void LD_A_off_HL(uint8_t opcode);
    void LD_A_A(uint8_t opcode);
    void ADD_A_B(uint8_t opcode);
    void ADD_A_C(uint8_t opcode);
    void ADD_A_D(uint8_t opcode);
    void ADD_A_E(uint8_t opcode);
    void ADD_A_H(uint8_t opcode);
    void ADD_A_L(uint8_t opcode);
    void ADD_A_off_HL(uint8_t opcode);
    void ADD_A_A(uint8_t opcode);
    void ADC_A_B(uint8_t opcode);
    void ADC_A_C(uint8_t opcode);
    void ADC_A_D(uint8_t opcode);
    void ADC_A_E(uint8_t opcode);
    void ADC_A_H(uint8_t opcode);
    void ADC_A_L(uint8_t opcode);
    void ADC_A_off_HL(uint8_t opcode);
    void ADC_A_A(uint8_t opcode);
    void SUB_A_B(uint8_t opcode);
    void SUB_A_C(uint8_t opcode);
    void SUB_A_D(uint8_t opcode);
    void SUB_A_E(uint8_t opcode);
    void SUB_A_H(uint8_t opcode);
    void SUB_A_L(uint8_t opcode);
    void SUB_A_off_HL(uint8_t opcode);
    void SUB_A_A(uint8_t opcode);
    void SBC_A_B(uint8_t opcode);
    void SBC_A_C(uint8_t opcode);
    void SBC_A_D(uint8_t opcode);
    void SBC_A_E(uint8_t opcode);
    void SBC_A_H(uint8_t opcode);
    void SBC_A_L(uint8_t opcode);
    void SBC_A_off_HL(uint8_t opcode);
    void SBC_A_A(uint8_t opcode);
    void AND_B(uint8_t opcode);
    void AND_C(uint8_t opcode);
    void AND_D(uint8_t opcode);
    void AND_E(uint8_t opcode);
    void AND_H(uint8_t opcode);
    void AND_L(uint8_t opcode);
    void AND_off_HL(uint8_t opcode);
    void AND_A(uint8_t opcode);
    void XOR_B(uint8_t opcode);
    void XOR_C(uint8_t opcode);
    void XOR_D(uint8_t opcode);
    void XOR_E(uint8_t opcode);
    void XOR_H(uint8_t opcode);
    void XOR_L(uint8_t opcode);
    void XOR_off_HL(uint8_t opcode);
    void XOR_A(uint8_t opcode);
    void OR_B(uint8_t opcode);
    void OR_C(uint8_t opcode);
    void OR_D(uint8_t opcode);
    void OR_E(uint8_t opcode);
    void OR_H(uint8_t opcode);
    void OR_L(uint8_t opcode);
    void OR_off_HL(uint8_t opcode);
    void OR_A(uint8_t opcode);
    void CP_B(uint8_t opcode);
    void CP_C(uint8_t opcode);
    void CP_D(uint8_t opcode);
    void CP_E(uint8_t opcode);
    void CP_H(uint8_t opcode);
    void CP_L(uint8_t opcode);
    void CP_off_HL(uint8_t opcode);
    void CP_A(uint8_t opcode);
    void RET_NZ(uint8_t opcode);
    void POP_BC(uint8_t opcode);
    void JP_NZ_off_nn(uint8_t opcode);
    void JP_off_nn(uint8_t opcode);
    void CALL_NZ_off_nn(uint8_t opcode);
    void PUSH_BC(uint8_t opcode);
    void ADD_A_n(uint8_t opcode);
    void RST_0H(uint8_t opcode);
    void RET_Z(uint8_t opcode);
    void RET(uint8_t opcode);
    void JP_Z_off_nn(uint8_t opcode);
    void CALL_Z_off_nn(uint8_t opcode);
    void CALL_off_nn(uint8_t opcode);
    void ADC_A_n(uint8_t opcode);
    void RST_8H(uint8_t opcode);
    void RET_NC(uint8_t opcode);
    void POP_DE(uint8_t opcode);
    void JP_NC_off_nn(uint8_t opcode);
    void OUT_off_n_A(uint8_t opcode);
    void CALL_NC_off_nn(uint8_t opcode);
    void PUSH_DE(uint8_t opcode);
    void SUB_A_n(uint8_t opcode);
    void RST_10H(uint8_t opcode);
    void RET_C(uint8_t opcode);
    void EXX(uint8_t opcode);
    void JP_C_off_nn(uint8_t opcode);
    void IN_A_off_n(uint8_t opcode);
    void CALL_C_off_nn(uint8_t opcode);
    void SBC_A_n(uint8_t opcode);
    void RST_18H(uint8_t opcode);
    void RET_PO(uint8_t opcode);
    void POP_HL(uint8_t opcode);
    void JP_PO_off_nn(uint8_t opcode);
    void EX_off_SP_HL(uint8_t opcode);
    void CALL_PO_off_nn(uint8_t opcode);
    void PUSH_HL(uint8_t opcode);
    void AND_n(uint8_t opcode);
    void RST_20H(uint8_t opcode);
    void RET_PE(uint8_t opcode);
    void JP_off_HL(uint8_t opcode);
    void JP_PE_off_nn(uint8_t opcode);
    void EX_DE_HL(uint8_t opcode);
    void CALL_PE_off_nn(uint8_t opcode);
    void XOR_n(uint8_t opcode);
    void RST_28H(uint8_t opcode);
    void RET_P(uint8_t opcode);
    void POP_AF(uint8_t opcode);
    void JP_P_off_nn(uint8_t opcode);
    void DI(uint8_t opcode);
    void CALL_P_off_nn(uint8_t opcode);
    void PUSH_AF(uint8_t opcode);
    void OR_n(uint8_t opcode);
    void RST_30H(uint8_t opcode);
    void RET_M(uint8_t opcode);
    void LD_SP_HL(uint8_t opcode);
    void JP_M_off_nn(uint8_t opcode);
    void EI(uint8_t opcode);
    void CALL_M_off_nn(uint8_t opcode);
    void CP_n(uint8_t opcode);
    void RST_38H(uint8_t opcode);

    // CB prefix opcodes (bit operations)
    void RLC_B(uint8_t opcode); void RLC_C(uint8_t opcode); void RLC_D(uint8_t opcode);
    void RLC_E(uint8_t opcode); void RLC_H(uint8_t opcode); void RLC_L(uint8_t opcode);
    void RLC_off_HL(uint8_t opcode); void RLC_A(uint8_t opcode);
    void RRC_B(uint8_t opcode); void RRC_C(uint8_t opcode); void RRC_D(uint8_t opcode);
    void RRC_E(uint8_t opcode); void RRC_H(uint8_t opcode); void RRC_L(uint8_t opcode);
    void RRC_off_HL(uint8_t opcode); void RRC_A(uint8_t opcode);
    void RL_B(uint8_t opcode); void RL_C(uint8_t opcode); void RL_D(uint8_t opcode);
    void RL_E(uint8_t opcode); void RL_H(uint8_t opcode); void RL_L(uint8_t opcode);
    void RL_off_HL(uint8_t opcode); void RL_A(uint8_t opcode);
    void RR_B(uint8_t opcode); void RR_C(uint8_t opcode); void RR_D(uint8_t opcode);
    void RR_E(uint8_t opcode); void RR_H(uint8_t opcode); void RR_L(uint8_t opcode);
    void RR_off_HL(uint8_t opcode); void RR_A(uint8_t opcode);
    void SLA_B(uint8_t opcode); void SLA_C(uint8_t opcode); void SLA_D(uint8_t opcode);
    void SLA_E(uint8_t opcode); void SLA_H(uint8_t opcode); void SLA_L(uint8_t opcode);
    void SLA_off_HL(uint8_t opcode); void SLA_A(uint8_t opcode);
    void SRA_B(uint8_t opcode); void SRA_C(uint8_t opcode); void SRA_D(uint8_t opcode);
    void SRA_E(uint8_t opcode); void SRA_H(uint8_t opcode); void SRA_L(uint8_t opcode);
    void SRA_off_HL(uint8_t opcode); void SRA_A(uint8_t opcode);
    void SLL_B(uint8_t opcode); void SLL_C(uint8_t opcode); void SLL_D(uint8_t opcode);
    void SLL_E(uint8_t opcode); void SLL_H(uint8_t opcode); void SLL_L(uint8_t opcode);
    void SLL_off_HL(uint8_t opcode); void SLL_A(uint8_t opcode);
    void SRL_B(uint8_t opcode); void SRL_C(uint8_t opcode); void SRL_D(uint8_t opcode);
    void SRL_E(uint8_t opcode); void SRL_H(uint8_t opcode); void SRL_L(uint8_t opcode);
    void SRL_off_HL(uint8_t opcode); void SRL_A(uint8_t opcode);
    void BIT_0_B(uint8_t opcode); void BIT_0_C(uint8_t opcode); void BIT_0_D(uint8_t opcode);
    void BIT_0_E(uint8_t opcode); void BIT_0_H(uint8_t opcode); void BIT_0_L(uint8_t opcode);
    void BIT_0_off_HL(uint8_t opcode); void BIT_0_A(uint8_t opcode);
    void BIT_1_B(uint8_t opcode); void BIT_1_C(uint8_t opcode); void BIT_1_D(uint8_t opcode);
    void BIT_1_E(uint8_t opcode); void BIT_1_H(uint8_t opcode); void BIT_1_L(uint8_t opcode);
    void BIT_1_off_HL(uint8_t opcode); void BIT_1_A(uint8_t opcode);
    void BIT_2_B(uint8_t opcode); void BIT_2_C(uint8_t opcode); void BIT_2_D(uint8_t opcode);
    void BIT_2_E(uint8_t opcode); void BIT_2_H(uint8_t opcode); void BIT_2_L(uint8_t opcode);
    void BIT_2_off_HL(uint8_t opcode); void BIT_2_A(uint8_t opcode);
    void BIT_3_B(uint8_t opcode); void BIT_3_C(uint8_t opcode); void BIT_3_D(uint8_t opcode);
    void BIT_3_E(uint8_t opcode); void BIT_3_H(uint8_t opcode); void BIT_3_L(uint8_t opcode);
    void BIT_3_off_HL(uint8_t opcode); void BIT_3_A(uint8_t opcode);
    void BIT_4_B(uint8_t opcode); void BIT_4_C(uint8_t opcode); void BIT_4_D(uint8_t opcode);
    void BIT_4_E(uint8_t opcode); void BIT_4_H(uint8_t opcode); void BIT_4_L(uint8_t opcode);
    void BIT_4_off_HL(uint8_t opcode); void BIT_4_A(uint8_t opcode);
    void BIT_5_B(uint8_t opcode); void BIT_5_C(uint8_t opcode); void BIT_5_D(uint8_t opcode);
    void BIT_5_E(uint8_t opcode); void BIT_5_H(uint8_t opcode); void BIT_5_L(uint8_t opcode);
    void BIT_5_off_HL(uint8_t opcode); void BIT_5_A(uint8_t opcode);
    void BIT_6_B(uint8_t opcode); void BIT_6_C(uint8_t opcode); void BIT_6_D(uint8_t opcode);
    void BIT_6_E(uint8_t opcode); void BIT_6_H(uint8_t opcode); void BIT_6_L(uint8_t opcode);
    void BIT_6_off_HL(uint8_t opcode); void BIT_6_A(uint8_t opcode);
    void BIT_7_B(uint8_t opcode); void BIT_7_C(uint8_t opcode); void BIT_7_D(uint8_t opcode);
    void BIT_7_E(uint8_t opcode); void BIT_7_H(uint8_t opcode); void BIT_7_L(uint8_t opcode);
    void BIT_7_off_HL(uint8_t opcode); void BIT_7_A(uint8_t opcode);
    void RES_0_B(uint8_t opcode); void RES_0_C(uint8_t opcode); void RES_0_D(uint8_t opcode);
    void RES_0_E(uint8_t opcode); void RES_0_H(uint8_t opcode); void RES_0_L(uint8_t opcode);
    void RES_0_off_HL(uint8_t opcode); void RES_0_A(uint8_t opcode);
    void RES_1_B(uint8_t opcode); void RES_1_C(uint8_t opcode); void RES_1_D(uint8_t opcode);
    void RES_1_E(uint8_t opcode); void RES_1_H(uint8_t opcode); void RES_1_L(uint8_t opcode);
    void RES_1_off_HL(uint8_t opcode); void RES_1_A(uint8_t opcode);
    void RES_2_B(uint8_t opcode); void RES_2_C(uint8_t opcode); void RES_2_D(uint8_t opcode);
    void RES_2_E(uint8_t opcode); void RES_2_H(uint8_t opcode); void RES_2_L(uint8_t opcode);
    void RES_2_off_HL(uint8_t opcode); void RES_2_A(uint8_t opcode);
    void RES_3_B(uint8_t opcode); void RES_3_C(uint8_t opcode); void RES_3_D(uint8_t opcode);
    void RES_3_E(uint8_t opcode); void RES_3_H(uint8_t opcode); void RES_3_L(uint8_t opcode);
    void RES_3_off_HL(uint8_t opcode); void RES_3_A(uint8_t opcode);
    void RES_4_B(uint8_t opcode); void RES_4_C(uint8_t opcode); void RES_4_D(uint8_t opcode);
    void RES_4_E(uint8_t opcode); void RES_4_H(uint8_t opcode); void RES_4_L(uint8_t opcode);
    void RES_4_off_HL(uint8_t opcode); void RES_4_A(uint8_t opcode);
    void RES_5_B(uint8_t opcode); void RES_5_C(uint8_t opcode); void RES_5_D(uint8_t opcode);
    void RES_5_E(uint8_t opcode); void RES_5_H(uint8_t opcode); void RES_5_L(uint8_t opcode);
    void RES_5_off_HL(uint8_t opcode); void RES_5_A(uint8_t opcode);
    void RES_6_B(uint8_t opcode); void RES_6_C(uint8_t opcode); void RES_6_D(uint8_t opcode);
    void RES_6_E(uint8_t opcode); void RES_6_H(uint8_t opcode); void RES_6_L(uint8_t opcode);
    void RES_6_off_HL(uint8_t opcode); void RES_6_A(uint8_t opcode);
    void RES_7_B(uint8_t opcode); void RES_7_C(uint8_t opcode); void RES_7_D(uint8_t opcode);
    void RES_7_E(uint8_t opcode); void RES_7_H(uint8_t opcode); void RES_7_L(uint8_t opcode);
    void RES_7_off_HL(uint8_t opcode); void RES_7_A(uint8_t opcode);
    void SET_0_B(uint8_t opcode); void SET_0_C(uint8_t opcode); void SET_0_D(uint8_t opcode);
    void SET_0_E(uint8_t opcode); void SET_0_H(uint8_t opcode); void SET_0_L(uint8_t opcode);
    void SET_0_off_HL(uint8_t opcode); void SET_0_A(uint8_t opcode);
    void SET_1_B(uint8_t opcode); void SET_1_C(uint8_t opcode); void SET_1_D(uint8_t opcode);
    void SET_1_E(uint8_t opcode); void SET_1_H(uint8_t opcode); void SET_1_L(uint8_t opcode);
    void SET_1_off_HL(uint8_t opcode); void SET_1_A(uint8_t opcode);
    void SET_2_B(uint8_t opcode); void SET_2_C(uint8_t opcode); void SET_2_D(uint8_t opcode);
    void SET_2_E(uint8_t opcode); void SET_2_H(uint8_t opcode); void SET_2_L(uint8_t opcode);
    void SET_2_off_HL(uint8_t opcode); void SET_2_A(uint8_t opcode);
    void SET_3_B(uint8_t opcode); void SET_3_C(uint8_t opcode); void SET_3_D(uint8_t opcode);
    void SET_3_E(uint8_t opcode); void SET_3_H(uint8_t opcode); void SET_3_L(uint8_t opcode);
    void SET_3_off_HL(uint8_t opcode); void SET_3_A(uint8_t opcode);
    void SET_4_B(uint8_t opcode); void SET_4_C(uint8_t opcode); void SET_4_D(uint8_t opcode);
    void SET_4_E(uint8_t opcode); void SET_4_H(uint8_t opcode); void SET_4_L(uint8_t opcode);
    void SET_4_off_HL(uint8_t opcode); void SET_4_A(uint8_t opcode);
    void SET_5_B(uint8_t opcode); void SET_5_C(uint8_t opcode); void SET_5_D(uint8_t opcode);
    void SET_5_E(uint8_t opcode); void SET_5_H(uint8_t opcode); void SET_5_L(uint8_t opcode);
    void SET_5_off_HL(uint8_t opcode); void SET_5_A(uint8_t opcode);
    void SET_6_B(uint8_t opcode); void SET_6_C(uint8_t opcode); void SET_6_D(uint8_t opcode);
    void SET_6_E(uint8_t opcode); void SET_6_H(uint8_t opcode); void SET_6_L(uint8_t opcode);
    void SET_6_off_HL(uint8_t opcode); void SET_6_A(uint8_t opcode);
    void SET_7_B(uint8_t opcode); void SET_7_C(uint8_t opcode); void SET_7_D(uint8_t opcode);
    void SET_7_E(uint8_t opcode); void SET_7_H(uint8_t opcode); void SET_7_L(uint8_t opcode);
    void SET_7_off_HL(uint8_t opcode); void SET_7_A(uint8_t opcode);

    // DD prefix opcodes (IX register)
    void ADD_IX_BC(uint8_t opcode); void ADD_IX_DE(uint8_t opcode);
    void LD_IX_nn(uint8_t opcode); void LD_off_nn_IX(uint8_t opcode);
    void INC_IX(uint8_t opcode); void INC_IXh(uint8_t opcode);
    void DEC_IXh(uint8_t opcode); void LD_IXh_n(uint8_t opcode);
    void ADD_IX_IX(uint8_t opcode); void LD_IX_off_nn(uint8_t opcode);
    void DEC_IX(uint8_t opcode); void INC_IXl(uint8_t opcode);
    void DEC_IXl(uint8_t opcode); void LD_IXl_n(uint8_t opcode);
    void INC_off_IX_d(uint8_t opcode); void DEC_off_IX_d(uint8_t opcode);
    void LD_off_IX_d_n(uint8_t opcode); void ADD_IX_SP(uint8_t opcode);
    void LD_B_IXh(uint8_t opcode); void LD_B_IXl(uint8_t opcode);
    void LD_B_off_IX_d(uint8_t opcode);
    void LD_C_IXh(uint8_t opcode); void LD_C_IXl(uint8_t opcode);
    void LD_C_off_IX_d(uint8_t opcode);
    void LD_D_IXh(uint8_t opcode); void LD_D_IXl(uint8_t opcode);
    void LD_D_off_IX_d(uint8_t opcode);
    void LD_E_IXh(uint8_t opcode); void LD_E_IXl(uint8_t opcode);
    void LD_E_off_IX_d(uint8_t opcode);
    void LD_IXh_B(uint8_t opcode); void LD_IXh_C(uint8_t opcode);
    void LD_IXh_D(uint8_t opcode); void LD_IXh_E(uint8_t opcode);
    void LD_IXh_IXh(uint8_t opcode); void LD_IXh_IXl(uint8_t opcode);
    void LD_H_off_IX_d(uint8_t opcode); void LD_IXh_A(uint8_t opcode);
    void LD_IXl_B(uint8_t opcode); void LD_IXl_C(uint8_t opcode);
    void LD_IXl_D(uint8_t opcode); void LD_IXl_E(uint8_t opcode);
    void LD_IXl_IXh(uint8_t opcode); void LD_IXl_IXl(uint8_t opcode);
    void LD_L_off_IX_d(uint8_t opcode); void LD_IXl_A(uint8_t opcode);
    void LD_off_IX_d_B(uint8_t opcode); void LD_off_IX_d_C(uint8_t opcode);
    void LD_off_IX_d_D(uint8_t opcode); void LD_off_IX_d_E(uint8_t opcode);
    void LD_off_IX_d_H(uint8_t opcode); void LD_off_IX_d_L(uint8_t opcode);
    void LD_off_IX_d_A(uint8_t opcode);
    void LD_A_IXh(uint8_t opcode); void LD_A_IXl(uint8_t opcode);
    void LD_A_off_IX_d(uint8_t opcode);
    void ADD_A_IXh(uint8_t opcode); void ADD_A_IXl(uint8_t opcode);
    void ADD_A_off_IX_d(uint8_t opcode);
    void ADC_A_IXh(uint8_t opcode); void ADC_A_IXl(uint8_t opcode);
    void ADC_A_off_IX_d(uint8_t opcode);
    void SUB_A_IXh(uint8_t opcode); void SUB_A_IXl(uint8_t opcode);
    void SUB_A_off_IX_d(uint8_t opcode);
    void SBC_A_IXh(uint8_t opcode); void SBC_A_IXl(uint8_t opcode);
    void SBC_A_off_IX_d(uint8_t opcode);
    void AND_IXh(uint8_t opcode); void AND_IXl(uint8_t opcode);
    void AND_off_IX_d(uint8_t opcode);
    void XOR_IXh(uint8_t opcode); void XOR_IXl(uint8_t opcode);
    void XOR_off_IX_d(uint8_t opcode);
    void OR_IXh(uint8_t opcode); void OR_IXl(uint8_t opcode);
    void OR_off_IX_d(uint8_t opcode);
    void CP_IXh(uint8_t opcode); void CP_IXl(uint8_t opcode);
    void CP_off_IX_d(uint8_t opcode);
    void POP_IX(uint8_t opcode); void EX_off_SP_IX(uint8_t opcode);
    void PUSH_IX(uint8_t opcode); void JP_off_IX(uint8_t opcode);
    void LD_SP_IX(uint8_t opcode);

    // ED prefix opcodes (extended)
    void IN_B_off_C(uint8_t opcode); void OUT_off_C_B(uint8_t opcode);
    void SBC_HL_BC(uint8_t opcode); void LD_off_nn_BC(uint8_t opcode);
    void NEG(uint8_t opcode); void RETN(uint8_t opcode);
    void IM_0(uint8_t opcode); void LD_I_A(uint8_t opcode);
    void IN_C_off_C(uint8_t opcode); void OUT_off_C_C(uint8_t opcode);
    void ADC_HL_BC(uint8_t opcode); void LD_BC_off_nn(uint8_t opcode);
    void RETI(uint8_t opcode); void LD_R_A(uint8_t opcode);
    void IN_D_off_C(uint8_t opcode); void OUT_off_C_D(uint8_t opcode);
    void SBC_HL_DE(uint8_t opcode); void LD_off_nn_DE(uint8_t opcode);
    void IM_1(uint8_t opcode); void LD_A_I(uint8_t opcode);
    void IN_E_off_C(uint8_t opcode); void OUT_off_C_E(uint8_t opcode);
    void ADC_HL_DE(uint8_t opcode); void LD_DE_off_nn(uint8_t opcode);
    void IM_2(uint8_t opcode); void LD_A_R(uint8_t opcode);
    void IN_H_off_C(uint8_t opcode); void OUT_off_C_H(uint8_t opcode);
    void SBC_HL_HL(uint8_t opcode); void RRD(uint8_t opcode);
    void IN_L_off_C(uint8_t opcode); void OUT_off_C_L(uint8_t opcode);
    void ADC_HL_HL(uint8_t opcode); void RLD(uint8_t opcode);
    void IN_F_off_C(uint8_t opcode); void OUT_off_C_0(uint8_t opcode);
    void SBC_HL_SP(uint8_t opcode); void LD_off_nn_SP(uint8_t opcode);
    void IN_A_off_C(uint8_t opcode); void OUT_off_C_A(uint8_t opcode);
    void ADC_HL_SP(uint8_t opcode); void LD_SP_off_nn(uint8_t opcode);
    void LDI(uint8_t opcode); void CPI(uint8_t opcode);
    void INI(uint8_t opcode); void OUTI(uint8_t opcode);
    void LDD(uint8_t opcode); void CPD(uint8_t opcode);
    void IND(uint8_t opcode); void OUTD(uint8_t opcode);
    void LDIR(uint8_t opcode); void CPIR(uint8_t opcode);
    void INIR(uint8_t opcode); void OTIR(uint8_t opcode);
    void LDDR(uint8_t opcode); void CPDR(uint8_t opcode);
    void INDR(uint8_t opcode); void OTDR(uint8_t opcode);

    // FD prefix opcodes (IY register)
    void ADD_IY_BC(uint8_t opcode); void ADD_IY_DE(uint8_t opcode);
    void LD_IY_nn(uint8_t opcode); void LD_off_nn_IY(uint8_t opcode);
    void INC_IY(uint8_t opcode); void INC_IYh(uint8_t opcode);
    void DEC_IYh(uint8_t opcode); void LD_IYh_n(uint8_t opcode);
    void ADD_IY_IY(uint8_t opcode); void LD_IY_off_nn(uint8_t opcode);
    void DEC_IY(uint8_t opcode); void INC_IYl(uint8_t opcode);
    void DEC_IYl(uint8_t opcode); void LD_IYl_n(uint8_t opcode);
    void INC_off_IY_d(uint8_t opcode); void DEC_off_IY_d(uint8_t opcode);
    void LD_off_IY_d_n(uint8_t opcode); void ADD_IY_SP(uint8_t opcode);
    void LD_B_IYh(uint8_t opcode); void LD_B_IYl(uint8_t opcode);
    void LD_B_off_IY_d(uint8_t opcode);
    void LD_C_IYh(uint8_t opcode); void LD_C_IYl(uint8_t opcode);
    void LD_C_off_IY_d(uint8_t opcode);
    void LD_D_IYh(uint8_t opcode); void LD_D_IYl(uint8_t opcode);
    void LD_D_off_IY_d(uint8_t opcode);
    void LD_E_IYh(uint8_t opcode); void LD_E_IYl(uint8_t opcode);
    void LD_E_off_IY_d(uint8_t opcode);
    void LD_IYh_B(uint8_t opcode); void LD_IYh_C(uint8_t opcode);
    void LD_IYh_D(uint8_t opcode); void LD_IYh_E(uint8_t opcode);
    void LD_IYh_IYh(uint8_t opcode); void LD_IYh_IYl(uint8_t opcode);
    void LD_H_off_IY_d(uint8_t opcode); void LD_IYh_A(uint8_t opcode);
    void LD_IYl_B(uint8_t opcode); void LD_IYl_C(uint8_t opcode);
    void LD_IYl_D(uint8_t opcode); void LD_IYl_E(uint8_t opcode);
    void LD_IYl_IYh(uint8_t opcode); void LD_IYl_IYl(uint8_t opcode);
    void LD_L_off_IY_d(uint8_t opcode); void LD_IYl_A(uint8_t opcode);
    void LD_off_IY_d_B(uint8_t opcode); void LD_off_IY_d_C(uint8_t opcode);
    void LD_off_IY_d_D(uint8_t opcode); void LD_off_IY_d_E(uint8_t opcode);
    void LD_off_IY_d_H(uint8_t opcode); void LD_off_IY_d_L(uint8_t opcode);
    void LD_off_IY_d_A(uint8_t opcode);
    void LD_A_IYh(uint8_t opcode); void LD_A_IYl(uint8_t opcode);
    void LD_A_off_IY_d(uint8_t opcode);
    void ADD_A_IYh(uint8_t opcode); void ADD_A_IYl(uint8_t opcode);
    void ADD_A_off_IY_d(uint8_t opcode);
    void ADC_A_IYh(uint8_t opcode); void ADC_A_IYl(uint8_t opcode);
    void ADC_A_off_IY_d(uint8_t opcode);
    void SUB_A_IYh(uint8_t opcode); void SUB_A_IYl(uint8_t opcode);
    void SUB_A_off_IY_d(uint8_t opcode);
    void SBC_A_IYh(uint8_t opcode); void SBC_A_IYl(uint8_t opcode);
    void SBC_A_off_IY_d(uint8_t opcode);
    void AND_IYh(uint8_t opcode); void AND_IYl(uint8_t opcode);
    void AND_off_IY_d(uint8_t opcode);
    void XOR_IYh(uint8_t opcode); void XOR_IYl(uint8_t opcode);
    void XOR_off_IY_d(uint8_t opcode);
    void OR_IYh(uint8_t opcode); void OR_IYl(uint8_t opcode);
    void OR_off_IY_d(uint8_t opcode);
    void CP_IYh(uint8_t opcode); void CP_IYl(uint8_t opcode);
    void CP_off_IY_d(uint8_t opcode);
    void POP_IY(uint8_t opcode); void EX_off_SP_IY(uint8_t opcode);
    void PUSH_IY(uint8_t opcode); void JP_off_IY(uint8_t opcode);
    void LD_SP_IY(uint8_t opcode);

    // DDCB/FDCB prefix opcodes (IX/IY bit operations - shared implementations)
    void LD_B_RLC_off_IX_IY_d(uint8_t opcode); void LD_C_RLC_off_IX_IY_d(uint8_t opcode);
    void LD_D_RLC_off_IX_IY_d(uint8_t opcode); void LD_E_RLC_off_IX_IY_d(uint8_t opcode);
    void LD_H_RLC_off_IX_IY_d(uint8_t opcode); void LD_L_RLC_off_IX_IY_d(uint8_t opcode);
    void RLC_off_IX_IY_d(uint8_t opcode); void LD_A_RLC_off_IX_IY_d(uint8_t opcode);
    void LD_B_RRC_off_IX_IY_d(uint8_t opcode); void LD_C_RRC_off_IX_IY_d(uint8_t opcode);
    void LD_D_RRC_off_IX_IY_d(uint8_t opcode); void LD_E_RRC_off_IX_IY_d(uint8_t opcode);
    void LD_H_RRC_off_IX_IY_d(uint8_t opcode); void LD_L_RRC_off_IX_IY_d(uint8_t opcode);
    void RRC_off_IX_IY_d(uint8_t opcode); void LD_A_RRC_off_IX_IY_d(uint8_t opcode);
    void LD_B_RL_off_IX_IY_d(uint8_t opcode); void LD_C_RL_off_IX_IY_d(uint8_t opcode);
    void LD_D_RL_off_IX_IY_d(uint8_t opcode); void LD_E_RL_off_IX_IY_d(uint8_t opcode);
    void LD_H_RL_off_IX_IY_d(uint8_t opcode); void LD_L_RL_off_IX_IY_d(uint8_t opcode);
    void RL_off_IX_IY_d(uint8_t opcode); void LD_A_RL_off_IX_IY_d(uint8_t opcode);
    void LD_B_RR_off_IX_IY_d(uint8_t opcode); void LD_C_RR_off_IX_IY_d(uint8_t opcode);
    void LD_D_RR_off_IX_IY_d(uint8_t opcode); void LD_E_RR_off_IX_IY_d(uint8_t opcode);
    void LD_H_RR_off_IX_IY_d(uint8_t opcode); void LD_L_RR_off_IX_IY_d(uint8_t opcode);
    void RR_off_IX_IY_d(uint8_t opcode); void LD_A_RR_off_IX_IY_d(uint8_t opcode);
    void LD_B_SLA_off_IX_IY_d(uint8_t opcode); void LD_C_SLA_off_IX_IY_d(uint8_t opcode);
    void LD_D_SLA_off_IX_IY_d(uint8_t opcode); void LD_E_SLA_off_IX_IY_d(uint8_t opcode);
    void LD_H_SLA_off_IX_IY_d(uint8_t opcode); void LD_L_SLA_off_IX_IY_d(uint8_t opcode);
    void SLA_off_IX_IY_d(uint8_t opcode); void LD_A_SLA_off_IX_IY_d(uint8_t opcode);
    void LD_B_SRA_off_IX_IY_d(uint8_t opcode); void LD_C_SRA_off_IX_IY_d(uint8_t opcode);
    void LD_D_SRA_off_IX_IY_d(uint8_t opcode); void LD_E_SRA_off_IX_IY_d(uint8_t opcode);
    void LD_H_SRA_off_IX_IY_d(uint8_t opcode); void LD_L_SRA_off_IX_IY_d(uint8_t opcode);
    void SRA_off_IX_IY_d(uint8_t opcode); void LD_A_SRA_off_IX_IY_d(uint8_t opcode);
    void LD_B_SLL_off_IX_IY_d(uint8_t opcode); void LD_C_SLL_off_IX_IY_d(uint8_t opcode);
    void LD_D_SLL_off_IX_IY_d(uint8_t opcode); void LD_E_SLL_off_IX_IY_d(uint8_t opcode);
    void LD_H_SLL_off_IX_IY_d(uint8_t opcode); void LD_L_SLL_off_IX_IY_d(uint8_t opcode);
    void SLL_off_IX_IY_d(uint8_t opcode); void LD_A_SLL_off_IX_IY_d(uint8_t opcode);
    void LD_B_SRL_off_IX_IY_d(uint8_t opcode); void LD_C_SRL_off_IX_IY_d(uint8_t opcode);
    void LD_D_SRL_off_IX_IY_d(uint8_t opcode); void LD_E_SRL_off_IX_IY_d(uint8_t opcode);
    void LD_H_SRL_off_IX_IY_d(uint8_t opcode); void LD_L_SRL_off_IX_IY_d(uint8_t opcode);
    void SRL_off_IX_IY_d(uint8_t opcode); void LD_A_SRL_off_IX_IY_d(uint8_t opcode);
    void BIT_0_off_IX_IY_d(uint8_t opcode); void BIT_1_off_IX_IY_d(uint8_t opcode);
    void BIT_2_off_IX_IY_d(uint8_t opcode); void BIT_3_off_IX_IY_d(uint8_t opcode);
    void BIT_4_off_IX_IY_d(uint8_t opcode); void BIT_5_off_IX_IY_d(uint8_t opcode);
    void BIT_6_off_IX_IY_d(uint8_t opcode); void BIT_7_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_0_off_IX_IY_d(uint8_t opcode); void LD_C_RES_0_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_0_off_IX_IY_d(uint8_t opcode); void LD_E_RES_0_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_0_off_IX_IY_d(uint8_t opcode); void LD_L_RES_0_off_IX_IY_d(uint8_t opcode);
    void RES_0_off_IX_IY_d(uint8_t opcode); void LD_A_RES_0_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_1_off_IX_IY_d(uint8_t opcode); void LD_C_RES_1_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_1_off_IX_IY_d(uint8_t opcode); void LD_E_RES_1_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_1_off_IX_IY_d(uint8_t opcode); void LD_L_RES_1_off_IX_IY_d(uint8_t opcode);
    void RES_1_off_IX_IY_d(uint8_t opcode); void LD_A_RES_1_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_2_off_IX_IY_d(uint8_t opcode); void LD_C_RES_2_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_2_off_IX_IY_d(uint8_t opcode); void LD_E_RES_2_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_2_off_IX_IY_d(uint8_t opcode); void LD_L_RES_2_off_IX_IY_d(uint8_t opcode);
    void RES_2_off_IX_IY_d(uint8_t opcode); void LD_A_RES_2_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_3_off_IX_IY_d(uint8_t opcode); void LD_C_RES_3_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_3_off_IX_IY_d(uint8_t opcode); void LD_E_RES_3_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_3_off_IX_IY_d(uint8_t opcode); void LD_L_RES_3_off_IX_IY_d(uint8_t opcode);
    void RES_3_off_IX_IY_d(uint8_t opcode); void LD_A_RES_3_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_4_off_IX_IY_d(uint8_t opcode); void LD_C_RES_4_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_4_off_IX_IY_d(uint8_t opcode); void LD_E_RES_4_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_4_off_IX_IY_d(uint8_t opcode); void LD_L_RES_4_off_IX_IY_d(uint8_t opcode);
    void RES_4_off_IX_IY_d(uint8_t opcode); void LD_A_RES_4_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_5_off_IX_IY_d(uint8_t opcode); void LD_C_RES_5_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_5_off_IX_IY_d(uint8_t opcode); void LD_E_RES_5_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_5_off_IX_IY_d(uint8_t opcode); void LD_L_RES_5_off_IX_IY_d(uint8_t opcode);
    void RES_5_off_IX_IY_d(uint8_t opcode); void LD_A_RES_5_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_6_off_IX_IY_d(uint8_t opcode); void LD_C_RES_6_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_6_off_IX_IY_d(uint8_t opcode); void LD_E_RES_6_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_6_off_IX_IY_d(uint8_t opcode); void LD_L_RES_6_off_IX_IY_d(uint8_t opcode);
    void RES_6_off_IX_IY_d(uint8_t opcode); void LD_A_RES_6_off_IX_IY_d(uint8_t opcode);
    void LD_B_RES_7_off_IX_IY_d(uint8_t opcode); void LD_C_RES_7_off_IX_IY_d(uint8_t opcode);
    void LD_D_RES_7_off_IX_IY_d(uint8_t opcode); void LD_E_RES_7_off_IX_IY_d(uint8_t opcode);
    void LD_H_RES_7_off_IX_IY_d(uint8_t opcode); void LD_L_RES_7_off_IX_IY_d(uint8_t opcode);
    void RES_7_off_IX_IY_d(uint8_t opcode); void LD_A_RES_7_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_0_off_IX_IY_d(uint8_t opcode); void LD_C_SET_0_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_0_off_IX_IY_d(uint8_t opcode); void LD_E_SET_0_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_0_off_IX_IY_d(uint8_t opcode); void LD_L_SET_0_off_IX_IY_d(uint8_t opcode);
    void SET_0_off_IX_IY_d(uint8_t opcode); void LD_A_SET_0_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_1_off_IX_IY_d(uint8_t opcode); void LD_C_SET_1_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_1_off_IX_IY_d(uint8_t opcode); void LD_E_SET_1_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_1_off_IX_IY_d(uint8_t opcode); void LD_L_SET_1_off_IX_IY_d(uint8_t opcode);
    void SET_1_off_IX_IY_d(uint8_t opcode); void LD_A_SET_1_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_2_off_IX_IY_d(uint8_t opcode); void LD_C_SET_2_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_2_off_IX_IY_d(uint8_t opcode); void LD_E_SET_2_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_2_off_IX_IY_d(uint8_t opcode); void LD_L_SET_2_off_IX_IY_d(uint8_t opcode);
    void SET_2_off_IX_IY_d(uint8_t opcode); void LD_A_SET_2_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_3_off_IX_IY_d(uint8_t opcode); void LD_C_SET_3_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_3_off_IX_IY_d(uint8_t opcode); void LD_E_SET_3_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_3_off_IX_IY_d(uint8_t opcode); void LD_L_SET_3_off_IX_IY_d(uint8_t opcode);
    void SET_3_off_IX_IY_d(uint8_t opcode); void LD_A_SET_3_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_4_off_IX_IY_d(uint8_t opcode); void LD_C_SET_4_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_4_off_IX_IY_d(uint8_t opcode); void LD_E_SET_4_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_4_off_IX_IY_d(uint8_t opcode); void LD_L_SET_4_off_IX_IY_d(uint8_t opcode);
    void SET_4_off_IX_IY_d(uint8_t opcode); void LD_A_SET_4_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_5_off_IX_IY_d(uint8_t opcode); void LD_C_SET_5_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_5_off_IX_IY_d(uint8_t opcode); void LD_E_SET_5_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_5_off_IX_IY_d(uint8_t opcode); void LD_L_SET_5_off_IX_IY_d(uint8_t opcode);
    void SET_5_off_IX_IY_d(uint8_t opcode); void LD_A_SET_5_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_6_off_IX_IY_d(uint8_t opcode); void LD_C_SET_6_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_6_off_IX_IY_d(uint8_t opcode); void LD_E_SET_6_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_6_off_IX_IY_d(uint8_t opcode); void LD_L_SET_6_off_IX_IY_d(uint8_t opcode);
    void SET_6_off_IX_IY_d(uint8_t opcode); void LD_A_SET_6_off_IX_IY_d(uint8_t opcode);
    void LD_B_SET_7_off_IX_IY_d(uint8_t opcode); void LD_C_SET_7_off_IX_IY_d(uint8_t opcode);
    void LD_D_SET_7_off_IX_IY_d(uint8_t opcode); void LD_E_SET_7_off_IX_IY_d(uint8_t opcode);
    void LD_H_SET_7_off_IX_IY_d(uint8_t opcode); void LD_L_SET_7_off_IX_IY_d(uint8_t opcode);
    void SET_7_off_IX_IY_d(uint8_t opcode); void LD_A_SET_7_off_IX_IY_d(uint8_t opcode);

protected:
    // Opcode tables
    static Z80OpcodeTable Main_Opcodes;
    static Z80OpcodeTable CB_Opcodes;
    static Z80OpcodeTable DD_Opcodes;
    static Z80OpcodeTable ED_Opcodes;
    static Z80OpcodeTable FD_Opcodes;
    static Z80OpcodeTable DDCB_Opcodes;
    static Z80OpcodeTable FDCB_Opcodes;

    // CPU state
    Z80State m_CPURegisters;
    uint8_t m_ParityTable[256];
    uint8_t m_SZ35Table[256];
    uint16_t m_MEMPTR;
    CpuType m_CPUType = CpuType::NMOS;
    uint32_t m_PrevOpcodeFlags;
    bool m_Iff2_read = false;
    bool m_LD_I_A = false;

    // Callbacks
    void* m_Param = nullptr;
    MemReadFunc m_MemRead;
    MemWriteFunc m_MemWrite;
    IoReadFunc m_IORead;
    IoWriteFunc m_IOWrite;
    ContentionFunc m_MemContentionHandling;
    ContentionFunc m_NoMreqContentionHandling;
    OpcodeCallback m_OpcodeCallback;
};

} // namespace zxspec
