/*
 * zx_spectrum.cpp - ZX Spectrum base class (shared emulation logic)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "zx_spectrum.hpp"
#include "loaders/tzx_loader.hpp"
#include "basic/sinclair_basic.hpp"
#include <cstring>
#include <random>

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

    // Derive the exact frames-per-second from the CPU clock and T-states per frame.
    // For the 48K: 3,500,000 / 69,888 ≈ 50.08 Hz (not exactly 50 Hz).
    // For 128K:    3,500,000 / 70,908 ≈ 49.36 Hz.
    double fps = CPU_CLOCK_HZ / static_cast<double>(machineInfo_.tsPerFrame);

    audio_.setup(AUDIO_SAMPLE_RATE, fps, machineInfo_.tsPerFrame);
    ay_.setup(AUDIO_SAMPLE_RATE, fps, machineInfo_.tsPerFrame);
    contention_.init(machineInfo_);
    display_.init(machineInfo_);

    // 128K machines have AY built-in
    if (machineInfo_.hasAY) {
        ayEnabled_ = true;
    }

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
    ay_.reset();
    ayMixOffset_ = 0;
    keyboardMatrix_.fill(0xBF);
    display_.frameReset();
    paused_ = false;

    // Fill RAM with random data (mimics real hardware power-on state)
    std::random_device rd;
    std::mt19937 rng(rd());
    std::uniform_int_distribution<int> dist(0, 255);
    for (auto& byte : memoryRam_) {
        byte = static_cast<uint8_t>(dist(rng));
    }

    // Stop any active recording
    tapeRecording_ = false;
    recordPulses_.clear();
    recordedTapData_.clear();
    recordedBlocks_.clear();
    recordedBlockInfo_.clear();
    recordCurrentBlockData_.clear();
    recordDecodeState_ = REC_IDLE;
    recordAbsoluteTs_ = 0;

    // Reset tape playback position but keep loaded tape data
    tapeBlockIndex_ = 0;
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

            if (tapeRecording_) recordAbsoluteTs_ += machineInfo_.tsPerFrame;
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

    // Normal speed frame — execute one instruction at a time, updating audio
    // after each instruction to capture beeper bit-banging at full resolution.
    // Display is updated lazily (by the machine variant's I/O write handler)
    // only when the border colour or screen memory changes.
    while (z80_->getTStates() < machineInfo_.tsPerFrame && !paused_)
    {
        uint32_t before = z80_->getTStates();
        z80_->execute(1, machineInfo_.intLength);
        int32_t delta = static_cast<int32_t>(z80_->getTStates() - before);

        // Advance tape playback by the elapsed T-states so the EAR bit
        // reflects the correct pulse level when the CPU reads port 0xFE
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

        // Feed the instruction's T-states into the audio accumulator
        audio_.update(delta);
        if (ayEnabled_) ay_.update(delta);
    }

    if (paused_) return;

    // Advance tape playback to the exact end of frame before the T-state
    // counter is reset, so no tape pulses are lost at the frame boundary
    if (tapePulseActive_ && tapePulseIndex_ < tapePulses_.size())
    {
        uint32_t curTs = z80_->getTStates();
        if (curTs >= lastTapeReadTs_)
            advanceTape(curTs - lastTapeReadTs_);
        lastTapeReadTs_ = 0;
    }

    if (tapeRecording_) recordAbsoluteTs_ += machineInfo_.tsPerFrame;

    // Reset the T-state counter for the next frame. Any T-states that overshot
    // the frame boundary (because the last instruction straddled it) are preserved
    // as a negative offset, so the next frame starts at the correct position.
    z80_->resetTStates(machineInfo_.tsPerFrame);

    // Signal the maskable interrupt, which the ULA generates at the start of
    // each frame (during vertical blank). The interrupt lasts for intLength
    // T-states (32 for 48K, 36 for 128K).
    z80_->signalInterrupt();

    audio_.frameEnd();

    // Mix AY output into beeper buffer (only new samples since last mix)
    if (ayEnabled_) {
        ay_.frameEnd();
        int aySamples = ay_.getSampleCount();
        int beeperSamples = audio_.getSampleCount();
        int mixEnd = (aySamples < beeperSamples) ? aySamples : beeperSamples;
        float* beeperBuf = audio_.getMutableBuffer();
        const float* ayBuf = ay_.getBuffer();
        for (int i = ayMixOffset_; i < mixEnd; i++) {
            beeperBuf[i] += ayBuf[i];
        }
        ayMixOffset_ = beeperSamples;
    }

    if (muteFrames_ > 0)
    {
        audio_.resetBuffer();
        ay_.resetBuffer();
        ayMixOffset_ = 0;
        muteFrames_--;
    }

    // Catch up display rendering to the end of the frame. Any scanlines not yet
    // rendered (because no border/screen writes occurred during them) are drawn
    // now with the final border colour and current screen memory contents.
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

void ZXSpectrum::renderDisplay()
{
    // Reset display position to start so we re-render the ENTIRE screen
    // from current memory state (not just the remaining scanlines).
    // This ensures PRINT output that wrote to already-rendered scanlines
    // is visible when pausing mid-frame for BASIC stepping.
    display_.frameReset();
    display_.updateWithTs(
        static_cast<int32_t>(machineInfo_.tsPerFrame),
        getScreenMemory(), borderColor_, frameCounter_);
    display_.frameReset();
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
    ay_.resetBuffer();
    ayMixOffset_ = 0;
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

    if (breakpoints_.empty() && !tapeActive_ && !basicProgramActive_) {
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

int ZXSpectrum::getBreakpointCount() const
{
    return static_cast<int>(breakpoints_.size());
}

std::string ZXSpectrum::getBreakpointListJson() const
{
    std::string json = "[";
    bool first = true;
    for (uint16_t addr : breakpoints_) {
        if (!first) json += ",";
        first = false;
        bool enabled = (disabledBreakpoints_.find(addr) == disabledBreakpoints_.end());
        json += "{\"addr\":";
        json += std::to_string(addr);
        json += ",\"enabled\":";
        json += enabled ? "true" : "false";
        json += "}";
    }
    json += "]";
    return json;
}

// ============================================================================
// Step-over / Step-out
// ============================================================================

static uint8_t stepReadByte(uint16_t addr, void* ctx)
{
    return static_cast<ZXSpectrum*>(ctx)->readMemory(addr);
}

void ZXSpectrum::stepOver()
{
    uint16_t pc = getPC();
    uint8_t opcode = readMemory(pc);

    // Check for CALL instructions (unconditional and conditional)
    bool isCall = (opcode == 0xCD) || (opcode == 0xC4) || (opcode == 0xCC) ||
                  (opcode == 0xD4) || (opcode == 0xDC) || (opcode == 0xE4) ||
                  (opcode == 0xEC) || (opcode == 0xF4) || (opcode == 0xFC);
    // Check for RST instructions (0xC7, 0xCF, 0xD7, 0xDF, 0xE7, 0xEF, 0xF7, 0xFF)
    bool isRst = (opcode & 0xC7) == 0xC7 && opcode != 0xC7;

    if (isCall || isRst) {
        uint8_t instrLen = z80InstructionLength(pc, stepReadByte, this);
        uint16_t nextAddr = (pc + instrLen) & 0xFFFF;

        // Set temp breakpoint at the instruction after the CALL/RST
        tempBreakpointActive_ = true;
        tempBreakpointAddr_ = nextAddr;
        addBreakpoint(nextAddr);

        // Resume execution
        clearBreakpointHit();
        paused_ = false;
    } else {
        // Not a CALL/RST - just single-step
        clearBreakpointHit();
        stepInstruction();
    }
}

void ZXSpectrum::stepOut()
{
    uint16_t sp = getSP();
    // Read return address from stack (little-endian)
    uint8_t lo = readMemory(sp);
    uint8_t hi = readMemory((sp + 1) & 0xFFFF);
    uint16_t retAddr = (hi << 8) | lo;

    // Set temp breakpoint at the return address
    tempBreakpointActive_ = true;
    tempBreakpointAddr_ = retAddr;
    addBreakpoint(retAddr);

    // Resume execution
    clearBreakpointHit();
    paused_ = false;
}

void ZXSpectrum::clearTempBreakpoint()
{
    if (tempBreakpointActive_) {
        removeBreakpoint(tempBreakpointAddr_);
        tempBreakpointActive_ = false;
    }
}

// ============================================================================
// BASIC Breakpoint Support
// ============================================================================

// EACH_S_2 (0x1B29): fires before each BASIC statement executes
static constexpr uint16_t EACH_S_2_ADDR = 0x1B29;

// MAIN_4 (0x1303): ROM entry point reached after every report/error.
// When a BASIC program ends (0 OK, errors, STOP, BREAK) the ROM always
// arrives here.  It is NOT reached during scroll?, INPUT, or PAUSE waits.
static constexpr uint16_t MAIN_4_ADDR = 0x1303;

void ZXSpectrum::setBasicBreakpointStep()
{
    basicBpMode_ = BasicBpMode::STEP;
    basicBpHit_ = false;

    // If currently stopped at EACH_S_2, step past it first
    if (breakpointHit_ && breakpointAddress_ == EACH_S_2_ADDR) {
        removeBreakpoint(EACH_S_2_ADDR);
        breakpointHit_ = false;
        paused_ = false;
        stepInstruction();
    } else {
        breakpointHit_ = false;
    }

    addBreakpoint(EACH_S_2_ADDR);
    paused_ = false;
}

void ZXSpectrum::setBasicBreakpointRun()
{
    basicBpMode_ = BasicBpMode::RUN;
    basicBpHit_ = false;

    // If currently stopped at EACH_S_2, step past it first
    if (breakpointHit_ && breakpointAddress_ == EACH_S_2_ADDR) {
        removeBreakpoint(EACH_S_2_ADDR);
        breakpointHit_ = false;
        paused_ = false;
        stepInstruction();
    } else {
        breakpointHit_ = false;
    }

    addBreakpoint(EACH_S_2_ADDR);
    paused_ = false;
}

void ZXSpectrum::addBasicBreakpointLine(uint16_t lineNumber)
{
    basicBreakpointLines_.insert(lineNumber);
}

void ZXSpectrum::clearBasicBreakpointLines()
{
    basicBreakpointLines_.clear();
}

void ZXSpectrum::clearBasicBreakpointMode()
{
    basicBpMode_ = BasicBpMode::OFF;
    basicBpHit_ = false;
    basicBreakpointLines_.clear();
    removeBreakpoint(EACH_S_2_ADDR);
}

void ZXSpectrum::setBasicProgramActive()
{
    basicProgramActive_ = true;
    basicReportFired_ = false;
    // Ensure the opcode callback is installed so we can detect MAIN-4
    installOpcodeCallback();
}

bool ZXSpectrum::hasBasicProgram() const
{
    // PROG (0x5C53) points to the start of the BASIC program area.
    // If the first byte there is 0x80 (end-of-variables marker),
    // there is no program loaded.
    uint16_t prog = readMemory(basic::sys::PROG) |
                    (static_cast<uint16_t>(readMemory(basic::sys::PROG + 1)) << 8);
    return readMemory(prog) != 0x80;
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

            // Detect BASIC program end: MAIN-4 (0x1303) is reached after
            // every ROM report (0 OK, errors, STOP, BREAK).  It is NOT
            // reached during scroll?, INPUT, or PAUSE waits.
            if (basicProgramActive_ && address == MAIN_4_ADDR) {
                basicProgramActive_ = false;
                basicReportFired_ = true;
            }

            // Breakpoint handling
            if (!breakpoints_.empty())
            {
                if (skipBreakpointOnce_ && address == skipBreakpointAddr_) {
                    skipBreakpointOnce_ = false;
                    return false;
                }
                if (breakpoints_.count(address) && !disabledBreakpoints_.count(address)) {
                    // BASIC breakpoint filtering at EACH_S_2 (0x1B29)
                    if (address == EACH_S_2_ADDR && basicBpMode_ != BasicBpMode::OFF) {
                        uint8_t lo = coreDebugRead(basic::sys::PPC);
                        uint8_t hi = coreDebugRead(basic::sys::PPC + 1);
                        uint16_t ppc = lo | (hi << 8);

                        bool validLine = ppc > 0 && ppc <= 9999;
                        bool shouldStop = validLine && (
                            basicBpMode_ == BasicBpMode::STEP ||
                            (basicBpMode_ == BasicBpMode::RUN && basicBreakpointLines_.count(ppc))
                        );

                        if (shouldStop) {
                            // Hit! Remove the 0x1B29 breakpoint and notify
                            removeBreakpoint(EACH_S_2_ADDR);
                            basicBpMode_ = BasicBpMode::OFF;
                            basicBpHit_ = true;
                            basicBpLine_ = ppc;
                            breakpointHit_ = true;
                            breakpointAddress_ = address;
                            paused_ = true;
                            z80_->setRegister(Z80::WordReg::PC, address);

                            // Render display so PRINT output is visible
                            renderDisplay();
                            return true;
                        } else {
                            // Not our target line — let the instruction execute
                            // normally.  The breakpoint stays armed and will fire
                            // again for the next BASIC statement.
                            return false;
                        }
                    }

                    // Auto-clear temp breakpoint on hit
                    if (tempBreakpointActive_ && address == tempBreakpointAddr_) {
                        removeBreakpoint(tempBreakpointAddr_);
                        tempBreakpointActive_ = false;
                    }
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

void ZXSpectrum::tapeRewindBlock()
{
    if (tapeBlockIndex_ > 0) {
        tapeBlockIndex_--;
    }
    if (tapeBlockIndex_ < tapePulseBlockStarts_.size()) {
        tapePulseIndex_ = tapePulseBlockStarts_[tapeBlockIndex_];
    }
    tapePulseRemaining_ = 0;
    tapeEarLevel_ = false;
    lastTapeReadTs_ = 0;
}

void ZXSpectrum::tapeForwardBlock()
{
    if (tapeBlockIndex_ + 1 < tapeBlocks_.size()) {
        tapeBlockIndex_++;
    }
    if (tapeBlockIndex_ < tapePulseBlockStarts_.size()) {
        tapePulseIndex_ = tapePulseBlockStarts_[tapeBlockIndex_];
    }
    tapePulseRemaining_ = 0;
    tapeEarLevel_ = false;
    lastTapeReadTs_ = 0;
}

void ZXSpectrum::tapeSetBlockPause(size_t blockIndex, uint16_t pauseMs)
{
    if (blockIndex < tapeBlocks_.size())
    {
        tapeBlocks_[blockIndex].pauseMs = pauseMs;

        // Regenerate pulses with the updated pause
        std::vector<uint32_t> pulses;
        std::vector<size_t> blockPulseStarts;
        TZXLoader::generatePulses(tapeBlocks_, pulses, blockPulseStarts);
        tapePulses_ = std::move(pulses);
        tapePulseBlockStarts_ = std::move(blockPulseStarts);
    }
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
        // Pause when the next block is a header so multi-program tapes
        // stop between each program during instant load
        if (tapeBlockIndex_ < tapeBlockInfo_.size() &&
            tapeBlockInfo_[tapeBlockIndex_].flagByte == 0x00)
        {
            tapePulseActive_ = false;
        }
        else
        {
            tapePulseActive_ = true;
        }
    }

    z80_->setRegister(Z80::WordReg::PC, 0x05E2);
    return true;
}

// ============================================================================
// Tape recording
// ============================================================================

void ZXSpectrum::tapeRecordStart()
{
    tapeRecording_ = true;
    recordPulses_.clear();
    recordedTapData_.clear();
    recordedBlocks_.clear();
    recordedBlockInfo_.clear();
    recordCurrentBlockData_.clear();
    recordDecodeState_ = REC_IDLE;
    recordPilotCount_ = 0;
    recordDataPulseCount_ = 0;
    recordCurrentByte_ = 0;
    recordBitCount_ = 0;
    recordLastMicBit_ = 0;
    recordAbsoluteTs_ = 0;
    recordLastTransitionTs_ = z80_->getTStates();
}

void ZXSpectrum::tapeRecordStop()
{
    if (!tapeRecording_) return;
    tapeRecording_ = false;

    // Flush any block still being decoded
    if (recordDecodeState_ == REC_DATA)
    {
        recordFinishCurrentBlock();
    }
    recordDecodeState_ = REC_IDLE;

    decodePulsesToTap();
}

const uint8_t* ZXSpectrum::tapeRecordGetData() const
{
    if (recordedTapData_.empty()) return nullptr;
    return recordedTapData_.data();
}

uint32_t ZXSpectrum::tapeRecordGetSize() const
{
    return static_cast<uint32_t>(recordedTapData_.size());
}

void ZXSpectrum::recordMicTransition(uint8_t micBit)
{
    if (!tapeRecording_) return;
    if (micBit == recordLastMicBit_) return;

    uint64_t currentTs = recordAbsoluteTs_ + z80_->getTStates();
    uint64_t diff = currentTs - recordLastTransitionTs_;
    recordLastTransitionTs_ = currentTs;
    recordLastMicBit_ = micBit;

    if (diff == 0 || diff >= 0xFFFFFFFF) return;
    uint32_t pulseDuration = static_cast<uint32_t>(diff);
    recordPulses_.push_back(pulseDuration);

    // Real-time block detection state machine
    switch (recordDecodeState_)
    {
    case REC_IDLE:
        if (pulseDuration >= 1500 && pulseDuration <= 3500)
        {
            recordPilotCount_ = 1;
            recordDecodeState_ = REC_PILOT;
        }
        break;

    case REC_PILOT:
        if (pulseDuration >= 1500 && pulseDuration <= 3500)
        {
            recordPilotCount_++;
        }
        else if (recordPilotCount_ >= 200 && pulseDuration >= 400 && pulseDuration <= 1200)
        {
            // First sync pulse detected
            recordDecodeState_ = REC_SYNC1;
        }
        else
        {
            recordDecodeState_ = REC_IDLE;
        }
        break;

    case REC_SYNC1:
        if (pulseDuration >= 400 && pulseDuration <= 1200)
        {
            // Second sync pulse - start data decoding
            recordDecodeState_ = REC_DATA;
            recordCurrentBlockData_.clear();
            recordCurrentByte_ = 0;
            recordBitCount_ = 0;
            recordDataPulseCount_ = 0;
        }
        else
        {
            recordDecodeState_ = REC_IDLE;
        }
        break;

    case REC_DATA:
        recordDataPulseCount_++;
        if (pulseDuration >= 300 && pulseDuration <= 3000)
        {
            // Two pulses per bit - decode on even pulse
            if (recordDataPulseCount_ % 2 == 0)
            {
                uint32_t prevPulse = recordPulses_[recordPulses_.size() - 2];
                uint32_t avg = (prevPulse + pulseDuration) / 2;
                int bit = (avg > 1200) ? 1 : 0;
                recordCurrentByte_ = (recordCurrentByte_ << 1) | bit;
                recordBitCount_++;
                if (recordBitCount_ == 8)
                {
                    recordCurrentBlockData_.push_back(recordCurrentByte_);
                    recordCurrentByte_ = 0;
                    recordBitCount_ = 0;
                }
            }
        }
        else
        {
            // Pulse out of data range - block complete
            recordFinishCurrentBlock();
            // Check if this pulse starts a new pilot
            if (pulseDuration >= 1500 && pulseDuration <= 3500)
            {
                recordPilotCount_ = 1;
                recordDecodeState_ = REC_PILOT;
            }
            else
            {
                recordDecodeState_ = REC_IDLE;
            }
        }
        break;
    }
}

void ZXSpectrum::recordFinishCurrentBlock()
{
    if (recordCurrentBlockData_.empty()) return;

    size_t idx = recordedBlocks_.size();
    recordedBlocks_.push_back({recordCurrentBlockData_});
    buildRecordedBlockInfo(recordCurrentBlockData_, idx);
    recordCurrentBlockData_.clear();
}

void ZXSpectrum::buildRecordedBlockInfo(const std::vector<uint8_t>& data, size_t /*index*/)
{
    TapeBlockInfo info{};
    info.flagByte = data.empty() ? 0xFF : data[0];
    info.dataLength = static_cast<uint16_t>(data.size() > 1 ? data.size() - 2 : 0); // exclude flag+checksum

    if (info.flagByte == 0x00 && data.size() >= 18)
    {
        // Header block: type(1) + filename(10) + dataLen(2) + param1(2) + param2(2) + checksum(1) = 18+ bytes after flag
        info.headerType = data[1];
        for (int c = 0; c < 10; c++)
        {
            info.filename[c] = static_cast<char>(data[2 + c]);
        }
        info.filename[10] = '\0';
        info.dataLength = data[12] | (data[13] << 8);
        info.param1 = data[14] | (data[15] << 8);
        info.param2 = data[16] | (data[17] << 8);
    }
    else
    {
        info.headerType = 0xFF;
        info.filename[0] = '\0';
    }

    recordedBlockInfo_.push_back(info);
}

