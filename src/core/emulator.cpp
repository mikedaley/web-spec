/*
 * emulator.cpp - Core emulator coordinator for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "emulator.hpp"
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

    reset();
    z80_->signalInterrupt();
}

void Emulator::reset()
{
    z80_->reset(true);
    audio_.reset();
    keyboardMatrix_.fill(0xBF);
    paused_ = false;
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

    z80_->resetTStates();
    z80_->signalInterrupt();
    renderFrame();
    frameCounter_++;
}

void Emulator::renderFrame()
{
    uint32_t* pixels = reinterpret_cast<uint32_t*>(framebuffer_.data());
    const uint32_t borderRGBA = SPECTRUM_COLORS[borderColor_];

    // Fill entire framebuffer with border color
    for (int i = 0; i < TOTAL_WIDTH * TOTAL_HEIGHT; i++)
    {
        pixels[i] = borderRGBA;
    }

    bool flashInvert = (frameCounter_ & 0x10) != 0;

    // Render 256x192 screen area
    for (int y = 0; y < SCREEN_HEIGHT; y++)
    {
        for (int x = 0; x < SCREEN_WIDTH; x += 8)
        {
            // ZX Spectrum bitmap address calculation
            uint16_t bitmapAddr = 0x4000
                | ((y & 0xC0) << 5)
                | ((y & 0x07) << 8)
                | ((y & 0x38) << 2)
                | (x >> 3);

            // Attribute address
            uint16_t attrAddr = 0x5800 + ((y >> 3) * 32) + (x >> 3);

            uint8_t bitmap = memory_[bitmapAddr];
            uint8_t attr = memory_[attrAddr];

            bool flash = (attr & 0x80) != 0;
            bool bright = (attr & 0x40) != 0;
            uint8_t paper = (attr >> 3) & 0x07;
            uint8_t ink = attr & 0x07;

            if (flash && flashInvert)
            {
                uint8_t tmp = ink;
                ink = paper;
                paper = tmp;
            }

            uint32_t inkRGBA = SPECTRUM_COLORS[ink + (bright ? 8 : 0)];
            uint32_t paperRGBA = SPECTRUM_COLORS[paper + (bright ? 8 : 0)];

            int screenY = BORDER_TOP + y;
            int screenX = BORDER_LEFT + x;

            for (int bit = 7; bit >= 0; bit--)
            {
                int px = screenX + (7 - bit);
                pixels[screenY * TOTAL_WIDTH + px] = (bitmap & (1 << bit)) ? inkRGBA : paperRGBA;
            }
        }
    }
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
        memory_[address] = data;
    }
}

uint8_t Emulator::ioRead(uint16_t address, void* /*param*/)
{
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
    if ((address & 0x01) == 0)
    {
        borderColor_ = data & 0x07;
        audio_.setEarBit((data >> 4) & 1);
    }
}

void Emulator::memContention(uint16_t /*address*/, uint32_t /*tstates*/, void* /*param*/)
{
}

} // namespace zxspec
