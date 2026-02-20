/*
 * sinclair_basic_renumber.cpp - BASIC line renumbering using tokenization
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "sinclair_basic_renumber.hpp"
#include "sinclair_basic.hpp"
#include "sinclair_basic_tokenizer.hpp"
#include <algorithm>
#include <cctype>
#include <map>
#include <sstream>
#include <vector>

namespace zxspec {
namespace basic {

// Token codes for keywords that reference line numbers
static constexpr uint8_t TOK_GO_TO   = 0xEC;
static constexpr uint8_t TOK_GO_SUB  = 0xED;
static constexpr uint8_t TOK_RESTORE = 0xE5;
static constexpr uint8_t TOK_RUN     = 0xF7;
static constexpr uint8_t TOK_REM     = 0xEA;

struct ParsedLine {
    int lineNumber;
    std::string body;
    int rawIndex; // index in the original lines array
};

// Split text into lines
static std::vector<std::string> splitLines(const std::string& text)
{
    std::vector<std::string> lines;
    std::istringstream stream(text);
    std::string line;
    while (std::getline(stream, line)) {
        lines.push_back(line);
    }
    return lines;
}

// Parse a raw line into line number + body
static bool parseLine(const std::string& raw, int& lineNumber, std::string& body)
{
    // Skip leading whitespace
    size_t pos = 0;
    while (pos < raw.size() && std::isspace(static_cast<unsigned char>(raw[pos]))) pos++;
    if (pos >= raw.size() || !std::isdigit(static_cast<unsigned char>(raw[pos]))) return false;

    // Read line number
    size_t numStart = pos;
    while (pos < raw.size() && std::isdigit(static_cast<unsigned char>(raw[pos]))) pos++;
    lineNumber = std::stoi(raw.substr(numStart, pos - numStart));

    // Skip whitespace after line number
    while (pos < raw.size() && raw[pos] == ' ') pos++;

    body = raw.substr(pos);
    return true;
}

// Check if a token byte is a line-number-referencing keyword
static bool isLineRefToken(uint8_t tok)
{
    return tok == TOK_GO_TO || tok == TOK_GO_SUB || tok == TOK_RESTORE || tok == TOK_RUN;
}

// Update line number references in a BASIC line body using tokenization.
// Tokenizes the body to find GO TO/GO SUB/RESTORE/RUN tokens,
// then replaces the literal number following them in the source text.
static std::string updateReferences(const std::string& body, const std::map<int, int>& mapping)
{
    if (mapping.empty() || body.empty()) return body;

    // Tokenize "0 <body>" to get proper token bytes (line number 0 is a dummy)
    std::string dummyLine = "0 " + body;
    auto tokens = tokenize(dummyLine);

    // Walk the token bytes looking for referencing keywords.
    // The tokenized format is: 2-byte line number (big endian), 2-byte length (LE), body bytes, 0x0D
    // Skip the first 4 bytes (line header) to get to the body tokens.
    if (tokens.size() < 5) return body;

    // Collect positions of literal numbers that follow referencing keywords.
    // We work on the source text, using the keyword text positions to find the numbers.
    // Strategy: scan the body text for keyword occurrences, then check if the token
    // stream confirms them (to avoid matching inside strings/REM).

    // Simpler approach: walk token bytes, when we find a referencing keyword token,
    // find the corresponding position in the source text and replace the number after it.

    // Build a list of reference positions in the source body text
    struct RefPos {
        size_t numStart;  // position of the number in body
        size_t numEnd;    // one past end of number
        int oldNumber;
    };
    std::vector<RefPos> refs;

    // Scan source text for keywords, but verify them against the token stream.
    // We scan case-insensitively for the keyword patterns.
    bool inRem = false;
    bool inString = false;

    // Walk through token bytes (skip 4-byte header)
    size_t ti = 4;
    size_t si = 0; // source index in body

    while (ti < tokens.size() && tokens[ti] != 0x0D) {
        uint8_t tok = tokens[ti];

        if (tok == TOK_REM) {
            // Everything after REM is literal - stop scanning
            break;
        }

        if (tok == '"') {
            inString = !inString;
            ti++;
            // Advance source past the quote
            if (si < body.size()) si++;
            continue;
        }

        if (inString) {
            ti++;
            if (si < body.size()) si++;
            continue;
        }

        if (tok == NUMBER_MARKER) {
            // Skip the 5-byte floating point representation
            ti += 6; // marker + 5 bytes
            continue;
        }

        if (isLineRefToken(tok)) {
            ti++;

            // Find the keyword text in the source to advance si past it
            // Keywords: "GO TO" (may have spaces), "GO SUB", "RESTORE", "RUN"
            const char* kwText = tokenToKeyword(tok);
            if (kwText) {
                // Find keyword in source starting at si (case-insensitive, allowing spaces)
                size_t kwLen = strlen(kwText);
                // Search for the keyword allowing flexible spacing
                size_t searchStart = si;
                bool found = false;
                for (size_t s = searchStart; s < body.size(); s++) {
                    // Try to match keyword at position s
                    size_t ki = 0, bi = s;
                    bool matched = true;
                    while (ki < kwLen && bi < body.size()) {
                        if (std::toupper(static_cast<unsigned char>(body[bi])) ==
                            std::toupper(static_cast<unsigned char>(kwText[ki]))) {
                            ki++; bi++;
                        } else if (body[bi] == ' ' && ki > 0) {
                            // Allow extra spaces within keyword (e.g., "GO  TO")
                            bi++;
                        } else {
                            matched = false;
                            break;
                        }
                    }
                    if (matched && ki == kwLen) {
                        si = bi;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    // Fallback: advance past keyword length
                    si += kwLen;
                }
            }

            // Skip whitespace in source text and token stream
            while (si < body.size() && body[si] == ' ') si++;

            // Skip whitespace tokens
            while (ti < tokens.size() && tokens[ti] == ' ') ti++;

            // Now we should be at a number. Read it from source text.
            if (si < body.size() && std::isdigit(static_cast<unsigned char>(body[si]))) {
                size_t numStart = si;
                while (si < body.size() && std::isdigit(static_cast<unsigned char>(body[si]))) si++;
                int oldNum = std::stoi(body.substr(numStart, si - numStart));
                refs.push_back({ numStart, si, oldNum });
            }

            // Skip the number marker and FP representation in token stream
            if (ti < tokens.size() && tokens[ti] == NUMBER_MARKER) {
                ti += 6;
            }
            continue;
        }

        // Regular token or character
        if (tok >= 0xA5) {
            // Keyword token - advance source past the keyword text
            const char* kwText = tokenToKeyword(tok);
            if (kwText) {
                size_t kwLen = strlen(kwText);
                // Find keyword in source
                for (size_t s = si; s < body.size(); s++) {
                    size_t ki = 0, bi = s;
                    bool matched = true;
                    while (ki < kwLen && bi < body.size()) {
                        if (std::toupper(static_cast<unsigned char>(body[bi])) ==
                            std::toupper(static_cast<unsigned char>(kwText[ki]))) {
                            ki++; bi++;
                        } else if (body[bi] == ' ' && ki > 0) {
                            bi++;
                        } else {
                            matched = false;
                            break;
                        }
                    }
                    if (matched && ki == kwLen) {
                        si = bi;
                        break;
                    }
                }
            }
            ti++;
        } else {
            ti++;
            if (si < body.size()) si++;
        }
    }

    // Apply replacements in reverse order so positions stay valid
    std::string result = body;
    for (auto it = refs.rbegin(); it != refs.rend(); ++it) {
        auto mapIt = mapping.find(it->oldNumber);
        if (mapIt != mapping.end()) {
            result.replace(it->numStart, it->numEnd - it->numStart, std::to_string(mapIt->second));
        }
    }

    return result;
}

std::string renumberProgram(const std::string& text, int startNum, int step)
{
    auto rawLines = splitLines(text);

    // Parse lines with line numbers
    std::vector<ParsedLine> parsed;
    for (int i = 0; i < static_cast<int>(rawLines.size()); i++) {
        int lineNum;
        std::string body;
        if (parseLine(rawLines[i], lineNum, body)) {
            parsed.push_back({ lineNum, body, i });
        }
    }

    if (parsed.empty()) return text;

    // Sort by current line number
    std::sort(parsed.begin(), parsed.end(), [](const ParsedLine& a, const ParsedLine& b) {
        return a.lineNumber < b.lineNumber;
    });

    // Build old->new mapping
    std::map<int, int> mapping;
    for (size_t i = 0; i < parsed.size(); i++) {
        int newNum = startNum + static_cast<int>(i) * step;
        mapping[parsed[i].lineNumber] = newNum;
    }

    // Update references and rebuild
    std::ostringstream result;
    for (size_t i = 0; i < parsed.size(); i++) {
        int newNum = mapping[parsed[i].lineNumber];
        std::string updatedBody = updateReferences(parsed[i].body, mapping);
        if (i > 0) result << "\n";
        result << newNum << " " << updatedBody;
    }

    return result.str();
}

std::string autoRenumber(const std::string& text)
{
    auto rawLines = splitLines(text);

    // Parse lines with line numbers, keeping raw index
    std::vector<ParsedLine> parsed;
    for (int i = 0; i < static_cast<int>(rawLines.size()); i++) {
        int lineNum;
        std::string body;
        if (parseLine(rawLines[i], lineNum, body)) {
            parsed.push_back({ lineNum, body, i });
        }
    }

    if (parsed.size() < 2) return text;

    // Find first conflict: a line number <= the previous one
    int conflictIdx = -1;
    for (size_t i = 1; i < parsed.size(); i++) {
        if (parsed[i].lineNumber <= parsed[i - 1].lineNumber) {
            conflictIdx = static_cast<int>(i);
            break;
        }
    }

    if (conflictIdx < 0) return text;

    // Bump conflicting lines
    int insertedLineNum = parsed[conflictIdx - 1].lineNumber;
    std::map<int, int> mapping;
    int nextNum = insertedLineNum + 10;

    for (int i = conflictIdx; i < static_cast<int>(parsed.size()); i++) {
        int oldNum = parsed[i].lineNumber;
        if (oldNum < nextNum) {
            mapping[oldNum] = nextNum;
            parsed[i].lineNumber = nextNum;
        } else {
            break;
        }
        nextNum = parsed[i].lineNumber + 10;
    }

    if (mapping.empty()) return text;

    // Update references across all lines
    for (auto& p : parsed) {
        p.body = updateReferences(p.body, mapping);
    }

    // Rebuild raw lines with updated line numbers
    for (auto& p : parsed) {
        rawLines[p.rawIndex] = std::to_string(p.lineNumber) + " " + p.body;
    }

    std::ostringstream result;
    for (size_t i = 0; i < rawLines.size(); i++) {
        if (i > 0) result << "\n";
        result << rawLines[i];
    }

    return result.str();
}

} // namespace basic
} // namespace zxspec
