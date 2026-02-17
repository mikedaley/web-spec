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
    paperStartLine_ = info.pxVerticalBlank + info.pxVertBorder;
    borderDrawingOffset_ = info.borderDrawingOffset;
    paperDrawingOffset_ = info.paperDrawingOffset;
    buildLineAddressTable();
    buildTsTable();
    frameReset();
}

void Display::frameReset()
{
    currentDisplayTs_ = 0;
    bufferIndex_ = 0;
}

void Display::buildLineAddressTable()
{
    for (uint32_t i = 0; i < 3; i++)
    {
        for (uint32_t j = 0; j < 8; j++)
        {
            for (uint32_t k = 0; k < 8; k++)
            {
                lineAddrTable_[(i << 6) + (j << 3) + k] =
                    static_cast<uint16_t>((i << 11) + (j << 5) + (k << 8));
            }
        }
    }
}

void Display::buildTsTable()
{
    std::memset(tstateTable_, 0, sizeof(tstateTable_));

    constexpr uint32_t tsLeftBorderEnd = PX_EMU_BORDER_H / 2;
    constexpr uint32_t tsRightBorderStart = tsLeftBorderEnd + TS_HORIZONTAL_DISPLAY;
    constexpr uint32_t tsRightBorderEnd = tsRightBorderStart + (PX_EMU_BORDER_H / 2);

    uint32_t pxLinePaperStart = paperStartLine_;
    uint32_t pxLinePaperEnd = pxLinePaperStart + SCREEN_HEIGHT;
    uint32_t pxLineBottomBorderEnd = pxLinePaperEnd + PX_EMU_BORDER_BOTTOM;
    uint32_t pxLineTopBorderVisible = pxLinePaperStart - PX_EMU_BORDER_TOP;

    for (uint32_t line = 0; line < scanlines_; line++)
    {
        for (uint32_t ts = 0; ts < tsPerScanline_; ts++)
        {
            tstateTable_[line][ts] = DISPLAY_RETRACE;

            if (line < pxVerticalBlank_)
            {
                continue;
            }

            if (line >= pxVerticalBlank_ && line < pxLinePaperStart)
            {
                if (ts >= tsRightBorderEnd || line < pxLineTopBorderVisible)
                {
                    continue;
                }
                tstateTable_[line][ts] = DISPLAY_BORDER;
            }
            else if (line >= pxLinePaperStart && line < pxLinePaperEnd)
            {
                if (ts < tsLeftBorderEnd || (ts >= tsRightBorderStart && ts < tsRightBorderEnd))
                {
                    tstateTable_[line][ts] = DISPLAY_BORDER;
                }
                else if (ts >= tsRightBorderEnd)
                {
                    continue;
                }
                else
                {
                    tstateTable_[line][ts] = DISPLAY_PAPER;
                }
            }
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

void Display::updateWithTs(int32_t tStates, const uint8_t* memory,
                           uint8_t borderColor, uint32_t frameCounter)
{
    uint32_t* pixels = reinterpret_cast<uint32_t*>(framebuffer_.data());
    const uint8_t flashMask = (frameCounter & 0x10) ? 0xff : 0x00;

    const uint32_t yAdjust = paperStartLine_;
    constexpr uint32_t tsLeftBorderEnd = PX_EMU_BORDER_H / 2;

    while (tStates > 0)
    {
        uint32_t line = currentDisplayTs_ / tsPerScanline_;
        uint32_t ts = currentDisplayTs_ % tsPerScanline_;

        if (line >= scanlines_)
        {
            break;
        }

        uint32_t action = tstateTable_[line][ts];

        switch (action)
        {
            case DISPLAY_BORDER:
            {
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
                uint32_t y = line - yAdjust;
                uint32_t x = (ts / TSTATES_PER_CHAR) - (tsLeftBorderEnd / TSTATES_PER_CHAR);

                uint16_t pixelAddr = lineAddrTable_[y] + x;
                uint16_t attrAddr = 6144 + ((y >> 3) << 5) + x;

                uint8_t pixelByte = memory[pixelAddr];
                uint8_t attrByte = memory[attrAddr];

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

                uint32_t inkRGBA = SPECTRUM_COLORS[ink + (bright ? 8 : 0)];
                uint32_t paperRGBA = SPECTRUM_COLORS[paper + (bright ? 8 : 0)];

                uint32_t idx = bufferIndex_;
                for (int bit = 7; bit >= 0; bit--)
                {
                    pixels[idx++] = (pixelByte & (1 << bit)) ? inkRGBA : paperRGBA;
                }
                bufferIndex_ += 8;
                break;
            }

            default:
                break;
        }

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

uint8_t Display::floatingBus(uint32_t cpuTs, const uint8_t* memory, int32_t floatBusAdjust) const
{
    const uint32_t displayStartLine = paperStartLine_;
    constexpr uint32_t bitmapSize = (SCREEN_WIDTH / 8) * SCREEN_HEIGHT;

    uint32_t adjustedTs = cpuTs + static_cast<uint32_t>(floatBusAdjust);
    uint32_t line = adjustedTs / tsPerScanline_;
    uint32_t ts = adjustedTs % tsPerScanline_;

    if (line >= displayStartLine
        && line < displayStartLine + SCREEN_HEIGHT
        && ts < TS_HORIZONTAL_DISPLAY)
    {
        uint32_t y = line - displayStartLine;
        uint32_t x = ts >> 2;

        switch (ts % 8)
        {
            case 3:
            case 5:
                return memory[bitmapSize + ((y >> 3) << 5) + x];

            case 2:
            case 4:
                return memory[lineAddrTable_[y] + x];

            default:
                return 0xFF;
        }
    }

    return 0xFF;
}

} // namespace zxspec
