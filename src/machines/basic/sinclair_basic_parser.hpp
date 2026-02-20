/*
 * sinclair_basic_parser.hpp - Tokenized BASIC bytes to text
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <string>

namespace zxspec {

class ZXSpectrum;

namespace basic {

// Parse the BASIC program from the machine's PROG->VARS memory region.
// Returns a JSON array of {lineNumber, text} objects.
std::string parseProgramFromMemory(const ZXSpectrum& machine);

} // namespace basic
} // namespace zxspec
