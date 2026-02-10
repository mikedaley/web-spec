/*
 * types.hpp - Shared constants and types for the ZX Spectrum emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <functional>

namespace zxspec {

// Memory size constants
constexpr size_t RAM_48K_SIZE = 48 * 1024;      // 48KB RAM
constexpr size_t RAM_128K_SIZE = 128 * 1024;    // 128KB RAM (8 x 16KB pages)
constexpr size_t ROM_48K_SIZE = 16 * 1024;      // 16KB ROM
constexpr size_t ROM_128K_SIZE = 32 * 1024;     // 32KB ROM (2 x 16KB)
constexpr size_t MEM_PAGE_SIZE = 16 * 1024;      // 16KB memory page

// Display constants
constexpr int SCREEN_WIDTH = 256;               // Display area width
constexpr int SCREEN_HEIGHT = 192;              // Display area height
constexpr int BORDER_TOP = 48;                  // Top border lines (48K)
constexpr int BORDER_BOTTOM = 56;               // Bottom border lines (48K)
constexpr int BORDER_LEFT = 48;                 // Left border pixels
constexpr int BORDER_RIGHT = 48;               // Right border pixels
constexpr int TOTAL_WIDTH = BORDER_LEFT + SCREEN_WIDTH + BORDER_RIGHT;   // 352
constexpr int TOTAL_HEIGHT = BORDER_TOP + SCREEN_HEIGHT + BORDER_BOTTOM; // 296
constexpr int FRAMEBUFFER_SIZE = TOTAL_WIDTH * TOTAL_HEIGHT * 4; // RGBA

// Timing constants (48K model)
constexpr double CPU_CLOCK_HZ = 3500000.0;     // 3.5 MHz
constexpr int TSTATES_PER_FRAME = 69888;        // T-states per frame (48K)
constexpr int SCANLINES_PER_FRAME = 312;        // Total scanlines (48K)
constexpr int TSTATES_PER_SCANLINE = 224;       // T-states per scanline (48K)
constexpr double FRAMES_PER_SECOND = 50.08;     // ~50Hz
constexpr int AUDIO_SAMPLE_RATE = 48000;
constexpr double CYCLES_PER_SAMPLE =
    CPU_CLOCK_HZ / AUDIO_SAMPLE_RATE;           // ~72.9

// Display timing constants (48K)
constexpr int TSTATES_PER_CHAR = 4;             // T-states per character cell (8 pixels)
constexpr int TS_HORIZONTAL_DISPLAY = 128;      // T-states for 256-pixel display area
constexpr int PX_VERTICAL_BLANK = 8;            // Vertical blank lines
constexpr int PX_VERT_BORDER = 56;              // Total vertical border lines (ULA)
constexpr int PX_VERTICAL_DISPLAY = 192;        // Active display lines
constexpr int PX_VERTICAL_TOTAL = 312;          // Total scanlines
constexpr int PX_EMU_BORDER_H = 48;             // Emulation horizontal border in pixels
constexpr int PX_EMU_BORDER_TOP = 48;           // Emulation top border in lines
constexpr int PX_EMU_BORDER_BOTTOM = 56;        // Emulation bottom border in lines
constexpr int BORDER_DRAWING_OFFSET = 10;       // T-state offset for border draw trigger
constexpr int PAPER_DRAWING_OFFSET = 16;        // T-state offset for paper draw trigger

// Display action types for T-state table
constexpr uint32_t DISPLAY_RETRACE = 0;
constexpr uint32_t DISPLAY_BORDER = 1;
constexpr uint32_t DISPLAY_PAPER = 2;

// Interrupt timing (48K)
constexpr int INT_LENGTH_TSTATES = 32;          // Interrupt signal duration

// ZX Spectrum color palette (RGBA - 16 colors: 8 normal + 8 bright)
constexpr std::array<uint32_t, 16> SPECTRUM_COLORS = {{
    0xFF000000,  // 0: Black
    0xFFCD0000,  // 1: Blue
    0xFF0000CD,  // 2: Red
    0xFFCD00CD,  // 3: Magenta
    0xFF00CD00,  // 4: Green
    0xFFCDCD00,  // 5: Cyan
    0xFF00CDCD,  // 6: Yellow
    0xFFCDCDCD,  // 7: White
    0xFF000000,  // 8: Black (bright)
    0xFFFF0000,  // 9: Bright Blue
    0xFF0000FF,  // 10: Bright Red
    0xFFFF00FF,  // 11: Bright Magenta
    0xFF00FF00,  // 12: Bright Green
    0xFFFFFF00,  // 13: Bright Cyan
    0xFF00FFFF,  // 14: Bright Yellow
    0xFFFFFFFF,  // 15: Bright White
}};

} // namespace zxspec