void ZXSpectrum::decodePulsesToTap()
{
    recordedTapData_.clear();

    // First, write any existing loaded tape blocks
    for (const auto& block : tapeBlocks_)
    {
        if (block.data.empty()) continue;
        uint16_t blockLen = static_cast<uint16_t>(block.data.size());
        recordedTapData_.push_back(blockLen & 0xFF);
        recordedTapData_.push_back((blockLen >> 8) & 0xFF);
        for (uint8_t b : block.data)
        {
            recordedTapData_.push_back(b);
        }
    }

    // Then append newly recorded blocks
    for (const auto& block : recordedBlocks_)
    {
        if (block.data.empty()) continue;
        uint16_t blockLen = static_cast<uint16_t>(block.data.size());
        recordedTapData_.push_back(blockLen & 0xFF);
        recordedTapData_.push_back((blockLen >> 8) & 0xFF);
        for (uint8_t b : block.data)
        {
            recordedTapData_.push_back(b);
        }
    }
}

// ============================================================================
// Tape playback
// ============================================================================

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

                // During instant load, pause when a header block is reached
                if (tapeInstantLoad_ && tapeAccelerating_ &&
                    tapeBlockIndex_ < tapeBlockInfo_.size() &&
                    tapeBlockInfo_[tapeBlockIndex_].flagByte == 0x00)
                {
                    tapePulseActive_ = false;
                    break;
                }
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
