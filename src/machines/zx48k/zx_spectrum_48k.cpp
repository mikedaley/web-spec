/*
 * zx_spectrum_48k.cpp - ZX Spectrum 48K machine variant
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx_spectrum_48k.hpp"
#include "../loaders/sna_loader.hpp"
#include "../loaders/z80_loader.hpp"
#include "../loaders/tzx_loader.hpp"
#include "../loaders/tap_loader.hpp"
#include <cstring>

#include "roms.cpp"

namespace zxspec::zx48k {

// ============================================================================
// Constructor / Destructor
// ============================================================================

ZXSpectrum48::ZXSpectrum48() = default;
ZXSpectrum48::~ZXSpectrum48() = default;

// ============================================================================
// Initialization
// ============================================================================

void ZXSpectrum48::init()
{
    // Set machine configuration from the data table
    machineInfo_ = machines[eZXSpectrum48];

    // Base class allocates memory and wires up Z80
    baseInit();

    // Load ROM
    if (roms::ROM_48K_SIZE > 0 && roms::ROM_48K_SIZE <= memoryRom_.size())
    {
        std::memcpy(memoryRom_.data(), roms::ROM_48K, roms::ROM_48K_SIZE);
    }

    setupPaging();
}

// ============================================================================
// Reset
// ============================================================================

void ZXSpectrum48::reset()
{
    ZXSpectrum::reset();
    setupPaging();
}

// ============================================================================
// Memory paging (48K: simple linear layout)
// ============================================================================

void ZXSpectrum48::setupPaging()
{
    // 48K layout: ROM at page 0, RAM at pages 1/2/3
    pageRead_[0] = memoryRom_.data();
    pageRead_[1] = &memoryRam_[0 * MEM_PAGE_SIZE];
    pageRead_[2] = &memoryRam_[1 * MEM_PAGE_SIZE];
    pageRead_[3] = &memoryRam_[2 * MEM_PAGE_SIZE];

    pageWrite_[0] = nullptr;  // ROM is read-only
    pageWrite_[1] = &memoryRam_[0 * MEM_PAGE_SIZE];
    pageWrite_[2] = &memoryRam_[1 * MEM_PAGE_SIZE];
    pageWrite_[3] = &memoryRam_[2 * MEM_PAGE_SIZE];
}

// ============================================================================
// Screen memory
// ============================================================================

uint8_t* ZXSpectrum48::getScreenMemory()
{
    return &memoryRam_[0];
}

const uint8_t* ZXSpectrum48::getScreenMemory() const
{
    return &memoryRam_[0];
}

// ============================================================================
// Core memory read/write (called during CPU execution)
// ============================================================================

uint8_t ZXSpectrum48::coreMemoryRead(uint16_t address)
{
    int slot = address >> 14;
    return pageRead_[slot][address & 0x3FFF];
}

void ZXSpectrum48::coreMemoryWrite(uint16_t address, uint8_t data)
{
    int slot = address >> 14;
    if (!pageWrite_[slot]) return;  // ROM protection

    // Trigger display update if writing to screen memory area (skip during tape acceleration)
    if (!tapeAccelerating_)
    {
        uint16_t offset = address & 0x3FFF;
        if (slot == 1 && offset < 6912)
        {
            display_.updateWithTs(
                static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + machineInfo_.paperDrawingOffset),
                getScreenMemory(), borderColor_, frameCounter_);
        }
    }

    pageWrite_[slot][address & 0x3FFF] = data;
}

// ============================================================================
// Debug memory (no side effects — for debugger / public API)
// ============================================================================

uint8_t ZXSpectrum48::coreDebugRead(uint16_t address) const
{
    int slot = address >> 14;
    return pageRead_[slot][address & 0x3FFF];
}

void ZXSpectrum48::coreDebugWrite(uint16_t address, uint8_t data)
{
    int slot = address >> 14;
    if (pageWrite_[slot])
    {
        pageWrite_[slot][address & 0x3FFF] = data;
    }
}

// ============================================================================
// Memory contention (only slot 1 / 0x4000-0x7FFF is contended on 48K)
// ============================================================================

void ZXSpectrum48::coreMemoryContention(uint16_t address, uint32_t /*tstates*/)
{
    if (tapeAccelerating_) return;
    if ((address >> 14) == 1)
    {
        z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
    }
}

void ZXSpectrum48::coreNoMreqContention(uint16_t address, uint32_t /*tstates*/)
{
    if (tapeAccelerating_) return;
    if ((address >> 14) == 1)
    {
        z80_->addContentionTStates(contention_.ioContention(z80_->getTStates()));
    }
}

// ============================================================================
// IO Read (keyboard, floating bus, tape EAR bit)
// ============================================================================

