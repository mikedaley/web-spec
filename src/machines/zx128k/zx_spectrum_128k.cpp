/*
 * zx_spectrum_128k.cpp - ZX Spectrum 128K machine variant
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx_spectrum_128k.hpp"
#include "../loaders/sna_loader.hpp"
#include "../loaders/z80_loader.hpp"
#include "../loaders/tzx_loader.hpp"
#include "../loaders/tap_loader.hpp"
#include <cstring>

#include "roms.cpp"

namespace zxspec::zx128k {

// ============================================================================
// Constructor / Destructor
// ============================================================================

ZXSpectrum128::ZXSpectrum128() = default;
ZXSpectrum128::~ZXSpectrum128() = default;

// ============================================================================
// Initialization
// ============================================================================

void ZXSpectrum128::init()
{
    // Set machine configuration from the data table
    machineInfo_ = machines[eZXSpectrum128];

    // Base class allocates memory and wires up Z80
    baseInit();

    // Load both ROMs (ROM 0 = 128K editor, ROM 1 = 48K BASIC)
    if (roms::ROM_128K_0_SIZE > 0 && roms::ROM_128K_0_SIZE <= MEM_PAGE_SIZE)
    {
        std::memcpy(memoryRom_.data(), roms::ROM_128K_0, roms::ROM_128K_0_SIZE);
    }
    if (roms::ROM_128K_1_SIZE > 0 && roms::ROM_128K_1_SIZE <= MEM_PAGE_SIZE)
    {
        std::memcpy(memoryRom_.data() + MEM_PAGE_SIZE, roms::ROM_128K_1, roms::ROM_128K_1_SIZE);
    }

    // Default paging: ROM 0, RAM bank 0 at slot 3, screen bank 5
    pagingRegister_ = 0;
    pagingDisabled_ = false;
    updatePaging();
}

// ============================================================================
// Reset
// ============================================================================

void ZXSpectrum128::reset()
{
    ZXSpectrum::reset();
    pagingRegister_ = 0;
    pagingDisabled_ = false;
    updatePaging();
}

// ============================================================================
// Memory paging (128K: switchable ROM + RAM banks via port 0x7FFD)
//
// Slot 0 (0x0000-0x3FFF): ROM — switchable between ROM 0 (128K editor) and ROM 1 (48K BASIC)
// Slot 1 (0x4000-0x7FFF): RAM bank 5 (always)
// Slot 2 (0x8000-0xBFFF): RAM bank 2 (always)
// Slot 3 (0xC000-0xFFFF): RAM bank 0-7 (switchable via bits 0-2 of port 0x7FFD)
// ============================================================================

void ZXSpectrum128::updatePaging()
{
    // ROM select: bit 4 of paging register (0 = ROM 0, 1 = ROM 1)
    uint8_t romBank = (pagingRegister_ & 0x10) ? 1 : 0;
    pageRead_[0] = memoryRom_.data() + (romBank * MEM_PAGE_SIZE);
    pageWrite_[0] = nullptr;  // ROM is read-only

    // Slot 1: always RAM bank 5
    pageRead_[1] = &memoryRam_[5 * MEM_PAGE_SIZE];
    pageWrite_[1] = &memoryRam_[5 * MEM_PAGE_SIZE];

    // Slot 2: always RAM bank 2
    pageRead_[2] = &memoryRam_[2 * MEM_PAGE_SIZE];
    pageWrite_[2] = &memoryRam_[2 * MEM_PAGE_SIZE];

    // Slot 3: RAM bank selected by bits 0-2
    uint8_t ramBank = pagingRegister_ & 0x07;
    pageRead_[3] = &memoryRam_[ramBank * MEM_PAGE_SIZE];
    pageWrite_[3] = &memoryRam_[ramBank * MEM_PAGE_SIZE];
}

void ZXSpectrum128::setPagingRegister(uint8_t value)
{
    pagingRegister_ = value;
    pagingDisabled_ = (value & 0x20) != 0;
    updatePaging();
}

void ZXSpectrum128::writeRamBank(uint8_t bank, uint16_t offset, uint8_t data)
{
    if (bank < 8 && offset < MEM_PAGE_SIZE)
    {
        memoryRam_[bank * MEM_PAGE_SIZE + offset] = data;
    }
}

// ============================================================================
// Screen memory
// ============================================================================

uint8_t* ZXSpectrum128::getScreenMemory()
{
    // Bit 3 of paging register selects screen bank: 0 = bank 5, 1 = bank 7
    uint8_t screenBank = (pagingRegister_ & 0x08) ? 7 : 5;
    return &memoryRam_[screenBank * MEM_PAGE_SIZE];
}

const uint8_t* ZXSpectrum128::getScreenMemory() const
{
    uint8_t screenBank = (pagingRegister_ & 0x08) ? 7 : 5;
    return &memoryRam_[screenBank * MEM_PAGE_SIZE];
}

// ============================================================================
// Core memory read/write (called during CPU execution)
// ============================================================================

uint8_t ZXSpectrum128::coreMemoryRead(uint16_t address)
{
    int slot = address >> 14;
    return pageRead_[slot][address & 0x3FFF];
}

void ZXSpectrum128::coreMemoryWrite(uint16_t address, uint8_t data)
{
    int slot = address >> 14;
    if (!pageWrite_[slot]) return;  // ROM protection

    // Slot 1 (bank 5) always gets display catch-up unconditionally,
    // matching SpectREMCPP behaviour. This is simpler and correct because
    // bank 5 is the default screen and writes anywhere in it could affect
    // the display (pixel data or attributes).
    if (slot == 1 && !tapeAccelerating_)
    {
        display_.updateWithTs(
            static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + machineInfo_.paperDrawingOffset),
            getScreenMemory(), borderColor_, frameCounter_);
    }

    pageWrite_[slot][address & 0x3FFF] = data;
}

// ============================================================================
// Debug memory (no side effects -- for debugger / public API)
// ============================================================================

uint8_t ZXSpectrum128::coreDebugRead(uint16_t address) const
{
    int slot = address >> 14;
    return pageRead_[slot][address & 0x3FFF];
}

void ZXSpectrum128::coreDebugWrite(uint16_t address, uint8_t data)
{
    int slot = address >> 14;
    if (pageWrite_[slot])
    {
        pageWrite_[slot][address & 0x3FFF] = data;
    }
}

// ============================================================================
// Memory contention
//
// On the 128K Spectrum, odd-numbered RAM banks (1, 3, 5, 7) are contended.
// Slot 1 (0x4000-0x7FFF) always holds bank 5 -- always contended.
// Slot 3 (0xC000-0xFFFF) is contended when an odd bank is paged in.
// Slot 0 (ROM) and Slot 2 (bank 2) are never contended.
// ============================================================================

void ZXSpectrum128::coreMemoryContention(uint16_t address, uint32_t /*tstates*/)
{
    if (tapeAccelerating_) return;

    int slot = address >> 14;
    bool contended = false;

    if (slot == 1)
    {
        // Slot 1 = bank 5 (odd) -- always contended
        contended = true;
    }
    else if (slot == 3)
    {
        // Slot 3 = paged bank -- contended if odd
        contended = (pagingRegister_ & 0x01) != 0;
    }

    if (contended)
    {
        z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
    }
}

