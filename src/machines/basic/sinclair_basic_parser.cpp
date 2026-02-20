/*
 * sinclair_basic_parser.cpp - Tokenized BASIC bytes to text
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sinclair_basic_parser.hpp"
#include "sinclair_basic.hpp"
#include "../zx_spectrum.hpp"
#include <cctype>
#include <string>
#include <vector>

namespace zxspec {
namespace basic {

// JSON-escape a string
static void jsonEscape(std::string& out, const std::string& s) {
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:   out += c; break;
        }
    }
}

// Remove double spaces and trim
static std::string cleanText(const std::string& s) {
    std::string result;
    bool lastWasSpace = false;
    for (char c : s) {
        if (c == ' ') {
            if (lastWasSpace) continue;
            lastWasSpace = true;
        } else {
            lastWasSpace = false;
        }
        result += c;
    }
    // Trim
    size_t start = result.find_first_not_of(' ');
    if (start == std::string::npos) return "";
    size_t end = result.find_last_not_of(' ');
    return result.substr(start, end - start + 1);
}

std::string parseProgramFromMemory(const ZXSpectrum& machine) {
    // Read VARS and PROG pointers
    uint16_t varsAddr = machine.readMemory(sys::VARS) |
                        (static_cast<uint16_t>(machine.readMemory(sys::VARS + 1)) << 8);
    uint16_t progAddr = machine.readMemory(sys::PROG) |
                        (static_cast<uint16_t>(machine.readMemory(sys::PROG + 1)) << 8);

    if (varsAddr <= progAddr) return "[]";

    uint16_t programSize = varsAddr - progAddr;
    if (programSize == 0 || programSize > 0xFFFF) return "[]";

    // Read program data into a local buffer
    std::vector<uint8_t> data(programSize);
    for (uint16_t i = 0; i < programSize; i++) {
        data[i] = machine.readMemory((progAddr + i) & 0xFFFF);
    }

    // Parse lines
    std::string json = "[";
    bool first = true;
    size_t offset = 0;

    while (offset + 4 <= data.size()) {
        // Line number: 2 bytes big-endian
        uint16_t lineNumber = (static_cast<uint16_t>(data[offset]) << 8) | data[offset + 1];
        // Line length: 2 bytes little-endian
        uint16_t lineLength = data[offset + 2] | (static_cast<uint16_t>(data[offset + 3]) << 8);

        if (lineNumber > 9999 || lineLength == 0) break;

        offset += 4;
        size_t lineEnd = offset + lineLength;
        if (lineEnd > data.size()) break;

        std::string text;
        size_t i = offset;

        while (i < lineEnd) {
            uint8_t byte = data[i];

            // End of line marker
            if (byte == 0x0D) {
                i++;
                break;
            }

            // Number marker: skip 0x0E + 5 bytes of floating point
            if (byte == NUMBER_MARKER) {
                i += 6;
                continue;
            }

            // Colour control codes: 0x10-0x15 + 1 param byte
            if (byte >= 0x10 && byte <= 0x15) {
                i += 2;
                continue;
            }

            // AT/TAB control: 0x16-0x17 + 2 param bytes
            if (byte >= 0x16 && byte <= 0x17) {
                i += 3;
                continue;
            }

            // Token
            if (byte >= 0xA5) {
                const char* keyword = tokenToKeyword(byte);
                if (keyword) {
                    if (!text.empty() && text.back() != ' ') {
                        text += ' ';
                    }
                    text += keyword;
                    size_t kwLen = std::strlen(keyword);
                    char lastChar = keyword[kwLen - 1];
                    if (std::isalpha(static_cast<unsigned char>(lastChar)) ||
                        lastChar == '$' || lastChar == '#') {
                        text += ' ';
                    }
                }
                i++;
                continue;
            }

            // Printable ASCII
            if (byte >= 0x20 && byte < 0x80) {
                text += static_cast<char>(byte);
                i++;
                continue;
            }

            // Skip other control codes
            i++;
        }

        // Clean up
        text = cleanText(text);

        // Add to JSON
        if (!first) json += ",";
        first = false;
        json += "{\"lineNumber\":";
        json += std::to_string(lineNumber);
        json += ",\"text\":\"";
        jsonEscape(json, text);
        json += "\"}";

        offset = lineEnd;
    }

    json += "]";
    return json;
}

} // namespace basic
} // namespace zxspec
