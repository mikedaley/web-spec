/*
 * zx81.cpp - ZX81 machine emulation
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx81.hpp"
#include <cstring>
#include <cstdio>

#include "roms.cpp"

namespace zxspec::zx81 {

// ============================================================================
// Constructor / Destructor
// ============================================================================

ZX81::ZX81() = default;
ZX81::~ZX81() = default;

// ============================================================================
// Initialization
// ============================================================================

void ZX81::init()
{
    machineInfo_ = machines[eZX81];
    baseInit();

    // Re-setup audio with correct ZX81 clock (3.25 MHz, not 3.5 MHz)
    double fps = ZX81_CPU_CLOCK_HZ / static_cast<double>(machineInfo_.tsPerFrame);
    audio_.setup(AUDIO_SAMPLE_RATE, fps, machineInfo_.tsPerFrame);

    // Load 8KB ROM
    if (roms::ROM_ZX81_SIZE > 0 && roms::ROM_ZX81_SIZE <= memoryRom_.size())
    {
        std::memcpy(memoryRom_.data(), roms::ROM_ZX81, roms::ROM_ZX81_SIZE);
    }

    // Register ZX81 opcode fetch callback for character generation.
    // When the CPU fetches an opcode from an address with A15 high
    // (display file area), the ULA intercepts: bytes with bit 6 low
    // are display characters (replaced with NOP), bytes with bit 6
    // high are real opcodes (e.g., HALT = 0x76).
    z80_->registerOpcodeFetchCallback(
        [](uint16_t address, void* param) -> uint8_t {
            auto* self = static_cast<ZX81*>(param);
            uint8_t byte = self->coreMemoryRead(address);
            if (address & 0x8000) {
                // Display file area: bit 6 low = character (return NOP)
                if ((byte & 0x40) == 0) {
                    return 0x00;  // NOP
                }
            }
            return byte;
        }
    );

    // Clear framebuffer to white (ZX81 default background)
    for (uint32_t i = 0; i < FRAMEBUFFER_SIZE; i += 4)
    {
        zx81Framebuffer_[i]     = 255;  // R
        zx81Framebuffer_[i + 1] = 255;  // G
        zx81Framebuffer_[i + 2] = 255;  // B
        zx81Framebuffer_[i + 3] = 255;  // A
    }
    std::memset(zx81SignalBuffer_.data(), 255, SIGNAL_BUFFER_SIZE);
}

// ============================================================================
// Reset
// ============================================================================

void ZX81::reset()
{
    ZXSpectrum::reset();

    nmiGeneratorOn_ = false;
    nmiTsAccumulator_ = 0;
    vsyncActive_ = false;

    // The ZX81 ROM's NMI handler uses A' as a scanline counter.
    // The standard ROM starts with DI; XOR A (clearing A and A') before
    // enabling NMI. Some ROM variants omit the DI/XOR A prefix and expect
    // A' to be 0 at boot. Zero AF' to match expected initial state.
    z80_->setRegister(Z80::WordReg::AltAF, 0x0000);

    // The ZX81 ROM never explicitly loads IX — it's expected to point to
    // the display line rendering routine at 0x0281 (LD A,R entry point).
    // The NMI handler exits via JP (IX), so IX must be valid before the
    // first NMI fires. The ROM turns on NMI generation immediately
    // (first instruction is OUT (0xFD),A), before IX could be set.
    z80_->setRegister(Z80::WordReg::IX, 0x0281);

    // Clear framebuffer to white
    for (uint32_t i = 0; i < FRAMEBUFFER_SIZE; i += 4)
    {
        zx81Framebuffer_[i]     = 255;
        zx81Framebuffer_[i + 1] = 255;
        zx81Framebuffer_[i + 2] = 255;
        zx81Framebuffer_[i + 3] = 255;
    }
    std::memset(zx81SignalBuffer_.data(), 255, SIGNAL_BUFFER_SIZE);
}

// ============================================================================
// Frame execution (ZX81-specific with NMI generation)
// ============================================================================

void ZX81::runFrame()
{
    if (paused_) return;

    if (frameCounter_ < 30) {
        uint16_t dfile = readAddress(0x400C) | (readAddress(0x400D) << 8);
        uint8_t ireg = z80_->getRegister(Z80::ByteReg::I);
        uint8_t im = z80_->getIMMode();
        // Show first few bytes of D_FILE
        uint8_t df0 = (dfile >= 0x4000 && dfile < 0x7FFF) ? readAddress(dfile) : 0xFF;
        uint8_t df1 = (dfile >= 0x4000 && dfile < 0x7FFF) ? readAddress(dfile+1) : 0xFF;
        uint8_t df2 = (dfile >= 0x4000 && dfile < 0x7FFF) ? readAddress(dfile+2) : 0xFF;
        printf("[ZX81] F%u PC=%04X IFF=%d/%d H=%d NMI=%d I=%02X IM=%d SP=%04X DF=%04X [%02X %02X %02X]\n",
               frameCounter_, z80_->getRegister(Z80::WordReg::PC),
               z80_->getIFF1(), z80_->getIFF2(),
               z80_->getHalted() ? 1 : 0, nmiGeneratorOn_ ? 1 : 0,
               ireg, im,
               z80_->getRegister(Z80::WordReg::SP), dfile,
               df0, df1, df2);
    }

    while (z80_->getTStates() < machineInfo_.tsPerFrame && !paused_)
    {
        uint32_t before = z80_->getTStates();
        // ZX81 INT can fire at any point (triggered by R register bit 6),
        // so pass tsPerFrame as the INT window instead of the narrow
        // Spectrum-style intLength.
        z80_->execute(1, machineInfo_.tsPerFrame);
        int32_t delta = static_cast<int32_t>(z80_->getTStates() - before);

        // NMI generation: when the NMI generator is on, fire an NMI
        // every ZX81_TS_PER_LINE T-states (one per scanline)
        if (nmiGeneratorOn_)
        {
            nmiTsAccumulator_ += static_cast<uint32_t>(delta);
            if (nmiTsAccumulator_ >= ZX81_TS_PER_LINE)
            {
                nmiTsAccumulator_ -= ZX81_TS_PER_LINE;
                z80_->setNMIReq(true);
            }
        }

        // ZX81 INT generation: the ULA monitors bit 6 of the R register
        // during M1 cycles. When bit 6 goes low, INT is asserted.
        // The ROM uses this to time the end of the display routine.
        if ((z80_->getRegister(Z80::ByteReg::R) & 0x40) == 0)
        {
            z80_->signalInterrupt();
        }

        // Tape playback
        if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
        {
            uint32_t curTs = z80_->getTStates();
            if (curTs > lastTapeReadTs_)
            {
                advanceTape(curTs - lastTapeReadTs_);
                lastTapeReadTs_ = curTs;
            }
            audio_.setTapeEarBit(tapeEarLevel_ ? 1 : 0);
        }
        else
        {
            audio_.setTapeEarBit(0);
        }

        // Audio
        audio_.update(delta);
    }

    if (paused_) return;

    // Tape end-of-frame advance
    if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
    {
        uint32_t curTs = z80_->getTStates();
        if (curTs >= lastTapeReadTs_)
            advanceTape(curTs - lastTapeReadTs_);
        lastTapeReadTs_ = 0;
    }

    if (tapeRecording_) recordAbsoluteTs_ += machineInfo_.tsPerFrame;

    z80_->resetTStates(machineInfo_.tsPerFrame);

    audio_.frameEnd();

    if (muteFrames_ > 0)
    {
        audio_.resetBuffer();
        muteFrames_--;
    }

    // Render the ZX81 character display
    renderZX81Display();
    frameCounter_++;
}

// ============================================================================
// Display rendering (character-based from D-FILE)
// ============================================================================

void ZX81::renderDisplay()
{
    renderZX81Display();
}

void ZX81::renderZX81Display()
{
    // Fill entire framebuffer with white (border + background)
    for (uint32_t i = 0; i < FRAMEBUFFER_SIZE; i += 4)
    {
        zx81Framebuffer_[i]     = 255;
        zx81Framebuffer_[i + 1] = 255;
        zx81Framebuffer_[i + 2] = 255;
        zx81Framebuffer_[i + 3] = 255;
    }
    std::memset(zx81SignalBuffer_.data(), 255, SIGNAL_BUFFER_SIZE);

    // Read D-FILE pointer from system variable at address 0x400C-0x400D
    // D_FILE system variable is at offset 0x0C from start of system variables (0x4000)
    uint16_t dfile = readAddress(0x400C) | (readAddress(0x400D) << 8);

    // Bounds check: D-FILE must be in RAM range (0x4000-0x7FFF)
    if (dfile < 0x4000 || dfile >= 0x7FFF)
        return;

    // Get character set base address from I register
    // The ZX81 ROM sets I = 0x1E, so character data is at 0x1E00
    uint16_t charBase = static_cast<uint16_t>(z80_->getRegister(Z80::ByteReg::I)) << 8;

    // D-FILE starts with a HALT/NEWLINE byte (0x76), skip it
    uint16_t dfilePos = dfile + 1;

    // Render 24 lines of up to 32 characters each
    for (int line = 0; line < 24; line++)
    {
        int col = 0;

        while (col < 32)
        {
            // Bounds check
            if (dfilePos >= 0x8000)
                return;

            uint8_t ch = readAddress(dfilePos++);

            // NEWLINE (0x76) terminates the line
            if (ch == 0x76)
                break;

            // Inverse video: bit 7 set
            bool inverse = (ch & 0x80) != 0;
            uint8_t charIndex = ch & 0x3F;

            // Render the 8x8 character bitmap
            for (int row = 0; row < 8; row++)
            {
                uint8_t bitmap = readAddress(charBase + charIndex * 8 + row);
                if (inverse)
                    bitmap = ~bitmap;

                for (int pixel = 0; pixel < 8; pixel++)
                {
                    bool set = (bitmap >> (7 - pixel)) & 1;
                    uint32_t x = BORDER_LEFT + static_cast<uint32_t>(col) * 8 + static_cast<uint32_t>(pixel);
                    uint32_t y = BORDER_TOP + static_cast<uint32_t>(line) * 8 + static_cast<uint32_t>(row);

                    if (x < TOTAL_WIDTH && y < TOTAL_HEIGHT)
                    {
                        uint32_t idx = (y * TOTAL_WIDTH + x) * 4;
                        uint8_t color = set ? 0 : 255;  // Black ink on white paper
                        zx81Framebuffer_[idx]     = color;
                        zx81Framebuffer_[idx + 1] = color;
                        zx81Framebuffer_[idx + 2] = color;
                        // Alpha stays 255

                        // Signal buffer: simple intensity
                        zx81SignalBuffer_[y * TOTAL_WIDTH + x] = color;
                    }
                }
            }

            col++;
        }

        // If we ended the line without hitting NEWLINE, advance to NEWLINE
        if (col >= 32)
        {
            while (dfilePos < 0x8000)
            {
                uint8_t ch = readAddress(dfilePos++);
                if (ch == 0x76)
                    break;
            }
        }
    }
}

uint8_t ZX81::readAddress(uint16_t address) const
{
    if (address < 0x2000)
    {
        // ROM (8KB)
        return memoryRom_[address];
    }
    else if (address < 0x4000)
    {
        // ROM mirror
        return memoryRom_[address & 0x1FFF];
    }
    else if (address < 0x8000)
    {
        // RAM (16KB with RAM pack)
        uint16_t offset = address - 0x4000;
        if (offset < memoryRam_.size())
            return memoryRam_[offset];
        return 0xFF;
    }
    else if (address < 0xC000)
    {
        // ROM mirror
        return memoryRom_[address & 0x1FFF];
    }
    else
    {
        // RAM mirror
        uint16_t offset = (address - 0xC000) % static_cast<uint16_t>(memoryRam_.size());
        return memoryRam_[offset];
    }
}

// ============================================================================
// Framebuffer access
// ============================================================================

const uint8_t* ZX81::getFramebuffer() const
{
    return zx81Framebuffer_.data();
}

int ZX81::getFramebufferSize() const
{
    return static_cast<int>(FRAMEBUFFER_SIZE);
}

const uint8_t* ZX81::getSignalBuffer() const
{
    return zx81SignalBuffer_.data();
}

int ZX81::getSignalBufferSize() const
{
    return static_cast<int>(SIGNAL_BUFFER_SIZE);
}

// ============================================================================
// Screen memory (for base class compatibility)
// ============================================================================

uint8_t* ZX81::getScreenMemory()
{
    return memoryRam_.data();
}

const uint8_t* ZX81::getScreenMemory() const
{
    return memoryRam_.data();
}

// ============================================================================
// Core memory read/write
// ============================================================================

uint8_t ZX81::coreMemoryRead(uint16_t address)
{
    return readAddress(address);
}

void ZX81::coreMemoryWrite(uint16_t address, uint8_t data)
{
    // Only RAM area (0x4000-0x7FFF) and its mirror (0xC000-0xFFFF) are writable
    if (address >= 0x4000 && address < 0x8000)
    {
        uint16_t offset = address - 0x4000;
        if (offset < memoryRam_.size())
            memoryRam_[offset] = data;
    }
    else if (address >= 0xC000)
    {
        uint16_t offset = (address - 0xC000) % static_cast<uint16_t>(memoryRam_.size());
        memoryRam_[offset] = data;
    }
    // Writes to ROM area (0x0000-0x3FFF, 0x8000-0xBFFF) are ignored
}

// ============================================================================
// Debug memory (no side effects)
// ============================================================================

uint8_t ZX81::coreDebugRead(uint16_t address) const
{
    return readAddress(address);
}

void ZX81::coreDebugWrite(uint16_t address, uint8_t data)
{
    if (address >= 0x4000 && address < 0x8000)
    {
        uint16_t offset = address - 0x4000;
        if (offset < memoryRam_.size())
            memoryRam_[offset] = data;
    }
    else if (address >= 0xC000)
    {
        uint16_t offset = (address - 0xC000) % static_cast<uint16_t>(memoryRam_.size());
        memoryRam_[offset] = data;
    }
}

// ============================================================================
// Memory contention (ZX81 has no ULA contention)
// ============================================================================

void ZX81::coreMemoryContention(uint16_t /*address*/, uint32_t /*tstates*/)
{
    // No contention on ZX81
}