void ZXSpectrum128::coreNoMreqContention(uint16_t address, uint32_t /*tstates*/)
{
    if (tapeAccelerating_) return;

    int slot = address >> 14;
    bool contended = false;

    if (slot == 1)
    {
        contended = true;
    }
    else if (slot == 3)
    {
        contended = (pagingRegister_ & 0x01) != 0;
    }

    if (contended)
    {
        z80_->addContentionTStates(contention_.ioContention(z80_->getTStates()));
    }
}

// ============================================================================
// IO Read (keyboard, AY, floating bus, tape EAR bit)
// ============================================================================

uint8_t ZXSpectrum128::coreIORead(uint16_t address)
{
    if (!tapeAccelerating_)
    {
        int slot = address >> 14;
        bool contended = (slot == 1) || (slot == 3 && (pagingRegister_ & 0x01));
        contention_.applyIOContention(*z80_, address, contended);
    }

    // ULA un-owned (odd) ports
    if (address & 0x01)
    {
        // Kempston joystick: port 0x1F (format: 000FDULR)
        // Checked first as it takes priority over keyboard on a real machine
        if ((address & 0xFF) == 0x1F)
        {
            return 0x00;
        }

        // AY-3-8912 data read: port 0xFFFD -- (address & 0xC002) == 0xC000
        if ((address & 0xC002) == 0xC000)
        {
            return ay_.readData();
        }

        // Port 0x7FFD read-side bug: reading from the paging port actually
        // performs a write of the floating bus value to the paging register
        if ((address & 0x8002) == 0 && !pagingDisabled_)
        {
            uint8_t floatingBusData = display_.floatingBus(z80_->getTStates(), pageRead_[1]);
            // Apply the screen bank change display catch-up via the same path as coreIOWrite
            uint8_t newScreenBank = (floatingBusData & 0x08) ? 7 : 5;
            uint8_t oldScreenBank = (pagingRegister_ & 0x08) ? 7 : 5;
            if (newScreenBank != oldScreenBank && !tapeAccelerating_)
            {
                display_.updateWithTs(
                    static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + machineInfo_.borderDrawingOffset),
                    getScreenMemory(), borderColor_, frameCounter_);
            }
            pagingRegister_ = floatingBusData;
            if (floatingBusData & 0x20) pagingDisabled_ = true;
            updatePaging();
        }

        // Unhandled odd port -- return floating bus value
        return display_.floatingBus(z80_->getTStates(), pageRead_[1]);
    }

    // ULA owned (even) ports -- keyboard
    uint8_t result = 0xFF;
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
        // 128K is always Issue 3 equivalent
        uint8_t feedbackBit = audio_.getEarBit();
        result = (result & 0xBF) | (feedbackBit << 6);
    }
    return result;
}

