/*
 * z80_test.cpp - Native test harness for the Z80 CPU emulation core
 *
 * Standalone tests for basic Z80 instruction execution.
 * Compiles with the z80_test CMake target (native, non-Emscripten build).
 *
 * Written by Mike Daley
 */

#include "z80/z80.hpp"

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cstdlib>

// ---------------------------------------------------------------------------
// Minimal test framework
// ---------------------------------------------------------------------------

static int g_total   = 0;
static int g_passed  = 0;
static int g_failed  = 0;

#define TEST_BEGIN(name)                                         \
    do {                                                         \
        g_total++;                                               \
        const char* _test_name = (name);                         \
        bool _test_ok = true;                                    \
        (void)_test_ok;

#define EXPECT_EQ(actual, expected)                               \
    do {                                                          \
        auto _a = (actual);                                       \
        auto _e = (expected);                                     \
        if (_a != _e) {                                           \
            std::printf("    FAIL: %s == 0x%X, expected 0x%X\n",  \
                        #actual, (unsigned)_a, (unsigned)_e);     \
            _test_ok = false;                                     \
        }                                                         \
    } while (0)

#define EXPECT_TRUE(expr)                                         \
    do {                                                          \
        if (!(expr)) {                                            \
            std::printf("    FAIL: %s was false\n", #expr);       \
            _test_ok = false;                                     \
        }                                                         \
    } while (0)

#define EXPECT_FALSE(expr)                                        \
    do {                                                          \
        if ((expr)) {                                             \
            std::printf("    FAIL: %s was true\n", #expr);        \
            _test_ok = false;                                     \
        }                                                         \
    } while (0)

#define TEST_END()                                                \
        if (_test_ok) {                                           \
            std::printf("  PASS  %s\n", _test_name);              \
            g_passed++;                                           \
        } else {                                                  \
            std::printf("  FAIL  %s\n", _test_name);              \
            g_failed++;                                           \
        }                                                         \
    } while (0)

// ---------------------------------------------------------------------------
// Test environment: 64 KB flat memory + stubs
// ---------------------------------------------------------------------------

static uint8_t g_memory[65536];

static uint8_t memReadCallback(uint16_t address, void* /*param*/)
{
    return g_memory[address];
}

static void memWriteCallback(uint16_t address, uint8_t data, void* /*param*/)
{
    g_memory[address] = data;
}

static uint8_t ioReadCallback(uint16_t /*address*/, void* /*param*/)
{
    return 0xFF;
}

static void ioWriteCallback(uint16_t /*address*/, uint8_t /*data*/, void* /*param*/)
{
}

static void contentionCallback(uint16_t /*address*/, uint32_t /*tstates*/, void* /*param*/)
{
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

using ByteReg = zxspec::Z80::ByteReg;
using WordReg = zxspec::Z80::WordReg;

static zxspec::Z80 g_cpu;

// Reset the CPU and clear memory, then initialise callbacks.
static void resetEnv()
{
    std::memset(g_memory, 0x00, sizeof(g_memory));
    g_cpu.reset(true);
    g_cpu.initialise(memReadCallback, memWriteCallback,
                     ioReadCallback, ioWriteCallback,
                     contentionCallback, nullptr);
    g_cpu.resetTStates();
}

// Place bytes into memory starting at 'address'.
static void poke(uint16_t address, std::initializer_list<uint8_t> bytes)
{
    for (auto b : bytes) {
        g_memory[address++] = b;
    }
}

// Execute a single instruction (the CPU will execute one do-while iteration).
static void step()
{
    g_cpu.execute(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

static void test_nop()
{
    TEST_BEGIN("NOP - PC increments by 1, T-states = 4");
        resetEnv();
        poke(0x0000, { 0x00 });             // NOP
        step();
        EXPECT_EQ(g_cpu.getRegister(WordReg::PC), 0x0001);
        EXPECT_EQ(g_cpu.getTStates(), 4u);
    TEST_END();
}

static void test_ld_bc_nn()
{
    TEST_BEGIN("LD BC,nn - loads 16-bit immediate into BC");
        resetEnv();
        poke(0x0000, { 0x01, 0x34, 0x12 }); // LD BC, 0x1234
        step();
        EXPECT_EQ(g_cpu.getRegister(WordReg::BC), 0x1234);
        EXPECT_EQ(g_cpu.getRegister(WordReg::PC), 0x0003);
        EXPECT_EQ(g_cpu.getTStates(), 10u);
    TEST_END();
}

static void test_ld_a_n()
{
    TEST_BEGIN("LD A,n - loads 8-bit immediate into A");
        resetEnv();
        poke(0x0000, { 0x3E, 0x42 });       // LD A, 0x42
        step();
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x42);
        EXPECT_EQ(g_cpu.getRegister(WordReg::PC), 0x0002);
        EXPECT_EQ(g_cpu.getTStates(), 7u);
    TEST_END();
}

static void test_inc_a()
{
    TEST_BEGIN("INC A - increments A, sets flags correctly");
        resetEnv();
        // LD A, 0x00 ; INC A
        poke(0x0000, { 0x3E, 0x00, 0x3C });
        step(); // LD A, 0
        step(); // INC A
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x01);
        // Z should be clear, N should be clear
        uint8_t f = g_cpu.getRegister(ByteReg::F);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_Z);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_N);
    TEST_END();

    TEST_BEGIN("INC A - zero to 1 clears Z flag, 0xFF wraps to 0 sets Z and H");
        resetEnv();
        poke(0x0000, { 0x3E, 0xFF, 0x3C }); // LD A, 0xFF; INC A
        step(); // LD A, 0xFF
        step(); // INC A -> 0x00
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x00);
        uint8_t f = g_cpu.getRegister(ByteReg::F);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_Z);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_H);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_N);
    TEST_END();
}

