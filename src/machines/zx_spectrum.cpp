/*
 * zx_spectrum.cpp - ZX Spectrum base class (shared emulation logic)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx_spectrum.hpp"
#include <cstring>

namespace zxspec {

// ============================================================================
// Static callbacks bridging Z80 → virtual methods
// ============================================================================

uint8_t ZXSpectrum::memReadCallback(uint16_t addr, void* param)
{
    return static_cast<ZXSpectrum*>(param)->coreMemoryRead(addr);
}

void ZXSpectrum::memWriteCallback(uint16_t addr, uint8_t data, void* param)
{
    static_cast<ZXSpectrum*>(param)->coreMemoryWrite(addr, data);
}

uint8_t ZXSpectrum::ioReadCallback(uint16_t addr, void* param)
{
    return static_cast<ZXSpectrum*>(param)->coreIORead(addr);
}

void ZXSpectrum::ioWriteCallback(uint16_t addr, uint8_t data, void* param)
{
    static_cast<ZXSpectrum*>(param)->coreIOWrite(addr, data);
}

void ZXSpectrum::contentionCallback(uint16_t addr, uint32_t ts, void* param)
{
    static_cast<ZXSpectrum*>(param)->coreMemoryContention(addr, ts);
}

void ZXSpectrum::noMreqContentionCallback(uint16_t addr, uint32_t ts, void* param)
{
    static_cast<ZXSpectrum*>(param)->coreNoMreqContention(addr, ts);
}

// ============================================================================
// Constructor / Destructor
// ============================================================================

ZXSpectrum::ZXSpectrum()
{
    z80_ = std::make_unique<Z80>();
}

ZXSpectrum::~ZXSpectrum() = default;

// ============================================================================
// Initialization (called by variant after setting machineInfo_)
// ============================================================================

void ZXSpectrum::baseInit()
{
    // Allocate memory
    memoryRom_.resize(machineInfo_.romSize, 0);
    memoryRam_.resize(machineInfo_.ramSize, 0);

    // Wire Z80 callbacks through static functions → virtual methods
    z80_->initialise(
        memReadCallback,
        memWriteCallback,
        ioReadCallback,
        ioWriteCallback,
        contentionCallback,
        noMreqContentionCallback,
        this
    );

    // Compute frames per second from timing
    double fps = CPU_CLOCK_HZ / static_cast<double>(machineInfo_.tsPerFrame);

    audio_.setup(AUDIO_SAMPLE_RATE, fps, machineInfo_.tsPerFrame);
    contention_.init(machineInfo_);
    display_.init(machineInfo_);

    reset();
    z80_->signalInterrupt();
}

// ============================================================================
// Reset
// ============================================================================

void ZXSpectrum::reset()
{
    z80_->reset(true);
    audio_.reset();
    keyboardMatrix_.fill(0xBF);
    display_.frameReset();
    paused_ = false;

    tapeBlocks_.clear();
    tapeBlockInfo_.clear();
    tapeBlockIndex_ = 0;
    tapeActive_ = false;
    tapePulses_.clear();
    tapePulseBlockStarts_.clear();
    tapePulseIndex_ = 0;
    tapePulseRemaining_ = 0;
    tapeEarLevel_ = false;
    tapePulseActive_ = false;
    lastTapeReadTs_ = 0;
}

// ============================================================================
// Frame execution
// ============================================================================

void ZXSpectrum::runFrame()
{
    if (paused_) return;

    // Instant load: run CPU at full host speed until tape finishes loading.
    // No audio, no display, no contention — just blast through all tape pulses.
    if (tapePulseActive_ && tapeInstantLoad_)
    {
        tapeAccelerating_ = true;

        // Run frames until all tape pulses are consumed or tape stops
        while (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
        {
            while (z80_->getTStates() < machineInfo_.tsPerFrame && !paused_)
            {
                uint32_t before = z80_->getTStates();
                z80_->execute(1, machineInfo_.intLength);

                // Advance tape timing
                uint32_t curTs = z80_->getTStates();
                if (curTs > lastTapeReadTs_)
                {
                    advanceTape(curTs - lastTapeReadTs_);
                    lastTapeReadTs_ = curTs;
                }
            }

            if (paused_) break;

            // End-of-frame tape advance before T-state reset
            if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
            {
                uint32_t curTs = z80_->getTStates();
                if (curTs >= lastTapeReadTs_)
                    advanceTape(curTs - lastTapeReadTs_);
                lastTapeReadTs_ = 0;
            }

            z80_->resetTStates(machineInfo_.tsPerFrame);
            z80_->signalInterrupt();
            display_.frameReset();
            frameCounter_++;
        }

        tapeAccelerating_ = false;

        // Produce a silent audio frame and render the final display state
        audio_.resetBuffer();
        muteFrames_ = 2;
        display_.updateWithTs(
            static_cast<int32_t>(machineInfo_.tsPerFrame),
            getScreenMemory(), borderColor_, frameCounter_);
        display_.frameReset();
        frameCounter_++;
        return;
    }

    // Normal speed frame
    while (z80_->getTStates() < machineInfo_.tsPerFrame && !paused_)
    {
        uint32_t before = z80_->getTStates();
        z80_->execute(1, machineInfo_.intLength);
        int32_t delta = static_cast<int32_t>(z80_->getTStates() - before);

        // Advance tape
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

        audio_.update(delta);
    }

    if (paused_) return;

    // Advance tape playback to end of frame before T-state reset
    if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
    {
        uint32_t curTs = z80_->getTStates();
        if (curTs >= lastTapeReadTs_)
            advanceTape(curTs - lastTapeReadTs_);
        lastTapeReadTs_ = 0;
    }

    z80_->resetTStates(machineInfo_.tsPerFrame);
    z80_->signalInterrupt();

    audio_.frameEnd();

    if (muteFrames_ > 0)
    {
        audio_.resetBuffer();
        muteFrames_--;
    }

    display_.updateWithTs(
        static_cast<int32_t>(machineInfo_.tsPerFrame - display_.getCurrentDisplayTs()),
        getScreenMemory(), borderColor_, frameCounter_);
    display_.frameReset();
    frameCounter_++;
}

void ZXSpectrum::runCycles(int cycles)
{
    if (paused_) return;
    z80_->execute(static_cast<uint32_t>(cycles), machineInfo_.intLength);
}

void ZXSpectrum::stepInstruction()
{
    z80_->execute(1, machineInfo_.intLength);
}

// ============================================================================
// Display / Audio accessors
// ============================================================================

const uint8_t* ZXSpectrum::getFramebuffer() const
{
    return display_.getFramebuffer();
}

int ZXSpectrum::getFramebufferSize() const
{
    return display_.getFramebufferSize();
}

const float* ZXSpectrum::getAudioBuffer() const
{
    return audio_.getBuffer();
}

int ZXSpectrum::getAudioSampleCount() const
{
    return audio_.getSampleCount();
}

void ZXSpectrum::resetAudioBuffer()
{
    audio_.resetBuffer();
}

// ============================================================================
// Keyboard
// ============================================================================

void ZXSpectrum::keyDown(int row, int bit)
{
    if (row >= 0 && row < 8 && bit >= 0 && bit < 5)
    {
        keyboardMatrix_[row] &= ~(1 << bit);
    }
}

void ZXSpectrum::keyUp(int row, int bit)
{
    if (row >= 0 && row < 8 && bit >= 0 && bit < 5)
    {
        keyboardMatrix_[row] |= (1 << bit);
    }
}

uint8_t ZXSpectrum::getKeyboardRow(int row) const
{
    if (row >= 0 && row < 8) return keyboardMatrix_[row];
    return 0xBF;
}

// ============================================================================
// Public memory access (debug / WASM interface — no side effects)
// ============================================================================

uint8_t ZXSpectrum::readMemory(uint16_t address) const
{
    return coreDebugRead(address);
}

void ZXSpectrum::writeMemory(uint16_t address, uint8_t data)
{
    coreDebugWrite(address, data);
}

// ============================================================================
// Breakpoints
// ============================================================================

void ZXSpectrum::addBreakpoint(uint16_t addr)
{
    breakpoints_.insert(addr);
    disabledBreakpoints_.erase(addr);
    installOpcodeCallback();
}

void ZXSpectrum::removeBreakpoint(uint16_t addr)
{
    breakpoints_.erase(addr);
    disabledBreakpoints_.erase(addr);

    if (breakpoints_.empty() && !tapeActive_) {
        z80_->registerOpcodeCallback(nullptr);
    } else {
        installOpcodeCallback();
    }
}

void ZXSpectrum::enableBreakpoint(uint16_t addr, bool enabled)
{
    if (enabled) {
        disabledBreakpoints_.erase(addr);
    } else {
        disabledBreakpoints_.insert(addr);
    }
}

void ZXSpectrum::clearBreakpointHit()
{
    skipBreakpointAddr_ = breakpointAddress_;
    skipBreakpointOnce_ = true;
    breakpointHit_ = false;
}

void ZXSpectrum::installOpcodeCallback()
{
    z80_->registerOpcodeCallback(
        [this](uint8_t /*opcode*/, uint16_t address, void* /*param*/) -> bool {
            // Tape ROM trap
            if (tapeActive_ && handleTapeTrap(address))
            {
                return true;
            }

            // Breakpoint handling
            if (!breakpoints_.empty())
            {
                if (skipBreakpointOnce_ && address == skipBreakpointAddr_) {
                    skipBreakpointOnce_ = false;
                    return false;
                }
                if (breakpoints_.count(address) && !disabledBreakpoints_.count(address)) {
                    breakpointHit_ = true;
                    breakpointAddress_ = address;
                    paused_ = true;
                    z80_->setRegister(Z80::WordReg::PC, address);
                    return true;
                }
            }
            return false;
        });
}