// ============================================================================
// IO Write (paging register, AY, border colour and EAR/MIC)
// ============================================================================

void ZXSpectrum128::coreIOWrite(uint16_t address, uint8_t data)
{
    if (!tapeAccelerating_)
    {
        int slot = address >> 14;
        bool contended = (slot == 1) || (slot == 3 && (pagingRegister_ & 0x01));
        contention_.applyIOContention(*z80_, address, contended);
    }

    // Memory paging: port 0x7FFD -- (address & 0x8002) == 0
    // Only when paging has not been disabled (bit 5 latches until reset)
    if ((address & 0x8002) == 0 && !pagingDisabled_)
    {
        // If the screen bank is about to change, catch up the display first
        // so the current frame renders correctly up to this point
        uint8_t newScreenBank = (data & 0x08) ? 7 : 5;
        uint8_t oldScreenBank = (pagingRegister_ & 0x08) ? 7 : 5;
        if (newScreenBank != oldScreenBank && !tapeAccelerating_)
        {
            display_.updateWithTs(
                static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + machineInfo_.borderDrawingOffset),
                getScreenMemory(), borderColor_, frameCounter_);
        }
        pagingRegister_ = data;
        if (data & 0x20) pagingDisabled_ = true;
        updatePaging();
    }

    // AY-3-8912 ports
    // Register select: port 0xFFFD -- (address & 0xC002) == 0xC000
    if ((address & 0xC002) == 0xC000)
    {
        ay_.selectRegister(data);
    }
    // Data write: port 0xBFFD -- (address & 0xC002) == 0x8000
    if ((address & 0xC002) == 0x8000)
    {
        ay_.writeData(data);
    }

    // ULA owned (even) ports -- border colour and EAR/MIC
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

void ZXSpectrum128::loadSNA(const uint8_t* data, uint32_t size)
{
    reset();
    zxspec::SNALoader::load(*this, data, size);
}

void ZXSpectrum128::loadZ80(const uint8_t* data, uint32_t size)
{
    reset();
    zxspec::Z80Loader::load(*this, data, size);
}

void ZXSpectrum128::loadTZX(const uint8_t* data, uint32_t size)
{
    reset();

    // The ROM must initialise system variables before we can load tape data.
    // For 128K, we need to switch to 48K BASIC mode first (page in ROM 1).
    // Write to port 0x7FFD: bit 4 = 1 (ROM 1 = 48K BASIC)
    pagingRegister_ = 0x10;
    pagingDisabled_ = false;
    updatePaging();

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

    // Trigger LOAD "" via the ROM
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

void ZXSpectrum128::loadTAP(const uint8_t* data, uint32_t size)
{
    zxspec::TAPLoader::load(*this, data, size);
}

void ZXSpectrum128::loadTZXTape(const uint8_t* data, uint32_t size)
{
    // Load TZX into tape player (no reset, no boot, no auto-play)
    zxspec::TZXLoader::load(*this, data, size);
    tapePulseActive_ = false;

    // Generate block info for UI (reuse TAP block info parser)
    zxspec::TAPLoader::parseBlockInfo(tapeBlocks_, tapeBlockInfo_);
}

} // namespace zxspec::zx128k
