/*
 * emulator.hpp - Core emulator coordinator for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "types.hpp"
#include "z80/z80.hpp"
#include <array>
#include <cstdint>
#include <memory>

namespace zxspec {

class Emulator {
public:
    Emulator();
    ~Emulator();

    void init();
    void reset();

    void runCycles(int cycles);
    void runFrame();

    const uint8_t* getFramebuffer() const;
    int getFramebufferSize() const;

    // Keyboard input (row 0-7, bit 0-4)
    void keyDown(int row, int bit);
    void keyUp(int row, int bit);
    uint8_t getKeyboardRow(int row) const;

    bool isPaused() const { return paused_; }
    void setPaused(bool paused) { paused_ = paused; }

    void stepInstruction();

    // CPU state access
    uint16_t getPC() const { return z80_->getRegister(Z80::WordReg::PC); }
    uint16_t getSP() const { return z80_->getRegister(Z80::WordReg::SP); }
    uint16_t getAF() const { return z80_->getRegister(Z80::WordReg::AF); }
    uint16_t getBC() const { return z80_->getRegister(Z80::WordReg::BC); }
    uint16_t getDE() const { return z80_->getRegister(Z80::WordReg::DE); }
    uint16_t getHL() const { return z80_->getRegister(Z80::WordReg::HL); }
    uint16_t getIX() const { return z80_->getRegister(Z80::WordReg::IX); }
    uint16_t getIY() const { return z80_->getRegister(Z80::WordReg::IY); }
    uint8_t getI() const { return z80_->getRegister(Z80::ByteReg::I); }
    uint8_t getR() const { return z80_->getRegister(Z80::ByteReg::R); }
    uint8_t getIFF1() const { return z80_->getIFF1(); }
    uint8_t getIFF2() const { return z80_->getIFF2(); }
    uint8_t getIM() const { return z80_->getIMMode(); }
    uint32_t getTStates() const { return z80_->getTStates(); }

    // Memory access
    uint8_t readMemory(uint16_t address) const;
    void writeMemory(uint16_t address, uint8_t data);

private:
    // Memory callbacks for CPU
    uint8_t memRead(uint16_t address, void* param);
    void memWrite(uint16_t address, uint8_t data, void* param);
    uint8_t ioRead(uint16_t address, void* param);
    void ioWrite(uint16_t address, uint8_t data, void* param);
    void memContention(uint16_t address, uint32_t tstates, void* param);

    void renderFrame();

    std::unique_ptr<Z80> z80_;

    // 64KB flat memory (48K RAM + 16K ROM at bottom)
    std::array<uint8_t, 65536> memory_{};

    std::array<uint8_t, FRAMEBUFFER_SIZE> framebuffer_{};
    uint8_t borderColor_ = 7;
    uint32_t frameCounter_ = 0;

    // Keyboard matrix: 8 half-rows, bits 0-4 active LOW (0 = pressed)
    std::array<uint8_t, 8> keyboardMatrix_{};

    bool paused_ = false;
};

} // namespace zxspec
