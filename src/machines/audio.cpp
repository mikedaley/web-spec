/*
 * audio.cpp - Audio subsystem (beeper) shared across machine variants
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "audio.hpp"

namespace zxspec {

Audio::Audio() = default;

// Calculate how many T-states elapse between each audio sample.
//
// For the 48K: 48000 Hz / 50.08 fps ≈ 958.7 samples per frame.
// With 69,888 T-states per frame: 69888 / 958.7 ≈ 72.9 T-states per sample.
//
// The fractional accumulator in update() handles the non-integer ratio
// smoothly, producing exactly the right number of samples per frame.
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

// Advance the audio accumulator by the given number of T-states.
//
// Uses a simple box-averaging approach: for each T-state, we accumulate the
// current beeper level. When enough T-states have elapsed to fill one audio
// sample (~72.9 T-states for 48K), we average the accumulated level and emit
// a sample. The fractional remainder carries over to the next sample period,
// ensuring smooth timing without drift.
//
// This is called after every CPU instruction with the instruction's T-state
// count, so the beeper output faithfully tracks rapid bit-banging.
void Audio::update(int32_t tStates)
{
    // Current output level: beeper contributes BEEPER_VOLUME when EAR bit is set,
    // tape playback adds TAPE_VOLUME when active
    float level = (earBit_ ? BEEPER_VOLUME : 0.0f)
               + (tapeEarBit_ ? TAPE_VOLUME : 0.0f);

    for (int32_t i = 0; i < tStates; i++)
    {
        tsCounter_ += 1.0;
        outputLevel_ += static_cast<double>(level);

        // Have we accumulated enough T-states for one audio sample?
        if (tsCounter_ >= beeperTsStep_)
        {
            if (sampleIndex_ < MAX_SAMPLES_PER_FRAME)
            {
                // Average the accumulated level over the sample period
                float sample = static_cast<float>(outputLevel_ / tsCounter_);
                sampleBuffer_[sampleIndex_++] = sample;

                // Store in waveform ring buffer for debug display
                waveformBuffer_[waveformWritePos_] = sample;
                waveformWritePos_ = (waveformWritePos_ + 1) % WAVEFORM_BUFFER_SIZE;
            }
            // Carry the fractional remainder into the next sample period,
            // preserving the current level contribution for the overflow portion
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
