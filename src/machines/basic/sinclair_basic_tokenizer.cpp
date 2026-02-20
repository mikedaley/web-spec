/*
 * sinclair_basic_tokenizer.cpp - Text to tokenized BASIC bytes
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sinclair_basic_tokenizer.hpp"
#include "sinclair_basic.hpp"
#include "sinclair_basic_float.hpp"
#include <cctype>
#include <cstdlib>
#include <sstream>

namespace zxspec {
namespace basic {

// Tokenize the body of a single BASIC line (after the line number)
static void tokenizeLine(const std::string& text, std::vector<uint8_t>& bytes) {
    const auto& lookup = TokenLookup::instance();
    const auto& kwByLen = lookup.keywordsByLength();
    size_t i = 0;
    size_t len = text.length();
    bool inRem = false;
    bool inDefFnParams = false;

    while (i < len) {
        // After REM, everything is literal
        if (inRem) {
            bytes.push_back(static_cast<uint8_t>(text[i]));
            i++;
            continue;
        }

        // Inside DEF FN parameter list
        if (inDefFnParams) {
            if (text[i] == ')') {
                inDefFnParams = false;
                bytes.push_back(0x29); // )
                i++;
                continue;
            }
            if (text[i] == ',' || text[i] == ' ') {
                bytes.push_back(static_cast<uint8_t>(text[i]));
                i++;
                continue;
            }
            if (std::isalpha(static_cast<unsigned char>(text[i]))) {
                // Parameter variable letter + number placeholder
                bytes.push_back(static_cast<uint8_t>(text[i]));
                i++;
                bytes.push_back(NUMBER_MARKER);
                bytes.push_back(0x00);
                bytes.push_back(0x00);
                bytes.push_back(0x00);
                bytes.push_back(0x00);
                bytes.push_back(0x00);
                continue;
            }
            bytes.push_back(static_cast<uint8_t>(text[i]));
            i++;
            continue;
        }

        // String literal - pass through verbatim
        if (text[i] == '"') {
            bytes.push_back(0x22);
            i++;
            while (i < len && text[i] != '"') {
                bytes.push_back(static_cast<uint8_t>(text[i]));
                i++;
            }
            if (i < len) {
                bytes.push_back(0x22);
                i++;
            }
            continue;
        }

        // Try keyword match (longest first, case-insensitive)
        bool matched = false;
        for (const auto& kw : kwByLen) {
            if (i + kw.length() > len) continue;

            // Case-insensitive comparison
            bool match = true;
            for (size_t c = 0; c < kw.length(); c++) {
                if (std::toupper(static_cast<unsigned char>(text[i + c])) !=
                    static_cast<unsigned char>(kw[c])) {
                    match = false;
                    break;
                }
            }
            if (!match) continue;

            // Verify word boundary
            size_t afterKw = i + kw.length();
            if (afterKw < len) {
                char lastKwChar = kw[kw.length() - 1];
                char nextChar = text[afterKw];
                if (std::isalpha(static_cast<unsigned char>(lastKwChar)) &&
                    std::isalnum(static_cast<unsigned char>(nextChar))) {
                    continue;
                }
            }

            uint8_t token = lookup.keywordToToken(kw);
            bytes.push_back(token);
            i += kw.length();
            matched = true;

            // Skip trailing space after keyword
            if (i < len && text[i] == ' ') i++;

            if (kw == "REM") {
                inRem = true;
            }

            // After BIN token: consume binary digits, emit as ASCII + number marker
            if (kw == "BIN") {
                while (i < len && text[i] == ' ') i++;
                size_t binStart = i;
                while (i < len && (text[i] == '0' || text[i] == '1')) i++;
                std::string binStr = text.substr(binStart, i - binStart);
                for (char c : binStr) {
                    bytes.push_back(static_cast<uint8_t>(c));
                }
                int binVal = binStr.length() > 0 ? static_cast<int>(std::strtol(binStr.c_str(), nullptr, 2)) : 0;
                bytes.push_back(NUMBER_MARKER);
                uint8_t encoded[5];
                encodeNumber(static_cast<double>(binVal), encoded);
                bytes.insert(bytes.end(), encoded, encoded + 5);
            }

            // After DEF FN token
            if (kw == "DEF FN") {
                while (i < len && text[i] == ' ') {
                    bytes.push_back(0x20);
                    i++;
                }
                if (i < len && std::isalpha(static_cast<unsigned char>(text[i]))) {
                    bytes.push_back(static_cast<uint8_t>(text[i]));
                    i++;
                }
                while (i < len && text[i] == ' ') {
                    bytes.push_back(0x20);
                    i++;
                }
                if (i < len && text[i] == '(') {
                    bytes.push_back(0x28);
                    i++;
                    inDefFnParams = true;
                }
            }

            break;
        }
        if (matched) continue;

        // Numeric literal - emit ASCII digits + number marker + 5-byte float
        if (text[i] >= '0' && text[i] <= '9') {
            size_t numEnd = i;
            bool hasDot = false;
            while (numEnd < len) {
                if (text[numEnd] >= '0' && text[numEnd] <= '9') {
                    numEnd++;
                } else if (text[numEnd] == '.' && !hasDot) {
                    hasDot = true;
                    numEnd++;
                } else if ((text[numEnd] == 'e' || text[numEnd] == 'E') && numEnd > i) {
                    numEnd++;
                    if (numEnd < len && (text[numEnd] == '+' || text[numEnd] == '-')) numEnd++;
                } else {
                    break;
                }
            }

            std::string numStr = text.substr(i, numEnd - i);
            for (char c : numStr) {
                bytes.push_back(static_cast<uint8_t>(c));
            }

            double numVal = std::strtod(numStr.c_str(), nullptr);
            bytes.push_back(NUMBER_MARKER);
            uint8_t encoded[5];
            encodeNumber(numVal, encoded);
            bytes.insert(bytes.end(), encoded, encoded + 5);

            i = numEnd;
            continue;
        }

        // Regular character
        bytes.push_back(static_cast<uint8_t>(text[i]));
        i++;
    }
}

std::vector<uint8_t> tokenize(const std::string& text) {
    std::vector<uint8_t> allBytes;
    std::istringstream stream(text);
    std::string line;

    while (std::getline(stream, line)) {
        // Trim
        size_t start = line.find_first_not_of(" \t\r");
        if (start == std::string::npos) continue;
        size_t end = line.find_last_not_of(" \t\r");
        std::string trimmed = line.substr(start, end - start + 1);
        if (trimmed.empty()) continue;

        // Parse line number
        size_t i = 0;
        while (i < trimmed.length() && trimmed[i] >= '0' && trimmed[i] <= '9') i++;
        if (i == 0) continue;

        int lineNumber = std::stoi(trimmed.substr(0, i));
        if (lineNumber < 0 || lineNumber > 9999) continue;

        // Skip whitespace after line number
        while (i < trimmed.length() && trimmed[i] == ' ') i++;

        std::string bodyText = trimmed.substr(i);
        std::vector<uint8_t> bodyBytes;
        tokenizeLine(bodyText, bodyBytes);

        // Line format: [hi][lo] line number (big endian), [lo][hi] length (little endian), body..., 0x0D
        uint16_t lineLength = static_cast<uint16_t>(bodyBytes.size() + 1); // +1 for 0x0D
        allBytes.push_back((lineNumber >> 8) & 0xFF);
        allBytes.push_back(lineNumber & 0xFF);
        allBytes.push_back(lineLength & 0xFF);
        allBytes.push_back((lineLength >> 8) & 0xFF);
        allBytes.insert(allBytes.end(), bodyBytes.begin(), bodyBytes.end());
        allBytes.push_back(0x0D);
    }

    return allBytes;
}

} // namespace basic
} // namespace zxspec
