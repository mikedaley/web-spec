/*
 * audio.hpp - Audio subsystem (beeper) shared across machine variants
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

class Audio {
public:
    Audio();
    ~Audio() = default;

    void setup(int sampleRate, double framesPerSecond, int tStatesPerFrame);
    void reset();
    void update(int32_t tStates);
    void frameEnd();

    void setEarBit(uint8_t bit) { earBit_ = bit; }
    uint8_t getEarBit() const { return earBit_; }

    void setMicBit(uint8_t bit) { micBit_ = bit; }
    uint8_t getMicBit() const { return micBit_; }

    void setTapeEarBit(uint8_t bit) { tapeEarBit_ = bit; }

    // SpecDrum 8-bit DAC output (added to beeper level each T-state)
    void setSpecdrumLevel(float level) { specdrumLevel_ = level; }
    float getSpecdrumLevel() const { return specdrumLevel_; }

    const float* getBuffer() const { return sampleBuffer_; }
    float* getMutableBuffer() { return sampleBuffer_; }
    int getSampleCount() const { return sampleIndex_; }
    void resetBuffer() { sampleIndex_ = 0; }

    // Waveform ring buffer for debug display
    void getWaveform(float* buf, int count) const;

    // Mix external audio (e.g. SP0256 speech) into the waveform ring buffer
    // so it shows up in the sound window visualisation. Call after mixing
    // external audio into sampleBuffer_ at frame end.
    void mixIntoWaveform(const float* buf, int count, int offset);

private:
    static constexpr int MAX_SAMPLES_PER_FRAME = 2048;
    static constexpr int WAVEFORM_BUFFER_SIZE = 2048;
    static constexpr float BEEPER_VOLUME = 0.6f;
    static constexpr float TAPE_VOLUME = 0.3f;

    uint8_t earBit_ = 0;
    uint8_t micBit_ = 0;
    uint8_t tapeEarBit_ = 0;
    float specdrumLevel_ = 0.0f;

    float sampleBuffer_[MAX_SAMPLES_PER_FRAME]{};
    int sampleIndex_ = 0;

    // Per-sample waveform ring buffer for debug display
    float waveformBuffer_[WAVEFORM_BUFFER_SIZE]{};
    int waveformWritePos_ = 0;

    double tsCounter_ = 0.0;
    double outputLevel_ = 0.0;
    double beeperTsStep_ = 0.0;
};

} // namespace zxspec
