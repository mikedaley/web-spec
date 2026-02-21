/*
 * palette.hpp - Shared ZX Spectrum color palette
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <array>
#include <cstdint>

namespace zxspec {

// ZX Spectrum color palette (RGBA - 16 colors: 8 normal + 8 bright)
constexpr std::array<uint32_t, 16> SPECTRUM_COLORS = {{
    0xFF000000,  // 0: Black
    0xFFC20000,  // 1: Blue
    0xFF0000C2,  // 2: Red
    0xFFC200C2,  // 3: Magenta
    0xFF00C200,  // 4: Green
    0xFFC2C200,  // 5: Cyan
    0xFF00C2C2,  // 6: Yellow
    0xFFC2C2C2,  // 7: White
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
