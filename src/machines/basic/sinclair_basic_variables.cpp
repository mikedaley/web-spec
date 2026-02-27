/*
 * sinclair_basic_variables.cpp - BASIC variable inspector
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sinclair_basic_variables.hpp"
#include "sinclair_basic.hpp"
#include "sinclair_basic_float.hpp"
#include "../zx_spectrum.hpp"
#include <cmath>
#include <cstring>
#include <string>
#include <vector>

namespace zxspec {
namespace basic {

// Format a number for display (match JS behavior)
static std::string formatNumber(double value) {
    if (value == static_cast<int64_t>(value) && std::fabs(value) < 1e15) {
        return std::to_string(static_cast<int64_t>(value));
    }
    // Up to 8 significant digits, remove trailing zeros
    char buf[32];
    snprintf(buf, sizeof(buf), "%.8g", value);
    return buf;
}

// JSON-escape a string
static void jsonEscape(std::string& out, const std::string& s) {
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char hex[8];
                    snprintf(hex, sizeof(hex), "\\u%04x", static_cast<unsigned char>(c));
                    out += hex;
                } else {
                    out += c;
                }
                break;
        }
    }
}

std::string parseVariablesFromMemory(const ZXSpectrum& machine) {
    // Read PROG, VARS, and E_LINE pointers
    uint16_t progAddr = machine.readMemory(sys::PROG) |
                        (static_cast<uint16_t>(machine.readMemory(sys::PROG + 1)) << 8);
    uint16_t varsAddr = machine.readMemory(sys::VARS) |
                        (static_cast<uint16_t>(machine.readMemory(sys::VARS + 1)) << 8);
    uint16_t eLineAddr = machine.readMemory(sys::E_LINE) |
                         (static_cast<uint16_t>(machine.readMemory(sys::E_LINE + 1)) << 8);

    // Sanity checks
    if (progAddr < 0x5B00 || varsAddr < 0x5B00 || eLineAddr < 0x5B00) return "[]";
    if (varsAddr <= progAddr) return "[]";
    if (eLineAddr <= varsAddr) return "[]";
    if (varsAddr - progAddr <= 1) return "[]"; // Empty program

    uint16_t size = eLineAddr - varsAddr;
    if (size == 0 || size > 0xFFFF) return "[]";

    // Read variable data
    std::vector<uint8_t> data(size);
    for (uint16_t i = 0; i < size; i++) {
        data[i] = machine.readMemory((varsAddr + i) & 0xFFFF);
    }

    // Parse variables
    std::string json = "[";
    bool first = true;
    size_t i = 0;

    while (i < data.size()) {
        uint8_t byte = data[i];
        if (byte == 0x80) break; // End marker

        uint8_t topBits = byte & 0xE0;
        uint8_t letterCode = byte & 0x1F;

        if (letterCode < 1 || letterCode > 26) break;
        char letter = static_cast<char>(letterCode + 0x60);

        if (!first) json += ",";
        first = false;

        switch (topBits) {
            case 0x60: {
                // Single-letter numeric variable
                if (i + 6 > data.size()) goto done;
                double value = decodeNumber(&data[i + 1]);
                i += 6;
                json += "{\"name\":\"";
                json += letter;
                json += "\",\"type\":\"number\",\"value\":";
                json += formatNumber(value);
                json += "}";
                break;
            }

            case 0x40: {
                // Single-letter string variable
                if (i + 3 > data.size()) goto done;
                uint16_t strLen = data[i + 1] | (static_cast<uint16_t>(data[i + 2]) << 8);
                i += 3;
                std::string str;
                for (uint16_t c = 0; c < strLen && i < data.size(); c++, i++) {
                    str += static_cast<char>(data[i]);
                }
                json += "{\"name\":\"";
                json += letter;
                json += "$\",\"type\":\"string\",\"value\":\"";
                jsonEscape(json, str);
                json += "\"}";
                break;
            }

            case 0xA0: {
                // Multi-letter numeric variable
                std::string name;
                name += letter;
                i++;
                while (i < data.size()) {
                    uint8_t ch = data[i];
                    if (ch & 0x80) {
                        name += static_cast<char>(ch & 0x7F);
                        i++;
                        break;
                    }
                    name += static_cast<char>(ch);
                    i++;
                }
                if (i + 5 > data.size()) goto done;
                double val = decodeNumber(&data[i]);
                i += 5;
                json += "{\"name\":\"";
                jsonEscape(json, name);
                json += "\",\"type\":\"number\",\"value\":";
                json += formatNumber(val);
                json += "}";
                break;
            }

            case 0x80: {
                // Numeric array
                if (i + 3 > data.size()) goto done;
                uint16_t totalLen = data[i + 1] | (static_cast<uint16_t>(data[i + 2]) << 8);
                i += 3;
                size_t startOffset = i;
                if (i >= data.size()) goto done;
                uint8_t numDims = data[i];
                i++;
                std::vector<uint16_t> dims;
                for (uint8_t d = 0; d < numDims && i + 1 < data.size(); d++) {
                    dims.push_back(data[i] | (static_cast<uint16_t>(data[i + 1]) << 8));
                    i += 2;
                }
                uint32_t totalElements = 1;
                for (auto d : dims) totalElements *= d;

                json += "{\"name\":\"";
                json += letter;
                json += "()\",\"type\":\"numArray\",\"dimensions\":[";
                for (size_t d = 0; d < dims.size(); d++) {
                    if (d > 0) json += ",";
                    json += std::to_string(dims[d]);
                }
                json += "],\"elements\":[";
                for (uint32_t e = 0; e < totalElements && i + 4 < data.size(); e++) {
                    if (e > 0) json += ",";
                    json += formatNumber(decodeNumber(&data[i]));
                    i += 5;
                }
                json += "]}";
                i = startOffset + totalLen;
                break;
            }

            case 0xC0: {
                // String array
                if (i + 3 > data.size()) goto done;
                uint16_t totalLen = data[i + 1] | (static_cast<uint16_t>(data[i + 2]) << 8);
                i += 3;
                size_t startOffset = i;
                if (i >= data.size()) goto done;
                uint8_t numDims = data[i];
                i++;
                std::vector<uint16_t> dims;
                for (uint8_t d = 0; d < numDims && i + 1 < data.size(); d++) {
                    dims.push_back(data[i] | (static_cast<uint16_t>(data[i + 1]) << 8));
                    i += 2;
                }
                uint16_t strLen = dims.empty() ? 0 : dims.back();
                std::vector<uint16_t> outerDims(dims.begin(), dims.size() > 0 ? dims.end() - 1 : dims.end());
                uint32_t totalStrings = 1;
                for (auto d : outerDims) totalStrings *= d;

                json += "{\"name\":\"";
                json += letter;
                json += "$()\",\"type\":\"strArray\",\"dimensions\":[";
                for (size_t d = 0; d < outerDims.size(); d++) {
                    if (d > 0) json += ",";
                    json += std::to_string(outerDims[d]);
                }
                json += "],\"strLen\":";
                json += std::to_string(strLen);
                json += ",\"elements\":[";
                for (uint32_t e = 0; e < totalStrings && i + strLen - 1 < data.size(); e++) {
                    if (e > 0) json += ",";
                    std::string s;
                    for (uint16_t c = 0; c < strLen && i < data.size(); c++, i++) {
                        s += static_cast<char>(data[i]);
                    }
                    // Trim trailing spaces
                    size_t lastNonSpace = s.find_last_not_of(' ');
                    if (lastNonSpace != std::string::npos) {
                        s = s.substr(0, lastNonSpace + 1);
                    } else {
                        s.clear();
                    }
                    json += "\"";
                    jsonEscape(json, s);
                    json += "\"";
                }
                json += "]}";
                i = startOffset + totalLen;
                break;
            }

            case 0xE0: {
                // FOR loop control variable
                if (i + 19 > data.size()) goto done;
                double forVal = decodeNumber(&data[i + 1]);
                double limit = decodeNumber(&data[i + 6]);
                double step = decodeNumber(&data[i + 11]);
                uint16_t loopLine = data[i + 16] | (static_cast<uint16_t>(data[i + 17]) << 8);
                uint8_t loopStmt = data[i + 18];
                i += 19;
                json += "{\"name\":\"";
                json += letter;
                json += "\",\"type\":\"for\",\"value\":";
                json += formatNumber(forVal);
                json += ",\"limit\":";
                json += formatNumber(limit);
                json += ",\"step\":";
                json += formatNumber(step);
                json += ",\"loopLine\":";
                json += std::to_string(loopLine);
                json += ",\"loopStmt\":";
                json += std::to_string(loopStmt);
                json += "}";
                break;
            }

            default:
                goto done;
        }
    }

done:

    // Scan program lines (PROG->VARS) for DEF FN definitions.
    // These are not stored in the VARS area — they live inline in the program.
    {
        uint16_t programSize = varsAddr - progAddr;
        if (programSize > 0 && programSize < 0xFFFF) {
            std::vector<uint8_t> prog(programSize);
            for (uint16_t p = 0; p < programSize; p++) {
                prog[p] = machine.readMemory((progAddr + p) & 0xFFFF);
            }

            size_t offset = 0;
            while (offset + 4 <= prog.size()) {
                uint16_t lineNumber = (static_cast<uint16_t>(prog[offset]) << 8) | prog[offset + 1];
                uint16_t lineLength = prog[offset + 2] | (static_cast<uint16_t>(prog[offset + 3]) << 8);
                if (lineNumber > 9999 || lineLength == 0) break;

                size_t lineStart = offset + 4;
                size_t lineEnd = lineStart + lineLength;
                if (lineEnd > prog.size()) break;

                // Scan for DEF FN token (0xCE) within this line
                size_t p = lineStart;
                bool inString = false;
                while (p < lineEnd) {
                    uint8_t b = prog[p];
                    if (b == 0x0D) break;

                    // Track string literals to avoid false matches
                    if (b == 0x22) { inString = !inString; p++; continue; }
                    if (inString) { p++; continue; }

                    // Skip number marker + 5-byte float
                    if (b == NUMBER_MARKER) { p += 6; continue; }

                    if (b == 0xCE) { // DEF FN token
                        p++;

                        // Skip spaces
                        while (p < lineEnd && prog[p] == 0x20) p++;

                        // Function name letter
                        if (p >= lineEnd || !std::isalpha(prog[p])) break;
                        char fnName = static_cast<char>(prog[p]);
                        p++;

                        // Optional $ for string function
                        bool isStringFn = false;
                        if (p < lineEnd && prog[p] == '$') {
                            isStringFn = true;
                            p++;
                        }

                        // Skip spaces
                        while (p < lineEnd && prog[p] == 0x20) p++;

                        // Opening bracket
                        if (p >= lineEnd || prog[p] != '(') break;
                        p++;

                        // Parse parameter list
                        std::string params;
                        while (p < lineEnd && prog[p] != ')') {
                            uint8_t ch = prog[p];
                            if (ch == NUMBER_MARKER) { p += 6; continue; }
                            if (std::isalpha(ch)) {
                                if (!params.empty() && params.back() != ',') params += ",";
                                params += static_cast<char>(ch);
                                p++;
                                if (p < lineEnd && prog[p] == '$') {
                                    params += '$';
                                    p++;
                                }
                            } else if (ch == ',') {
                                p++;
                            } else if (ch == ' ') {
                                p++;
                            } else {
                                p++;
                            }
                        }
                        if (p < lineEnd && prog[p] == ')') p++; // skip )

                        // Skip spaces and '='
                        while (p < lineEnd && prog[p] == 0x20) p++;
                        if (p < lineEnd && prog[p] == '=') p++;
                        while (p < lineEnd && prog[p] == 0x20) p++;

                        // Extract expression text (rest of the DEF FN until : or end of line)
                        std::string expr;
                        while (p < lineEnd) {
                            uint8_t eb = prog[p];
                            if (eb == 0x0D) break;
                            if (eb == ':') break;
                            if (eb == NUMBER_MARKER) { p += 6; continue; }
                            if (eb >= 0xA5) {
                                const char* kw = tokenToKeyword(eb);
                                if (kw) expr += kw;
                                p++;
                                continue;
                            }
                            if (eb >= 0x20 && eb < 0x80) {
                                expr += static_cast<char>(eb);
                            }
                            p++;
                        }

                        // Trim expression
                        size_t es = expr.find_first_not_of(' ');
                        size_t ee = expr.find_last_not_of(' ');
                        if (es != std::string::npos) {
                            expr = expr.substr(es, ee - es + 1);
                        }

                        // Emit JSON
                        if (!first) json += ",";
                        first = false;
                        json += "{\"name\":\"FN ";
                        json += fnName;
                        if (isStringFn) json += '$';
                        json += "(";
                        jsonEscape(json, params);
                        json += ")\",\"type\":\"defFn\",\"line\":";
                        json += std::to_string(lineNumber);
                        json += ",\"expression\":\"";
                        jsonEscape(json, expr);
                        json += "\"}";

                        break; // Only one DEF FN per scan position
                    }

                    p++;
                }

                offset = lineEnd;
            }
        }
    }

    json += "]";
    return json;
}

} // namespace basic
} // namespace zxspec
