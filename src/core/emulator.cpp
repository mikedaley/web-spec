/*
 * emulator.cpp - Core emulator coordinator for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "emulator.hpp"
#include "loaders/sna_loader.hpp"
#include "loaders/z80_loader.hpp"
#include "loaders/tzx_loader.hpp"
#include <algorithm>
#include <cstring>

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
        [this](uint16_t addr, uint32_t tstates, void* param) { noMreqContention(addr, tstates, param); },
        this
    );

    memory_.init();

    audio_.setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, TSTATES_PER_FRAME);
    contention_.init(TSTATES_PER_FRAME, TSTATES_PER_SCANLINE, 14335);
    display_.init(SCANLINES_PER_FRAME, TSTATES_PER_SCANLINE, PX_VERTICAL_BLANK);

    reset();
    z80_->signalInterrupt();
}

void Emulator::reset()
{
    z80_->reset(true);
    audio_.reset();
    keyboardMatrix_.fill(0xBF);
    display_.frameReset();
    paused_ = false;

    memory_.reset();

    tapeBlocks_.clear();
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

void Emulator::loadSNA(const uint8_t* data, uint32_t size)
{
    reset();
    SNALoader::load(*this, data, size);
}

void Emulator::loadZ80(const uint8_t* data, uint32_t size)
{
    reset();
    Z80Loader::load(*this, data, size);
}

void Emulator::loadTZX(const uint8_t* data, uint32_t size)
{
    reset();

    // The ROM must initialise system variables before we can load tape data.
    // Run frames until the ROM has finished init and reached the editor loop.
    z80_->signalInterrupt();
    for (int f = 0; f < 300; f++)
    {
        z80_->execute(TSTATES_PER_FRAME, INT_LENGTH_TSTATES);
        z80_->resetTStates(TSTATES_PER_FRAME);
        z80_->signalInterrupt();

        uint16_t pc = z80_->getRegister(Z80::WordReg::PC);
        if (pc == 0x12A2) break;
    }
    audio_.reset();
    display_.frameReset();

    TZXLoader::load(*this, data, size);

    // Now simulate LOAD "" to trigger the ROM tape loading routine,
    // which our opcode callback will intercept at 0x0556.
    // Write tokenized LOAD "" into the edit line area and execute it.

    // E_LINE (23641/23642) points to the edit line
    uint16_t eLine = readMemory(23641) | (readMemory(23642) << 8);

    // Write: LOAD (token 0xEF) " " Enter
    writeMemory(eLine, 0xEF);       // LOAD token
    writeMemory(eLine + 1, 0x22);   // "
    writeMemory(eLine + 2, 0x22);   // "
    writeMemory(eLine + 3, 0x0D);   // ENTER

    // Set NSPPC to 0 (start of statement)
    writeMemory(23620, 0xFF);

    // Set CH_ADD to point to the start of our command
    writeMemory(23645, eLine & 0xFF);
    writeMemory(23646, eLine >> 8);

    // Jump to the ROM's LINE-RUN routine at 0x1B8A which interprets the edit line
    z80_->setRegister(Z80::WordReg::PC, 0x1B8A);

    // Set up stack so RET lands back in the editor
    uint16_t sp = z80_->getRegister(Z80::WordReg::SP);
    sp -= 2;
    writeMemory(sp, 0xA2);     // low byte of 0x12A2
    writeMemory(sp + 1, 0x12); // high byte
    z80_->setRegister(Z80::WordReg::SP, sp);
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

    if (turbo_)
    {
        z80_->execute(TSTATES_PER_FRAME, INT_LENGTH_TSTATES);
    }
    else
    {
        while (z80_->getTStates() < static_cast<uint32_t>(TSTATES_PER_FRAME) && !paused_)
        {
            uint32_t before = z80_->getTStates();
            z80_->execute(1, INT_LENGTH_TSTATES);
            int32_t delta = static_cast<int32_t>(z80_->getTStates() - before);
            audio_.update(delta);
        }

        // If paused mid-frame (breakpoint hit), don't do frame-end processing
        if (paused_) return;

        audio_.frameEnd();
    }

    // Advance tape playback to end of frame before T-state reset
    if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
    {
        uint32_t curTs = z80_->getTStates();
        if (curTs >= lastTapeReadTs_)
            advanceTape(curTs - lastTapeReadTs_);
        lastTapeReadTs_ = 0;
    }

    z80_->resetTStates(TSTATES_PER_FRAME);
    z80_->signalInterrupt();
    display_.updateWithTs(TSTATES_PER_FRAME - display_.getCurrentDisplayTs(),
                          getScreenMemory(), borderColor_, frameCounter_);
    display_.frameReset();
    frameCounter_++;
}

const uint8_t* Emulator::getFramebuffer() const
{
    return display_.getFramebuffer();
}

int Emulator::getFramebufferSize() const
{
    return display_.getFramebufferSize();
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
    return memory_.read(address);
}

void Emulator::writeMemory(uint16_t address, uint8_t data)
{
    memory_.write(address, data);
}

uint8_t Emulator::memRead(uint16_t address, void* /*param*/)
{
    return memory_.read(address);
}

