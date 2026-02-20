/*
 * sinclair_basic.hpp - Shared constants and types for Sinclair BASIC
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

namespace zxspec {
namespace basic {

// Number marker byte - precedes 5-byte floating point representation in BASIC lines
constexpr uint8_t NUMBER_MARKER = 0x0E;

// Sinclair BASIC tokens: byte 0xA5-0xFF -> keyword string
struct TokenEntry {
    uint8_t code;
    const char* keyword;
};

// Token table (0xA5 - 0xFF)
inline const TokenEntry TOKEN_TABLE[] = {
    {0xA5, "RND"},      {0xA6, "INKEY$"},   {0xA7, "PI"},
    {0xA8, "FN"},       {0xA9, "POINT"},    {0xAA, "SCREEN$"},
    {0xAB, "ATTR"},     {0xAC, "AT"},       {0xAD, "TAB"},
    {0xAE, "VAL$"},     {0xAF, "CODE"},     {0xB0, "VAL"},
    {0xB1, "LEN"},      {0xB2, "SIN"},      {0xB3, "COS"},
    {0xB4, "TAN"},      {0xB5, "ASN"},      {0xB6, "ACS"},
    {0xB7, "ATN"},      {0xB8, "LN"},       {0xB9, "EXP"},
    {0xBA, "INT"},      {0xBB, "SQR"},      {0xBC, "SGN"},
    {0xBD, "ABS"},      {0xBE, "PEEK"},     {0xBF, "IN"},
    {0xC0, "USR"},      {0xC1, "STR$"},     {0xC2, "CHR$"},
    {0xC3, "NOT"},      {0xC4, "BIN"},      {0xC5, "OR"},
    {0xC6, "AND"},      {0xC7, "<="},       {0xC8, ">="},
    {0xC9, "<>"},       {0xCA, "LINE"},     {0xCB, "THEN"},
    {0xCC, "TO"},       {0xCD, "STEP"},     {0xCE, "DEF FN"},
    {0xCF, "CAT"},      {0xD0, "FORMAT"},   {0xD1, "MOVE"},
    {0xD2, "ERASE"},    {0xD3, "OPEN #"},   {0xD4, "CLOSE #"},
    {0xD5, "MERGE"},    {0xD6, "VERIFY"},   {0xD7, "BEEP"},
    {0xD8, "CIRCLE"},   {0xD9, "INK"},      {0xDA, "PAPER"},
    {0xDB, "FLASH"},    {0xDC, "BRIGHT"},   {0xDD, "INVERSE"},
    {0xDE, "OVER"},     {0xDF, "OUT"},      {0xE0, "LPRINT"},
    {0xE1, "LLIST"},    {0xE2, "STOP"},     {0xE3, "READ"},
    {0xE4, "DATA"},     {0xE5, "RESTORE"},  {0xE6, "NEW"},
    {0xE7, "BORDER"},   {0xE8, "CONTINUE"}, {0xE9, "DIM"},
    {0xEA, "REM"},      {0xEB, "FOR"},      {0xEC, "GO TO"},
    {0xED, "GO SUB"},   {0xEE, "INPUT"},    {0xEF, "LOAD"},
    {0xF0, "LIST"},     {0xF1, "LET"},      {0xF2, "PAUSE"},
    {0xF3, "NEXT"},     {0xF4, "POKE"},     {0xF5, "PRINT"},
    {0xF6, "PLOT"},     {0xF7, "RUN"},      {0xF8, "SAVE"},
    {0xF9, "RANDOMIZE"},{0xFA, "IF"},       {0xFB, "CLS"},
    {0xFC, "DRAW"},     {0xFD, "CLEAR"},    {0xFE, "RETURN"},
    {0xFF, "COPY"},
};

constexpr size_t TOKEN_TABLE_SIZE = sizeof(TOKEN_TABLE) / sizeof(TOKEN_TABLE[0]);

// Token code to keyword string lookup
inline const char* tokenToKeyword(uint8_t code) {
    if (code < 0xA5) return nullptr;
    size_t idx = code - 0xA5;
    if (idx < TOKEN_TABLE_SIZE) return TOKEN_TABLE[idx].keyword;
    return nullptr;
}

// ZX Spectrum system variable addresses
namespace sys {
    constexpr uint16_t KSTATE   = 0x5C00;
    constexpr uint16_t LAST_K   = 0x5C08;
    constexpr uint16_t REPDEL   = 0x5C09;
    constexpr uint16_t REPPER   = 0x5C0A;
    constexpr uint16_t DEFADD   = 0x5C0B;
    constexpr uint16_t K_DATA   = 0x5C0D;
    constexpr uint16_t TVDATA   = 0x5C0E;
    constexpr uint16_t STRMS    = 0x5C10;
    constexpr uint16_t CHARS    = 0x5C36;
    constexpr uint16_t RASP     = 0x5C38;
    constexpr uint16_t PIP      = 0x5C39;
    constexpr uint16_t ERR_NR   = 0x5C3A;
    constexpr uint16_t FLAGS    = 0x5C3B;
    constexpr uint16_t TV_FLAG  = 0x5C3C;
    constexpr uint16_t ERR_SP   = 0x5C3D;
    constexpr uint16_t LIST_SP  = 0x5C3F;
    constexpr uint16_t MODE     = 0x5C41;
    constexpr uint16_t NEWPPC   = 0x5C42;
    constexpr uint16_t NSPPC    = 0x5C44;
    constexpr uint16_t PPC      = 0x5C45;
    constexpr uint16_t SUBPPC   = 0x5C47;
    constexpr uint16_t BORDCR   = 0x5C48;
    constexpr uint16_t E_PPC    = 0x5C49;
    constexpr uint16_t VARS     = 0x5C4B;
    constexpr uint16_t DEST     = 0x5C4D;
    constexpr uint16_t CHANS    = 0x5C4F;
    constexpr uint16_t CURCHL   = 0x5C51;
    constexpr uint16_t PROG     = 0x5C53;
    constexpr uint16_t NXTLIN   = 0x5C55;
    constexpr uint16_t DATADD   = 0x5C57;
    constexpr uint16_t E_LINE   = 0x5C59;
    constexpr uint16_t K_CUR    = 0x5C5B;
    constexpr uint16_t CH_ADD   = 0x5C5D;
    constexpr uint16_t X_PTR    = 0x5C5F;
    constexpr uint16_t WORKSP   = 0x5C61;
    constexpr uint16_t STKBOT   = 0x5C63;
    constexpr uint16_t STKEND   = 0x5C65;
    constexpr uint16_t BREG     = 0x5C67;
    constexpr uint16_t MEM      = 0x5C68;
    constexpr uint16_t FLAGS2   = 0x5C6A;
    constexpr uint16_t DF_SZ    = 0x5C6B;
    constexpr uint16_t S_TOP    = 0x5C6C;
    constexpr uint16_t OLDPPC   = 0x5C6E;
    constexpr uint16_t OSPPC    = 0x5C70;
    constexpr uint16_t FLAGX    = 0x5C71;
    constexpr uint16_t STRLEN   = 0x5C72;
    constexpr uint16_t T_ADDR   = 0x5C74;
    constexpr uint16_t SEED     = 0x5C76;
    constexpr uint16_t FRAMES   = 0x5C78;
    constexpr uint16_t UDG      = 0x5C7B;
    constexpr uint16_t COORDS_X = 0x5C7D;
    constexpr uint16_t COORDS_Y = 0x5C7E;
    constexpr uint16_t P_POSN   = 0x5C7F;
    constexpr uint16_t PR_CC    = 0x5C80;
    constexpr uint16_t ECHO_E   = 0x5C82;
    constexpr uint16_t DF_CC    = 0x5C84;
    constexpr uint16_t DF_CCL   = 0x5C86;
    constexpr uint16_t S_POSN   = 0x5C88;
    constexpr uint16_t SPOSNL   = 0x5C8A;
    constexpr uint16_t SCR_CT   = 0x5C8C;
    constexpr uint16_t ATTR_P   = 0x5C8D;
    constexpr uint16_t MASK_P   = 0x5C8E;
    constexpr uint16_t ATTR_T   = 0x5C8F;
    constexpr uint16_t MASK_T   = 0x5C90;
    constexpr uint16_t P_FLAG   = 0x5C91;
    constexpr uint16_t MEMBOT   = 0x5C92;
    constexpr uint16_t RAMTOP   = 0x5CAA;
    constexpr uint16_t P_RAMT   = 0x5CB2;
} // namespace sys

// Parsed BASIC line
struct BasicLine {
    uint16_t lineNumber;
    std::string text;
};

// Keyword-to-token lookup table (built lazily)
class TokenLookup {
public:
    static TokenLookup& instance() {
        static TokenLookup inst;
        return inst;
    }

    // Get token code for a keyword, or 0 if not found
    uint8_t keywordToToken(const std::string& keyword) const {
        auto it = keywordToToken_.find(keyword);
        return it != keywordToToken_.end() ? it->second : 0;
    }

    // Keywords sorted by length descending (for longest-match tokenization)
    const std::vector<std::string>& keywordsByLength() const {
        return keywordsByLength_;
    }

private:
    TokenLookup() {
        for (size_t i = 0; i < TOKEN_TABLE_SIZE; i++) {
            keywordToToken_[TOKEN_TABLE[i].keyword] = TOKEN_TABLE[i].code;
        }
        for (const auto& [kw, _] : keywordToToken_) {
            keywordsByLength_.push_back(kw);
        }
        std::sort(keywordsByLength_.begin(), keywordsByLength_.end(),
            [](const std::string& a, const std::string& b) {
                return a.length() > b.length();
            });
    }

    std::unordered_map<std::string, uint8_t> keywordToToken_;
    std::vector<std::string> keywordsByLength_;
};

} // namespace basic
} // namespace zxspec
