/*
 * emulator.cpp - Core emulator coordinator for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "emulator.hpp"
#include "loaders/sna_loader.hpp"
#include "loaders/z80_loader.hpp"
#include "peripherals/ay_sound_board.hpp"
#include <algorithm>
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
    display_.init();

    // Add AY sound board peripheral (enabled by default)
    auto ay = std::make_unique<AYSoundBoard>();
    ay->setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, TSTATES_PER_FRAME);
    addPeripheral(std::move(ay));

    reset();
    z80_->signalInterrupt();
}

void Emulator::reset()
{
    z80_->reset(true);
    audio_.reset();
    for (auto& p : peripherals_) p->reset();
    keyboardMatrix_.fill(0xBF);
    display_.frameReset();
    paused_ = false;
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
        while (z80_->getTStates() < TSTATES_PER_FRAME && !paused_)
        {
            uint32_t before = z80_->getTStates();
            z80_->execute(1, INT_LENGTH_TSTATES);
            int32_t delta = static_cast<int32_t>(z80_->getTStates() - before);
            audio_.update(delta);
            for (auto& p : peripherals_) p->update(delta);
        }

        // If paused mid-frame (breakpoint hit), don't do frame-end processing
        if (paused_) return;

        audio_.frameEnd();
        for (auto& p : peripherals_) p->frameEnd();
        mixPeripheralAudio();
    }

    z80_->resetTStates(TSTATES_PER_FRAME);
    z80_->signalInterrupt();
    display_.updateWithTs(TSTATES_PER_FRAME - display_.getCurrentDisplayTs(),
                          memory_.data(), borderColor_, frameCounter_);
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
    for (auto& p : peripherals_) p->resetAudioBuffer();
    mixOffset_ = 0;
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
            display_.updateWithTs(
                static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + PAPER_DRAWING_OFFSET),
                memory_.data(), borderColor_, frameCounter_);
        }
        memory_[address] = data;
    }
}

uint8_t Emulator::ioRead(uint16_t address, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address);

    // Check peripherals first
    for (auto& p : peripherals_) {
        if (p->claimsPort(address, false)) return p->ioRead(address);
    }

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

    // ULA un-owned (odd) ports return the floating bus value
    return display_.floatingBus(z80_->getTStates(), memory_.data());
}

void Emulator::ioWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address);

    // Dispatch to peripherals (non-exclusive with ULA: AY ports are odd)
    for (auto& p : peripherals_) {
        if (p->claimsPort(address, true)) p->ioWrite(address, data);
    }

    if ((address & 0x01) == 0)
    {
        display_.updateWithTs(
            static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + BORDER_DRAWING_OFFSET),
            memory_.data(), borderColor_, frameCounter_);
        borderColor_ = data & 0x07;
        audio_.setEarBit((data >> 4) & 1);
    }
}

void Emulator::addPeripheral(std::unique_ptr<Peripheral> peripheral)
{
    peripherals_.push_back(std::move(peripheral));
}

void Emulator::enableAY(bool enable)
{
    // Find or remove AY sound board
    if (enable) {
        // Check if already present
        for (auto& p : peripherals_) {
            if (dynamic_cast<AYSoundBoard*>(p.get())) return;
        }
        auto ay = std::make_unique<AYSoundBoard>();
        ay->setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, TSTATES_PER_FRAME);
        addPeripheral(std::move(ay));
    } else {
        peripherals_.erase(
            std::remove_if(peripherals_.begin(), peripherals_.end(),
                [](const std::unique_ptr<Peripheral>& p) {
                    return dynamic_cast<AYSoundBoard*>(p.get()) != nullptr;
                }),
            peripherals_.end());
    }
}

bool Emulator::isAYEnabled() const
{
    for (auto& p : peripherals_) {
        if (dynamic_cast<AYSoundBoard*>(p.get())) return true;
    }
    return false;
}

uint8_t Emulator::getAYRegister(int reg) const
{
    for (auto& p : peripherals_) {
        auto* ay = dynamic_cast<AYSoundBoard*>(p.get());
        if (ay) return ay->getRegister(reg);
    }
    return 0;
}

bool Emulator::getAYChannelMute(int channel) const
{
    for (auto& p : peripherals_) {
        auto* ay = dynamic_cast<AYSoundBoard*>(p.get());
        if (ay) return ay->getChannelMute(channel);
    }
    return false;
}

void Emulator::setAYChannelMute(int channel, bool muted)
{
    for (auto& p : peripherals_) {
        auto* ay = dynamic_cast<AYSoundBoard*>(p.get());
        if (ay) { ay->setChannelMute(channel, muted); return; }
    }
}

void Emulator::getAYWaveform(int channel, float* buffer, int sampleCount) const
{
    for (auto& p : peripherals_) {
        auto* ay = dynamic_cast<AYSoundBoard*>(p.get());
        if (ay) { ay->getWaveform(channel, buffer, sampleCount); return; }
    }
}

void Emulator::mixPeripheralAudio()
{
    float* buf = audio_.getMutableBuffer();
    int count = audio_.getSampleCount();
    for (auto& p : peripherals_) {
        const float* pBuf = p->getAudioBuffer();
        int pCount = p->getAudioSampleCount();
        if (pBuf && pCount > 0) {
            // Only mix samples generated since last mix to avoid
            // double-mixing when multiple frames run before JS reads audio
            int mixEnd = std::min(count, pCount);
            for (int i = mixOffset_; i < mixEnd; i++) buf[i] += pBuf[i];
        }
    }
    mixOffset_ = count;
}

void Emulator::addBreakpoint(uint16_t addr)
{
    breakpoints_.insert(addr);
    disabledBreakpoints_.erase(addr);

    // Register opcode callback if not already registered
    z80_->registerOpcodeCallback(
        [this](uint8_t /*opcode*/, uint16_t address, void* /*param*/) -> bool {
            if (skipBreakpointOnce_ && address == skipBreakpointAddr_) {
                skipBreakpointOnce_ = false;
                return false;
            }
            if (breakpoints_.count(address) && !disabledBreakpoints_.count(address)) {
                breakpointHit_ = true;
                breakpointAddress_ = address;
                paused_ = true;
                z80_->setRegister(Z80::WordReg::PC, address);
                return true; // skip execution of this instruction
            }
            return false;
        });
}

void Emulator::removeBreakpoint(uint16_t addr)
{
    breakpoints_.erase(addr);
    disabledBreakpoints_.erase(addr);

    if (breakpoints_.empty()) {
        z80_->registerOpcodeCallback(nullptr);
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

void Emulator::memContention(uint16_t address, uint32_t /*tstates*/, void* /*param*/)
{
    // 48K contended memory range: 0x4000-0x7FFF
    if (address >= 0x4000 && address <= 0x7FFF)
    {
        z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
    }
}

} // namespace zxspec
