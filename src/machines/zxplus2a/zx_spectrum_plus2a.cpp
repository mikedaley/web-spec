/*
 * zx_spectrum_plus2a.cpp - ZX Spectrum 128K +2A machine variant
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx_spectrum_plus2a.hpp"
#include "../loaders/sna_loader.hpp"
#include "../loaders/z80_loader.hpp"
#include "../loaders/tzx_loader.hpp"
#include "../loaders/tap_loader.hpp"
#include <cstring>

#include "roms.cpp"

namespace zxspec::zxplus2a {

// Special paging RAM configurations (port 0x1FFD bits 2:1)
// Each config maps slots 0-3 to specific RAM banks
static constexpr uint8_t specialConfigs[4][4] = {
    { 0, 1, 2, 3 },  // Config 0
    { 4, 5, 6, 7 },  // Config 1
    { 4, 5, 6, 3 },  // Config 2
    { 4, 7, 6, 3 },  // Config 3
};

// ============================================================================
// Constructor / Destructor
// ============================================================================

ZXSpectrumPlus2A::ZXSpectrumPlus2A() = default;
ZXSpectrumPlus2A::~ZXSpectrumPlus2A() = default;

// ============================================================================
// Initialization
// ============================================================================

void ZXSpectrumPlus2A::init()
{
    // Set machine configuration from the data table
    machineInfo_ = machines[eZXSpectrum128_2A];

    // Base class allocates memory and wires up Z80
    baseInit();

    // Load all 4 ROM banks (64KB total)
    if (roms::ROM_PLUS2A_SIZE > 0 && roms::ROM_PLUS2A_SIZE <= 4 * MEM_PAGE_SIZE)
    {
        std::memcpy(memoryRom_.data(), roms::ROM_PLUS2A, roms::ROM_PLUS2A_SIZE);
    }

    // Load Spectranet ROM into flash if available
    if (roms::ROM_SPECTRANET_SIZE > 0)
    {
        spectranet_.loadROM(roms::ROM_SPECTRANET, static_cast<uint32_t>(roms::ROM_SPECTRANET_SIZE));
    }

    // Default paging state
    pagingRegister_ = 0;
    pagingRegister1FFD_ = 0;
    pagingDisabled_ = false;
    specialPaging_ = false;
    updatePaging();
}

// ============================================================================
// Reset
// ============================================================================

void ZXSpectrumPlus2A::reset()
{
    ZXSpectrum::reset();
    pagingRegister_ = 0;
    pagingRegister1FFD_ = 0;
    pagingDisabled_ = false;
    specialPaging_ = false;
    updatePaging();
}

void ZXSpectrumPlus2A::reloadSpectranetROM()
{
    if (roms::ROM_SPECTRANET_SIZE > 0) {
        spectranet_.loadROM(roms::ROM_SPECTRANET, static_cast<uint32_t>(roms::ROM_SPECTRANET_SIZE));
    }
}

// ============================================================================
// Memory paging
//
// Normal mode (0x1FFD bit 0 = 0):
//   Slot 0: ROM — selected by combining 0x7FFD bit 4 (low) and 0x1FFD bit 2 (high)
//     ROM 0 = 128K editor,  ROM 1 = 128K syntax checker
//     ROM 2 = +2A extension, ROM 3 = 48K BASIC
//   Slot 1: RAM bank 5 (always)
//   Slot 2: RAM bank 2 (always)
//   Slot 3: RAM bank 0-7 (switchable via 0x7FFD bits 0-2)
//
// Special mode (0x1FFD bit 0 = 1):
//   All four slots are RAM, configuration selected by 0x1FFD bits 2:1
//   Config 0: banks 0, 1, 2, 3
//   Config 1: banks 4, 5, 6, 7
//   Config 2: banks 4, 5, 6, 3
//   Config 3: banks 4, 7, 6, 3
// ============================================================================

void ZXSpectrumPlus2A::updatePaging()
{
    if (specialPaging_)
    {
        // Special all-RAM mode
        uint8_t config = (pagingRegister1FFD_ >> 1) & 0x03;
        for (int slot = 0; slot < 4; slot++)
        {
            uint8_t bank = specialConfigs[config][slot];
            pageRead_[slot] = &memoryRam_[bank * MEM_PAGE_SIZE];
            pageWrite_[slot] = &memoryRam_[bank * MEM_PAGE_SIZE];
        }
    }
    else
    {
        // Normal paging mode
        // ROM select: 0x7FFD bit 4 (low bit) + 0x1FFD bit 2 (high bit)
        uint8_t romBank = ((pagingRegister_ & 0x10) >> 4) | ((pagingRegister1FFD_ & 0x04) >> 1);
        pageRead_[0] = memoryRom_.data() + (romBank * MEM_PAGE_SIZE);
        pageWrite_[0] = nullptr;  // ROM is read-only

        // Slot 1: always RAM bank 5
        pageRead_[1] = &memoryRam_[5 * MEM_PAGE_SIZE];
        pageWrite_[1] = &memoryRam_[5 * MEM_PAGE_SIZE];

        // Slot 2: always RAM bank 2
        pageRead_[2] = &memoryRam_[2 * MEM_PAGE_SIZE];
        pageWrite_[2] = &memoryRam_[2 * MEM_PAGE_SIZE];

        // Slot 3: RAM bank selected by 0x7FFD bits 0-2
        uint8_t ramBank = pagingRegister_ & 0x07;
        pageRead_[3] = &memoryRam_[ramBank * MEM_PAGE_SIZE];
        pageWrite_[3] = &memoryRam_[ramBank * MEM_PAGE_SIZE];
    }
}

void ZXSpectrumPlus2A::setPagingRegister(uint8_t value)
{
    pagingRegister_ = value;
    pagingDisabled_ = (value & 0x20) != 0;
    updatePaging();
}

void ZXSpectrumPlus2A::writeRamBank(uint8_t bank, uint16_t offset, uint8_t data)
{
    if (bank < 8 && offset < MEM_PAGE_SIZE)
    {
        memoryRam_[bank * MEM_PAGE_SIZE + offset] = data;
    }
}

uint8_t ZXSpectrumPlus2A::readRamBank(uint8_t bank, uint16_t offset) const
{
    if (bank < 8 && offset < MEM_PAGE_SIZE)
    {
        return memoryRam_[bank * MEM_PAGE_SIZE + offset];
    }
    return 0xFF;
}

// ============================================================================
// Contention helpers
//
// On the +2A, RAM banks 4, 5, 6, 7 are contended (not odd-numbered banks).
// ============================================================================

bool ZXSpectrumPlus2A::isRamBankContended(uint8_t bank) const
{
    return bank >= 4;
}

// ============================================================================
// Screen memory
// ============================================================================

uint8_t* ZXSpectrumPlus2A::getScreenMemory()
{
    uint8_t screenBank = (pagingRegister_ & 0x08) ? 7 : 5;
    return &memoryRam_[screenBank * MEM_PAGE_SIZE];
}

const uint8_t* ZXSpectrumPlus2A::getScreenMemory() const
{
    uint8_t screenBank = (pagingRegister_ & 0x08) ? 7 : 5;
    return &memoryRam_[screenBank * MEM_PAGE_SIZE];
}

// ============================================================================
// Core memory read/write
// ============================================================================

uint8_t ZXSpectrumPlus2A::coreMemoryRead(uint16_t address)
{
    int slot = address >> 14;

    // Spectranet intercepts slot 0 when paged in (normal mode only)
    if (slot == 0 && !specialPaging_ && spectranetEnabled_ && spectranet_.isPagedIn()) {
        return spectranet_.memoryRead(address);
    }

    return pageRead_[slot][address & 0x3FFF];
}

void ZXSpectrumPlus2A::coreMemoryWrite(uint16_t address, uint8_t data)
{
    int slot = address >> 14;

    // Spectranet intercepts slot 0 when paged in (normal mode only)
    if (slot == 0 && !specialPaging_ && spectranetEnabled_ && spectranet_.isPagedIn()) {
        spectranet_.memoryWrite(address, data);
        return;
    }

    if (!pageWrite_[slot]) return;  // ROM protection

    // Slot 1 (bank 5) always gets display catch-up
    if (slot == 1 && !tapeAccelerating_)
    {
        display_.updateWithTs(
            static_cast<int32_t>((z80_->getTStates() - display_.getCurrentDisplayTs()) + machineInfo_.paperDrawingOffset),
            getScreenMemory(), borderColor_, frameCounter_);
    }

    uint8_t oldValue = pageWrite_[slot][address & 0x3FFF];
    pageWrite_[slot][address & 0x3FFF] = data;

    if (!tapeAccelerating_)
    {
        patchScreenForUdgWrite(address, oldValue, data);
    }
}

// ============================================================================
// Debug memory (no side effects)
// ============================================================================

uint8_t ZXSpectrumPlus2A::coreDebugRead(uint16_t address) const
{
    int slot = address >> 14;

    if (slot == 0 && !specialPaging_ && spectranetEnabled_ && spectranet_.isPagedIn()) {
        return spectranet_.memoryRead(address);
    }

    return pageRead_[slot][address & 0x3FFF];
}

void ZXSpectrumPlus2A::coreDebugWrite(uint16_t address, uint8_t data)
{
    int slot = address >> 14;

    if (slot == 0 && !specialPaging_ && spectranetEnabled_ && spectranet_.isPagedIn()) {
        spectranet_.memoryWrite(address, data);
        return;
    }

    if (pageWrite_[slot])
    {
        pageWrite_[slot][address & 0x3FFF] = data;
    }
}

// ============================================================================
// Memory contention
//
// On the +2A, banks 4, 5, 6, 7 are contended.
// In normal mode: slot 1 (bank 5) and slot 3 (if bank 4-7 paged) are contended.
// In special mode: check which bank is mapped to each slot.
// ============================================================================

void ZXSpectrumPlus2A::coreMemoryContention(uint16_t address, uint32_t /*tstates*/)
{
    if (tapeAccelerating_) return;

    int slot = address >> 14;
    bool contended = false;

    if (specialPaging_)
    {
        uint8_t config = (pagingRegister1FFD_ >> 1) & 0x03;
        contended = isRamBankContended(specialConfigs[config][slot]);
    }
    else
    {
        if (slot == 1)
        {
            // Bank 5 — always contended on +2A
            contended = true;
        }
        else if (slot == 3)
        {
            // Contended if bank 4-7 is paged in
            contended = isRamBankContended(pagingRegister_ & 0x07);
        }
    }

    if (contended)
    {
        z80_->addContentionTStates(contention_.memoryContention(z80_->getTStates()));
    }
}

