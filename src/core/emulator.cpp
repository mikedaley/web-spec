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

void Emulator::updatePaging()
{
    if (machineType_ == MachineType::Spectrum48K)
    {
        // 48K: ROM page 1 (48K ROM), RAM 5/2/0
        pageRead_[0] = &rom_[MEM_PAGE_SIZE];   // ROM page 1 = 48K ROM
        pageRead_[1] = &ram_[5 * MEM_PAGE_SIZE];
        pageRead_[2] = &ram_[2 * MEM_PAGE_SIZE];
        pageRead_[3] = &ram_[0 * MEM_PAGE_SIZE];

        pageWrite_[0] = nullptr;  // ROM not writable
        pageWrite_[1] = &ram_[5 * MEM_PAGE_SIZE];
        pageWrite_[2] = &ram_[2 * MEM_PAGE_SIZE];
        pageWrite_[3] = &ram_[0 * MEM_PAGE_SIZE];

        currentScreenPage_ = 5;
    }
    else
    {
        // 128K: ROM selected by bit 4, RAM 5 fixed, RAM 2 fixed, RAM 0-7 by bits 0-2
        int romPage = (port7FFD_ & 0x10) ? 1 : 0;
        int ramPage = port7FFD_ & 0x07;

        pageRead_[0] = &rom_[romPage * MEM_PAGE_SIZE];
        pageRead_[1] = &ram_[5 * MEM_PAGE_SIZE];
        pageRead_[2] = &ram_[2 * MEM_PAGE_SIZE];
        pageRead_[3] = &ram_[ramPage * MEM_PAGE_SIZE];

        pageWrite_[0] = nullptr;  // ROM not writable
        pageWrite_[1] = &ram_[5 * MEM_PAGE_SIZE];
        pageWrite_[2] = &ram_[2 * MEM_PAGE_SIZE];
        pageWrite_[3] = &ram_[ramPage * MEM_PAGE_SIZE];

        currentScreenPage_ = (port7FFD_ & 0x08) ? 7 : 5;
    }
}

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

    // Load 48K ROM into ROM page 1 (second 16KB of rom_ array)
    if (roms::ROM_48K_SIZE > 0)
    {
        std::memcpy(&rom_[MEM_PAGE_SIZE], roms::ROM_48K, roms::ROM_48K_SIZE);
    }

    // Load 128K ROMs into ROM pages 0 and 1
    if (roms::ROM_128K_0_SIZE > 0)
    {
        std::memcpy(&rom_[0], roms::ROM_128K_0, roms::ROM_128K_0_SIZE);
    }
    if (roms::ROM_128K_1_SIZE > 0)
    {
        // 128K ROM 1 is the 48K ROM equivalent, load into page 1 area
        // but we already have the 48K ROM there; for 128K mode, ROM page 0 = 128-0.rom, ROM page 1 = 128-1.rom
        // So we need separate handling: when in 128K mode, rom_[0] = 128-0.rom, rom_[MEM_PAGE_SIZE] = 128-1.rom
        // For 48K mode, rom_[MEM_PAGE_SIZE] = 48.rom
        // Solution: store 128K ROM 1 and 48K ROM separately. But we only have 32KB rom_ array.
        // The 128-1.rom IS the 48K ROM, so this is fine - just overwrite page 1 with 128-1.rom if available
        std::memcpy(&rom_[MEM_PAGE_SIZE], roms::ROM_128K_1, roms::ROM_128K_1_SIZE);
    }

    updatePaging();

    audio_.setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, tsPerFrame_);
    contention_.init(tsPerFrame_, TSTATES_PER_SCANLINE, 14335);
    display_.init(SCANLINES_PER_FRAME, TSTATES_PER_SCANLINE, PX_VERTICAL_BLANK);

    // Add AY sound board peripheral (enabled by default)
    auto ay = std::make_unique<AYSoundBoard>();
    ay->setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, tsPerFrame_);
    addPeripheral(std::move(ay));

    reset();
    z80_->signalInterrupt();
}

void Emulator::setMachineType(MachineType type)
{
    machineType_ = type;

    if (type == MachineType::Spectrum48K)
    {
        tsPerFrame_ = TSTATES_PER_FRAME;
        tsPerScanline_ = TSTATES_PER_SCANLINE;
        intLength_ = INT_LENGTH_TSTATES;
    }
    else
    {
        tsPerFrame_ = TSTATES_PER_FRAME_128K;
        tsPerScanline_ = TSTATES_PER_SCANLINE_128K;
        intLength_ = INT_LENGTH_TSTATES_128K;
    }

    port7FFD_ = 0;
    pagingDisabled_ = false;
    updatePaging();

    int scanlines = (type == MachineType::Spectrum48K) ? SCANLINES_PER_FRAME : SCANLINES_PER_FRAME_128K;
    int tsOrigin = (type == MachineType::Spectrum48K) ? 14335 : TS_TO_ORIGIN_128K;
    int vblank = (type == MachineType::Spectrum48K) ? PX_VERTICAL_BLANK : PX_VERTICAL_BLANK_128K;

    display_.init(scanlines, tsPerScanline_, vblank);
    contention_.init(tsPerFrame_, tsPerScanline_, tsOrigin);
    audio_.setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, tsPerFrame_);
    for (auto& p : peripherals_) p->setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, tsPerFrame_);
}

