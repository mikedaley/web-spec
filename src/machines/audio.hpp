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

    void setTapeEarBit(uint8_t bit) { tapeEarBit_ = bit; }

    const float* getBuffer() const { return sampleBuffer_; }
    float* getMutableBuffer() { return sampleBuffer_; }
    int getSampleCount() const { return sampleIndex_; }
    void resetBuffer() { sampleIndex_ = 0; }

    // Waveform ring buffer for debug display
    void getWaveform(float* buf, int count) const;

private:
    static constexpr int MAX_SAMPLES_PER_FRAME = 2048;
    static constexpr int WAVEFORM_BUFFER_SIZE = 1024;
    static constexpr float BEEPER_VOLUME = 0.3f;
    static constexpr float TAPE_VOLUME = 0.15f;

    uint8_t earBit_ = 0;
    uint8_t tapeEarBit_ = 0;

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
