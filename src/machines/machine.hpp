/*
 * machine.hpp - Abstract machine interface for multi-machine support
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstddef>
#include <cstdint>

namespace zxspec {

class Z80;

class Machine {
public:
    virtual ~Machine() = default;
    virtual void init() = 0;
    virtual void reset() = 0;
    virtual void runFrame() = 0;
    virtual void runCycles(int cycles) = 0;
    virtual void stepInstruction() = 0;

    virtual const uint8_t* getFramebuffer() const = 0;
    virtual int getFramebufferSize() const = 0;
    virtual const float* getAudioBuffer() const = 0;
    virtual int getAudioSampleCount() const = 0;
    virtual void resetAudioBuffer() = 0;

    virtual void keyDown(int row, int bit) = 0;
    virtual void keyUp(int row, int bit) = 0;
    virtual uint8_t getKeyboardRow(int row) const = 0;

    virtual uint8_t readMemory(uint16_t address) const = 0;
    virtual void writeMemory(uint16_t address, uint8_t data) = 0;

    virtual void loadSNA(const uint8_t* data, uint32_t size) = 0;
    virtual void loadZ80(const uint8_t* data, uint32_t size) = 0;
    virtual void loadTZX(const uint8_t* data, uint32_t size) = 0;
    virtual void loadTAP(const uint8_t* data, uint32_t size) = 0;
    virtual void loadTZXTape(const uint8_t* data, uint32_t size) = 0;

    // Tape transport
    virtual void tapePlay() = 0;
    virtual void tapeStop() = 0;
    virtual void tapeRewind() = 0;
    virtual void tapeEject() = 0;
    virtual bool tapeIsPlaying() const = 0;
    virtual bool tapeIsLoaded() const = 0;
    virtual size_t tapeGetBlockCount() const = 0;
    virtual size_t tapeGetCurrentBlock() const = 0;

    virtual Z80* getCPU() = 0;
    virtual const Z80* getCPU() const = 0;

    virtual bool isPaused() const = 0;
    virtual void setPaused(bool paused) = 0;

    virtual void addBreakpoint(uint16_t addr) = 0;
    virtual void removeBreakpoint(uint16_t addr) = 0;
    virtual void enableBreakpoint(uint16_t addr, bool enabled) = 0;
    virtual bool isBreakpointHit() const = 0;
    virtual uint16_t getBreakpointAddress() const = 0;
    virtual void clearBreakpointHit() = 0;

    virtual const char* getName() const = 0;
    virtual int getId() const = 0;

    // CPU state access (delegates to Z80)
    virtual uint16_t getPC() const = 0;
    virtual uint16_t getSP() const = 0;
    virtual uint16_t getAF() const = 0;
    virtual uint16_t getBC() const = 0;
    virtual uint16_t getDE() const = 0;
    virtual uint16_t getHL() const = 0;
    virtual uint16_t getIX() const = 0;
    virtual uint16_t getIY() const = 0;
    virtual uint8_t getI() const = 0;
    virtual uint8_t getR() const = 0;
    virtual uint8_t getIFF1() const = 0;
    virtual uint8_t getIFF2() const = 0;
    virtual uint8_t getIM() const = 0;
    virtual uint32_t getTStates() const = 0;
    virtual uint16_t getAltAF() const = 0;
    virtual uint16_t getAltBC() const = 0;
    virtual uint16_t getAltDE() const = 0;
    virtual uint16_t getAltHL() const = 0;
    virtual void setPC(uint16_t v) = 0;
    virtual void setSP(uint16_t v) = 0;
    virtual void setAF(uint16_t v) = 0;
    virtual void setBC(uint16_t v) = 0;
    virtual void setDE(uint16_t v) = 0;
    virtual void setHL(uint16_t v) = 0;
    virtual void setIX(uint16_t v) = 0;
    virtual void setIY(uint16_t v) = 0;
    virtual void setI(uint8_t v) = 0;
    virtual void setR(uint8_t v) = 0;
};

} // namespace zxspec
