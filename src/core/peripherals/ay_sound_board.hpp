/*
 * ay_sound_board.hpp - AY-3-8912 sound board peripheral
 *
 * Emulates a generic AY sound board (Fuller Box, Melodik, etc.)
 * for the ZX Spectrum 48K expansion bus.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "peripheral.hpp"
#include "ay8912.hpp"

namespace zxspec {

class AYSoundBoard : public Peripheral {
public:
    AYSoundBoard();
    ~AYSoundBoard() override = default;

    void setup(int sampleRate, double fps, int tsPerFrame) override;

    // Peripheral interface
    const char* getName() const override { return "AY Sound Board"; }
    bool claimsPort(uint16_t address, bool isWrite) const override;
    uint8_t ioRead(uint16_t address) override;
    void ioWrite(uint16_t address, uint8_t data) override;
    void update(int32_t tStates) override;
    void frameEnd() override;
    void reset() override;

    // Audio output
    const float* getAudioBuffer() const override { return sampleBuffer_; }
    int getAudioSampleCount() const override { return sampleIndex_; }
    void resetAudioBuffer() override { sampleIndex_ = 0; }

    // Debug accessors
    uint8_t getRegister(int reg) const { return ay_.getRegister(reg); }
    bool getChannelMute(int channel) const { return ay_.getChannelMute(channel); }
    void setChannelMute(int channel, bool muted) { ay_.setChannelMute(channel, muted); }
    void getWaveform(int channel, float* buffer, int sampleCount) const;

private:
    static constexpr int MAX_SAMPLES_PER_FRAME = 2048;
    static constexpr int WAVEFORM_BUFFER_SIZE = 256;
    static constexpr float AY_VOLUME = 0.4f;

    // AY generators tick at PSG_CLOCK/8 rate relative to 3.5MHz CPU clock:
    // one generator tick per (CPU_CLOCK / (PSG_CLOCK/8)) = 3500000 / 221675 ≈ 15.79 T-states
    static constexpr double AY_TICKS_PER_TSTATE = (1773400.0 / 8.0) / 3500000.0;

    AY8912 ay_;

    float sampleBuffer_[MAX_SAMPLES_PER_FRAME]{};
    int sampleIndex_ = 0;

    // Sample generation (same pattern as beeper)
    double tsCounter_ = 0.0;
    double outputLevel_ = 0.0;
    double tsStep_ = 0.0;

    // AY generator update tracking
    double ayTsCounter_ = 0.0;
    float ayLevel_ = 0.0f;

    // Per-channel waveform ring buffers for debug display
    float waveformBuffers_[3][WAVEFORM_BUFFER_SIZE]{};
    int waveformWritePos_ = 0;
};

} // namespace zxspec
