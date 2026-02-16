/*
 * peripheral.hpp - Abstract base class for expansion peripherals
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

class Peripheral {
public:
    virtual ~Peripheral() = default;

    virtual const char* getName() const = 0;
    virtual bool claimsPort(uint16_t address, bool isWrite) const = 0;
    virtual uint8_t ioRead(uint16_t address) = 0;
    virtual void ioWrite(uint16_t address, uint8_t data) = 0;
    virtual void setup(int /*sampleRate*/, double /*fps*/, int /*tsPerFrame*/) {}
    virtual void update(int32_t tStates) {}
    virtual void frameEnd() {}
    virtual void reset() = 0;

    // Optional audio output for peripherals that generate sound
    virtual const float* getAudioBuffer() const { return nullptr; }
    virtual int getAudioSampleCount() const { return 0; }
    virtual void resetAudioBuffer() {}
};

} // namespace zxspec
