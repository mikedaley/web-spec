/*
 * emulator.hpp - Core emulator coordinator for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "audio/audio.hpp"
#include "display/display.hpp"
#include "peripherals/peripheral.hpp"
#include "types.hpp"
#include "ula/ula_contention.hpp"
#include "z80/z80.hpp"
#include <array>
#include <cstdint>
#include <memory>
#include <vector>

namespace zxspec {

class SNALoader;
class Z80Loader;

class Emulator {
    friend class SNALoader;
    friend class Z80Loader;
public:
    Emulator();
    ~Emulator();

    void init();
    void reset();
    void loadSNA(const uint8_t* data, uint32_t size);
    void loadZ80(const uint8_t* data, uint32_t size);

    void runCycles(int cycles);
    void runFrame();

    const uint8_t* getFramebuffer() const;
    int getFramebufferSize() const;

    const float* getAudioBuffer() const;
    int getAudioSampleCount() const;
    void resetAudioBuffer();

    // Keyboard input (row 0-7, bit 0-4)
    void keyDown(int row, int bit);
    void keyUp(int row, int bit);
    uint8_t getKeyboardRow(int row) const;

    bool isPaused() const { return paused_; }
    void setPaused(bool paused) { paused_ = paused; }

    bool isTurbo() const { return turbo_; }
    void setTurbo(bool turbo) { turbo_ = turbo; }

    // Peripheral management
    void addPeripheral(std::unique_ptr<Peripheral> peripheral);
    void enableAY(bool enable);
    bool isAYEnabled() const;

    // AY debug accessors
    uint8_t getAYRegister(int reg) const;
    bool getAYChannelMute(int channel) const;
    void setAYChannelMute(int channel, bool muted);
    void getAYWaveform(int channel, float* buffer, int sampleCount) const;

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

    void mixPeripheralAudio();

    std::unique_ptr<Z80> z80_;
    Audio audio_;
    Display display_;
    ULAContention contention_;
    std::vector<std::unique_ptr<Peripheral>> peripherals_;

    // 64KB flat memory (48K RAM + 16K ROM at bottom)
    std::array<uint8_t, 65536> memory_{};

    uint8_t borderColor_ = 7;
    uint32_t frameCounter_ = 0;

    // Keyboard matrix: 8 half-rows, bits 0-4 active LOW (0 = pressed)
    std::array<uint8_t, 8> keyboardMatrix_{};

    bool paused_ = false;
    bool turbo_ = false;
    int mixOffset_ = 0;
};

} // namespace zxspec
