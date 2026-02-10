/*
 * emulator.cpp - Core emulator coordinator for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "emulator.hpp"
#include "sna_loader.hpp"
#include <cstring>

#include "roms.cpp"

namespace zxspec {

Emulator::Emulator()
{
    z80_ = std::make_unique<Z80>();
}

Emulator::~Emulator() = default;

void Emulator::init()
{
    z80_->initialise(
        [this](uint16_t addr, void* param) { return memRead(addr, param); },
        [this](uint16_t addr, uint8_t data, void* param) { memWrite(addr, data, param); },
        [this](uint16_t addr, void* param) { return ioRead(addr, param); },
        [this](uint16_t addr, uint8_t data, void* param) { ioWrite(addr, data, param); },
        [this](uint16_t addr, uint32_t tstates, void* param) { memContention(addr, tstates, param); },
        this
    );

    // Load 48K ROM into first 16KB
    if (roms::ROM_48K_SIZE > 0)
    {
        std::memcpy(memory_.data(), roms::ROM_48K, roms::ROM_48K_SIZE);
    }

    audio_.setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, TSTATES_PER_FRAME);
    contention_.init();

    displayBuildLineAddressTable();
    displayBuildTsTable();

    reset();
    z80_->signalInterrupt();
}

void Emulator::reset()
{
    z80_->reset(true);
    audio_.reset();
    keyboardMatrix_.fill(0xBF);
    displayFrameReset();
    paused_ = false;
}

void Emulator::loadSNA(const uint8_t* data, uint32_t size)
{
    SNALoader::load(*this, data, size);
}

void Emulator::runCycles(int cycles)
{
    if (paused_)
        return;

    z80_->execute(static_cast<uint32_t>(cycles), INT_LENGTH_TSTATES);
}

void Emulator::runFrame()
{
    if (paused_) return;

    while (z80_->getTStates() < TSTATES_PER_FRAME)
    {
        uint32_t before = z80_->getTStates();
        z80_->execute(1, INT_LENGTH_TSTATES);
        audio_.update(static_cast<int32_t>(z80_->getTStates() - before));
    }
    audio_.frameEnd();

    z80_->resetTStates(TSTATES_PER_FRAME);
    z80_->signalInterrupt();
    displayUpdateWithTs(TSTATES_PER_FRAME - emuCurrentDisplayTs_);
    displayFrameReset();
    frameCounter_++;
}

void Emulator::displayBuildLineAddressTable()
{
    for (uint32_t i = 0; i < 3; i++)
    {
        for (uint32_t j = 0; j < 8; j++)
        {
            for (uint32_t k = 0; k < 8; k++)
            {
                displayLineAddrTable_[(i << 6) + (j << 3) + k] =
                    static_cast<uint16_t>((i << 11) + (j << 5) + (k << 8));
            }
        }
    }
}

void Emulator::displayBuildTsTable()
{
    // Horizontal timing in T-states (each T-state = 2 pixels)
    constexpr uint32_t tsLeftBorderEnd = PX_EMU_BORDER_H / 2;       // 24
    constexpr uint32_t tsRightBorderStart = tsLeftBorderEnd + TS_HORIZONTAL_DISPLAY; // 152
    constexpr uint32_t tsRightBorderEnd = tsRightBorderStart + (PX_EMU_BORDER_H / 2); // 176

    // Vertical line ranges
    constexpr uint32_t pxLineTopBorderStart = PX_VERTICAL_BLANK;    // 8
    constexpr uint32_t pxLinePaperStart = PX_VERTICAL_BLANK + PX_VERT_BORDER; // 64
    constexpr uint32_t pxLinePaperEnd = pxLinePaperStart + PX_VERTICAL_DISPLAY; // 256
    // Bottom border: show PX_EMU_BORDER_BOTTOM lines after paper
    constexpr uint32_t pxLineBottomBorderEnd = pxLinePaperEnd + PX_EMU_BORDER_BOTTOM; // 312

    // Top border: show PX_EMU_BORDER_TOP lines before paper
    constexpr uint32_t pxLineTopBorderVisible = pxLinePaperStart - PX_EMU_BORDER_TOP; // 16

    for (uint32_t line = 0; line < PX_VERTICAL_TOTAL; line++)
    {
        for (uint32_t ts = 0; ts < TSTATES_PER_SCANLINE; ts++)
        {
            // Default to retrace
            displayTstateTable_[line][ts] = DISPLAY_RETRACE;

            // Vertical blank - always retrace
            if (line < PX_VERTICAL_BLANK)
            {
                continue;
            }

            // Top border region
            if (line >= pxLineTopBorderStart && line < pxLinePaperStart)
            {
                if (ts >= tsRightBorderEnd || line < pxLineTopBorderVisible)
                {
                    // H-retrace or above visible top border
                    continue;
                }
                displayTstateTable_[line][ts] = DISPLAY_BORDER;
            }
            // Paper region (with left/right borders)
            else if (line >= pxLinePaperStart && line < pxLinePaperEnd)
            {
                if (ts < tsLeftBorderEnd || (ts >= tsRightBorderStart && ts < tsRightBorderEnd))
                {
                    displayTstateTable_[line][ts] = DISPLAY_BORDER;
                }
                else if (ts >= tsRightBorderEnd)
                {
                    // H-retrace
                    continue;
                }
                else
                {
                    displayTstateTable_[line][ts] = DISPLAY_PAPER;
                }
            }
            // Bottom border region
            else if (line >= pxLinePaperEnd && line < pxLineBottomBorderEnd)
            {
                if (ts >= tsRightBorderEnd)
                {
                    continue;
                }
                displayTstateTable_[line][ts] = DISPLAY_BORDER;
            }
        }
    }
}

void Emulator::displayUpdateWithTs(int32_t tStates)
{
    uint32_t* pixels = reinterpret_cast<uint32_t*>(framebuffer_.data());
    const uint8_t flashMask = (frameCounter_ & 0x10) ? 0xff : 0x00;

    // yAdjust: number of lines before paper starts
    constexpr uint32_t yAdjust = PX_VERTICAL_BLANK + PX_VERT_BORDER;
    // Horizontal T-state offset where paper begins
    constexpr uint32_t tsLeftBorderEnd = PX_EMU_BORDER_H / 2;

    while (tStates > 0)
    {
        uint32_t line = emuCurrentDisplayTs_ / TSTATES_PER_SCANLINE;
        uint32_t ts = emuCurrentDisplayTs_ % TSTATES_PER_SCANLINE;

        // Bounds check
        if (line >= PX_VERTICAL_TOTAL)
        {
            break;
        }

        uint32_t action = displayTstateTable_[line][ts];

        switch (action)
        {
            case DISPLAY_BORDER:
            {
                uint32_t color = SPECTRUM_COLORS[borderColor_];
                uint32_t idx = displayBufferIndex_;
                pixels[idx]     = color;
                pixels[idx + 1] = color;
                pixels[idx + 2] = color;
                pixels[idx + 3] = color;
                pixels[idx + 4] = color;
                pixels[idx + 5] = color;
                pixels[idx + 6] = color;
                pixels[idx + 7] = color;
                displayBufferIndex_ += 8;
                break;
            }

            case DISPLAY_PAPER:
            {
                uint32_t y = line - yAdjust;
                uint32_t x = (ts / TSTATES_PER_CHAR) - (tsLeftBorderEnd / TSTATES_PER_CHAR);

                uint16_t pixelAddr = displayLineAddrTable_[y] + x;
                uint16_t attrAddr = 6144 + ((y >> 3) << 5) + x;

                uint8_t pixelByte = memory_[0x4000 + pixelAddr];
                uint8_t attrByte = memory_[0x4000 + attrAddr];

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

                uint32_t idx = displayBufferIndex_;
                for (int bit = 7; bit >= 0; bit--)
                {
                    pixels[idx++] = (pixelByte & (1 << bit)) ? inkRGBA : paperRGBA;
                }
                displayBufferIndex_ += 8;
                break;
            }

            default:
                // Retrace - no pixel output
                break;
        }

        emuCurrentDisplayTs_ += TSTATES_PER_CHAR;
        tStates -= TSTATES_PER_CHAR;
    }
}

void Emulator::displayFrameReset()
{
    emuCurrentDisplayTs_ = 0;
    displayBufferIndex_ = 0;
}

const uint8_t* Emulator::getFramebuffer() const
{
    return framebuffer_.data();
}

int Emulator::getFramebufferSize() const
{
    return FRAMEBUFFER_SIZE;
}

const float* Emulator::getAudioBuffer() const
{
    return audio_.getBuffer();
}

int Emulator::getAudioSampleCount() const
{
    return audio_.getSampleCount();
}

void Emulator::resetAudioBuffer()
{
    audio_.resetBuffer();
}

void Emulator::keyDown(int row, int bit)
{
    if (row >= 0 && row < 8 && bit >= 0 && bit < 5)
    {
        keyboardMatrix_[row] &= ~(1 << bit);
    }
}

void Emulator::keyUp(int row, int bit)
{
    if (row >= 0 && row < 8 && bit >= 0 && bit < 5)
    {
        keyboardMatrix_[row] |= (1 << bit);
    }
}

uint8_t Emulator::getKeyboardRow(int row) const
{
    if (row >= 0 && row < 8) return keyboardMatrix_[row];
    return 0xBF;
}

void Emulator::stepInstruction()
{
    z80_->execute(1, INT_LENGTH_TSTATES);
}

uint8_t Emulator::readMemory(uint16_t address) const
{
    return memory_[address];
}

void Emulator::writeMemory(uint16_t address, uint8_t data)
{
    if (address >= ROM_48K_SIZE)
    {
        memory_[address] = data;
    }
}

uint8_t Emulator::memRead(uint16_t address, void* /*param*/)
{
    return memory_[address];
}

