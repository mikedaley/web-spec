/*
 * sinclair_basic_float.cpp - 5-byte Sinclair BASIC floating point codec
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sinclair_basic_float.hpp"
#include <cmath>
#include <cstring>

namespace zxspec {
namespace basic {

void encodeNumber(double value, uint8_t out[5]) {
    // Integer shorthand: -65535..65535 stored compactly
    if (value == static_cast<int>(value) && value >= -65535 && value <= 65535) {
        int intVal = static_cast<int>(value);
        if (intVal >= 0) {
            out[0] = 0x00;
            out[1] = 0x00;
            out[2] = intVal & 0xFF;
            out[3] = (intVal >> 8) & 0xFF;
            out[4] = 0x00;
        } else {
            int absVal = -intVal;
            out[0] = 0x00;
            out[1] = 0xFF;
            out[2] = absVal & 0xFF;
            out[3] = (absVal >> 8) & 0xFF;
            out[4] = 0x00;
        }
        return;
    }

    // Zero
    if (value == 0.0) {
        memset(out, 0, 5);
        return;
    }

    bool negative = value < 0;
    double abs = std::fabs(value);

    // Find exponent: abs = mantissa * 2^exp where 0.5 <= mantissa < 1
    int exp = 0;
    double m = abs;
    if (m >= 1.0) {
        while (m >= 1.0) { m /= 2.0; exp++; }
    } else {
        while (m < 0.5) { m *= 2.0; exp--; }
    }

    // Spectrum stores exponent biased by 128
    int biasedExp = exp + 128;
    if (biasedExp <= 0 || biasedExp > 255) {
        // Overflow/underflow - store as zero
        memset(out, 0, 5);
        return;
    }

    // Mantissa: 4 bytes. m is in [0.5, 1), multiply by 2^32 to get 32-bit mantissa
    uint32_t mantissa32 = static_cast<uint32_t>(std::round(m * 4294967296.0)); // 2^32

    uint8_t b1 = (mantissa32 >> 24) & 0xFF;
    uint8_t b2 = (mantissa32 >> 16) & 0xFF;
    uint8_t b3 = (mantissa32 >> 8) & 0xFF;
    uint8_t b4 = mantissa32 & 0xFF;

    // Replace implied 1 (bit 7 of b1) with sign bit
    if (negative) {
        b1 |= 0x80;
    } else {
        b1 &= 0x7F;
    }

    out[0] = static_cast<uint8_t>(biasedExp);
    out[1] = b1;
    out[2] = b2;
    out[3] = b3;
    out[4] = b4;
}

double decodeNumber(const uint8_t data[5]) {
    uint8_t exp = data[0];

    // Integer shorthand: exponent = 0
    if (exp == 0) {
        uint8_t sign = data[1];
        uint16_t intVal = data[2] | (static_cast<uint16_t>(data[3]) << 8);
        if (sign == 0xFF) {
            // Negative
            return intVal >= 0x8000 ? static_cast<double>(static_cast<int16_t>(intVal))
                                    : -static_cast<double>(intVal);
        }
        return static_cast<double>(intVal);
    }

    // Full floating point
    bool signBit = (data[1] & 0x80) != 0;
    // Restore implied leading 1
    uint8_t b1 = (data[1] & 0x7F) | 0x80;
    uint8_t b2 = data[2];
    uint8_t b3 = data[3];
    uint8_t b4 = data[4];

    // Mantissa as fraction in [0.5, 1)
    double mantissa = (b1 * 16777216.0 + b2 * 65536.0 + b3 * 256.0 + b4) / 4294967296.0;

    // Value = mantissa * 2^(exp - 128)
    double value = mantissa * std::pow(2.0, static_cast<int>(exp) - 128);

    return signBit ? -value : value;
}

} // namespace basic
} // namespace zxspec