static void test_dec_a()
{
    TEST_BEGIN("DEC A - decrements A, sets N flag");
        resetEnv();
        poke(0x0000, { 0x3E, 0x01, 0x3D }); // LD A, 0x01; DEC A
        step(); // LD A, 1
        step(); // DEC A -> 0
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x00);
        uint8_t f = g_cpu.getRegister(ByteReg::F);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_Z);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_N);
    TEST_END();
}

static void test_add_a_b()
{
    TEST_BEGIN("ADD A,B - adds B to A, correct result and flags");
        resetEnv();
        // LD A, 0x10; LD B, 0x20; ADD A,B
        poke(0x0000, { 0x3E, 0x10,   // LD A, 0x10
                        0x06, 0x20,   // LD B, 0x20
                        0x80 });      // ADD A, B
        step(); // LD A
        step(); // LD B
        step(); // ADD A,B
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x30);
        uint8_t f = g_cpu.getRegister(ByteReg::F);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_Z);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_C);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_N);
    TEST_END();

    TEST_BEGIN("ADD A,B - overflow sets carry flag");
        resetEnv();
        poke(0x0000, { 0x3E, 0x80,   // LD A, 0x80
                        0x06, 0x80,   // LD B, 0x80
                        0x80 });      // ADD A, B -> 0x100 -> A=0x00
        step(); step(); step();
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x00);
        uint8_t f = g_cpu.getRegister(ByteReg::F);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_C);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_Z);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_V); // signed overflow: -128 + -128
    TEST_END();
}

static void test_jp_nn()
{
    TEST_BEGIN("JP nn - unconditional jump changes PC");
        resetEnv();
        poke(0x0000, { 0xC3, 0x00, 0x80 }); // JP 0x8000
        step();
        EXPECT_EQ(g_cpu.getRegister(WordReg::PC), 0x8000);
        EXPECT_EQ(g_cpu.getTStates(), 10u);
    TEST_END();
}

static void test_call_ret()
{
    TEST_BEGIN("CALL nn / RET - call pushes return addr, RET pops it");
        resetEnv();
        // Set SP to a known value
        g_cpu.setRegister(WordReg::SP, 0xFFFE);

        // At 0x0000: CALL 0x0100
        poke(0x0000, { 0xCD, 0x00, 0x01 });
        // At 0x0100: RET
        poke(0x0100, { 0xC9 });

        step(); // CALL 0x0100
        EXPECT_EQ(g_cpu.getRegister(WordReg::PC), 0x0100);
        EXPECT_EQ(g_cpu.getRegister(WordReg::SP), 0xFFFC);
        // Stack should contain return address 0x0003 (next instr after CALL)
        EXPECT_EQ(g_memory[0xFFFC], 0x03);
        EXPECT_EQ(g_memory[0xFFFD], 0x00);

        step(); // RET
        EXPECT_EQ(g_cpu.getRegister(WordReg::PC), 0x0003);
        EXPECT_EQ(g_cpu.getRegister(WordReg::SP), 0xFFFE);
    TEST_END();
}