void Emulator::memWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    if (address >= ROM_48K_SIZE)
    {
        if (address < 0x5B00)
        {
            displayUpdateWithTs(static_cast<int32_t>((z80_->getTStates() - emuCurrentDisplayTs_) + PAPER_DRAWING_OFFSET));
        }
        memory_[address] = data;
    }
}

uint8_t Emulator::ioRead(uint16_t address, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address);

    if ((address & 0x01) == 0)
    {
        uint8_t result = 0xBF;
        for (int i = 0; i < 8; i++)
        {
            if (!(address & (0x100 << i)))
            {
                result &= keyboardMatrix_[i];
            }
        }
        return result;
    }
    return 0xFF;
}

void Emulator::ioWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address);

    if ((address & 0x01) == 0)
    {
        displayUpdateWithTs(static_cast<int32_t>((z80_->getTStates() - emuCurrentDisplayTs_) + BORDER_DRAWING_OFFSET));
        borderColor_ = data & 0x07;
        audio_.setEarBit((data >> 4) & 1);
    }
}

void Emulator::memContention(uint16_t address, uint32_t /*tstates*/, void* /*param*/)
{
    // 48K contended memory range: 0x4000-0x7FFF
    if (address >= 0x4000 && address <= 0x7FFF)
    {
        z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
    }
}

} // namespace zxspec
