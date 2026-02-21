/*
 * timing_test.cpp - CPU and ULA timing validation tests
 *
 * Verifies that machine timing constants, frame structure, and ULA contention
 * tables are correct for each ZX Spectrum machine variant. Uses the current
 * values in machine_info.hpp as the reference.
 *
 * Written by Mike Daley
 */

#include "machine_info.hpp"
#include "contention.hpp"
#include "z80/z80.hpp"

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cmath>

// ---------------------------------------------------------------------------
// Minimal test framework (shared with z80_test.cpp)
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
            std::printf("    FAIL: %s == %u, expected %u\n",      \
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

using namespace zxspec;

// ---------------------------------------------------------------------------
// Stub callbacks for Z80 (needed by contention's applyIOContention)
// ---------------------------------------------------------------------------

static uint8_t g_memory[65536];

static uint8_t memReadCallback(uint16_t address, void*) { return g_memory[address]; }
static void memWriteCallback(uint16_t address, uint8_t data, void*) { g_memory[address] = data; }
static uint8_t ioReadCallback(uint16_t, void*) { return 0xFF; }
static void ioWriteCallback(uint16_t, uint8_t, void*) {}
static void contentionCallback(uint16_t, uint32_t, void*) {}

// ---------------------------------------------------------------------------
// Test: Shared display constants
// ---------------------------------------------------------------------------

static void test_display_constants()
{
    TEST_BEGIN("Display constants - screen dimensions");
        EXPECT_EQ(SCREEN_WIDTH, 256u);
        EXPECT_EQ(SCREEN_HEIGHT, 192u);
        EXPECT_EQ(TOTAL_WIDTH, 352u);
        EXPECT_EQ(TOTAL_HEIGHT, 304u);
        EXPECT_EQ(BORDER_TOP, 56u);
        EXPECT_EQ(BORDER_BOTTOM, 56u);
        EXPECT_EQ(BORDER_LEFT, 48u);
        EXPECT_EQ(BORDER_RIGHT, 48u);
    TEST_END();

    TEST_BEGIN("Display constants - framebuffer size");
        EXPECT_EQ(FRAMEBUFFER_SIZE, 352u * 304u * 4u);
    TEST_END();

    TEST_BEGIN("Display constants - timing invariants");
        EXPECT_EQ(TS_HORIZONTAL_DISPLAY, 128u);
        EXPECT_EQ(TSTATES_PER_CHAR, 4u);
    TEST_END();

    TEST_BEGIN("Audio constants");
        EXPECT_EQ(AUDIO_SAMPLE_RATE, 48000u);
        EXPECT_TRUE(std::abs(CPU_CLOCK_HZ - 3500000.0) < 0.01);
    TEST_END();

    TEST_BEGIN("Memory page size");
        EXPECT_EQ(MEM_PAGE_SIZE, 16384u);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: ULA contention pattern values
// ---------------------------------------------------------------------------

static void test_ula_contention_values()
{
    TEST_BEGIN("ULA contention pattern - 8-T-state cycle");
        EXPECT_EQ(ULA_CONTENTION_VALUES[0], 6u);
        EXPECT_EQ(ULA_CONTENTION_VALUES[1], 5u);
        EXPECT_EQ(ULA_CONTENTION_VALUES[2], 4u);
        EXPECT_EQ(ULA_CONTENTION_VALUES[3], 3u);
        EXPECT_EQ(ULA_CONTENTION_VALUES[4], 2u);
        EXPECT_EQ(ULA_CONTENTION_VALUES[5], 1u);
        EXPECT_EQ(ULA_CONTENTION_VALUES[6], 0u);
        EXPECT_EQ(ULA_CONTENTION_VALUES[7], 0u);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: Frame structure consistency for each machine
//
// Verifies that the timing parameters are internally consistent:
//   tsPerFrame == pxVerticalTotal * tsPerLine
//   tsVerticalBlank == pxVerticalBlank * tsPerLine
//   tsTopBorder == pxVertBorder * tsPerLine
//   tsVerticalDisplay == SCREEN_HEIGHT * tsPerLine
//   ulaTsToDisplay == tsVerticalBlank + tsTopBorder
// ---------------------------------------------------------------------------

static void test_frame_structure(const MachineInfo& m)
{
    char buf[128];

    std::snprintf(buf, sizeof(buf), "%s - tsPerFrame == pxVerticalTotal * tsPerLine", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.tsPerFrame, m.pxVerticalTotal * m.tsPerLine);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - tsVerticalBlank == pxVerticalBlank * tsPerLine", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.tsVerticalBlank, m.pxVerticalBlank * m.tsPerLine);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - tsTopBorder == pxVertBorder * tsPerLine", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.tsTopBorder, m.pxVertBorder * m.tsPerLine);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - tsVerticalDisplay == 192 * tsPerLine", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.tsVerticalDisplay, SCREEN_HEIGHT * m.tsPerLine);
    TEST_END();

    // ulaTsToDisplay is close to tsVerticalBlank + tsTopBorder but may differ
    // by a small offset on 128K machines due to hardware-specific ULA fetch timing.
    // The 48K has an exact match; 128K/+2 are 2 T-states earlier; +2A is 1 T-state later.
    std::snprintf(buf, sizeof(buf), "%s - ulaTsToDisplay near tsVerticalBlank + tsTopBorder", m.machineName);
    TEST_BEGIN(buf);
        uint32_t baseline = m.tsVerticalBlank + m.tsTopBorder;
        int32_t offset = (int32_t)m.ulaTsToDisplay - (int32_t)baseline;
        // Offset should be within a small range (currently -2 to +1 across all machines)
        EXPECT_TRUE(offset >= -3 && offset <= 3);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - frame regions sum to tsPerFrame", m.machineName);
    TEST_BEGIN(buf);
        // vblank + top border + paper + bottom border == total frame
        uint32_t bottomBorder = m.pxVertBorder * m.tsPerLine;
        uint32_t sum = m.tsVerticalBlank + m.tsTopBorder + m.tsVerticalDisplay + bottomBorder;
        EXPECT_EQ(sum, m.tsPerFrame);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - tsHorizontalDisplay == 128", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.tsHorizontalDisplay, 128u);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - tsPerChar == 4", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.tsPerChar, 4u);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - pxHorizontalDisplay == 256", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.pxHorizontalDisplay, 256u);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - pxVerticalDisplay == 192", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.pxVerticalDisplay, 192u);
    TEST_END();

    std::snprintf(buf, sizeof(buf), "%s - pxHorizontalTotal == 448", m.machineName);
    TEST_BEGIN(buf);
        EXPECT_EQ(m.pxHorizontalTotal, 448u);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: Machine-specific timing values (golden reference)
// ---------------------------------------------------------------------------

static void test_48k_timing()
{
    const MachineInfo& m = machines[eZXSpectrum48];

    TEST_BEGIN("48K - interrupt length");
        EXPECT_EQ(m.intLength, 32u);
    TEST_END();

    TEST_BEGIN("48K - T-states per frame");
        EXPECT_EQ(m.tsPerFrame, 69888u);
    TEST_END();

    TEST_BEGIN("48K - ULA T-state to display");
        EXPECT_EQ(m.ulaTsToDisplay, 14335u);
    TEST_END();

    TEST_BEGIN("48K - T-states per line");
        EXPECT_EQ(m.tsPerLine, 224u);
    TEST_END();

    TEST_BEGIN("48K - T-states top border");
        EXPECT_EQ(m.tsTopBorder, 12544u);
    TEST_END();

    TEST_BEGIN("48K - T-states vertical blank");
        EXPECT_EQ(m.tsVerticalBlank, 1792u);
    TEST_END();

    TEST_BEGIN("48K - T-states vertical display");
        EXPECT_EQ(m.tsVerticalDisplay, 43008u);
    TEST_END();

    TEST_BEGIN("48K - vertical blank lines");
        EXPECT_EQ(m.pxVerticalBlank, 8u);
    TEST_END();

    TEST_BEGIN("48K - vertical total lines");
        EXPECT_EQ(m.pxVerticalTotal, 312u);
    TEST_END();

    TEST_BEGIN("48K - vertical border lines");
        EXPECT_EQ(m.pxVertBorder, 56u);
    TEST_END();

    TEST_BEGIN("48K - no AY chip");
        EXPECT_FALSE(m.hasAY);
    TEST_END();

    TEST_BEGIN("48K - no paging");
        EXPECT_FALSE(m.hasPaging);
    TEST_END();

    TEST_BEGIN("48K - standard contention model");
        EXPECT_FALSE(m.altContention);
    TEST_END();

    TEST_BEGIN("48K - border drawing offset");
        EXPECT_EQ(m.borderDrawingOffset, 10u);
    TEST_END();

    TEST_BEGIN("48K - paper drawing offset");
        EXPECT_EQ(m.paperDrawingOffset, 16u);
    TEST_END();

    TEST_BEGIN("48K - ROM size 16K");
        EXPECT_EQ(m.romSize, 16384u);
    TEST_END();

    TEST_BEGIN("48K - RAM size 64K");
        EXPECT_EQ(m.ramSize, 65536u);
    TEST_END();

    TEST_BEGIN("48K - machine type enum");
        EXPECT_EQ(m.machineType, (uint32_t)eZXSpectrum48);
    TEST_END();
}

static void test_128k_timing()
{
    const MachineInfo& m = machines[eZXSpectrum128];

    TEST_BEGIN("128K - interrupt length");
        EXPECT_EQ(m.intLength, 36u);
    TEST_END();

    TEST_BEGIN("128K - T-states per frame");
        EXPECT_EQ(m.tsPerFrame, 70908u);
    TEST_END();

    TEST_BEGIN("128K - ULA T-state to display");
        EXPECT_EQ(m.ulaTsToDisplay, 14362u);
    TEST_END();

    TEST_BEGIN("128K - T-states per line");
        EXPECT_EQ(m.tsPerLine, 228u);
    TEST_END();

    TEST_BEGIN("128K - T-states top border");
        EXPECT_EQ(m.tsTopBorder, 12768u);
    TEST_END();

    TEST_BEGIN("128K - T-states vertical blank");
        EXPECT_EQ(m.tsVerticalBlank, 1596u);
    TEST_END();

    TEST_BEGIN("128K - T-states vertical display");
        EXPECT_EQ(m.tsVerticalDisplay, 43776u);
    TEST_END();

    TEST_BEGIN("128K - vertical blank lines");
        EXPECT_EQ(m.pxVerticalBlank, 7u);
    TEST_END();

    TEST_BEGIN("128K - vertical total lines");
        EXPECT_EQ(m.pxVerticalTotal, 311u);
    TEST_END();

    TEST_BEGIN("128K - vertical border lines");
        EXPECT_EQ(m.pxVertBorder, 56u);
    TEST_END();

    TEST_BEGIN("128K - has AY chip");
        EXPECT_TRUE(m.hasAY);
    TEST_END();

    TEST_BEGIN("128K - has paging");
        EXPECT_TRUE(m.hasPaging);
    TEST_END();

    TEST_BEGIN("128K - standard contention model");
        EXPECT_FALSE(m.altContention);
    TEST_END();

    TEST_BEGIN("128K - border drawing offset");
        EXPECT_EQ(m.borderDrawingOffset, 12u);
    TEST_END();

    TEST_BEGIN("128K - paper drawing offset");
        EXPECT_EQ(m.paperDrawingOffset, 16u);
    TEST_END();

    TEST_BEGIN("128K - ROM size 32K");
        EXPECT_EQ(m.romSize, 32768u);
    TEST_END();

    TEST_BEGIN("128K - RAM size 128K");
        EXPECT_EQ(m.ramSize, 131072u);
    TEST_END();

    TEST_BEGIN("128K - machine type enum");
        EXPECT_EQ(m.machineType, (uint32_t)eZXSpectrum128);
    TEST_END();
}

static void test_128k_plus2_timing()
{
    const MachineInfo& m = machines[eZXSpectrum128_2];

    TEST_BEGIN("128K +2 - interrupt length");
        EXPECT_EQ(m.intLength, 36u);
    TEST_END();

    TEST_BEGIN("128K +2 - T-states per frame");
        EXPECT_EQ(m.tsPerFrame, 70908u);
    TEST_END();

    TEST_BEGIN("128K +2 - ULA T-state to display");
        EXPECT_EQ(m.ulaTsToDisplay, 14362u);
    TEST_END();

    TEST_BEGIN("128K +2 - T-states per line");
        EXPECT_EQ(m.tsPerLine, 228u);
    TEST_END();

    TEST_BEGIN("128K +2 - T-states top border");
        EXPECT_EQ(m.tsTopBorder, 12768u);
    TEST_END();

    TEST_BEGIN("128K +2 - T-states vertical blank");
        EXPECT_EQ(m.tsVerticalBlank, 1596u);
    TEST_END();

    TEST_BEGIN("128K +2 - T-states vertical display");
        EXPECT_EQ(m.tsVerticalDisplay, 43776u);
    TEST_END();

    TEST_BEGIN("128K +2 - has AY chip");
        EXPECT_TRUE(m.hasAY);
    TEST_END();

    TEST_BEGIN("128K +2 - has paging");
        EXPECT_TRUE(m.hasPaging);
    TEST_END();

    TEST_BEGIN("128K +2 - standard contention model");
        EXPECT_FALSE(m.altContention);
    TEST_END();

    TEST_BEGIN("128K +2 - ROM size 32K");
        EXPECT_EQ(m.romSize, 32768u);
    TEST_END();

    TEST_BEGIN("128K +2 - RAM size 128K");
        EXPECT_EQ(m.ramSize, 131072u);
    TEST_END();

    TEST_BEGIN("128K +2 - machine type enum");
        EXPECT_EQ(m.machineType, (uint32_t)eZXSpectrum128_2);
    TEST_END();
}

static void test_128k_plus2a_timing()
{
    const MachineInfo& m = machines[eZXSpectrum128_2A];

    TEST_BEGIN("128K +2A - interrupt length");
        EXPECT_EQ(m.intLength, 32u);
    TEST_END();

    TEST_BEGIN("128K +2A - T-states per frame");
        EXPECT_EQ(m.tsPerFrame, 70908u);
    TEST_END();

    TEST_BEGIN("128K +2A - ULA T-state to display");
        EXPECT_EQ(m.ulaTsToDisplay, 14365u);
    TEST_END();

    TEST_BEGIN("128K +2A - T-states per line");
        EXPECT_EQ(m.tsPerLine, 228u);
    TEST_END();

    TEST_BEGIN("128K +2A - T-states top border");
        EXPECT_EQ(m.tsTopBorder, 12768u);
    TEST_END();

    TEST_BEGIN("128K +2A - T-states vertical blank");
        EXPECT_EQ(m.tsVerticalBlank, 1596u);
    TEST_END();

    TEST_BEGIN("128K +2A - T-states vertical display");
        EXPECT_EQ(m.tsVerticalDisplay, 43776u);
    TEST_END();

    TEST_BEGIN("128K +2A - has AY chip");
        EXPECT_TRUE(m.hasAY);
    TEST_END();

    TEST_BEGIN("128K +2A - has paging");
        EXPECT_TRUE(m.hasPaging);
    TEST_END();

    TEST_BEGIN("128K +2A - alternate contention model");
        EXPECT_TRUE(m.altContention);
    TEST_END();

    TEST_BEGIN("128K +2A - ROM size 64K");
        EXPECT_EQ(m.romSize, 65536u);
    TEST_END();

    TEST_BEGIN("128K +2A - RAM size 128K");
        EXPECT_EQ(m.ramSize, 131072u);
    TEST_END();

    TEST_BEGIN("128K +2A - machine type enum");
        EXPECT_EQ(m.machineType, (uint32_t)eZXSpectrum128_2A);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: ULA contention table correctness
//
// For each machine, initialise the ULAContention class and verify:
//  - No contention before the paper area begins
//  - Correct 8-T-state contention pattern at the start of the paper area
//  - No contention during horizontal retrace (beyond the 128 T-state paper width)
//  - No contention after the final paper scanline
// ---------------------------------------------------------------------------

static void test_contention_table(const MachineInfo& m)
{
    ULAContention contention;
    contention.init(m);
    char buf[128];

    // Contention starts 1 T-state before ulaTsToDisplay
    uint32_t contentionStart = m.ulaTsToDisplay - 1;

    // --- Before contention area: should be zero ---
    std::snprintf(buf, sizeof(buf), "%s contention - zero before paper area", m.machineName);
    TEST_BEGIN(buf);
        bool allZero = true;
        for (uint32_t ts = 0; ts < contentionStart && ts < 100; ts++) {
            if (contention.memoryContention(ts) != 0) {
                std::printf("    FAIL: contention at T-state %u = %u, expected 0\n",
                            ts, contention.memoryContention(ts));
                allZero = false;
                break;
            }
        }
        // Also check just before contention start
        if (contentionStart > 0 && contention.memoryContention(contentionStart - 1) != 0) {
            std::printf("    FAIL: contention at T-state %u = %u, expected 0\n",
                        contentionStart - 1, contention.memoryContention(contentionStart - 1));
            allZero = false;
        }
        EXPECT_TRUE(allZero);
    TEST_END();

    // --- First line of paper: check the 8-T-state repeating pattern ---
    std::snprintf(buf, sizeof(buf), "%s contention - first scanline pattern (6,5,4,3,2,1,0,0)", m.machineName);
    TEST_BEGIN(buf);
        for (uint32_t i = 0; i < 8; i++) {
            uint32_t ts = contentionStart + i;
            uint32_t expected = ULA_CONTENTION_VALUES[i];
            if (contention.memoryContention(ts) != expected) {
                std::printf("    FAIL: T-state %u (offset %u) = %u, expected %u\n",
                            ts, i, contention.memoryContention(ts), expected);
                _test_ok = false;
            }
        }
    TEST_END();

    // --- Pattern repeats across the first scanline ---
    std::snprintf(buf, sizeof(buf), "%s contention - pattern repeats across scanline", m.machineName);
    TEST_BEGIN(buf);
        // Check second and third repetitions of the pattern (at offset 8 and 16)
        for (uint32_t rep = 1; rep < 3; rep++) {
            for (uint32_t i = 0; i < 8; i++) {
                uint32_t ts = contentionStart + rep * 8 + i;
                uint32_t expected = ULA_CONTENTION_VALUES[i];
                if (contention.memoryContention(ts) != expected) {
                    std::printf("    FAIL: T-state %u (rep %u, offset %u) = %u, expected %u\n",
                                ts, rep, i, contention.memoryContention(ts), expected);
                    _test_ok = false;
                }
            }
        }
    TEST_END();

    // --- Horizontal retrace: no contention beyond 128 T-states into the line ---
    std::snprintf(buf, sizeof(buf), "%s contention - zero during horizontal retrace", m.machineName);
    TEST_BEGIN(buf);
        // Check a few T-states after the paper area on the first scanline
        uint32_t retraceStart = contentionStart + TS_HORIZONTAL_DISPLAY;
        bool retraceOk = true;
        for (uint32_t i = 0; i < 16 && (retraceStart + i) < m.tsPerFrame; i++) {
            if (contention.memoryContention(retraceStart + i) != 0) {
                std::printf("    FAIL: retrace T-state %u = %u, expected 0\n",
                            retraceStart + i, contention.memoryContention(retraceStart + i));
                retraceOk = false;
                break;
            }
        }
        EXPECT_TRUE(retraceOk);
    TEST_END();

    // --- Second scanline starts at contentionStart + tsPerLine ---
    std::snprintf(buf, sizeof(buf), "%s contention - second scanline starts correctly", m.machineName);
    TEST_BEGIN(buf);
        uint32_t line2Start = contentionStart + m.tsPerLine;
        // Should follow the same 6,5,4,3,2,1,0,0 pattern
        for (uint32_t i = 0; i < 8; i++) {
            uint32_t ts = line2Start + i;
            uint32_t expected = ULA_CONTENTION_VALUES[i];
            if (contention.memoryContention(ts) != expected) {
                std::printf("    FAIL: line 2 T-state %u (offset %u) = %u, expected %u\n",
                            ts, i, contention.memoryContention(ts), expected);
                _test_ok = false;
            }
        }
    TEST_END();

    // --- Last paper scanline (line 191) ---
    std::snprintf(buf, sizeof(buf), "%s contention - last paper scanline (line 191)", m.machineName);
    TEST_BEGIN(buf);
        uint32_t lastLineStart = contentionStart + 191 * m.tsPerLine;
        for (uint32_t i = 0; i < 8; i++) {
            uint32_t ts = lastLineStart + i;
            uint32_t expected = ULA_CONTENTION_VALUES[i];
            if (contention.memoryContention(ts) != expected) {
                std::printf("    FAIL: line 191 T-state %u (offset %u) = %u, expected %u\n",
                            ts, i, contention.memoryContention(ts), expected);
                _test_ok = false;
            }
        }
    TEST_END();

    // --- After paper area: no contention on line 192 ---
    std::snprintf(buf, sizeof(buf), "%s contention - zero after paper area (line 192+)", m.machineName);
    TEST_BEGIN(buf);
        uint32_t afterPaperStart = contentionStart + 192 * m.tsPerLine;
        bool afterOk = true;
        for (uint32_t i = 0; i < 16 && (afterPaperStart + i) < m.tsPerFrame; i++) {
            if (contention.memoryContention(afterPaperStart + i) != 0) {
                std::printf("    FAIL: post-paper T-state %u = %u, expected 0\n",
                            afterPaperStart + i, contention.memoryContention(afterPaperStart + i));
                afterOk = false;
                break;
            }
        }
        EXPECT_TRUE(afterOk);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: IO contention patterns
//
// Verifies the four I/O contention patterns using a Z80 instance:
//   - Contended address + even port
//   - Contended address + odd port
//   - Uncontended address + even port
//   - Uncontended address + odd port
// ---------------------------------------------------------------------------

static void test_io_contention_patterns(const MachineInfo& m)
{
    ULAContention contention;
    contention.init(m);

    Z80 z80;
    z80.reset(true);
    z80.initialise(memReadCallback, memWriteCallback,
                   ioReadCallback, ioWriteCallback,
                   contentionCallback, contentionCallback, nullptr);

    char buf[128];

    // Place the CPU at a non-contended T-state (before paper area) so contention
    // delays are zero. This lets us verify the base timing pattern.
    uint32_t safeTs = 0;

    // --- Uncontended + odd port: N:4 (4 T-states, no contention) ---
    std::snprintf(buf, sizeof(buf), "%s I/O contention - uncontended + odd port: N:4", m.machineName);
    TEST_BEGIN(buf);
        z80.resetTStates();
        z80.addTStates(safeTs);
        uint32_t before = z80.getTStates();
        contention.applyIOContention(z80, 0x8001, false);  // uncontended, odd
        uint32_t elapsed = z80.getTStates() - before;
        EXPECT_EQ(elapsed, 4u);
    TEST_END();

    // --- Uncontended + even port: N:1, C:3 (4 T-states when no contention delay) ---
    std::snprintf(buf, sizeof(buf), "%s I/O contention - uncontended + even port: N:1, C:3", m.machineName);
    TEST_BEGIN(buf);
        z80.resetTStates();
        z80.addTStates(safeTs);
        uint32_t before = z80.getTStates();
        contention.applyIOContention(z80, 0x8000, false);  // uncontended, even
        uint32_t elapsed = z80.getTStates() - before;
        // At a non-contended T-state, contention delay is 0, so total = 1 + 0 + 3 = 4
        EXPECT_EQ(elapsed, 4u);
    TEST_END();

    // --- Contended + even port: C:1, C:3 (4 T-states when no contention delay) ---
    std::snprintf(buf, sizeof(buf), "%s I/O contention - contended + even port: C:1, C:3", m.machineName);
    TEST_BEGIN(buf);
        z80.resetTStates();
        z80.addTStates(safeTs);
        uint32_t before = z80.getTStates();
        contention.applyIOContention(z80, 0x4000, true);  // contended, even
        uint32_t elapsed = z80.getTStates() - before;
        EXPECT_EQ(elapsed, 4u);
    TEST_END();

    // --- Contended + odd port: C:1, C:1, C:1, C:1 (4 T-states when no contention delay) ---
    std::snprintf(buf, sizeof(buf), "%s I/O contention - contended + odd port: C:1, C:1, C:1, C:1", m.machineName);
    TEST_BEGIN(buf);
        z80.resetTStates();
        z80.addTStates(safeTs);
        uint32_t before = z80.getTStates();
        contention.applyIOContention(z80, 0x4001, true);  // contended, odd
        uint32_t elapsed = z80.getTStates() - before;
        EXPECT_EQ(elapsed, 4u);
    TEST_END();

    // --- Contended + even port during active contention: should add extra delay ---
    std::snprintf(buf, sizeof(buf), "%s I/O contention - contended + even during paper adds delay", m.machineName);
    TEST_BEGIN(buf);
        // Position the CPU at the start of contention (where delay = 6)
        uint32_t contentionTs = m.ulaTsToDisplay - 1;
        z80.resetTStates();
        z80.addTStates(contentionTs);
        uint32_t before = z80.getTStates();
        contention.applyIOContention(z80, 0x4000, true);  // contended, even
        uint32_t elapsed = z80.getTStates() - before;
        // C:1, C:3 with contention delays added. The first C adds 6 T-states,
        // then 1 T-state advances, the second C delay depends on the new position.
        // Total should be > 4 since we're in the contention zone.
        EXPECT_TRUE(elapsed > 4u);
    TEST_END();

    // --- Contended + odd port during active contention: should add extra delay ---
    std::snprintf(buf, sizeof(buf), "%s I/O contention - contended + odd during paper adds delay", m.machineName);
    TEST_BEGIN(buf);
        uint32_t contentionTs = m.ulaTsToDisplay - 1;
        z80.resetTStates();
        z80.addTStates(contentionTs);
        uint32_t before = z80.getTStates();
        contention.applyIOContention(z80, 0x4001, true);  // contended, odd
        uint32_t elapsed = z80.getTStates() - before;
        EXPECT_TRUE(elapsed > 4u);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: Contention table wraps at frame boundary
// ---------------------------------------------------------------------------

static void test_contention_wrapping(const MachineInfo& m)
{
    ULAContention contention;
    contention.init(m);
    char buf[128];

    std::snprintf(buf, sizeof(buf), "%s contention - wraps at frame boundary", m.machineName);
    TEST_BEGIN(buf);
        // Contention at tsPerFrame + X should equal contention at X
        for (uint32_t ts = 0; ts < 32; ts++) {
            uint32_t wrapped = contention.memoryContention(m.tsPerFrame + ts);
            uint32_t direct = contention.memoryContention(ts);
            if (wrapped != direct) {
                std::printf("    FAIL: memoryContention(%u + %u) = %u, memoryContention(%u) = %u\n",
                            m.tsPerFrame, ts, wrapped, ts, direct);
                _test_ok = false;
            }
        }
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: FPS derived from timing
// ---------------------------------------------------------------------------

static void test_fps_calculation()
{
    TEST_BEGIN("48K - FPS is approximately 50.08 Hz");
        double fps48 = CPU_CLOCK_HZ / machines[eZXSpectrum48].tsPerFrame;
        EXPECT_TRUE(fps48 > 50.0 && fps48 < 50.1);
    TEST_END();

    TEST_BEGIN("128K - FPS is approximately 49.36 Hz");
        double fps128 = CPU_CLOCK_HZ / machines[eZXSpectrum128].tsPerFrame;
        EXPECT_TRUE(fps128 > 49.3 && fps128 < 49.4);
    TEST_END();
}

// ---------------------------------------------------------------------------
// Test: Maximum array bounds
// ---------------------------------------------------------------------------

static void test_max_bounds()
{
    TEST_BEGIN("MAX_SCANLINES accommodates all machines");
        for (int i = 0; i < 4; i++) {
            if (machines[i].pxVerticalTotal > MAX_SCANLINES) {
                std::printf("    FAIL: %s has %u scanlines > MAX_SCANLINES %u\n",
                            machines[i].machineName, machines[i].pxVerticalTotal, MAX_SCANLINES);
                _test_ok = false;
            }
        }
    TEST_END();

    TEST_BEGIN("MAX_TS_PER_LINE accommodates all machines");
        for (int i = 0; i < 4; i++) {
            if (machines[i].tsPerLine > MAX_TS_PER_LINE) {
                std::printf("    FAIL: %s has %u ts/line > MAX_TS_PER_LINE %u\n",
                            machines[i].machineName, machines[i].tsPerLine, MAX_TS_PER_LINE);
                _test_ok = false;
            }
        }
    TEST_END();

    TEST_BEGIN("MAX_TSTATES_PER_FRAME accommodates all machines");
        for (int i = 0; i < 4; i++) {
            if (machines[i].tsPerFrame > MAX_TSTATES_PER_FRAME) {
                std::printf("    FAIL: %s has %u ts/frame > MAX_TSTATES_PER_FRAME %u\n",
                            machines[i].machineName, machines[i].tsPerFrame, MAX_TSTATES_PER_FRAME);
                _test_ok = false;
            }
        }
    TEST_END();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

int main()
{
    std::printf("========================================\n");
    std::printf("  CPU & ULA Timing Test Harness\n");
    std::printf("========================================\n\n");

    // Shared constants
    std::printf("--- Display & Audio Constants ---\n");
    test_display_constants();

    // ULA contention pattern
    std::printf("\n--- ULA Contention Pattern ---\n");
    test_ula_contention_values();

    // Per-machine timing values (golden reference)
    std::printf("\n--- ZX Spectrum 48K Timing ---\n");
    test_48k_timing();

    std::printf("\n--- ZX Spectrum 128K Timing ---\n");
    test_128k_timing();

    std::printf("\n--- ZX Spectrum 128K +2 Timing ---\n");
    test_128k_plus2_timing();

    std::printf("\n--- ZX Spectrum 128K +2A Timing ---\n");
    test_128k_plus2a_timing();

    // Frame structure consistency (all machines)
    std::printf("\n--- Frame Structure Consistency ---\n");
    for (int i = 0; i < 4; i++) {
        test_frame_structure(machines[i]);
    }

    // ULA contention tables (all machines)
    std::printf("\n--- ULA Contention Tables ---\n");
    for (int i = 0; i < 4; i++) {
        test_contention_table(machines[i]);
    }

    // I/O contention patterns (all machines)
    std::printf("\n--- I/O Contention Patterns ---\n");
    for (int i = 0; i < 4; i++) {
        test_io_contention_patterns(machines[i]);
    }

    // Contention wrapping (all machines)
    std::printf("\n--- Contention Frame Wrapping ---\n");
    for (int i = 0; i < 4; i++) {
        test_contention_wrapping(machines[i]);
    }

    // Derived values
    std::printf("\n--- Derived Timing Values ---\n");
    test_fps_calculation();
    test_max_bounds();

    std::printf("\n========================================\n");
    std::printf("  Results: %d / %d passed", g_passed, g_total);
    if (g_failed > 0) {
        std::printf("  (%d FAILED)", g_failed);
    }
    std::printf("\n========================================\n");

    return (g_failed == 0) ? 0 : 1;
}