void Emulator::memWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    int slot = address >> 14;
    if (memory_.getPageWrite(slot))
    {
        // Check if writing to screen memory area for display update
        uint16_t offset = address & 0x3FFF;
        if (slot == 1 && offset < 6912)
        {
            display_.updateWithTs(
                static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + PAPER_DRAWING_OFFSET),
                getScreenMemory(), borderColor_, frameCounter_);
        }
        memory_.write(address, data);
    }
}

uint8_t Emulator::ioRead(uint16_t address, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address);

    // ULA owned (even) ports — keyboard
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
        // Bit 6 reflects the EAR input (from tape or audio)
        if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
        {
            uint32_t curTs = z80_->getTStates();
            if (curTs >= lastTapeReadTs_)
                advanceTape(curTs - lastTapeReadTs_);
            lastTapeReadTs_ = curTs;
            result = (result & 0xBF) | (tapeEarLevel_ ? 0x40 : 0x00);
        }
        else
        {
            result = (result & 0xBF) | (audio_.getEarBit() << 6);
        }
        return result;
    }

    // Return floating bus value
    return display_.floatingBus(z80_->getTStates(), memory_.getSlot1Memory(), 0);
}

void Emulator::ioWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address);

    // ULA owned (even) ports — border colour and EAR/MIC
    if ((address & 0x01) == 0)
    {
        display_.updateWithTs(
            static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + BORDER_DRAWING_OFFSET),
            getScreenMemory(), borderColor_, frameCounter_);
        audio_.setEarBit((data >> 4) & 1);
        borderColor_ = data & 0x07;
    }
}

void Emulator::addBreakpoint(uint16_t addr)
{
    breakpoints_.insert(addr);
    disabledBreakpoints_.erase(addr);
    installOpcodeCallback();
}

void Emulator::removeBreakpoint(uint16_t addr)
{
    breakpoints_.erase(addr);
    disabledBreakpoints_.erase(addr);

    if (breakpoints_.empty() && !tapeActive_) {
        z80_->registerOpcodeCallback(nullptr);
    } else {
        installOpcodeCallback();
    }
}

void Emulator::enableBreakpoint(uint16_t addr, bool enabled)
{
    if (enabled) {
        disabledBreakpoints_.erase(addr);
    } else {
        disabledBreakpoints_.insert(addr);
    }
}

