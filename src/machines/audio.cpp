/*
 * audio.cpp - Audio subsystem (beeper) shared across machine variants
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
    micBit_ = 0;
    tapeEarBit_ = 0;
    sampleIndex_ = 0;
    tsCounter_ = 0.0;
    outputLevel_ = 0.0;
    waveformWritePos_ = 0;
    for (int i = 0; i < WAVEFORM_BUFFER_SIZE; i++) waveformBuffer_[i] = 0.0f;
}

void Audio::update(int32_t tStates)
{
    float level = (earBit_ ? BEEPER_VOLUME : 0.0f)
               + (tapeEarBit_ ? TAPE_VOLUME : 0.0f);

    for (int32_t i = 0; i < tStates; i++)
    {
        tsCounter_ += 1.0;
        outputLevel_ += static_cast<double>(level);

        if (tsCounter_ >= beeperTsStep_)
        {
            if (sampleIndex_ < MAX_SAMPLES_PER_FRAME)
            {
                float sample = static_cast<float>(outputLevel_ / tsCounter_);
                sampleBuffer_[sampleIndex_++] = sample;

                // Store in waveform ring buffer for debug display
                waveformBuffer_[waveformWritePos_] = sample;
                waveformWritePos_ = (waveformWritePos_ + 1) % WAVEFORM_BUFFER_SIZE;
            }
            tsCounter_ -= beeperTsStep_;
            outputLevel_ = static_cast<double>(level) * tsCounter_;
        }
    }
}

void Audio::frameEnd()
{
    // Accumulator carries over naturally — no flush needed
}

void Audio::getWaveform(float* buf, int count) const
{
    // Copy the ring buffer in order: oldest → newest
    for (int i = 0; i < count; i++) {
        int idx = (waveformWritePos_ - count + i + WAVEFORM_BUFFER_SIZE) % WAVEFORM_BUFFER_SIZE;
        buf[i] = waveformBuffer_[idx];
    }
}

} // namespace zxspec