void ZXSpectrumPlus2A::coreNoMreqContention(uint16_t address, uint32_t /*tstates*/)
{
    if (tapeAccelerating_) return;

    int slot = address >> 14;
    bool contended = false;

    if (specialPaging_)
    {
        uint8_t config = (pagingRegister1FFD_ >> 1) & 0x03;
        contended = isRamBankContended(specialConfigs[config][slot]);
    }
    else
    {
        if (slot == 1)
        {
            contended = true;
        }
        else if (slot == 3)
        {
            contended = isRamBankContended(pagingRegister_ & 0x07);
        }
    }

    if (contended)
    {
        z80_->addContentionTStates(contention_.ioContention(z80_->getTStates()));
    }
}

// ============================================================================
// IO Read
// ============================================================================

uint8_t ZXSpectrumPlus2A::coreIORead(uint16_t address)
{
    if (!tapeAccelerating_)
    {
        int slot = address >> 14;
        bool contended = false;
        if (specialPaging_)
        {
            uint8_t config = (pagingRegister1FFD_ >> 1) & 0x03;
            contended = isRamBankContended(specialConfigs[config][slot]);
        }
        else
        {
            contended = (slot == 1) || (slot == 3 && isRamBankContended(pagingRegister_ & 0x07));
        }
        contention_.applyIOContention(*z80_, address, contended);
    }

    // Spectranet ports (low byte 0x3B)
    if (spectranetEnabled_ && spectranet_.isSpectranetPort(address)) {
        return spectranet_.ioRead(address, borderColor_, pagingRegister_);
    }

    // ULA un-owned (odd) ports
    if (address & 0x01)
    {
        // Kempston joystick: port 0x1F
        if ((address & 0xFF) == 0x1F)
        {
            return 0x00;
        }

        // AY-3-8912 data read: port 0xFFFD
        if ((address & 0xC002) == 0xC000)
        {
            return ay_.readData();
        }

        // +2A does NOT have the floating bus paging bug of the 128K/+2.
        // The floating bus on the +2A always returns 0xFF.
        return 0xFF;
    }

    // ULA owned (even) ports — keyboard
    uint8_t result = 0xFF;
    for (int i = 0; i < 8; i++)
    {
        if (!(address & (0x100 << i)))
        {
            result &= keyboardMatrix_[i];
        }
    }
    // Bit 6 reflects the EAR input
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
        uint8_t feedbackBit = audio_.getEarBit();
        result = (result & 0xBF) | (feedbackBit << 6);
    }
    return result;
}

