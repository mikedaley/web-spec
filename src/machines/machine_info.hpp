/*
 * machine_info.hpp - Machine type definitions and shared constants
 *
 * Modelled on SpectREMCPP's MachineInfo.h - parameterizes machine variants
 * so timing, memory sizes, and feature flags are data rather than code.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

enum MachineType {
    eZXSpectrum48     = 0,
    eZXSpectrum128    = 1,
    eZXSpectrum128_2  = 2,
    eZXSpectrum128_2A = 3,
};

struct MachineInfo {
    // --- Interrupt timing ---
    uint32_t    intLength;              // Duration of the maskable interrupt signal in T-states (32 or 36)

    // --- Frame timing ---
    uint32_t    tsPerFrame;             // Total T-states per video frame (69888 for 48K, 70908 for 128K)
    uint32_t    ulaTsToDisplay;         // T-state at which the ULA begins fetching the first byte of screen data
                                        // (top-left pixel of the 256x192 paper area). All contention and
                                        // display timing is relative to this value.
    uint32_t    tsPerLine;              // T-states per scanline (224 for 48K, 228 for 128K)
    uint32_t    tsTopBorder;            // Total T-states consumed by the top border region
    uint32_t    tsVerticalBlank;        // Total T-states consumed by the vertical blanking interval
    uint32_t    tsVerticalDisplay;      // Total T-states consumed by the 192-line paper area
    uint32_t    tsHorizontalDisplay;    // T-states per scanline spent on the 256-pixel paper area (always 128)
    uint32_t    tsPerChar;              // T-states per 8-pixel character cell (always 4: 2 pixels per T-state)

    // --- Display geometry (in pixels / scanlines) ---
    uint32_t    pxVertBorder;           // Vertical border height in scanlines (top and bottom, typically 56)
    uint32_t    pxVerticalBlank;        // Number of scanlines in the vertical blank period (8 for 48K, 7 for 128K)
    uint32_t    pxHorizontalDisplay;    // Paper width in pixels (always 256)
    uint32_t    pxVerticalDisplay;      // Paper height in pixels (always 192)
    uint32_t    pxHorizontalTotal;      // Total scanline width including retrace (448 pixels)
    uint32_t    pxVerticalTotal;        // Total scanlines per frame including blanking (312 for 48K, 311 for 128K)
    uint32_t    pxEmuBorder;            // Border width/height the emulator renders (32 pixels each side)

    // --- Feature flags ---
    bool        hasAY;                  // True if the machine has an AY-3-8912 sound chip
    bool        hasPaging;              // True if the machine supports 128K memory paging

    // --- Drawing offsets ---
    // These fine-tune when the display engine starts rendering relative to the current
    // CPU T-state, compensating for the pipeline delay between a CPU write and its
    // effect appearing on screen.
    uint32_t    borderDrawingOffset;    // T-state offset applied when rendering border changes
    uint32_t    paperDrawingOffset;     // T-state offset applied when rendering screen memory writes

    // --- Memory sizes ---
    uint32_t    romSize;                // Total ROM size in bytes (16K for 48K, 32K for 128K, 64K for +2A)
    uint32_t    ramSize;                // Total RAM size in bytes (64K for 48K, 128K for 128K models)

    // --- Contention model ---
    bool        altContention;          // True for +2A/+3 which use a different contention pattern
    const char* machineName;            // Human-readable machine name
    uint32_t    machineType;            // MachineType enum value
};

// Machine timing parameters for each ZX Spectrum variant.
//
// How the key timing values relate to each other (48K example):
//
//   Frame structure (312 scanlines × 224 T-states/line = 69,888 T-states/frame):
//
//     Scanlines 0-7     : Vertical blank (8 lines × 224 = 1,792 T-states)
//     Scanlines 8-63    : Top border     (56 lines × 224 = 12,544 T-states)
//     Scanlines 64-255  : Paper area     (192 lines × 224 = 43,008 T-states)
//     Scanlines 256-311 : Bottom border  (56 lines × 224 = 12,544 T-states)
//
//   ulaTsToDisplay = 14,336 = (pxVerticalBlank + pxVertBorder) × tsPerLine
//     This is the T-state when the ULA begins fetching the first byte of screen
//     bitmap data (top-left pixel). Contention timing and display rendering are
//     both anchored to this value.
//
//   Each scanline during the paper area:
//     128 T-states : 256 pixels of paper (2 pixels per T-state)
//      96 T-states : horizontal border + retrace
//
// The 128K machines have slightly different timing (228 T-states/line, 70,908/frame)
// because the 128K ULA generates an extra 4 T-states per scanline for memory paging.
//
//    int tsPF   ulaTD  tsLn tsTB   tsVB  tsVD   tsHD tsC pVB pVBl pHD  pVD  pHT  pVT  pEB  AY     Pg     bDO pDO romSz   ramSz  altC  name                        type
static const MachineInfo machines[] = {
    { 32, 69888, 14335, 224, 12544, 1792, 43008, 128, 4, 56, 8, 256, 192, 448, 312, 32,  true, true, 18, 24, 16384,  65536, false, "ZX Spectrum 48K",      eZXSpectrum48 },
    { 36, 70908, 14362, 228, 12768, 1596, 43776, 128, 4, 56, 7, 256, 192, 448, 311, 32,  true,  true, 20, 24, 32768, 131072, false, "ZX Spectrum 128K",     eZXSpectrum128 },
    { 36, 70908, 14362, 228, 12768, 1596, 43776, 128, 4, 56, 7, 256, 192, 448, 311, 32,  true,  true, 20, 24, 32768, 131072, false, "ZX Spectrum 128K +2",  eZXSpectrum128_2 },
    { 32, 70908, 14365, 228, 12768, 1596, 43776, 128, 4, 56, 7, 256, 192, 448, 311, 32,  true,  true, 20, 24, 65536, 131072,  true, "ZX Spectrum 128K +2A", eZXSpectrum128_2A },
};

// Maximum sizes for shared arrays (accommodate all machine variants)
constexpr uint32_t MAX_SCANLINES        = 312;
constexpr uint32_t MAX_TS_PER_LINE      = 228;
constexpr uint32_t MAX_TSTATES_PER_FRAME = 71000;

// Display constants (same for all machines)
constexpr uint32_t SCREEN_WIDTH         = 256;
constexpr uint32_t SCREEN_HEIGHT        = 192;
constexpr uint32_t BORDER_TOP           = 48;
constexpr uint32_t BORDER_BOTTOM        = 48;
constexpr uint32_t BORDER_LEFT          = 48;
constexpr uint32_t BORDER_RIGHT         = 48;
constexpr uint32_t TOTAL_WIDTH          = BORDER_LEFT + SCREEN_WIDTH + BORDER_RIGHT;   // 352
constexpr uint32_t TOTAL_HEIGHT         = BORDER_TOP + SCREEN_HEIGHT + BORDER_BOTTOM;  // 288
constexpr uint32_t FRAMEBUFFER_SIZE     = TOTAL_WIDTH * TOTAL_HEIGHT * 4;
constexpr uint32_t SIGNAL_BUFFER_SIZE   = TOTAL_WIDTH * TOTAL_HEIGHT;    // PAL composite signal (1 byte per pixel)

// Audio constants
constexpr uint32_t AUDIO_SAMPLE_RATE    = 48000;
constexpr double   CPU_CLOCK_HZ         = 3500000.0;

// Memory
constexpr uint32_t MEM_PAGE_SIZE        = 16384;

// Display action types for T-state table
constexpr uint32_t DISPLAY_RETRACE      = 0;
constexpr uint32_t DISPLAY_BORDER       = 1;
constexpr uint32_t DISPLAY_PAPER        = 2;

// Display timing (same for all machines)
constexpr uint32_t TS_HORIZONTAL_DISPLAY = 128;    // T-states for the 256-pixel paper width (2 pixels per T-state)
constexpr uint32_t TSTATES_PER_CHAR     = 4;       // T-states per 8-pixel character cell (the ULA fetches 1 bitmap
                                                    // byte + 1 attribute byte every 4 T-states)
constexpr uint32_t PX_EMU_BORDER_H      = 48;      // Emulated horizontal border width (pixels, each side)
constexpr uint32_t PX_EMU_BORDER_TOP    = 48;       // Emulated top border height (scanlines)
constexpr uint32_t PX_EMU_BORDER_BOTTOM = 48;       // Emulated bottom border height (scanlines)

// ULA contention delay values indexed by (tstate % 8).
//
// The ULA fetches screen data in an 8-T-state cycle: it reads the bitmap byte,
// the attribute byte, then idles for the remaining T-states. When the CPU tries
// to access contended memory during this cycle, the ULA forces it to wait until
// the current fetch cycle completes. The delay depends on where in the 8-T-state
// cycle the access falls:
//
//   Cycle position:  0   1   2   3   4   5   6   7
//   Delay added:     6   5   4   3   2   1   0   0
//
// At positions 6 and 7, the ULA is idle so no delay is needed.
constexpr uint32_t ULA_CONTENTION_VALUES[] = { 6, 5, 4, 3, 2, 1, 0, 0 };

} // namespace zxspec