void ZX81::coreNoMreqContention(uint16_t /*address*/, uint32_t /*tstates*/)
{
    // No contention on ZX81
}

// ============================================================================
// IO Read
// ============================================================================

uint8_t ZX81::coreIORead(uint16_t address)
{
    // Any port read with A0 low: keyboard matrix
    if ((address & 0x01) == 0)
    {
        uint8_t result = 0xBF;  // Bits 5-7: bit 5 unused, bit 6 = EAR, bit 7 unused

        // Keyboard matrix (same 8x5 matrix as Spectrum)
        for (int i = 0; i < 8; i++)
        {
            if (!(address & (0x100 << i)))
            {
                result &= keyboardMatrix_[i];
            }
        }

        // Bit 6: EAR input (tape)
        if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
        {
            uint32_t curTs = z80_->getTStates();
            if (curTs >= lastTapeReadTs_)
                advanceTape(curTs - lastTapeReadTs_);
            lastTapeReadTs_ = curTs;
            result = (result & 0xBF) | (tapeEarLevel_ ? 0x00 : 0x40);
        }
        else
        {
            // EAR feedback from MIC output
            result = (result & 0xBF) | (audio_.getEarBit() ? 0x00 : 0x40);
        }

        return result;
    }

    return 0xFF;
}

// ============================================================================
// IO Write
// ============================================================================

