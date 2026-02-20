/*
 * sinclair_basic_renumber.hpp - BASIC line renumbering
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <string>

namespace zxspec {
namespace basic {

// Full renumber: reassign all line numbers starting at startNum with given step.
// Updates GO TO, GO SUB, RESTORE, RUN references using tokenization.
// Returns the renumbered program text.
std::string renumberProgram(const std::string& text, int startNum, int step);

// Auto-renumber: detect and fix insertion conflicts.
// When a new line is inserted that creates a line number ordering conflict,
// bump subsequent conflicting lines by 10 and update references.
// Returns the renumbered program text, or the original text if no conflicts found.
std::string autoRenumber(const std::string& text);

} // namespace basic
} // namespace zxspec
