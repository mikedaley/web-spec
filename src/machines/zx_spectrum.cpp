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
#include <cstdio>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace zxspec {

// ============================================================================
// Static callbacks bridging Z80 → virtual methods
// ============================================================================

uint8_t ZXSpectrum::memReadCallback(uint16_t addr, void* param)
{
    auto* self = static_cast<ZXSpectrum*>(param);
    if (self->accessTrackingEnabled_) self->accessFlags_[addr] |= 0x02;
    return self->coreMemoryRead(addr);
}

void ZXSpectrum::memWriteCallback(uint16_t addr, uint8_t data, void* param)
{
    auto* self = static_cast<ZXSpectrum*>(param);
    if (self->accessTrackingEnabled_) self->accessFlags_[addr] |= 0x01;
    self->coreMemoryWrite(addr, data);
}

uint8_t ZXSpectrum::ioReadCallback(uint16_t addr, void* param)
{
    return static_cast<ZXSpectrum*>(param)->coreIORead(addr);
}

void ZXSpectrum::ioWriteCallback(uint16_t addr, uint8_t data, void* param)
{
    auto* self = static_cast<ZXSpectrum*>(param);

    // SpecDrum DAC: all ports ending in 0xDF
    if (self->specdrumEnabled_ && (addr & 0xFF) == 0xDF)
    {
        self->audio_.setSpecdrumLevel(((static_cast<float>(data) / 255.0f) * 2.0f - 1.0f) * 0.5f);
    }

    self->coreIOWrite(addr, data);
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

    // Register RETN callback to clear Spectranet NMI flip-flop
    z80_->registerRetnCallback([this]() {
        if (spectranetEnabled_) {
            spectranet_.clearNMIFlipFlop();
        }
    });

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

    // Fill RAM with random data (mimics real hardware power-on state).
    // This only happens at power-on, not on reset — a real Spectrum
    // preserves RAM contents across a reset.
    std::random_device rd;
    std::mt19937 rng(rd());
    std::uniform_int_distribution<int> dist(0, 255);
    for (auto& byte : memoryRam_) {
        byte = static_cast<uint8_t>(dist(rng));
    }

    reset();
    z80_->signalInterrupt();
}

// ============================================================================
// NMI
// ============================================================================

void ZXSpectrum::triggerNMI()
{
    // Block re-entrant NMI while Spectranet NMI handler is active
    if (spectranetEnabled_ && spectranet_.isNMIBlocked()) {
        return;
    }

    spectranet_.pageIn();

    if (spectranetEnabled_) {
        spectranet_.setNMIFlipFlop(true);
    }

    z80_->setNMIReq(true);
}

// Reset
// ============================================================================

