/*
 * sinclair_basic_writer.hpp - Write tokenized BASIC program to machine memory
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstddef>
#include <cstdint>

namespace zxspec {

class ZXSpectrum;

namespace basic {

// Write a tokenized BASIC program to the machine's memory.
// Updates all relevant system variables (VARS, NXTLIN, DATADD, E_LINE,
// K_CUR, CH_ADD, WORKSP, STKBOT, STKEND) and places end markers.
void writeProgramToMemory(ZXSpectrum& machine, const uint8_t* data, size_t length);

} // namespace basic
} // namespace zxspec
