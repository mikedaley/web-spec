/*
 * ay_sound_board.cpp - AY-3-8912 sound board peripheral implementation
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "ay_sound_board.hpp"

namespace zxspec {

AYSoundBoard::AYSoundBoard() = default;

void AYSoundBoard::setup(int sampleRate, double fps, int tsPerFrame) {
    double samplesPerFrame = static_cast<double>(sampleRate) / fps;
    tsStep_ = static_cast<double>(tsPerFrame) / samplesPerFrame;
    reset();
}

bool AYSoundBoard::claimsPort(uint16_t address, bool isWrite) const {
    // Register select: (address & 0xC002) == 0xC000 (port 0xFFFD)
    if ((address & 0xC002) == 0xC000) return true;
    // Data write: (address & 0xC002) == 0x8000 (port 0xBFFD)
    if (isWrite && (address & 0xC002) == 0x8000) return true;
    return false;
}

uint8_t AYSoundBoard::ioRead(uint16_t address) {
    // Only register select port is readable (returns current register value)
    if ((address & 0xC002) == 0xC000) {
        return ay_.readRegister();
    }
    return 0xFF;
}

void AYSoundBoard::ioWrite(uint16_t address, uint8_t data) {
    if ((address & 0xC002) == 0xC000) {
        // Register select
        ay_.setRegisterAddress(data);
    } else if ((address & 0xC002) == 0x8000) {
        // Data write
        ay_.writeRegister(data);
    }
}

void AYSoundBoard::update(int32_t tStates) {
    for (int32_t i = 0; i < tStates; i++) {
        // Advance AY generators at exact PSG clock rate
        ayTsCounter_ += AY_TICKS_PER_TSTATE;
        while (ayTsCounter_ >= 1.0) {
            ayTsCounter_ -= 1.0;
            ay_.tick();
        }
        ayLevel_ = ay_.getOutput() * AY_VOLUME;

        // Accumulate AY level every T-state
        tsCounter_ += 1.0;
        outputLevel_ += static_cast<double>(ayLevel_);

        // Emit averaged sample at the same rate as the beeper
        if (tsCounter_ >= tsStep_) {
            if (sampleIndex_ < MAX_SAMPLES_PER_FRAME) {
                sampleBuffer_[sampleIndex_++] =
                    static_cast<float>(outputLevel_ / tsCounter_);

                // Store per-channel waveform samples
                for (int ch = 0; ch < 3; ch++) {
                    waveformBuffers_[ch][waveformWritePos_] = ay_.getChannelOutput(ch);
                }
                waveformWritePos_ = (waveformWritePos_ + 1) % WAVEFORM_BUFFER_SIZE;
            }
            tsCounter_ -= tsStep_;
            // Carry fractional T-state contribution into next sample
            outputLevel_ = static_cast<double>(ayLevel_) * tsCounter_;
        }
    }
}

void AYSoundBoard::frameEnd() {
    // Accumulators carry over naturally
}

void AYSoundBoard::reset() {
    ay_.reset();
    sampleIndex_ = 0;
    tsCounter_ = 0.0;
    outputLevel_ = 0.0;
    ayTsCounter_ = 0.0;
    ayLevel_ = 0.0f;
    waveformWritePos_ = 0;
    for (int ch = 0; ch < 3; ch++) {
        for (int i = 0; i < WAVEFORM_BUFFER_SIZE; i++) {
            waveformBuffers_[ch][i] = 0.0f;
        }
    }
}

void AYSoundBoard::getWaveform(int channel, float* buffer, int sampleCount) const {
    if (channel < 0 || channel >= 3 || !buffer || sampleCount <= 0) return;
    int count = sampleCount < WAVEFORM_BUFFER_SIZE ? sampleCount : WAVEFORM_BUFFER_SIZE;
    // Read from ring buffer starting at oldest sample
    int readPos = (waveformWritePos_ - count + WAVEFORM_BUFFER_SIZE) % WAVEFORM_BUFFER_SIZE;
    for (int i = 0; i < count; i++) {
        buffer[i] = waveformBuffers_[channel][readPos];
        readPos = (readPos + 1) % WAVEFORM_BUFFER_SIZE;
    }
    // Zero-fill any remaining
    for (int i = count; i < sampleCount; i++) {
        buffer[i] = 0.0f;
    }
}

} // namespace zxspec
