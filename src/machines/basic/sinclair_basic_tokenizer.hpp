/*
 * sinclair_basic_tokenizer.hpp - Text to tokenized BASIC bytes
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace zxspec {
namespace basic {

// Tokenize a complete BASIC program from text lines.
// Returns the complete tokenized program bytes (line headers + body + 0x0D terminators).
std::vector<uint8_t> tokenize(const std::string& text);

} // namespace basic
} // namespace zxspec
