/*
 * sinclair_basic_variables.hpp - BASIC variable inspector
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <string>

namespace zxspec {

class ZXSpectrum;

namespace basic {

// Parse all BASIC variables from the machine's VARS->E_LINE memory region.
// Returns a JSON array of variable objects.
std::string parseVariablesFromMemory(const ZXSpectrum& machine);

} // namespace basic
} // namespace zxspec
