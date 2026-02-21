/*
 * display.cpp - ULA display generation (shared across all machine variants)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "display.hpp"
#include "../core/palette.hpp"
#include <cstring>

namespace zxspec {

void Display::init(const MachineInfo& info)
{
    scanlines_ = info.pxVerticalTotal;
    tsPerScanline_ = info.tsPerLine;
    pxVerticalBlank_ = info.pxVerticalBlank;

    // The paper area starts after the vertical blank and top border
    paperStartLine_ = info.pxVerticalBlank + info.pxVertBorder;

    borderDrawingOffset_ = info.borderDrawingOffset;
    paperDrawingOffset_ = info.paperDrawingOffset;
    ulaTsToDisplay_ = info.ulaTsToDisplay;
    tsPerFrame_ = info.tsPerFrame;
    buildLineAddressTable();
    buildTsTable();
    frameReset();
}

void Display::frameReset()
{
    currentDisplayTs_ = 0;
    bufferIndex_ = 0;
}

// Build a lookup table mapping each screen line (0-191) to its byte offset
// within the 6144-byte bitmap area of screen memory.
//
// The ZX Spectrum's screen memory is NOT laid out linearly. Instead it is
// organised in three 2K "thirds" (lines 0-63, 64-127, 128-191), and within
// each third the lines are interleaved in groups of 8. The layout is:
//
//   Line number = (third × 64) + (cell_row × 8) + (pixel_row)
//     where: third     = 0..2  (which 2K block)
//            cell_row  = 0..7  (which character row within the third)
//            pixel_row = 0..7  (which pixel row within the character cell)
//
//   Byte offset = (third × 2048) + (cell_row × 32) + (pixel_row × 256)
//
// So consecutive screen lines in memory are 256 bytes apart (one pixel row of
// the next character cell), not 32 bytes apart as you might expect. This odd
// layout is an artefact of the ULA's simple address counter design.
void Display::buildLineAddressTable()
{
    for (uint32_t i = 0; i < 3; i++)             // third (0-2)
    {
        for (uint32_t j = 0; j < 8; j++)         // cell_row within third (0-7)
        {
            for (uint32_t k = 0; k < 8; k++)     // pixel_row within cell (0-7)
            {
                // Line index: third*64 + cell_row*8 + pixel_row
                // Byte offset: third*2048 + cell_row*32 + pixel_row*256
                lineAddrTable_[(i << 6) + (j << 3) + k] =
                    static_cast<uint16_t>((i << 11) + (j << 5) + (k << 8));
            }
        }
    }
}

// Build the per-T-state action table for the entire frame.
//
// For every (scanline, T-state) position we pre-calculate whether the ULA is:
//   - DISPLAY_RETRACE : in vertical or horizontal blanking (no visible output)
//   - DISPLAY_BORDER  : drawing the border area around the screen
//   - DISPLAY_PAPER   : drawing the 256×192 pixel display from screen memory
//
// The frame is divided into vertical regions:
//
//   [0 .. pxVerticalBlank)                          : vertical blank (no output)
//   [pxVerticalBlank .. paperStartLine)             : top border
//   [paperStartLine .. paperStartLine+192)          : paper area (screen data)
//   [paperStartLine+192 .. paperStartLine+192+32)   : bottom border
//   [beyond bottom border .. scanlines)             : retrace / unused
//
// Within each scanline, the horizontal regions (in T-states) are:
//
//   [0 .. tsLeftBorderEnd)                           : left border (16 T-states = 32 pixels)
//   [tsLeftBorderEnd .. tsRightBorderStart)          : paper (128 T-states = 256 pixels)
//   [tsRightBorderStart .. tsRightBorderEnd)         : right border (16 T-states = 32 pixels)
//   [tsRightBorderEnd .. tsPerScanline)              : horizontal retrace (no output)
//
// Note: each T-state position in this table represents 4 actual T-states
// (one character cell = 8 pixels), since updateWithTs advances by TSTATES_PER_CHAR.
void Display::buildTsTable()
{
    std::memset(tstateTable_, 0, sizeof(tstateTable_));

    // Horizontal boundaries in T-state units (each unit = 4 T-states = 8 pixels)
    constexpr uint32_t tsLeftBorderEnd = PX_EMU_BORDER_H / 2;                         // 16
    constexpr uint32_t tsRightBorderStart = tsLeftBorderEnd + TS_HORIZONTAL_DISPLAY;   // 144
    constexpr uint32_t tsRightBorderEnd = tsRightBorderStart + (PX_EMU_BORDER_H / 2);  // 160

    // Vertical boundaries in scanlines
    uint32_t pxLinePaperStart = paperStartLine_;
    uint32_t pxLinePaperEnd = pxLinePaperStart + SCREEN_HEIGHT;
    uint32_t pxLineBottomBorderEnd = pxLinePaperEnd + PX_EMU_BORDER_BOTTOM;
    uint32_t pxLineTopBorderVisible = pxLinePaperStart - PX_EMU_BORDER_TOP;

    for (uint32_t line = 0; line < scanlines_; line++)
    {
        for (uint32_t ts = 0; ts < tsPerScanline_; ts++)
        {
            tstateTable_[line][ts] = DISPLAY_RETRACE;

            // Vertical blank — no visible output
            if (line < pxVerticalBlank_)
            {
                continue;
            }

            // Top border region (between vblank and paper)
            if (line >= pxVerticalBlank_ && line < pxLinePaperStart)
            {
                // Only draw the visible portion of the top border (last 32 lines)
                // and only within the horizontal visible area
                if (ts >= tsRightBorderEnd || line < pxLineTopBorderVisible)
                {
                    continue;
                }
                tstateTable_[line][ts] = DISPLAY_BORDER;
            }
            // Paper region (192 visible scanlines)
            else if (line >= pxLinePaperStart && line < pxLinePaperEnd)
            {
                if (ts < tsLeftBorderEnd || (ts >= tsRightBorderStart && ts < tsRightBorderEnd))
                {
                    // Left or right border alongside the paper area
                    tstateTable_[line][ts] = DISPLAY_BORDER;
                }
                else if (ts >= tsRightBorderEnd)
                {
                    // Horizontal retrace — no output
                    continue;
                }
                else
                {
                    // Active paper area — draw from screen memory
                    tstateTable_[line][ts] = DISPLAY_PAPER;
                }
            }
            // Bottom border region
            else if (line >= pxLinePaperEnd && line < pxLineBottomBorderEnd)
            {
                if (ts >= tsRightBorderEnd)
                {
                    continue;
                }
                tstateTable_[line][ts] = DISPLAY_BORDER;
            }
        }
    }
}

// Render pixels for the given number of T-states, advancing the display position.
//
// This is the core rendering loop, called after each CPU instruction to keep the
// framebuffer in sync with the ULA's beam position. Each iteration handles one
// character cell (4 T-states = 8 pixels):
//
//   DISPLAY_RETRACE — the beam is in blanking; skip, no pixels written.
//   DISPLAY_BORDER  — write 8 pixels of the current border colour.
//   DISPLAY_PAPER   — fetch a bitmap byte and attribute byte from screen memory,
//                     decode ink/paper/bright/flash, and write 8 coloured pixels.
//
// The `memory` pointer must point to the screen RAM bank (the 16K at 0x4000),
// i.e. offset 0 in this array corresponds to address 0x4000.
void Display::updateWithTs(int32_t tStates, const uint8_t* memory,
                           uint8_t borderColor, uint32_t frameCounter)
{
    uint32_t* pixels = reinterpret_cast<uint32_t*>(framebuffer_.data());

    // Flash toggles every 16 frames (bit 4 of the frame counter). When active,
    // ink and paper colours are swapped for any character cell with the FLASH
    // attribute bit set.
    const uint8_t flashMask = (frameCounter & 0x10) ? 0xff : 0x00;

    const uint32_t yAdjust = paperStartLine_;
    constexpr uint32_t tsLeftBorderEnd = PX_EMU_BORDER_H / 2;

    while (tStates > 0)
    {
        // Convert the current display T-state into a scanline and horizontal position
        uint32_t line = currentDisplayTs_ / tsPerScanline_;
        uint32_t ts = currentDisplayTs_ % tsPerScanline_;

        if (line >= scanlines_)
        {
            break;
        }

        // Look up the pre-calculated action for this beam position
        uint32_t action = tstateTable_[line][ts];

        switch (action)
        {
            case DISPLAY_BORDER:
            {
                // Write 8 pixels of solid border colour
                uint32_t color = SPECTRUM_COLORS[borderColor];
                uint32_t idx = bufferIndex_;
                pixels[idx]     = color;
                pixels[idx + 1] = color;
                pixels[idx + 2] = color;
                pixels[idx + 3] = color;
                pixels[idx + 4] = color;
                pixels[idx + 5] = color;
                pixels[idx + 6] = color;
                pixels[idx + 7] = color;
                bufferIndex_ += 8;
                break;
            }

            case DISPLAY_PAPER:
            {
                // Calculate which character cell we're rendering:
                //   y = pixel row within the paper area (0-191)
                //   x = character column (0-31)
                uint32_t y = line - yAdjust;
                uint32_t x = (ts / TSTATES_PER_CHAR) - (tsLeftBorderEnd / TSTATES_PER_CHAR);

                // Fetch the bitmap byte using the interleaved screen address table
                // and the attribute byte from the 768-byte attribute area (at offset 6144)
                uint16_t pixelAddr = lineAddrTable_[y] + x;
                uint16_t attrAddr = 6144 + ((y >> 3) << 5) + x;  // 6144 + (char_row * 32) + x

                uint8_t pixelByte = memory[pixelAddr];
                uint8_t attrByte = memory[attrAddr];

                // Decode the attribute byte:
                //   Bit 7: FLASH (swap ink/paper every 16 frames)
                //   Bit 6: BRIGHT (use bright colour variants)
                //   Bits 5-3: PAPER colour (0-7)
                //   Bits 2-0: INK colour (0-7)
                bool flash = (attrByte & 0x80) != 0;
                bool bright = (attrByte & 0x40) != 0;
                uint8_t ink = attrByte & 0x07;
                uint8_t paper = (attrByte >> 3) & 0x07;

                if (flash && flashMask)
                {
                    uint8_t tmp = ink;
                    ink = paper;
                    paper = tmp;
                }

                // Look up RGBA colours (bright variants are at indices 8-15)
                uint32_t inkRGBA = SPECTRUM_COLORS[ink + (bright ? 8 : 0)];
                uint32_t paperRGBA = SPECTRUM_COLORS[paper + (bright ? 8 : 0)];

                // Render 8 pixels from the bitmap byte, MSB first (left to right)
                uint32_t idx = bufferIndex_;
                for (int bit = 7; bit >= 0; bit--)
                {
                    pixels[idx++] = (pixelByte & (1 << bit)) ? inkRGBA : paperRGBA;
                }
                bufferIndex_ += 8;
                break;
            }

            default:
                // DISPLAY_RETRACE — beam is in blanking, no pixels to output
                break;
        }

        // Advance by one character cell (4 T-states = 8 pixels)
        currentDisplayTs_ += TSTATES_PER_CHAR;
        tStates -= TSTATES_PER_CHAR;
    }
}

const uint8_t* Display::getFramebuffer() const
{
    return framebuffer_.data();
}

int Display::getFramebufferSize() const
{
    return FRAMEBUFFER_SIZE;
}

// Return the "floating bus" value — the byte that would appear on the data bus
// when reading from a port not actively driven by any device.
//
// On real hardware, the data bus retains whatever value was last driven onto it.
// During the paper area, the ULA is continuously fetching screen data, so a read
// from an unattached port returns whatever the ULA last read. Programs exploit
// this to synchronise with the display beam without needing interrupts.
//
// The ULA's 8-T-state fetch cycle reads screen data in this pattern:
//
//   T-state offset within the 8-cycle:
//     0: Bitmap fetch begins
//     1: Bitmap data latched
//     2: Bitmap byte on bus  ← floating bus returns bitmap byte
//     3: Attribute fetch     ← floating bus returns attribute byte
//     4: Bitmap byte on bus  ← floating bus returns bitmap byte
//     5: Attribute byte      ← floating bus returns attribute byte
//     6: Idle (0xFF)
//     7: Idle (0xFF)
//
// Outside the paper area or during blanking, the bus is idle (returns 0xFF).
uint8_t Display::floatingBus(uint32_t cpuTs, const uint8_t* memory) const
{
    // Size of the bitmap area: 256/8 * 192 = 6144 bytes
    constexpr uint32_t bitmapSize = (SCREEN_WIDTH / 8) * SCREEN_HEIGHT;

    cpuTs %= tsPerFrame_;

    // The CPU reads the floating bus value 1 T-state before the ULA latches it,
    // so we offset by -1 (matching the original floatBusAdjust = -1 for 48K).
    if (cpuTs == 0)
        return 0xFF;
    uint32_t adjustedTs = cpuTs - 2;

    // Before the ULA starts fetching screen data, the bus is idle
    if (adjustedTs < ulaTsToDisplay_)
        return 0xFF;

    // Convert to scanline and horizontal position relative to screen start
    uint32_t elapsed = adjustedTs - ulaTsToDisplay_;
    uint32_t line = elapsed / tsPerScanline_;
    uint32_t ts = elapsed % tsPerScanline_;

    // Only return screen data during the paper area (192 lines × 128 T-states)
    if (line < SCREEN_HEIGHT && ts < TS_HORIZONTAL_DISPLAY)
    {
        uint32_t x = ts >> 2;  // Character column (0-31)

        switch (ts % 8)
        {
            case 3:
            case 5:
                // Attribute byte: base offset 6144 + (char_row * 32) + column
                return memory[bitmapSize + ((line >> 3) << 5) + x];

            case 2:
            case 4:
                // Bitmap byte: use the interleaved address table + column
                return memory[lineAddrTable_[line] + x];

            default:
                // ULA is idle during these phases
                return 0xFF;
        }
    }

    return 0xFF;
}

} // namespace zxspec
