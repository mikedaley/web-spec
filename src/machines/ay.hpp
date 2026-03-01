/*
 * ay.hpp - AY-3-8912 Programmable Sound Generator
 *
 * Three-channel tone + noise + envelope sound chip used in the
 * ZX Spectrum 128K (built-in) and various 48K add-ons (Fuller Box,
 * Melodik). Runs at 1.7734 MHz with internal /8 prescaler.
 *
 * Ported from the working web-a2e Mockingboard AY implementation,
 * adapted for ZX Spectrum clocking.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <array>

namespace zxspec {

class AY3_8912 {
public:
    static constexpr int NUM_CHANNELS = 3;
    static constexpr int PSG_CLOCK = 1773400;  // 1.7734 MHz

    AY3_8912();
    ~AY3_8912() = default;

    void setup(int sampleRate, double framesPerSecond, int tStatesPerFrame);
    void reset();

    // Called each instruction with the T-state delta
    void update(int32_t tStates);
    void frameEnd();

    // Port interface (128K-compatible: 0xFFFD select, 0xBFFD read/write)
    void selectRegister(uint8_t reg);
    void writeData(uint8_t data);
    uint8_t readData() const;

    // Debug access
    uint8_t getRegister(int reg) const;

    // Channel mute (debug)
    void setChannelMute(int ch, bool muted);
    bool getChannelMute(int ch) const;

    // Waveform ring buffer for debug display
    void getWaveform(int ch, float* buf, int count) const;

    // Audio buffer (mixed AY output at 48 kHz)
    const float* getBuffer() const { return sampleBuffer_; }
    float* getMutableBuffer() { return sampleBuffer_; }
    int getSampleCount() const { return sampleIndex_; }
    void resetBuffer() { sampleIndex_ = 0; }

    // Internal state accessors (debug)
    bool getToneOutput(int ch) const;
    uint32_t getNoiseLFSR() const;
    uint8_t getEnvVolume() const;
    bool getEnvHolding() const;
    bool getEnvAttack() const;
    float getChannelOutput(int ch) const;

private:
    static constexpr int MAX_SAMPLES_PER_FRAME = 2048;
    static constexpr int WAVEFORM_BUFFER_SIZE = 256;
    static constexpr float AY_VOLUME = 0.8f;

    // AY generators tick at PSG_CLOCK/8 relative to 3.5 MHz CPU clock
    static constexpr double AY_TICKS_PER_TSTATE = (1773400.0 / 8.0) / 3500000.0;

    // Volume table (logarithmic, measured AY DAC levels)
    static const float volumeTable_[16];

    // Register file
    std::array<uint8_t, 16> regs_{};
    uint8_t selectedReg_ = 0;

    // Tone generators (3 channels) — count UP, toggle at period
    std::array<uint32_t, 3> toneCounters_{};
    std::array<bool, 3> toneOutput_{};
    std::array<bool, 3> channelMuted_{};

    // Noise generator
    uint32_t noiseCounter_ = 0;
    uint32_t noiseLFSR_ = 1;

    // Envelope generator
    uint32_t envCounter_ = 0;
    uint8_t envVolume_ = 0;
    bool envHolding_ = false;
    bool envContinue_ = false;
    bool envAttack_ = false;
    bool envAlternate_ = false;
    bool envHold_ = false;

    // Audio output
    float sampleBuffer_[MAX_SAMPLES_PER_FRAME]{};
    int sampleIndex_ = 0;
    double tsCounter_ = 0.0;
    double outputLevel_ = 0.0;
    double tsStep_ = 0.0;

    // AY generator update tracking
    double ayTsCounter_ = 0.0;
    float ayLevel_ = 0.0f;

    // Per-channel waveform ring buffers for debug display
    float waveformBuffers_[3][WAVEFORM_BUFFER_SIZE]{};
    int waveformWritePos_ = 0;

    // Internal helpers
    uint16_t getTonePeriod(int ch) const;
    uint8_t getNoisePeriod() const;
    uint16_t getEnvPeriod() const;
    void tickToneGenerator(int ch);
    void tickNoiseGenerator();
    void tickEnvelopeGenerator();
    void handleEnvelopeCycleEnd();
    float computeMixerOutput() const;
};

} // namespace zxspec
