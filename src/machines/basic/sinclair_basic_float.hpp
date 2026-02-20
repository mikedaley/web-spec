/*
 * sinclair_basic_float.hpp - 5-byte Sinclair BASIC floating point codec
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {
namespace basic {

// Encode a number into 5-byte Sinclair BASIC floating point format.
// Uses integer shorthand for integers in range -65535..65535.
void encodeNumber(double value, uint8_t out[5]);

// Decode a 5-byte Sinclair BASIC floating point number.
double decodeNumber(const uint8_t data[5]);

} // namespace basic
} // namespace zxspec
