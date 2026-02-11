/*
 * ay8912.hpp - AY-3-8912 sound chip emulation
 *
 * Ported from web-a2e Mockingboard ay8910.hpp/.cpp
 * Adapted for ZX Spectrum clock (1.7734 MHz)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <array>

namespace zxspec {

class AY8912 {
public:
    static constexpr int NUM_CHANNELS = 3;
    static constexpr int PSG_CLOCK = 1773400;  // 1.7734 MHz ZX Spectrum AY clock

    AY8912();

    void setRegisterAddress(uint8_t address);
    void writeRegister(uint8_t value);
    uint8_t readRegister() const;

    // Advance all generators by one tick (tone/noise/envelope)
    void tick();

    // Get current mixer output without advancing state
    float getOutput() const;

    void reset();

    uint8_t getRegister(int reg) const {
        return (reg >= 0 && reg < 16) ? registers_[reg] : 0;
    }

    // Channel mute controls
    bool getChannelMute(int channel) const {
        return (channel >= 0 && channel < NUM_CHANNELS) ? channelMuted_[channel] : false;
    }
    void setChannelMute(int channel, bool muted) {
        if (channel >= 0 && channel < NUM_CHANNELS) channelMuted_[channel] = muted;
    }

    // Per-channel output (0.0-1.0) for waveform display
    float getChannelOutput(int channel) const;

private:
    // Registers
    static constexpr int REG_TONE_A_FINE = 0;
    static constexpr int REG_TONE_A_COARSE = 1;
    static constexpr int REG_TONE_B_FINE = 2;
    static constexpr int REG_TONE_B_COARSE = 3;
    static constexpr int REG_TONE_C_FINE = 4;
    static constexpr int REG_TONE_C_COARSE = 5;
    static constexpr int REG_NOISE_PERIOD = 6;
    static constexpr int REG_MIXER = 7;
    static constexpr int REG_AMP_A = 8;
    static constexpr int REG_AMP_B = 9;
    static constexpr int REG_AMP_C = 10;
    static constexpr int REG_ENV_FINE = 11;
    static constexpr int REG_ENV_COARSE = 12;
    static constexpr int REG_ENV_SHAPE = 13;
    static constexpr int REG_IO_PORT_A = 14;
    static constexpr int REG_IO_PORT_B = 15;

    std::array<uint8_t, 16> registers_{};
    uint8_t currentRegister_ = 0;

    // Tone generator state (3 channels)
    std::array<uint32_t, 3> toneCounters_{};
    std::array<bool, 3> toneOutput_{};
    std::array<bool, 3> channelMuted_{};

    // Noise generator state
    uint32_t noiseCounter_ = 0;
    uint32_t noiseShiftReg_ = 1;

    // Envelope generator state
    uint32_t envCounter_ = 0;
    uint8_t envVolume_ = 0;
    bool envHolding_ = false;
    bool envContinue_ = false;
    bool envAttack_ = false;
    bool envAlternate_ = false;
    bool envHold_ = false;

    // Volume table (4-bit to amplitude)
    static const float volumeTable_[16];

    void applyRegisterWrite(uint8_t reg, uint8_t value);

    uint16_t getTonePeriod(int channel) const;
    uint8_t getNoisePeriod() const;
    uint16_t getEnvPeriod() const;
    void updateToneGenerator(int channel);
    void updateNoiseGenerator();
    void updateEnvelopeGenerator();
    void handleEnvelopeCycleEnd();
    float computeMixerOutput() const;
};

} // namespace zxspec