// ============================================================================
// Tape transport controls
// ============================================================================

void ZXSpectrum::tapePlay()
{
    if (tapeBlocks_.empty()) return;
    tapeActive_ = true;
    tapePulseActive_ = true;
    installOpcodeCallback();
}

void ZXSpectrum::tapeStop()
{
    tapePulseActive_ = false;
}

void ZXSpectrum::tapeRewind()
{
    tapeBlockIndex_ = 0;
    tapePulseIndex_ = 0;
    tapePulseRemaining_ = 0;
    tapeEarLevel_ = false;
    lastTapeReadTs_ = 0;
}

void ZXSpectrum::tapeEject()
{
    tapePulseActive_ = false;
    tapeActive_ = false;
    tapeBlocks_.clear();
    tapeBlockInfo_.clear();
    tapeBlockIndex_ = 0;
    tapePulses_.clear();
    tapePulseBlockStarts_.clear();
    tapePulseIndex_ = 0;
    tapePulseRemaining_ = 0;
    tapeEarLevel_ = false;
    lastTapeReadTs_ = 0;
    tapeInstantLoad_ = false;

    // Remove opcode callback if no breakpoints remain
    if (breakpoints_.empty()) {
        z80_->registerOpcodeCallback(nullptr);
    }
}

// ============================================================================
// Tape (default: 48K ROM trap at 0x056B — RET NZ inside LD-BYTES)
// ============================================================================