void ZXSpectrum::reset()
{
    z80_->reset(true);
    audio_.reset();
    ay_.reset();
    ayMixOffset_ = 0;
    spectranet_.reset();
    keyboardMatrix_.fill(0xBF);
    display_.frameReset();
    borderColor_ = 7;
    frameCounter_ = 0;
    paused_ = false;

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
    if (accessTrackingEnabled_) clearAccessFlags();

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

void ZXSpectrum::renderDisplayToBeam()
{
    // Clear the framebuffer so everything after the beam position is black,
    // then render only up to the current CPU T-state position.
    display_.clearFramebuffer();
    display_.frameReset();
    uint32_t currentTs = z80_->getTStates() % machineInfo_.tsPerFrame;
    if (currentTs > 0) {
        display_.updateWithTs(
            static_cast<int32_t>(currentTs),
            getScreenMemory(), borderColor_, frameCounter_);
    }
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

const uint8_t* ZXSpectrum::getSignalBuffer() const
{
    return display_.getSignalBuffer();
}

int ZXSpectrum::getSignalBufferSize() const
{
    return display_.getSignalBufferSize();
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
    uint8_t oldValue = coreDebugRead(address);
    coreDebugWrite(address, data);
    patchScreenForUdgWrite(address, oldValue, data);
}

// ============================================================================
// Beam Position (derived from CPU T-states, not display render position)
// ============================================================================

void ZXSpectrum::getBeamPosition(int32_t& pixelX, int32_t& pixelY) const
{
    uint32_t ts = z80_->getTStates() % machineInfo_.tsPerFrame;
    uint32_t scanline = ts / machineInfo_.tsPerLine;
    uint32_t hTs = ts % machineInfo_.tsPerLine;

    // The framebuffer starts at the first rendered scanline, which is
    // paperStartLine - PX_EMU_BORDER_TOP (not pxVerticalBlank).
    uint32_t fbFirstLine = (machineInfo_.pxVerticalBlank + machineInfo_.pxVertBorder) - PX_EMU_BORDER_TOP;
    int32_t fbRow = static_cast<int32_t>(scanline) - static_cast<int32_t>(fbFirstLine);
    if (fbRow < 0 || fbRow >= static_cast<int32_t>(TOTAL_HEIGHT)) {
        pixelX = -1;
        pixelY = -1;
        return;
    }

    int32_t px = static_cast<int32_t>(hTs) * 2;
    if (px >= static_cast<int32_t>(TOTAL_WIDTH)) {
        px = static_cast<int32_t>(TOTAL_WIDTH) - 1;
    }

    pixelX = px;
    pixelY = fbRow;
}

void ZXSpectrum::getBeamScanline(uint32_t& scanline, uint32_t& hTs) const
{
    uint32_t ts = z80_->getTStates() % machineInfo_.tsPerFrame;
    scanline = ts / machineInfo_.tsPerLine;
    hTs = ts % machineInfo_.tsPerLine;
}

bool ZXSpectrum::isInVBL() const
{
    uint32_t ts = z80_->getTStates() % machineInfo_.tsPerFrame;
    uint32_t scanline = ts / machineInfo_.tsPerLine;
    return scanline < machineInfo_.pxVerticalBlank;
}

bool ZXSpectrum::isInHBLANK() const
{
    uint32_t ts = z80_->getTStates() % machineInfo_.tsPerFrame;
    uint32_t scanline = ts / machineInfo_.tsPerLine;
    if (scanline < machineInfo_.pxVerticalBlank) return false;
    uint32_t hTs = ts % machineInfo_.tsPerLine;
    return hTs >= (TOTAL_WIDTH / 2);
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

    if (breakpoints_.empty() && beamBreakpoints_.empty() && !tapeActive_ && !basicProgramActive_ && basicBpMode_ == BasicBpMode::OFF && !spectranetEnabled_ && !traceEnabled_) {
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
    beamBreakHit_ = false;
    beamBreakHitId_ = -1;
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
// Beam Breakpoints
// ============================================================================

int32_t ZXSpectrum::addBeamBreakpoint(int16_t scanline, int16_t hTs)
{
    if (beamBreakpoints_.size() >= MAX_BEAM_BREAKPOINTS) return -1;
    BeamBreakpoint bp{};
    bp.scanline = scanline;
    bp.hTs = hTs;
    bp.enabled = true;
    bp.id = beamBreakNextId_++;
    bp.lastFireFrame = 0;
    bp.lastFireScanline = -1;
    beamBreakpoints_.push_back(bp);
    installOpcodeCallback();
    return bp.id;
}

void ZXSpectrum::removeBeamBreakpoint(int32_t id)
{
    for (auto it = beamBreakpoints_.begin(); it != beamBreakpoints_.end(); ++it) {
        if (it->id == id) {
            beamBreakpoints_.erase(it);
            break;
        }
    }
    if (beamBreakpoints_.empty() && breakpoints_.empty() && !tapeActive_ && !basicProgramActive_ && basicBpMode_ == BasicBpMode::OFF && !spectranetEnabled_ && !traceEnabled_) {
        z80_->registerOpcodeCallback(nullptr);
    }
}

void ZXSpectrum::enableBeamBreakpoint(int32_t id, bool enabled)
{
    for (auto& bp : beamBreakpoints_) {
        if (bp.id == id) {
            bp.enabled = enabled;
            break;
        }
    }
}

void ZXSpectrum::clearAllBeamBreakpoints()
{
    beamBreakpoints_.clear();
    beamBreakHit_ = false;
    beamBreakHitId_ = -1;
    if (breakpoints_.empty() && !tapeActive_ && !basicProgramActive_ && basicBpMode_ == BasicBpMode::OFF && !spectranetEnabled_ && !traceEnabled_) {
        z80_->registerOpcodeCallback(nullptr);
    }
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

void ZXSpectrum::setBasicBreakpointStep()
{
    basicBpHit_ = false;

    // If currently stopped at the statement loop address, step past it first.
    // Temporarily keep basicBpMode_ OFF during the step so the opcode callback
    // doesn't re-trigger on the same instruction we're stepping over.
    uint16_t stmtAddr = getStmtLoopAddr();
    if (breakpointHit_ && breakpointAddress_ == stmtAddr) {
        basicBpMode_ = BasicBpMode::OFF;
        breakpointHit_ = false;
        paused_ = false;
        stepInstruction();
    } else {
        breakpointHit_ = false;
    }

    // Now arm STEP mode and ensure the opcode callback is installed
    basicBpMode_ = BasicBpMode::STEP;
    installOpcodeCallback();
    paused_ = false;
}

void ZXSpectrum::setBasicBreakpointRun()
{
    basicBpHit_ = false;

    // If currently stopped at the statement loop address, step past it first.
    // Temporarily keep basicBpMode_ OFF during the step so the opcode callback
    // doesn't re-trigger on the same instruction we're stepping over.
    uint16_t stmtAddr = getStmtLoopAddr();
    if (breakpointHit_ && breakpointAddress_ == stmtAddr) {
        basicBpMode_ = BasicBpMode::OFF;
        breakpointHit_ = false;
        paused_ = false;
        stepInstruction();
    } else {
        breakpointHit_ = false;
    }

    // Now arm RUN mode and ensure the opcode callback is installed
    basicBpMode_ = BasicBpMode::RUN;
    installOpcodeCallback();
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

    // If no other reasons to keep the callback, remove it
    if (breakpoints_.empty() && !tapeActive_ && !basicProgramActive_ && !spectranetEnabled_ && !traceEnabled_) {
        z80_->registerOpcodeCallback(nullptr);
    }
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
        [this](uint8_t opcode, uint16_t address, void* /*param*/) -> bool {
            // CPU instruction trace
            if (traceEnabled_) {
                traceRecordInstruction(address);
            }

            // Spectranet hardware traps
            if (spectranetEnabled_) {
                if (spectranet_.isPagedIn()) {
                    if (spectranet_.isPageOutTrap(address)) {
                        spectranet_.pageOut();
                        return false;
                    }
                } else {
                    // Deferred NMI page-in: when a programmable trap fires,
                    // we can't page in immediately (the current instruction
                    // hasn't finished, and its operand reads would go to
                    // Spectranet flash instead of Spectrum ROM). Instead we
                    // set NMI and defer the page-in. When the NMI handler
                    // fetches from 0x0066, we page in here so it reads from
                    // Spectranet flash.
                    if (spectranet_.isNMIPageInPending() && address == 0x0066) {
                        spectranet_.pageIn();
                        spectranet_.setNMIPageInPending(false);
                        z80_->setRegister(Z80::WordReg::PC, 0x0066);
                        return true;
                    }

                    // Page-in traps: the opcode callback fires AFTER the
                    // opcode fetch, so the CPU already has the Spectrum ROM
                    // byte. On real hardware the page-in happens BEFORE the
                    // fetch so the CPU reads from Spectranet flash. To match
                    // this, page in and set PC back to re-fetch the opcode
                    // from the now-paged-in Spectranet flash.
                    if (spectranet_.isPageInTrap(address)) {
                        spectranet_.pageIn();
                        z80_->setRegister(Z80::WordReg::PC, address);
                        return true;
                    }
                    if (spectranet_.isCallTrap(address)) {
                        spectranet_.pageIn();
                        z80_->setRegister(Z80::WordReg::PC, address);
                        return true;
                    }
                    if (spectranet_.isProgrammableTrap(address) && !spectranet_.isNMIBlocked()) {
                        // Don't page in now — the instruction at the trap
                        // address hasn't finished executing, and paging in
                        // would corrupt its operand reads. Just request NMI
                        // and defer the page-in to when 0x0066 is fetched.
                        spectranet_.setNMIPageInPending(true);
                        spectranet_.setNMIFlipFlop(true);
                        z80_->setNMIReq(true);
                        return false;
                    }
                }

                // Clear trap inhibit after checking traps this instruction.
                // This ensures the inhibit from pageOut() suppresses traps for
                // exactly one instruction (the RET after UNPAGE at 0x007C).
                spectranet_.tickTrapInhibit();
            }

            // Tape ROM trap
            if (tapeActive_ && handleTapeTrap(address))
            {
                return true;
            }

            // Detect BASIC program end: check PC against current ROM's
            // report handler address (0x1303 for 48K ROM, 0x0321 for 128K ROM 0).
            if (basicProgramActive_ && address == getMainReportAddr()) {
                basicProgramActive_ = false;
                basicReportFired_ = true;
            }

            // BASIC statement hook — check PC against current ROM's statement
            // loop address (0x1B29 for 48K ROM, 0x17C1 for 128K ROM 0).
            // This is checked directly rather than via the breakpoints_ set
            // so that ROM page switches are handled dynamically.
            if (basicBpMode_ != BasicBpMode::OFF && address == getStmtLoopAddr()) {
                uint8_t lo = coreDebugRead(basic::sys::PPC);
                uint8_t hi = coreDebugRead(basic::sys::PPC + 1);
                uint16_t ppc = lo | (hi << 8);

                bool validLine = ppc > 0 && ppc <= 9999;
                bool shouldStop = validLine && (
                    basicBpMode_ == BasicBpMode::STEP ||
                    (basicBpMode_ == BasicBpMode::RUN && basicBreakpointLines_.count(ppc))
                );

                if (shouldStop) {
                    basicBpMode_ = BasicBpMode::OFF;
                    basicBpHit_ = true;
                    basicBpLine_ = ppc;
                    basicBpStatement_ = coreDebugRead(basic::sys::SUBPPC);
                    breakpointHit_ = true;
                    breakpointAddress_ = address;
                    paused_ = true;
                    z80_->setRegister(Z80::WordReg::PC, address);

                    // Render display so PRINT output is visible
                    renderDisplay();
                    return true;
                }
                // Not our target line — let the instruction execute normally
            }

            // Beam breakpoint handling
            if (!beamBreakpoints_.empty()) {
                uint32_t cpuTs = z80_->getTStates() % machineInfo_.tsPerFrame;
                int16_t sl = static_cast<int16_t>(cpuTs / machineInfo_.tsPerLine);
                int16_t ht = static_cast<int16_t>(cpuTs % machineInfo_.tsPerLine);

                for (auto& bp : beamBreakpoints_) {
                    if (!bp.enabled) continue;

                    bool scanOk = (bp.scanline < 0) || (sl == bp.scanline);
                    bool hTsOk = (bp.hTs < 0) || (ht >= bp.hTs);
                    bool valid = (bp.scanline >= 0 || bp.hTs >= 0);

                    if (!scanOk || !hTsOk || !valid) continue;

                    // Re-fire prevention:
                    // Wildcard-scanline: fire once per scanline
                    // Specific-scanline: fire once per frame
                    bool alreadyFired;
                    if (bp.scanline < 0) {
                        alreadyFired = (frameCounter_ == bp.lastFireFrame && sl == bp.lastFireScanline);
                    } else {
                        alreadyFired = (frameCounter_ == bp.lastFireFrame);
                    }

                    if (!alreadyFired) {
                        beamBreakHit_ = true;
                        beamBreakHitId_ = bp.id;
                        beamBreakHitScanline_ = sl;
                        beamBreakHitHTs_ = ht;
                        bp.lastFireFrame = frameCounter_;
                        bp.lastFireScanline = sl;
                        paused_ = true;
                        z80_->setRegister(Z80::WordReg::PC, address);
                        return true;
                    }
                }
            }

            // Breakpoint handling (user-set breakpoints)
            if (!breakpoints_.empty())
            {
                if (skipBreakpointOnce_ && address == skipBreakpointAddr_) {
                    skipBreakpointOnce_ = false;
                    return false;
                }
                if (breakpoints_.count(address) && !disabledBreakpoints_.count(address)) {
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
// CPU instruction trace
// ============================================================================

void ZXSpectrum::setTraceEnabled(bool enabled)
{
    if (enabled && traceBuffer_.empty()) {
        traceBuffer_.resize(TRACE_BUFFER_SIZE);
    }
    if (enabled && !traceEnabled_) {
        traceWriteIndex_ = 0;
        traceEntryCount_ = 0;
    }
    traceEnabled_ = enabled;

    // Ensure the opcode callback is installed/uninstalled as needed
    if (enabled) {
        installOpcodeCallback();
    } else if (breakpoints_.empty() && !tapeActive_ && !basicProgramActive_
               && basicBpMode_ == BasicBpMode::OFF && !spectranetEnabled_) {
        z80_->registerOpcodeCallback(nullptr);
    }
}

void ZXSpectrum::traceRecordInstruction(uint16_t address)
{
    auto& e = traceBuffer_[traceWriteIndex_];
    e.pc  = address;
    e.sp  = z80_->getRegister(Z80::WordReg::SP);
    e.af  = z80_->getRegister(Z80::WordReg::AF);
    e.bc  = z80_->getRegister(Z80::WordReg::BC);
    e.de  = z80_->getRegister(Z80::WordReg::DE);
    e.hl  = z80_->getRegister(Z80::WordReg::HL);
    e.ix  = z80_->getRegister(Z80::WordReg::IX);
    e.iy  = z80_->getRegister(Z80::WordReg::IY);
    e.af_ = z80_->getRegister(Z80::WordReg::AltAF);
    e.bc_ = z80_->getRegister(Z80::WordReg::AltBC);
    e.de_ = z80_->getRegister(Z80::WordReg::AltDE);
    e.hl_ = z80_->getRegister(Z80::WordReg::AltHL);
    e.i    = z80_->getRegister(Z80::ByteReg::I);
    e.r    = z80_->getRegister(Z80::ByteReg::R);
    e.iff1 = z80_->getIFF1();
    e.im   = z80_->getIMMode();

    // Read up to 4 bytes at PC for display
    e.bytes[0] = coreDebugRead(address);
    e.bytes[1] = coreDebugRead(static_cast<uint16_t>(address + 1));
    e.bytes[2] = coreDebugRead(static_cast<uint16_t>(address + 2));
    e.bytes[3] = coreDebugRead(static_cast<uint16_t>(address + 3));

    traceWriteIndex_ = (traceWriteIndex_ + 1) % TRACE_BUFFER_SIZE;
    if (traceEntryCount_ < TRACE_BUFFER_SIZE) {
        traceEntryCount_++;
    }
}

// ============================================================================
// UDG screen patching
// ============================================================================

void ZXSpectrum::patchScreenForUdgWrite(uint16_t address, uint8_t oldValue, uint8_t newValue)
{
    if (oldValue == newValue) return;

    // Read UDG base pointer from system variable at 0x5C7B (UDG)
    uint16_t udgBase = coreDebugRead(0x5C7B) | (static_cast<uint16_t>(coreDebugRead(0x5C7C)) << 8);

    // Check if address falls within [udgBase, udgBase + 168)
    if (address < udgBase || address >= udgBase + 168) return;

    uint16_t offset = address - udgBase;
    int udgIndex = offset / 8;
    int pixelRow = offset % 8;

    // Build the full 8-byte UDG pattern using the OLD value at the changed row
    // (the new value has already been written to memory)
    uint8_t pattern[8];
    uint16_t udgStart = udgBase + udgIndex * 8;
    for (int i = 0; i < 8; i++) {
        if (i == pixelRow) {
            pattern[i] = oldValue;
        } else {
            pattern[i] = coreDebugRead(udgStart + i);
        }
    }

    bool allZero = true;
    for (int i = 0; i < 8; i++) {
        if (pattern[i] != 0) { allZero = false; break; }
    }

    uint8_t* screen = getScreenMemory();
    auto& positions = udgScreenPositions_[udgIndex];

    if (allZero) {
        // Old pattern is all zeros — we can't scan screen to find cells.
        // Use remembered positions from the last successful pattern match.
        if (positions.count == 0) return;

        for (int p = 0; p < positions.count; p++) {
            int cr = positions.positions[p] / 32;
            int c  = positions.positions[p] % 32;
            int off = (cr >> 3) * 0x800 + pixelRow * 0x100 + (cr & 7) * 0x20 + c;
            screen[off] = newValue;
        }
        return;
    }

    // Scan all 768 character cells in screen memory for old pattern matches
    positions.count = 0;
    for (int cr = 0; cr < 24; cr++) {
        for (int c = 0; c < 32; c++) {
            bool match = true;
            for (int pl = 0; pl < 8; pl++) {
                int off = (cr >> 3) * 0x800 + pl * 0x100 + (cr & 7) * 0x20 + c;
                if (screen[off] != pattern[pl]) { match = false; break; }
            }
            if (match) {
                // Remember this position
                if (positions.count < kMaxUdgScreenPositions) {
                    positions.positions[positions.count++] = static_cast<uint16_t>(cr * 32 + c);
                }
                // Write the new value at the changed pixel row
                int off = (cr >> 3) * 0x800 + pixelRow * 0x100 + (cr & 7) * 0x20 + c;
                screen[off] = newValue;
            }
        }
    }
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
    if (breakpoints_.empty() && !spectranetEnabled_ && !traceEnabled_) {
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