void ZX81::coreIOWrite(uint16_t address, uint8_t data)
{
    // ZX81 ULA port decode (bits are active low, checked independently):
    //
    //   A0=0 (even port, e.g. 0xFE): NMI generator OFF + start VSYNC
    //   A1=0 (e.g. port 0xFD):       NMI generator ON  + end VSYNC
    //
    // The ROM uses OUT (0xFE),A to disable NMI and OUT (0xFD),A to enable it.

    if (frameCounter_ < 20 && (address & 0x01) == 0) {
        printf("[ZX81] IO OUT NMI-OFF: addr=%04X PC=%04X\n",
               address, z80_->getRegister(Z80::WordReg::PC));
    }

    // A0 low → NMI generator OFF, VSYNC on, MIC output
    if ((address & 0x01) == 0)
    {
        nmiGeneratorOn_ = false;

        // MIC output for tape saving (bit 3 and bit 4)
        audio_.setMicBit((data >> 3) & 1);
        audio_.setEarBit((data >> 4) & 1);

        if (tapeRecording_)
        {
            recordMicTransition((data >> 3) & 1);
        }
    }

    // A1 low → NMI generator ON, VSYNC off
    if ((address & 0x02) == 0)
    {
        nmiGeneratorOn_ = true;
        nmiTsAccumulator_ = 0;
    }
}

