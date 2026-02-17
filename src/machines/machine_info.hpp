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
    uint32_t    intLength;
    uint32_t    tsPerFrame;
    uint32_t    tsToOrigin;
    uint32_t    tsPerLine;
    uint32_t    tsTopBorder;
    uint32_t    tsVerticalBlank;
    uint32_t    tsVerticalDisplay;
    uint32_t    tsHorizontalDisplay;
    uint32_t    tsPerChar;
    uint32_t    pxVertBorder;
    uint32_t    pxVerticalBlank;
    uint32_t    pxHorizontalDisplay;
    uint32_t    pxVerticalDisplay;
    uint32_t    pxHorizontalTotal;
    uint32_t    pxVerticalTotal;
    uint32_t    pxEmuBorder;
    bool        hasAY;
    bool        hasPaging;
    uint32_t    borderDrawingOffset;
    uint32_t    paperDrawingOffset;
    uint32_t    romSize;
    uint32_t    ramSize;
    int32_t     floatBusAdjust;
    bool        altContention;
    const char* machineName;
    uint32_t    machineType;
};

//                                int  tsPF   tsOr  tsLn  tsTB   tsVB  tsVD   tsHD  tsC pVB pVBl pHD  pVD  pHT  pVT  pEB  AY     Pg     bDO pDO romSz   ramSz    fbA  altC  name                        type
static const MachineInfo machines[] = {
    { 32, 69888, 14335, 224, 12544, 1792, 43008, 128, 4, 56, 8, 256, 192, 448, 312, 32, false, false, 10, 16, 16384,  65536, -1, false, "ZX Spectrum 48K",      eZXSpectrum48 },
    { 36, 70908, 14361, 228, 12768, 1596, 43776, 128, 4, 56, 7, 256, 192, 448, 311, 32,  true,  true, 12, 16, 32768, 131072,  1, false, "ZX Spectrum 128K",     eZXSpectrum128 },
    { 36, 70908, 14361, 228, 12768, 1596, 43776, 128, 4, 56, 7, 256, 192, 448, 311, 32,  true,  true, 12, 16, 32768, 131072,  1, false, "ZX Spectrum 128K +2",  eZXSpectrum128_2 },
    { 32, 70908, 14364, 228, 12768, 1596, 43776, 128, 4, 56, 7, 256, 192, 448, 311, 32,  true,  true, 12, 16, 65536, 131072,  1,  true, "ZX Spectrum 128K +2A", eZXSpectrum128_2A },
};

// Maximum sizes for shared arrays (accommodate all machine variants)
constexpr uint32_t MAX_SCANLINES        = 312;
constexpr uint32_t MAX_TS_PER_LINE      = 228;
constexpr uint32_t MAX_TSTATES_PER_FRAME = 71000;

// Display constants (same for all machines)
constexpr uint32_t SCREEN_WIDTH         = 256;
constexpr uint32_t SCREEN_HEIGHT        = 192;
constexpr uint32_t BORDER_TOP           = 32;
constexpr uint32_t BORDER_BOTTOM        = 32;
constexpr uint32_t BORDER_LEFT          = 32;
constexpr uint32_t BORDER_RIGHT         = 32;
constexpr uint32_t TOTAL_WIDTH          = BORDER_LEFT + SCREEN_WIDTH + BORDER_RIGHT;   // 320
constexpr uint32_t TOTAL_HEIGHT         = BORDER_TOP + SCREEN_HEIGHT + BORDER_BOTTOM;  // 256
constexpr uint32_t FRAMEBUFFER_SIZE     = TOTAL_WIDTH * TOTAL_HEIGHT * 4;

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
constexpr uint32_t TS_HORIZONTAL_DISPLAY = 128;
constexpr uint32_t TSTATES_PER_CHAR     = 4;
constexpr uint32_t PX_EMU_BORDER_H      = 32;
constexpr uint32_t PX_EMU_BORDER_TOP    = 32;
constexpr uint32_t PX_EMU_BORDER_BOTTOM = 32;

// ULA contention delay values indexed by (tstate % 8)
constexpr uint32_t ULA_CONTENTION_VALUES[] = { 6, 5, 4, 3, 2, 1, 0, 0 };

} // namespace zxspec
