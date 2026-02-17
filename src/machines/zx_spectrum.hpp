/*
 * zx_spectrum.hpp - ZX Spectrum base class (shared emulation logic)
 *
 * Modelled on SpectREMCPP's ZXSpectrum.hpp - contains all shared logic
 * for display, audio, contention, keyboard, breakpoints, and tape.
 * Machine variants override only the 7 core memory/IO virtual methods.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "machine.hpp"
#include "machine_info.hpp"
#include "audio.hpp"
#include "display.hpp"
#include "contention.hpp"
#include "tape_block.hpp"
#include "loaders/tap_loader.hpp"
#include "../core/z80/z80.hpp"
#include <array>
#include <cstdint>
#include <memory>
#include <set>
#include <vector>

namespace zxspec {

class TZXLoader;
class TAPLoader;

class ZXSpectrum : public Machine {
    friend class TZXLoader;
    friend class TAPLoader;

public:
    ZXSpectrum();
    ~ZXSpectrum() override;

    // Machine interface - concrete implementations
    void reset() override;
    void runFrame() override;
    void runCycles(int cycles) override;
    void stepInstruction() override;

    const uint8_t* getFramebuffer() const override;
    int getFramebufferSize() const override;
    const float* getAudioBuffer() const override;
    int getAudioSampleCount() const override;
    void resetAudioBuffer() override;

    void keyDown(int row, int bit) override;
    void keyUp(int row, int bit) override;
    uint8_t getKeyboardRow(int row) const override;

    // Public memory access delegates to coreDebugRead/Write (no side effects)
    uint8_t readMemory(uint16_t address) const override;
    void writeMemory(uint16_t address, uint8_t data) override;

    Z80* getCPU() override { return z80_.get(); }
    const Z80* getCPU() const override { return z80_.get(); }

    bool isPaused() const override { return paused_; }
    void setPaused(bool paused) override { paused_ = paused; }

    void addBreakpoint(uint16_t addr) override;
    void removeBreakpoint(uint16_t addr) override;
    void enableBreakpoint(uint16_t addr, bool enabled) override;
    bool isBreakpointHit() const override { return breakpointHit_; }
    uint16_t getBreakpointAddress() const override { return breakpointAddress_; }
    void clearBreakpointHit() override;

    const char* getName() const override { return machineInfo_.machineName; }
    int getId() const override { return static_cast<int>(machineInfo_.machineType); }

    // CPU state access
    uint16_t getPC() const override { return z80_->getRegister(Z80::WordReg::PC); }
    uint16_t getSP() const override { return z80_->getRegister(Z80::WordReg::SP); }
    uint16_t getAF() const override { return z80_->getRegister(Z80::WordReg::AF); }
    uint16_t getBC() const override { return z80_->getRegister(Z80::WordReg::BC); }
    uint16_t getDE() const override { return z80_->getRegister(Z80::WordReg::DE); }
    uint16_t getHL() const override { return z80_->getRegister(Z80::WordReg::HL); }
    uint16_t getIX() const override { return z80_->getRegister(Z80::WordReg::IX); }
    uint16_t getIY() const override { return z80_->getRegister(Z80::WordReg::IY); }
    uint8_t getI() const override { return z80_->getRegister(Z80::ByteReg::I); }
    uint8_t getR() const override { return z80_->getRegister(Z80::ByteReg::R); }
    uint8_t getIFF1() const override { return z80_->getIFF1(); }
    uint8_t getIFF2() const override { return z80_->getIFF2(); }
    uint8_t getIM() const override { return z80_->getIMMode(); }
    uint32_t getTStates() const override { return z80_->getTStates(); }
    uint16_t getAltAF() const override { return z80_->getRegister(Z80::WordReg::AltAF); }
    uint16_t getAltBC() const override { return z80_->getRegister(Z80::WordReg::AltBC); }
    uint16_t getAltDE() const override { return z80_->getRegister(Z80::WordReg::AltDE); }
    uint16_t getAltHL() const override { return z80_->getRegister(Z80::WordReg::AltHL); }
    void setPC(uint16_t v) override { z80_->setRegister(Z80::WordReg::PC, v); }
    void setSP(uint16_t v) override { z80_->setRegister(Z80::WordReg::SP, v); }
    void setAF(uint16_t v) override { z80_->setRegister(Z80::WordReg::AF, v); }
    void setBC(uint16_t v) override { z80_->setRegister(Z80::WordReg::BC, v); }
    void setDE(uint16_t v) override { z80_->setRegister(Z80::WordReg::DE, v); }
    void setHL(uint16_t v) override { z80_->setRegister(Z80::WordReg::HL, v); }
    void setIX(uint16_t v) override { z80_->setRegister(Z80::WordReg::IX, v); }
    void setIY(uint16_t v) override { z80_->setRegister(Z80::WordReg::IY, v); }
    void setI(uint8_t v) override { z80_->setRegister(Z80::ByteReg::I, v); }
    void setR(uint8_t v) override { z80_->setRegister(Z80::ByteReg::R, v); }

    void setBorderColor(uint8_t color) { borderColor_ = color & 0x07; }

    // Tape transport controls
    void tapePlay() override;
    void tapeStop() override;
    void tapeRewind() override;
    bool tapeIsPlaying() const override { return tapePulseActive_; }
    bool tapeIsLoaded() const override { return tapeActive_; }
    size_t tapeGetBlockCount() const override { return tapeBlocks_.size(); }
    size_t tapeGetCurrentBlock() const override { return tapeBlockIndex_; }
    const std::vector<TapeBlockInfo>& tapeGetBlockInfo() const { return tapeBlockInfo_; }

    // Pure virtual - machine-specific memory/IO (the 7 core methods)
    virtual uint8_t coreMemoryRead(uint16_t address) = 0;
    virtual void coreMemoryWrite(uint16_t address, uint8_t data) = 0;
    virtual void coreMemoryContention(uint16_t address, uint32_t tstates) = 0;
    virtual void coreNoMreqContention(uint16_t address, uint32_t tstates) = 0;
    virtual uint8_t coreIORead(uint16_t address) = 0;
    virtual void coreIOWrite(uint16_t address, uint8_t data) = 0;
    virtual uint8_t coreDebugRead(uint16_t address) const = 0;
    virtual void coreDebugWrite(uint16_t address, uint8_t data) = 0;

    // Screen memory access for display rendering (variant provides pointer)
    virtual uint8_t* getScreenMemory() = 0;
    virtual const uint8_t* getScreenMemory() const = 0;

protected:
    // Called by variant's init() after setting machineInfo_
    void baseInit();

    // Opcode callback support
    virtual void installOpcodeCallback();
    virtual bool handleTapeTrap(uint16_t address);
    void advanceTape(uint32_t tstates);

    // Machine configuration
    MachineInfo machineInfo_{};

    // Core components
    std::unique_ptr<Z80> z80_;
    Audio audio_;
    Display display_;
    ULAContention contention_;

    // Memory (allocated by base, managed by variant)
    std::vector<uint8_t> memoryRom_;
    std::vector<uint8_t> memoryRam_;

    // Keyboard matrix: 8 half-rows, bits 0-4 active LOW (0 = pressed)
    std::array<uint8_t, 8> keyboardMatrix_{};

    // Display state
    uint8_t borderColor_ = 7;
    uint32_t frameCounter_ = 0;

    // Execution state
    bool paused_ = false;

    // Breakpoint support
    std::set<uint16_t> breakpoints_;
    std::set<uint16_t> disabledBreakpoints_;
    bool breakpointHit_ = false;
    uint16_t breakpointAddress_ = 0;
    bool skipBreakpointOnce_ = false;
    uint16_t skipBreakpointAddr_ = 0;

    // Tape loading support (ROM trap + pulse playback)
    std::vector<TapeBlock> tapeBlocks_;
    size_t tapeBlockIndex_ = 0;
    bool tapeActive_ = false;

    // Pulse playback for EAR bit
    std::vector<uint32_t> tapePulses_;
    std::vector<size_t> tapePulseBlockStarts_;
    size_t tapePulseIndex_ = 0;
    uint32_t tapePulseRemaining_ = 0;
    bool tapeEarLevel_ = false;
    bool tapePulseActive_ = false;
    uint32_t lastTapeReadTs_ = 0;

    // Tape block metadata for UI
    std::vector<TapeBlockInfo> tapeBlockInfo_;

    int muteFrames_ = 0;

private:
    // Static callbacks bridging Z80's C-style callbacks to virtual methods
    static uint8_t memReadCallback(uint16_t addr, void* param);
    static void memWriteCallback(uint16_t addr, uint8_t data, void* param);
    static uint8_t ioReadCallback(uint16_t addr, void* param);
    static void ioWriteCallback(uint16_t addr, uint8_t data, void* param);
    static void contentionCallback(uint16_t addr, uint32_t ts, void* param);
    static void noMreqContentionCallback(uint16_t addr, uint32_t ts, void* param);
};

} // namespace zxspec
