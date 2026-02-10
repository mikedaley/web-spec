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
    tsInStep_ = 0;
}

void Audio::update(int32_t tStates)
{
    float level = earBit_ ? BEEPER_VOLUME : 0.0f;

    for (int32_t i = 0; i < tStates; i++)
    {
        outputLevel_ += static_cast<double>(level);
        tsInStep_++;
        tsCounter_ += 1.0;

        if (tsCounter_ >= beeperTsStep_)
        {
            if (sampleIndex_ < MAX_SAMPLES_PER_FRAME)
            {
                sampleBuffer_[sampleIndex_++] =
                    static_cast<float>(outputLevel_ / tsInStep_);
            }
            tsCounter_ -= beeperTsStep_;
            outputLevel_ = 0.0;
            tsInStep_ = 0;
        }
    }
}

void Audio::frameEnd()
{
    // Flush any remaining accumulated samples
    if (tsInStep_ > 0 && sampleIndex_ < MAX_SAMPLES_PER_FRAME)
    {
        sampleBuffer_[sampleIndex_++] =
            static_cast<float>(outputLevel_ / tsInStep_);
        outputLevel_ = 0.0;
        tsInStep_ = 0;
    }
}

} // namespace zxspec
