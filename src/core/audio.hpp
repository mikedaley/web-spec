/*
 * audio.hpp - Audio subsystem for ZX Spectrum beeper
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

    const float* getBuffer() const { return sampleBuffer_; }
    int getSampleCount() const { return sampleIndex_; }
    void resetBuffer() { sampleIndex_ = 0; }

private:
    static constexpr int MAX_SAMPLES_PER_FRAME = 1024;
    static constexpr float BEEPER_VOLUME = 0.3f;

    uint8_t earBit_ = 0;

    float sampleBuffer_[MAX_SAMPLES_PER_FRAME]{};
    int sampleIndex_ = 0;

    double tsCounter_ = 0.0;
    double outputLevel_ = 0.0;
    double beeperTsStep_ = 0.0;
    int tsInStep_ = 0;
};

} // namespace zxspec