bool ZXSpectrum::handleTapeTrap(uint16_t address)
{
    // Trap at 0x056B: by this point the ROM has already executed EX AF,AF'
    // so the block type and LOAD/VERIFY flag are in the alternate registers.
    // This matches SpectREMCPP's trap location.
    if (address != 0x056B) return false;
    if (!tapeInstantLoad_) return false;

    if (tapeBlockIndex_ >= tapeBlocks_.size())
    {
        tapeBlockIndex_ = 0;
    }

    // Read block type and carry flag from alternate registers
    // (EX AF,AF' at 0x0557 moved them there)
    uint8_t expectedBlockType = z80_->getRegister(Z80::ByteReg::AltA);
    uint8_t altF = z80_->getRegister(Z80::ByteReg::AltF);
    bool isLoad = (altF & Z80::FLAG_C) != 0;
    uint16_t startAddress = z80_->getRegister(Z80::WordReg::IX);

    uint32_t blockLength = z80_->getRegister(Z80::WordReg::DE);
    uint32_t tapBlockLength = tapeBlocks_[tapeBlockIndex_].data.size();
    blockLength = (blockLength < tapBlockLength) ? blockLength : tapBlockLength;

    uint32_t success = 1;
    const auto& block = tapeBlocks_[tapeBlockIndex_];

    if (block.data[0] == expectedBlockType)
    {
        if (isLoad)
        {
            uint32_t currentBytePtr = 1;
            uint8_t checksum = expectedBlockType;

            for (uint32_t i = 0; i < blockLength; i++)
            {
                uint8_t tapByte = block.data[currentBytePtr];
                writeMemory(startAddress + i, tapByte);
                checksum ^= tapByte;
                currentBytePtr++;
            }

            uint8_t expectedChecksum = block.data[block.data.size() - 1];
            if (expectedChecksum != checksum)
            {
                success = 0;
            }
        }
    }

    uint8_t currentF = z80_->getRegister(Z80::ByteReg::F);
    if (success)
    {
        currentF |= Z80::FLAG_C;
    }
    else
    {
        currentF &= ~Z80::FLAG_C;
    }
    z80_->setRegister(Z80::ByteReg::F, currentF);

    tapeBlockIndex_++;

    if (tapeBlockIndex_ < tapePulseBlockStarts_.size())
    {
        tapePulseIndex_ = tapePulseBlockStarts_[tapeBlockIndex_];
        tapePulseRemaining_ = 0;
    }

    if (tapeBlockIndex_ >= tapeBlocks_.size())
    {
        tapePulseActive_ = false;
    }
    else
    {
        tapePulseActive_ = true;
    }

    z80_->setRegister(Z80::WordReg::PC, 0x05E2);
    return true;
}

void ZXSpectrum::advanceTape(uint32_t tstates)
{
    while (tstates > 0 && tapePulseIndex_ < tapePulses_.size())
    {
        if (tapePulseRemaining_ == 0)
        {
            tapePulseRemaining_ = tapePulses_[tapePulseIndex_];
        }

        if (tstates >= tapePulseRemaining_)
        {
            tstates -= tapePulseRemaining_;
            tapePulseRemaining_ = 0;
            tapePulseIndex_++;
            tapeEarLevel_ = !tapeEarLevel_;

            // Track block boundaries during pulse playback
            if (tapeBlockIndex_ + 1 < tapePulseBlockStarts_.size() &&
                tapePulseIndex_ >= tapePulseBlockStarts_[tapeBlockIndex_ + 1])
            {
                tapeBlockIndex_++;
            }
        }
        else
        {
            tapePulseRemaining_ -= tstates;
            tstates = 0;
        }
    }

    if (tapePulseIndex_ >= tapePulses_.size())
    {
        tapePulseActive_ = false;
    }
}

} // namespace zxspec