uint8_t ZXSpectrum48::coreIORead(uint16_t address)
{
    if (!tapeAccelerating_)
    {
        bool contended = ((address >> 14) == 1);
        contention_.applyIOContention(*z80_, address, contended);
    }

    // AY-3-8912 data read: port 0xFFFD — (address & 0xC002) == 0xC000
    if (ayEnabled_ && (address & 0xC002) == 0xC000) {
        return ay_.readData();
    }

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
            // Issue 2: EAR OR MIC pulls bit 6 high (pin 28 voltage crosses 0.70V threshold)
            // Issue 3: only EAR (bit 4) controls bit 6; MIC (bit 3) alone stays below threshold
            uint8_t feedbackBit = (issueNumber_ == 2)
                ? (audio_.getEarBit() | audio_.getMicBit())
                : audio_.getEarBit();
            result = (result & 0xBF) | (feedbackBit << 6);
        }
        return result;
    }

    // Return floating bus value
    return display_.floatingBus(z80_->getTStates(), pageRead_[1]);
}

// ============================================================================
// IO Write (border colour and EAR/MIC)
// ============================================================================

void ZXSpectrum48::coreIOWrite(uint16_t address, uint8_t data)
{
    if (!tapeAccelerating_)
    {
        bool contended = ((address >> 14) == 1);
        contention_.applyIOContention(*z80_, address, contended);
    }

    // AY-3-8912 ports (128K-compatible scheme)
    if (ayEnabled_) {
        // Register select: port 0xFFFD — (address & 0xC002) == 0xC000
        if ((address & 0xC002) == 0xC000) {
            ay_.selectRegister(data);
        }
        // Data write: port 0xBFFD — (address & 0xC002) == 0x8000
        if ((address & 0xC002) == 0x8000) {
            ay_.writeData(data);
        }
    }

    // ULA owned (even) ports — border colour and EAR/MIC
    if ((address & 0x01) == 0)
    {
        if (!tapeAccelerating_)
        {
            display_.updateWithTs(
                static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + machineInfo_.borderDrawingOffset),
                getScreenMemory(), borderColor_, frameCounter_);
        }
        audio_.setEarBit((data >> 4) & 1);
        audio_.setMicBit((data >> 3) & 1);
        if (tapeRecording_) {
            recordMicTransition((data >> 3) & 1);
        }
        borderColor_ = data & 0x07;
    }
}

// ============================================================================
// Snapshot loading
// ============================================================================

void ZXSpectrum48::loadSNA(const uint8_t* data, uint32_t size)
{
    reset();
    zxspec::SNALoader::load(*this, data, size);
}

void ZXSpectrum48::loadZ80(const uint8_t* data, uint32_t size)
{
    reset();
    zxspec::Z80Loader::load(*this, data, size);
}

void ZXSpectrum48::loadTZX(const uint8_t* data, uint32_t size)
{
    reset();

    // The ROM must initialise system variables before we can load tape data.
    z80_->signalInterrupt();
    for (int f = 0; f < 300; f++)
    {
        z80_->execute(machineInfo_.tsPerFrame, machineInfo_.intLength);
        z80_->resetTStates(machineInfo_.tsPerFrame);
        z80_->signalInterrupt();

        uint16_t pc = z80_->getRegister(Z80::WordReg::PC);
        if (pc == 0x12A2) break;
    }
    audio_.reset();
    display_.frameReset();

    zxspec::TZXLoader::load(*this, data, size);

    // Trigger LOAD "" via the ROM, just as if the user had typed it.
    // The ROM's LOAD handler calls LD-BYTES at 0x0556 for each block;
    // our opcode-callback trap (handleTapeTrap) instantly copies the
    // tape data into memory — the same approach SpectREMCPP uses.
    uint16_t eLine = readMemory(23641) | (readMemory(23642) << 8);

    writeMemory(eLine, 0xEF);       // LOAD token
    writeMemory(eLine + 1, 0x22);   // "
    writeMemory(eLine + 2, 0x22);   // "
    writeMemory(eLine + 3, 0x0D);   // ENTER

    writeMemory(23620, 0xFF);       // NSPPC
    writeMemory(23645, eLine & 0xFF);
    writeMemory(23646, eLine >> 8); // CH_ADD

    z80_->setRegister(Z80::WordReg::PC, 0x1B8A);

    uint16_t sp = z80_->getRegister(Z80::WordReg::SP);
    sp -= 2;
    writeMemory(sp, 0xA2);
    writeMemory(sp + 1, 0x12);
    z80_->setRegister(Z80::WordReg::SP, sp);

    muteFrames_ = 10;
}

void ZXSpectrum48::loadTAP(const uint8_t* data, uint32_t size)
{
    zxspec::TAPLoader::load(*this, data, size);
}

void ZXSpectrum48::loadTZXTape(const uint8_t* data, uint32_t size)
{
    // Load TZX into tape player (no reset, no boot, no auto-play)
    zxspec::TZXLoader::load(*this, data, size);
    tapePulseActive_ = false;

    // Generate block info for UI (reuse TAP block info parser)
    zxspec::TAPLoader::parseBlockInfo(tapeBlocks_, tapeBlockInfo_);
}

} // namespace zxspec::zx48k