static void test_push_pop()
{
    TEST_BEGIN("PUSH BC / POP DE - stack round-trip preserves value");
        resetEnv();
        g_cpu.setRegister(WordReg::SP, 0xFFFE);

        // LD BC, 0xABCD; PUSH BC; POP DE
        poke(0x0000, { 0x01, 0xCD, 0xAB,   // LD BC, 0xABCD
                        0xC5,                // PUSH BC
                        0xD1 });             // POP DE
        step(); // LD BC
        step(); // PUSH BC
        EXPECT_EQ(g_cpu.getRegister(WordReg::SP), 0xFFFC);

        step(); // POP DE
        EXPECT_EQ(g_cpu.getRegister(WordReg::DE), 0xABCD);
        EXPECT_EQ(g_cpu.getRegister(WordReg::SP), 0xFFFE);
    TEST_END();
}

static void test_xor_a()
{
    TEST_BEGIN("XOR A - A becomes 0, Z and P flags set, others clear");
        resetEnv();
        // LD A, 0xFF; XOR A
        poke(0x0000, { 0x3E, 0xFF, 0xAF });
        step(); // LD A, 0xFF
        step(); // XOR A
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x00);
        uint8_t f = g_cpu.getRegister(ByteReg::F);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_Z);
        EXPECT_TRUE(f & zxspec::Z80::FLAG_P);  // even parity for 0x00
        EXPECT_FALSE(f & zxspec::Z80::FLAG_N);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_C);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_H);
        EXPECT_FALSE(f & zxspec::Z80::FLAG_S);
    TEST_END();
}

static void test_ld_hl_mem()
{
    TEST_BEGIN("LD (HL),n / LD A,(HL) - memory write then read");
        resetEnv();
        // LD HL, 0x8000; LD (HL), 0x55; LD A, (HL)
        poke(0x0000, { 0x21, 0x00, 0x80,   // LD HL, 0x8000
                        0x36, 0x55,          // LD (HL), 0x55
                        0x7E });             // LD A, (HL)
        step(); // LD HL
        EXPECT_EQ(g_cpu.getRegister(WordReg::HL), 0x8000);

        step(); // LD (HL), 0x55
        EXPECT_EQ(g_memory[0x8000], 0x55);

        step(); // LD A, (HL)
        EXPECT_EQ(g_cpu.getRegister(ByteReg::A), 0x55);
    TEST_END();
}

static void test_reset()
{
    TEST_BEGIN("reset(true) - clears PC, SP=0xFFFF, AF=0xFFFF, other regs zeroed");
        resetEnv();
        // Set some registers to non-default values via instructions
        g_cpu.setRegister(WordReg::BC, 0x1234);
        g_cpu.setRegister(WordReg::DE, 0x5678);
        g_cpu.setRegister(WordReg::HL, 0x9ABC);
        g_cpu.setRegister(WordReg::IX, 0xDEAD);
        g_cpu.setRegister(WordReg::IY, 0xBEEF);
        g_cpu.setRegister(WordReg::PC, 0x4000);

        g_cpu.reset(true);

        EXPECT_EQ(g_cpu.getRegister(WordReg::PC), 0x0000);
        EXPECT_EQ(g_cpu.getRegister(WordReg::SP), 0xFFFF);
        EXPECT_EQ(g_cpu.getRegister(WordReg::AF), 0xFFFF);
        EXPECT_EQ(g_cpu.getRegister(WordReg::BC), 0x0000);
        EXPECT_EQ(g_cpu.getRegister(WordReg::DE), 0x0000);
        EXPECT_EQ(g_cpu.getRegister(WordReg::HL), 0x0000);
        EXPECT_EQ(g_cpu.getRegister(WordReg::IX), 0x0000);
        EXPECT_EQ(g_cpu.getRegister(WordReg::IY), 0x0000);
        EXPECT_EQ(g_cpu.getTStates(), 0u);
        EXPECT_FALSE(g_cpu.getHalted());
        EXPECT_EQ(g_cpu.getIFF1(), 0);
        EXPECT_EQ(g_cpu.getIFF2(), 0);
        EXPECT_EQ(g_cpu.getIMMode(), 0);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

int main()
{
    std::printf("========================================\n");
    std::printf("  Z80 CPU Test Harness\n");
    std::printf("========================================\n\n");

    test_nop();
    test_ld_bc_nn();
    test_ld_a_n();
    test_inc_a();
    test_dec_a();
    test_add_a_b();
    test_jp_nn();
    test_call_ret();
    test_push_pop();
    test_xor_a();
    test_ld_hl_mem();
    test_reset();

    std::printf("\n========================================\n");
    std::printf("  Results: %d / %d passed", g_passed, g_total);
    if (g_failed > 0) {
        std::printf("  (%d FAILED)", g_failed);
    }
    std::printf("\n========================================\n");

    return (g_failed == 0) ? 0 : 1;
}
