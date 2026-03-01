/*
 * ay.cpp - AY-3-8912 Programmable Sound Generator
 *
 * Ported from the working web-a2e Mockingboard AY implementation,
 * adapted for ZX Spectrum clocking.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "ay.hpp"
#include <cstring>

namespace zxspec {

// Volume table based on AppleWin/MAME measurements
const float AY3_8912::volumeTable_[16] = {
    0.0000f, 0.0137f, 0.0205f, 0.0291f,
    0.0423f, 0.0618f, 0.0847f, 0.1369f,
    0.1691f, 0.2647f, 0.3527f, 0.4499f,
    0.5704f, 0.6873f, 0.8482f, 1.0000f
};

AY3_8912::AY3_8912() = default;

void AY3_8912::setup(int sampleRate, double framesPerSecond, int tStatesPerFrame)
{
    double samplesPerFrame = static_cast<double>(sampleRate) / framesPerSecond;
    tsStep_ = static_cast<double>(tStatesPerFrame) / samplesPerFrame;
    reset();
}

void AY3_8912::reset()
{
    regs_.fill(0);
    // All tone and noise disabled for silence
    regs_[7] = 0x3F;
    selectedReg_ = 0;

    toneCounters_.fill(0);
    toneOutput_.fill(false);
    channelMuted_.fill(false);

    noiseCounter_ = 0;
    noiseLFSR_ = 1;

    envCounter_ = 0;
    envVolume_ = 0;
    envHolding_ = false;
    envContinue_ = false;
    envAttack_ = false;
    envAlternate_ = false;
    envHold_ = false;

    sampleIndex_ = 0;
    tsCounter_ = 0.0;
    outputLevel_ = 0.0;
    ayTsCounter_ = 0.0;
    ayLevel_ = 0.0f;

    waveformWritePos_ = 0;
    std::memset(waveformBuffers_, 0, sizeof(waveformBuffers_));
}

// ============================================================================
// Port interface
// ============================================================================

void AY3_8912::selectRegister(uint8_t reg)
{
    selectedReg_ = reg & 0x0F;
}

void AY3_8912::writeData(uint8_t data)
{
    uint8_t reg = selectedReg_;
    switch (reg) {
        case 1: case 3: case 5:  // Tone coarse (4 bits)
            data &= 0x0F;
            break;
        case 6:  // Noise period (5 bits)
            data &= 0x1F;
            break;
        case 8: case 9: case 10:  // Channel amplitude (5 bits)
            data &= 0x1F;
            break;
        case 13:  // Envelope shape (4 bits) — writing restarts envelope
            data &= 0x0F;
            envCounter_ = 0;
            envHolding_ = false;
            envContinue_ = (data & 0x08) != 0;
            envAttack_   = (data & 0x04) != 0;
            envAlternate_ = (data & 0x02) != 0;
            envHold_     = (data & 0x01) != 0;
            envVolume_ = envAttack_ ? 0 : 15;
            break;
    }
    regs_[reg] = data;
}

uint8_t AY3_8912::readData() const
{
    return regs_[selectedReg_];
}

// ============================================================================
// Debug access
// ============================================================================

uint8_t AY3_8912::getRegister(int reg) const
{
    if (reg >= 0 && reg < 16) return regs_[reg];
    return 0;
}

void AY3_8912::setChannelMute(int ch, bool muted)
{
    if (ch >= 0 && ch < NUM_CHANNELS) channelMuted_[ch] = muted;
}

bool AY3_8912::getChannelMute(int ch) const
{
    if (ch >= 0 && ch < NUM_CHANNELS) return channelMuted_[ch];
    return false;
}

void AY3_8912::getWaveform(int ch, float* buf, int count) const
{
    if (ch < 0 || ch >= 3 || !buf || count <= 0) return;
    int n = count < WAVEFORM_BUFFER_SIZE ? count : WAVEFORM_BUFFER_SIZE;
    int readPos = (waveformWritePos_ - n + WAVEFORM_BUFFER_SIZE) % WAVEFORM_BUFFER_SIZE;
    for (int i = 0; i < n; i++) {
        buf[i] = waveformBuffers_[ch][readPos];
        readPos = (readPos + 1) % WAVEFORM_BUFFER_SIZE;
    }
    for (int i = n; i < count; i++) {
        buf[i] = 0.0f;
    }
}

// ============================================================================
// Per-T-state update (same pattern as beeper Audio::update)
// ============================================================================

void AY3_8912::update(int32_t tStates)
{
    for (int32_t i = 0; i < tStates; i++) {
        // Advance AY generators at exact PSG clock rate
        ayTsCounter_ += AY_TICKS_PER_TSTATE;
        while (ayTsCounter_ >= 1.0) {
            ayTsCounter_ -= 1.0;
            for (int ch = 0; ch < NUM_CHANNELS; ch++) {
                tickToneGenerator(ch);
            }
            tickNoiseGenerator();
            tickEnvelopeGenerator();
        }
        ayLevel_ = computeMixerOutput() * AY_VOLUME;

        // Accumulate AY level every T-state
        tsCounter_ += 1.0;
        outputLevel_ += static_cast<double>(ayLevel_);

        // Emit averaged sample at the same rate as the beeper
        if (tsCounter_ >= tsStep_) {
            if (sampleIndex_ < MAX_SAMPLES_PER_FRAME) {
                sampleBuffer_[sampleIndex_++] =
                    static_cast<float>(outputLevel_ / tsCounter_);

                // Store per-channel waveform samples at audio sample rate
                for (int ch = 0; ch < 3; ch++) {
                    waveformBuffers_[ch][waveformWritePos_] = getChannelOutput(ch);
                }
                waveformWritePos_ = (waveformWritePos_ + 1) % WAVEFORM_BUFFER_SIZE;
            }
            tsCounter_ -= tsStep_;
            outputLevel_ = static_cast<double>(ayLevel_) * tsCounter_;
        }
    }
}

void AY3_8912::frameEnd()
{
    // Accumulators carry over naturally
}

// ============================================================================
// Tone, noise, and envelope generators
// ============================================================================

uint16_t AY3_8912::getTonePeriod(int ch) const
{
    return regs_[ch * 2] | ((regs_[ch * 2 + 1] & 0x0F) << 8);
}

uint8_t AY3_8912::getNoisePeriod() const
{
    return regs_[6] & 0x1F;
}

uint16_t AY3_8912::getEnvPeriod() const
{
    return regs_[11] | (regs_[12] << 8);
}

void AY3_8912::tickToneGenerator(int ch)
{
    uint16_t period = getTonePeriod(ch);
    if (period == 0) period = 1;

    toneCounters_[ch]++;
    if (toneCounters_[ch] >= period) {
        toneCounters_[ch] = 0;
        toneOutput_[ch] = !toneOutput_[ch];
    }
}

void AY3_8912::tickNoiseGenerator()
{
    uint8_t period = getNoisePeriod();
    if (period == 0) period = 1;

    noiseCounter_++;
    if (noiseCounter_ >= static_cast<uint32_t>(period) * 2) {
        noiseCounter_ = 0;
        uint32_t feedback = (noiseLFSR_ & 1) ^ ((noiseLFSR_ >> 3) & 1);
        noiseLFSR_ = (noiseLFSR_ >> 1) | (feedback << 16);
    }
}

void AY3_8912::tickEnvelopeGenerator()
{
    if (envHolding_) return;

    uint16_t period = getEnvPeriod();
    uint32_t effectivePeriod = (period == 0) ? 1 : period;

    envCounter_++;
    if (envCounter_ >= effectivePeriod) {
        envCounter_ = 0;

        if (envAttack_) {
            if (envVolume_ < 15) {
                envVolume_++;
            } else {
                handleEnvelopeCycleEnd();
            }
        } else {
            if (envVolume_ > 0) {
                envVolume_--;
            } else {
                handleEnvelopeCycleEnd();
            }
        }
    }
}

void AY3_8912::handleEnvelopeCycleEnd()
{
    if (!envContinue_) {
        envVolume_ = 0;
        envHolding_ = true;
        return;
    }

    if (envHold_) {
        if (envAlternate_) {
            envVolume_ = envAttack_ ? 0 : 15;
        }
        envHolding_ = true;
    } else {
        if (envAlternate_) {
            envAttack_ = !envAttack_;
        } else {
            envVolume_ = envAttack_ ? 0 : 15;
        }
    }
}

// ============================================================================
// Mixer output
// ============================================================================

float AY3_8912::getChannelOutput(int ch) const
{
    if (ch < 0 || ch >= NUM_CHANNELS) return 0.0f;
    uint8_t mixer = regs_[7];
    uint8_t ampReg = regs_[8 + ch];
    uint8_t volume = (ampReg & 0x10) ? envVolume_ : (ampReg & 0x0F);
    if (volume == 0) return 0.0f;

    float level = volumeTable_[volume];

    bool toneDisable = (mixer & (1 << ch)) != 0;
    bool noiseDisable = (mixer & (1 << (ch + 3))) != 0;
    bool toneOut = toneOutput_[ch] || toneDisable;
    bool noiseOut = ((noiseLFSR_ & 1) != 0) || noiseDisable;

    return (toneOut && noiseOut) ? level : 0.0f;
}

bool AY3_8912::getToneOutput(int ch) const
{
    if (ch < 0 || ch >= NUM_CHANNELS) return false;
    return toneOutput_[ch];
}

uint32_t AY3_8912::getNoiseLFSR() const { return noiseLFSR_; }
uint8_t AY3_8912::getEnvVolume() const { return envVolume_; }
bool AY3_8912::getEnvHolding() const { return envHolding_; }
bool AY3_8912::getEnvAttack() const { return envAttack_; }

float AY3_8912::computeMixerOutput() const
{
    uint8_t mixer = regs_[7];
    float sample = 0.0f;

    for (int ch = 0; ch < NUM_CHANNELS; ch++) {
        if (channelMuted_[ch]) continue;

        uint8_t ampReg = regs_[8 + ch];
        uint8_t volume = (ampReg & 0x10) ? envVolume_ : (ampReg & 0x0F);
        if (volume == 0) continue;

        float level = volumeTable_[volume];

        bool toneDisable = (mixer & (1 << ch)) != 0;
        bool noiseDisable = (mixer & (1 << (ch + 3))) != 0;
        bool toneOut = toneOutput_[ch] || toneDisable;
        bool noiseOut = ((noiseLFSR_ & 1) != 0) || noiseDisable;

        sample += (toneOut && noiseOut) ? level : 0.0f;
    }

    return sample / 3.0f;
}

} // namespace zxspec