void Emulator::reset()
{
    z80_->reset(true);
    audio_.reset();
    for (auto& p : peripherals_) p->reset();
    keyboardMatrix_.fill(0xBF);
    display_.frameReset();
    paused_ = false;

    port7FFD_ = 0;
    pagingDisabled_ = false;
    updatePaging();
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

    z80_->execute(static_cast<uint32_t>(cycles), intLength_);
}

void Emulator::runFrame()
{
    if (paused_) return;

    if (turbo_)
    {
        z80_->execute(tsPerFrame_, intLength_);
    }
    else
    {
        while (z80_->getTStates() < static_cast<uint32_t>(tsPerFrame_) && !paused_)
        {
            uint32_t before = z80_->getTStates();
            z80_->execute(1, intLength_);
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

    z80_->resetTStates(tsPerFrame_);
    z80_->signalInterrupt();
    display_.updateWithTs(tsPerFrame_ - display_.getCurrentDisplayTs(),
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
    z80_->execute(1, intLength_);
}

uint8_t Emulator::readMemory(uint16_t address) const
{
    int slot = address >> 14;
    return pageRead_[slot][address & 0x3FFF];
}

void Emulator::writeMemory(uint16_t address, uint8_t data)
{
    int slot = address >> 14;
    if (pageWrite_[slot])
    {
        pageWrite_[slot][address & 0x3FFF] = data;
    }
}

uint8_t Emulator::memRead(uint16_t address, void* /*param*/)
{
    int slot = address >> 14;
    return pageRead_[slot][address & 0x3FFF];
}

void Emulator::memWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    int slot = address >> 14;
    if (pageWrite_[slot])
    {
        // Check if writing to screen memory area for display update
        uint16_t offset = address & 0x3FFF;
        if (slot >= 1)
        {
            // Determine which RAM page this slot points to
            uint8_t* slotBase = pageWrite_[slot];
            uint8_t* screenBase = &ram_[currentScreenPage_ * MEM_PAGE_SIZE];
            if (slotBase == screenBase && offset < 6912)
            {
                display_.updateWithTs(
                    static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + PAPER_DRAWING_OFFSET),
                    getScreenMemory(), borderColor_, frameCounter_);
            }
        }
        pageWrite_[slot][offset] = data;
    }
}

uint8_t Emulator::ioRead(uint16_t address, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address, machineType_);

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
    return display_.floatingBus(z80_->getTStates(), getScreenMemory());
}

void Emulator::ioWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    contention_.applyIOContention(*z80_, address, machineType_);

    // Dispatch to peripherals (non-exclusive with ULA: AY ports are odd)
    for (auto& p : peripherals_) {
        if (p->claimsPort(address, true)) p->ioWrite(address, data);
    }

    // Port 0x7FFD - 128K memory paging
    if (machineType_ == MachineType::Spectrum128K && (address & 0x8002) == 0)
    {
        if (!pagingDisabled_)
        {
            port7FFD_ = data;
            pagingDisabled_ = (data & 0x20) != 0;
            updatePaging();
        }
    }

    if ((address & 0x01) == 0)
    {
        display_.updateWithTs(
            static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + BORDER_DRAWING_OFFSET),
            getScreenMemory(), borderColor_, frameCounter_);
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
        ay->setup(AUDIO_SAMPLE_RATE, FRAMES_PER_SECOND, tsPerFrame_);
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
                return true;
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
    int slot = address >> 14;

    if (machineType_ == MachineType::Spectrum48K)
    {
        // 48K: only slot 1 (0x4000-0x7FFF) is contended
        if (slot == 1)
        {
            z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
        }
    }
    else
    {
        // 128K: slot 1 always contended (page 5), slot 3 contended if odd RAM page
        if (slot == 1)
        {
            z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
        }
        else if (slot == 3)
        {
            int ramPage = port7FFD_ & 0x07;
            if (ramPage & 1)  // odd pages (1,3,5,7) are contended
            {
                z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
            }
        }
    }
}

} // namespace zxspec
