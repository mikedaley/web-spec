/*
 * audio.cpp - Audio subsystem for ZX Spectrum beeper
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "audio.hpp"

namespace zxspec {

Audio::Audio() = default;

void Audio::setup(int sampleRate, double framesPerSecond, int tStatesPerFrame)
{
    double samplesPerFrame = static_cast<double>(sampleRate) / framesPerSecond;
    beeperTsStep_ = static_cast<double>(tStatesPerFrame) / samplesPerFrame;
    reset();
}

void Audio::reset()
{
    earBit_ = 0;
    sampleIndex_ = 0;
    tsCounter_ = 0.0;
    outputLevel_ = 0.0;
}

void Audio::update(int32_t tStates)
{
    float level = earBit_ ? BEEPER_VOLUME : 0.0f;

    for (int32_t i = 0; i < tStates; i++)
    {
        tsCounter_ += 1.0;
        outputLevel_ += static_cast<double>(level);

        if (tsCounter_ >= beeperTsStep_)
        {
            if (sampleIndex_ < MAX_SAMPLES_PER_FRAME)
            {
                sampleBuffer_[sampleIndex_++] =
                    static_cast<float>(outputLevel_ / tsCounter_);
            }
            tsCounter_ -= beeperTsStep_;
            // Carry fractional T-state contribution into next sample
            outputLevel_ = static_cast<double>(level) * tsCounter_;
        }
    }
}

void Audio::frameEnd()
{
    // Accumulator carries over naturally — no flush needed
}

} // namespace zxspec
