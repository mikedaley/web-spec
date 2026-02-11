/*
 * ay8912.cpp - AY-3-8912 sound chip emulation implementation
 *
 * Ported from web-a2e Mockingboard ay8910.cpp
 * Adapted for ZX Spectrum clock (1.7734 MHz)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "ay8912.hpp"

namespace zxspec {

// Volume table based on AppleWin/MAME measurements
const float AY8912::volumeTable_[16] = {
    0.0000f, 0.0137f, 0.0205f, 0.0291f,
    0.0423f, 0.0618f, 0.0847f, 0.1369f,
    0.1691f, 0.2647f, 0.3527f, 0.4499f,
    0.5704f, 0.6873f, 0.8482f, 1.0000f
};

AY8912::AY8912() {
    reset();
}

void AY8912::reset() {
    registers_.fill(0);
    currentRegister_ = 0;

    // All tone and noise disabled for silence
    registers_[REG_MIXER] = 0x3F;

    toneCounters_.fill(0);
    toneOutput_.fill(false);
    channelMuted_.fill(false);

    noiseCounter_ = 0;
    noiseShiftReg_ = 1;

    envCounter_ = 0;
    envVolume_ = 0;
    envHolding_ = false;
    envContinue_ = false;
    envAttack_ = false;
    envAlternate_ = false;
    envHold_ = false;

}

void AY8912::setRegisterAddress(uint8_t address) {
    currentRegister_ = address & 0x0F;
}

void AY8912::writeRegister(uint8_t value) {
    applyRegisterWrite(currentRegister_, value);
}

void AY8912::applyRegisterWrite(uint8_t reg, uint8_t value) {
    switch (reg) {
        case REG_TONE_A_COARSE:
        case REG_TONE_B_COARSE:
        case REG_TONE_C_COARSE:
            value &= 0x0F;
            break;
        case REG_NOISE_PERIOD:
            value &= 0x1F;
            break;
        case REG_AMP_A:
        case REG_AMP_B:
        case REG_AMP_C:
            value &= 0x1F;
            break;
        case REG_ENV_SHAPE:
            value &= 0x0F;
            envCounter_ = 0;
            envHolding_ = false;
            envContinue_ = (value & 0x08) != 0;
            envAttack_ = (value & 0x04) != 0;
            envAlternate_ = (value & 0x02) != 0;
            envHold_ = (value & 0x01) != 0;
            if (envAttack_) {
                envVolume_ = 0;
            } else {
                envVolume_ = 15;
            }
            break;
    }

    registers_[reg] = value;
}

uint8_t AY8912::readRegister() const {
    return registers_[currentRegister_];
}

uint16_t AY8912::getTonePeriod(int channel) const {
    int fineReg = channel * 2;
    int coarseReg = channel * 2 + 1;
    return registers_[fineReg] | ((registers_[coarseReg] & 0x0F) << 8);
}

uint8_t AY8912::getNoisePeriod() const {
    return registers_[REG_NOISE_PERIOD] & 0x1F;
}

uint16_t AY8912::getEnvPeriod() const {
    return registers_[REG_ENV_FINE] | (registers_[REG_ENV_COARSE] << 8);
}

void AY8912::updateToneGenerator(int channel) {
    uint16_t period = getTonePeriod(channel);
    if (period == 0) period = 1;

    toneCounters_[channel]++;
    if (toneCounters_[channel] >= period) {
        toneCounters_[channel] = 0;
        toneOutput_[channel] = !toneOutput_[channel];
    }
}

void AY8912::updateNoiseGenerator() {
    uint8_t period = getNoisePeriod();
    if (period == 0) period = 1;

    noiseCounter_++;
    if (noiseCounter_ >= static_cast<uint32_t>(period) * 2) {
        noiseCounter_ = 0;
        uint32_t feedback = (noiseShiftReg_ & 1) ^ ((noiseShiftReg_ >> 3) & 1);
        noiseShiftReg_ = (noiseShiftReg_ >> 1) | (feedback << 16);
    }
}

void AY8912::updateEnvelopeGenerator() {
    if (envHolding_) return;

    uint16_t period = getEnvPeriod();

    envCounter_++;
    uint32_t effectivePeriod = (period == 0) ? 1 : period;
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

void AY8912::handleEnvelopeCycleEnd() {
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

void AY8912::tick() {
    for (int ch = 0; ch < NUM_CHANNELS; ch++) {
        updateToneGenerator(ch);
    }
    updateNoiseGenerator();
    updateEnvelopeGenerator();
}

float AY8912::getOutput() const {
    return computeMixerOutput();
}

float AY8912::getChannelOutput(int channel) const {
    if (channel < 0 || channel >= NUM_CHANNELS) return 0.0f;
    uint8_t mixer = registers_[REG_MIXER];
    uint8_t ampReg = registers_[REG_AMP_A + channel];
    uint8_t volume = (ampReg & 0x10) ? envVolume_ : (ampReg & 0x0F);
    if (volume == 0) return 0.0f;

    float level = volumeTable_[volume];

    bool toneDisable = (mixer & (1 << channel)) != 0;
    bool noiseDisable = (mixer & (1 << (channel + 3))) != 0;
    bool toneOut = toneOutput_[channel] || toneDisable;
    bool noiseOut = ((noiseShiftReg_ & 1) != 0) || noiseDisable;

    return (toneOut && noiseOut) ? level : 0.0f;
}

float AY8912::computeMixerOutput() const {
    uint8_t mixer = registers_[REG_MIXER];
    float sample = 0.0f;
    for (int ch = 0; ch < NUM_CHANNELS; ch++) {
        if (channelMuted_[ch]) continue;

        uint8_t ampReg = registers_[REG_AMP_A + ch];
        uint8_t volume = (ampReg & 0x10) ? envVolume_ : (ampReg & 0x0F);
        if (volume == 0) continue;

        float level = volumeTable_[volume];

        bool toneDisable = (mixer & (1 << ch)) != 0;
        bool noiseDisable = (mixer & (1 << (ch + 3))) != 0;
        bool toneOut = toneOutput_[ch] || toneDisable;
        bool noiseOut = ((noiseShiftReg_ & 1) != 0) || noiseDisable;

        sample += (toneOut && noiseOut) ? level : 0.0f;
    }
    return sample / 3.0f;
}

} // namespace zxspec