// ============================================================================
// Snapshot loading (stubs - ZX81 uses .P format, not Spectrum formats)
// ============================================================================

void ZX81::loadSNA(const uint8_t* /*data*/, uint32_t /*size*/)
{
    // Not applicable for ZX81
}

void ZX81::loadZ80(const uint8_t* /*data*/, uint32_t /*size*/)
{
    // Not applicable for ZX81
}

void ZX81::loadTZX(const uint8_t* /*data*/, uint32_t /*size*/)
{
    // Not applicable for ZX81
}

void ZX81::loadTAP(const uint8_t* /*data*/, uint32_t /*size*/)
{
    // Not applicable for ZX81
}

void ZX81::loadTZXTape(const uint8_t* /*data*/, uint32_t /*size*/)
{
    // Not applicable for ZX81
}

// ============================================================================
// .P file loader (ZX81 native program format)
// ============================================================================

void ZX81::loadP(const uint8_t* data, uint32_t size)
{
    if (!data || size == 0 || size > 16384)
        return;

    reset();

    // Run the ROM for a few frames to initialize system variables
    z80_->signalInterrupt();
    for (int f = 0; f < 200; f++)
    {
        z80_->execute(machineInfo_.tsPerFrame, machineInfo_.intLength);
        z80_->resetTStates(machineInfo_.tsPerFrame);
        z80_->signalInterrupt();

        // Check if we've reached the main loop (cursor visible)
        uint16_t pc = z80_->getRegister(Z80::WordReg::PC);
        if (pc == 0x0207)  // SLOW mode main loop
            break;
    }

    // .P file is a memory dump from address 0x4009 (system variables)
    // to the end of the program/variables area
    uint16_t loadAddr = 0x4009;
    for (uint32_t i = 0; i < size && (loadAddr + i) < 0x8000; i++)
    {
        memoryRam_[loadAddr - 0x4000 + i] = data[i];
    }

    // Set up CPU to return to the main loop
    z80_->setRegister(Z80::WordReg::PC, 0x0283);  // SLOW/FAST return point
    audio_.reset();
    muteFrames_ = 5;
}

} // namespace zxspec::zx81