// ============================================================================
// IO Write
// ============================================================================

void ZXSpectrumPlus2A::coreIOWrite(uint16_t address, uint8_t data)
{
    if (!tapeAccelerating_)
    {
        int slot = address >> 14;
        bool contended = false;
        if (specialPaging_)
        {
            uint8_t config = (pagingRegister1FFD_ >> 1) & 0x03;
            contended = isRamBankContended(specialConfigs[config][slot]);
        }
        else
        {
            contended = (slot == 1) || (slot == 3 && isRamBankContended(pagingRegister_ & 0x07));
        }
        contention_.applyIOContention(*z80_, address, contended);
    }

    // Spectranet ports (low byte 0x3B)
    if (spectranetEnabled_ && spectranet_.isSpectranetPort(address)) {
        spectranet_.ioWrite(address, data);
        return;
    }

    // Memory paging: port 0x7FFD — (address & 0xC002) == 0x4000
    // +2A uses stricter decoding than 128K/+2: A15=0, A14=1, A1=0
    // This prevents port 0x1FFD from also matching as a 0x7FFD write
    if ((address & 0xC002) == 0x4000 && !pagingDisabled_)
    {
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

    // +2A additional paging: port 0x1FFD — (address & 0xF002) == 0x1000
    if ((address & 0xF002) == 0x1000 && !pagingDisabled_)
    {
        pagingRegister1FFD_ = data;
        specialPaging_ = (data & 0x01) != 0;
        updatePaging();
    }

    // AY-3-8912 ports
    if ((address & 0xC002) == 0xC000)
    {
        ay_.selectRegister(data);
    }
    if ((address & 0xC002) == 0x8000)
    {
        ay_.writeData(data);
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

void ZXSpectrumPlus2A::loadSNA(const uint8_t* data, uint32_t size)
{
    reset();
    zxspec::SNALoader::load(*this, data, size);
}

void ZXSpectrumPlus2A::loadZ80(const uint8_t* data, uint32_t size)
{
    reset();
    zxspec::Z80Loader::load(*this, data, size);
}

void ZXSpectrumPlus2A::loadTZX(const uint8_t* data, uint32_t size)
{
    reset();

    // Switch to 48K BASIC mode (ROM 3) for tape loading
    // 0x7FFD bit 4 = 1 (ROM low bit), 0x1FFD bit 2 = 1 (ROM high bit) → ROM 3
    pagingRegister_ = 0x10;
    pagingRegister1FFD_ = 0x04;
    pagingDisabled_ = false;
    specialPaging_ = false;
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

void ZXSpectrumPlus2A::loadTAP(const uint8_t* data, uint32_t size)
{
    zxspec::TAPLoader::load(*this, data, size);
}

void ZXSpectrumPlus2A::loadTZXTape(const uint8_t* data, uint32_t size)
{
    zxspec::TZXLoader::load(*this, data, size);
    tapePulseActive_ = false;
    zxspec::TAPLoader::parseBlockInfo(tapeBlocks_, tapeBlockInfo_);
}

} // namespace zxspec::zxplus2a