void Emulator::installOpcodeCallback()
{
    z80_->registerOpcodeCallback(
        [this](uint8_t /*opcode*/, uint16_t address, void* /*param*/) -> bool {
            // Tape ROM trap — intercept LD-BYTES at 0x0556
            if (tapeActive_ && address == 0x0556)
            {
                return handleTapeTrap(address);
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

bool Emulator::handleTapeTrap(uint16_t /*address*/)
{
    // ROM LD-BYTES routine entry at 0x0556
    // On entry: A = flag byte expected, IX = dest address, DE = length
    //           Carry flag set = LOAD, clear = VERIFY
    // On exit:  Carry set = success, zero flag set

    if (tapeBlockIndex_ >= tapeBlocks_.size())
    {
        // No more blocks — signal error by clearing carry and returning via RET
        uint8_t f = z80_->getRegister(Z80::ByteReg::F);
        f &= ~Z80::FLAG_C;  // clear carry = error
        z80_->setRegister(Z80::ByteReg::F, f);

        // Pop return address and set PC (simulate RET)
        uint16_t sp = z80_->getRegister(Z80::WordReg::SP);
        uint16_t retAddr = readMemory(sp) | (readMemory(sp + 1) << 8);
        z80_->setRegister(Z80::WordReg::SP, sp + 2);
        z80_->setRegister(Z80::WordReg::PC, retAddr);
        return true;
    }

    uint8_t expectedFlag = z80_->getRegister(Z80::ByteReg::A);
    uint16_t destAddr = z80_->getRegister(Z80::WordReg::IX);
    uint16_t length = z80_->getRegister(Z80::WordReg::DE);
    uint8_t f = z80_->getRegister(Z80::ByteReg::F);
    bool isLoad = (f & Z80::FLAG_C) != 0;

    const auto& block = tapeBlocks_[tapeBlockIndex_];

    // Skip pulse position past this block's pulses
    if (tapeBlockIndex_ + 1 < tapePulseBlockStarts_.size())
    {
        tapePulseIndex_ = tapePulseBlockStarts_[tapeBlockIndex_ + 1];
        tapePulseRemaining_ = 0;
    }

    tapeBlockIndex_++;

    if (block.data.empty())
    {
        // Empty block — error
        f &= ~Z80::FLAG_C;
        z80_->setRegister(Z80::ByteReg::F, f);
        uint16_t sp = z80_->getRegister(Z80::WordReg::SP);
        uint16_t retAddr = readMemory(sp) | (readMemory(sp + 1) << 8);
        z80_->setRegister(Z80::WordReg::SP, sp + 2);
        z80_->setRegister(Z80::WordReg::PC, retAddr);
        return true;
    }

    uint8_t blockFlag = block.data[0];

    // Check flag byte matches what the caller expects
    if (blockFlag != expectedFlag)
    {
        // Flag mismatch — the ROM would keep searching, so try next blocks
        // But for simplicity, signal error
        f &= ~Z80::FLAG_C;
        z80_->setRegister(Z80::ByteReg::F, f);
        uint16_t sp = z80_->getRegister(Z80::WordReg::SP);
        uint16_t retAddr = readMemory(sp) | (readMemory(sp + 1) << 8);
        z80_->setRegister(Z80::WordReg::SP, sp + 2);
        z80_->setRegister(Z80::WordReg::PC, retAddr);
        return true;
    }

    if (isLoad)
    {
        // Copy data (skip flag byte, up to 'length' bytes)
        uint32_t available = (block.data.size() > 1) ? static_cast<uint32_t>(block.data.size() - 1) : 0;
        uint32_t toCopy = (available < length) ? available : length;

        for (uint32_t i = 0; i < toCopy; i++)
        {
            writeMemory(destAddr + i, block.data[1 + i]);
        }
    }

    // Success — set carry flag, set zero flag
    f |= Z80::FLAG_C;
    f |= Z80::FLAG_Z;
    z80_->setRegister(Z80::ByteReg::F, f);

    // Update IX and DE as the ROM routine would
    z80_->setRegister(Z80::WordReg::IX, destAddr + length);
    z80_->setRegister(Z80::WordReg::DE, 0);

    // Pop return address and set PC (simulate RET)
    uint16_t sp = z80_->getRegister(Z80::WordReg::SP);
    uint16_t retAddr = readMemory(sp) | (readMemory(sp + 1) << 8);
    z80_->setRegister(Z80::WordReg::SP, sp + 2);
    z80_->setRegister(Z80::WordReg::PC, retAddr);

    return true;  // skip the instruction at 0x0556
}

void Emulator::advanceTape(uint32_t tstates)
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
        }
        else
        {
            tapePulseRemaining_ -= tstates;
            tstates = 0;
        }
    }

    // If all pulses consumed, deactivate tape
    if (tapePulseIndex_ >= tapePulses_.size())
    {
        tapePulseActive_ = false;
        tapeActive_ = false;
    }
}

void Emulator::memContention(uint16_t address, uint32_t /*tstates*/, void* /*param*/)
{
    if (memory_.isContendedAddress(address))
    {
        z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
    }
}

void Emulator::noMreqContention(uint16_t address, uint32_t /*tstates*/, void* /*param*/)
{
    if (memory_.isContendedAddress(address))
    {
        z80_->addContentionTStates(contention_.ioContention(z80_->getTStates()));
    }
}

} // namespace zxspec
