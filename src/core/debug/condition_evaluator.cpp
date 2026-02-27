/*
 * condition_evaluator.cpp - Expression evaluator for conditional breakpoints
 *
 * Recursive-descent parser supporting:
 *   Registers: A, B, C, D, E, H, L, F, BC, DE, HL, IX, IY, SP, PC, I, R
 *   Flags: FLAGS.S, FLAGS.Z, FLAGS.H, FLAGS.PV, FLAGS.N, FLAGS.C
 *   Memory: PEEK($addr), DEEK($addr)
 *   BASIC vars: BV(encoded_bytes), BA(encoded_bytes,idx)
 *   String literals: "hello"
 *   Operators: ==, !=, <, >, <=, >=, &&, ||, +, -, *, (, )
 *   Hex literals: $FF, $FFFF
 *   Decimal literals: 42, 1000
 *
 * Values are typed: either integer (int32_t) or string.
 * String variables (BV for $-named vars) return string values.
 * Comparisons between strings use lexicographic ordering.
 *
 * Grammar (precedence low to high):
 *   expr     = or_expr
 *   or_expr  = and_expr ( "||" and_expr )*
 *   and_expr = cmp_expr ( "&&" cmp_expr )*
 *   cmp_expr = add_expr ( ("==" | "!=" | "<=" | ">=" | "<" | ">") add_expr )?
 *   add_expr = mul_expr ( ("+" | "-") mul_expr )*
 *   mul_expr = unary   ( "*" unary )*
 *   unary    = "!" unary | atom
 *   atom     = number | hex | string | register | flag | PEEK(...) | DEEK(...) |
 *              BV(...) | BA(...) | "(" expr ")"
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "condition_evaluator.hpp"
#include "../z80/z80.hpp"
#include "../../machines/machine.hpp"
#include "../../machines/basic/sinclair_basic.hpp"
#include "../../machines/basic/sinclair_basic_float.hpp"
#include <cctype>
#include <cstring>
#include <vector>

namespace zxspec {
namespace debug {

// ============================================================================
// Value type — can hold integer or string
// ============================================================================

struct Value {
    enum Type { Int, Str };
    Type type;
    int32_t intVal;
    std::string strVal;

    static Value makeInt(int32_t v) { return { Int, v, {} }; }
    static Value makeStr(const std::string& s) { return { Str, 0, s }; }

    int32_t toInt() const { return type == Int ? intVal : 0; }
    bool toBool() const { return type == Int ? (intVal != 0) : !strVal.empty(); }
};

// ============================================================================
// Tokenizer
// ============================================================================

enum class TokenType {
    Number, Identifier, Dollar, StringLiteral,
    LParen, RParen, Comma, Dot, Bang,
    Plus, Minus, Star,
    Eq, Ne, Lt, Gt, Le, Ge,
    And, Or,
    End, Error
};

struct Token {
    TokenType type;
    int32_t numValue;
    std::string strValue;
};

class Tokenizer {
public:
    explicit Tokenizer(const std::string& input) : src_(input), pos_(0) {}

    Token next() {
        skipWhitespace();
        if (pos_ >= src_.size()) return { TokenType::End, 0, "" };

        char ch = src_[pos_];

        // Two-character operators
        if (pos_ + 1 < src_.size()) {
            char ch2 = src_[pos_ + 1];
            if (ch == '=' && ch2 == '=') { pos_ += 2; return { TokenType::Eq, 0, "==" }; }
            if (ch == '!' && ch2 == '=') { pos_ += 2; return { TokenType::Ne, 0, "!=" }; }
            if (ch == '<' && ch2 == '=') { pos_ += 2; return { TokenType::Le, 0, "<=" }; }
            if (ch == '>' && ch2 == '=') { pos_ += 2; return { TokenType::Ge, 0, ">=" }; }
            if (ch == '&' && ch2 == '&') { pos_ += 2; return { TokenType::And, 0, "&&" }; }
            if (ch == '|' && ch2 == '|') { pos_ += 2; return { TokenType::Or, 0, "||" }; }
        }

        // Single-character tokens
        switch (ch) {
            case '(': pos_++; return { TokenType::LParen, 0, "(" };
            case ')': pos_++; return { TokenType::RParen, 0, ")" };
            case ',': pos_++; return { TokenType::Comma, 0, "," };
            case '.': pos_++; return { TokenType::Dot, 0, "." };
            case '!': pos_++; return { TokenType::Bang, 0, "!" };
            case '+': pos_++; return { TokenType::Plus, 0, "+" };
            case '-': pos_++; return { TokenType::Minus, 0, "-" };
            case '*': pos_++; return { TokenType::Star, 0, "*" };
            case '<': pos_++; return { TokenType::Lt, 0, "<" };
            case '>': pos_++; return { TokenType::Gt, 0, ">" };
            default: break;
        }

        // String literal: "..."
        if (ch == '"') {
            return parseString();
        }

        // Hex literal: $FF or $FFFF
        if (ch == '$') {
            pos_++;
            return parseHex();
        }

        // Hex literal: #$FF
        if (ch == '#' && pos_ + 1 < src_.size() && src_[pos_ + 1] == '$') {
            pos_ += 2;
            return parseHex();
        }

        // Decimal number
        if (std::isdigit(ch)) {
            return parseDecimal();
        }

        // Identifier (register, function, flag name)
        if (std::isalpha(ch) || ch == '_') {
            return parseIdentifier();
        }

        pos_++;
        return { TokenType::Error, 0, std::string("Unexpected character: ") + ch };
    }

    size_t pos() const { return pos_; }

private:
    void skipWhitespace() {
        while (pos_ < src_.size() && (src_[pos_] == ' ' || src_[pos_] == '\t')) {
            pos_++;
        }
    }

    Token parseHex() {
        size_t start = pos_;
        while (pos_ < src_.size() && std::isxdigit(src_[pos_])) pos_++;
        if (pos_ == start) return { TokenType::Error, 0, "Expected hex digits after $" };
        std::string hex = src_.substr(start, pos_ - start);
        int32_t val = static_cast<int32_t>(std::stoul(hex, nullptr, 16));
        return { TokenType::Number, val, hex };
    }

    Token parseDecimal() {
        size_t start = pos_;
        while (pos_ < src_.size() && std::isdigit(src_[pos_])) pos_++;
        std::string num = src_.substr(start, pos_ - start);
        int32_t val = static_cast<int32_t>(std::stol(num));
        return { TokenType::Number, val, num };
    }

    Token parseString() {
        pos_++; // skip opening quote
        std::string result;
        while (pos_ < src_.size() && src_[pos_] != '"') {
            result += src_[pos_];
            pos_++;
        }
        if (pos_ < src_.size()) pos_++; // skip closing quote
        return { TokenType::StringLiteral, 0, result };
    }

    Token parseIdentifier() {
        size_t start = pos_;
        while (pos_ < src_.size() && (std::isalnum(src_[pos_]) || src_[pos_] == '_' || src_[pos_] == '$')) {
            pos_++;
        }
        std::string id = src_.substr(start, pos_ - start);
        return { TokenType::Identifier, 0, id };
    }

    const std::string& src_;
    size_t pos_;
};

// ============================================================================
// Parser / Evaluator
// ============================================================================

class Parser {
public:
    Parser(const Machine& machine, const std::string& expr)
        : machine_(machine), tokenizer_(expr), hasError_(false) {
        advance();
    }

    Value parseExpression() {
        Value result = parseOr();
        if (!hasError_ && current_.type != TokenType::End) {
            setError("Unexpected token: " + current_.strValue);
        }
        return result;
    }

    bool hasError() const { return hasError_; }
    const std::string& error() const { return error_; }

private:
    void advance() {
        current_ = tokenizer_.next();
    }

    void setError(const std::string& msg) {
        if (!hasError_) {
            hasError_ = true;
            error_ = msg;
        }
    }

    bool expect(TokenType type) {
        if (current_.type != type) {
            setError("Expected token type, got: " + current_.strValue);
            return false;
        }
        advance();
        return true;
    }

    // or_expr = and_expr ( "||" and_expr )*
    Value parseOr() {
        Value left = parseAnd();
        while (!hasError_ && current_.type == TokenType::Or) {
            advance();
            Value right = parseAnd();
            left = Value::makeInt((left.toBool() || right.toBool()) ? 1 : 0);
        }
        return left;
    }

    // and_expr = cmp_expr ( "&&" cmp_expr )*
    Value parseAnd() {
        Value left = parseCompare();
        while (!hasError_ && current_.type == TokenType::And) {
            advance();
            Value right = parseCompare();
            left = Value::makeInt((left.toBool() && right.toBool()) ? 1 : 0);
        }
        return left;
    }

    // cmp_expr = add_expr ( ("==" | "!=" | "<" | ">" | "<=" | ">=") add_expr )?
    Value parseCompare() {
        Value left = parseAdd();
        if (hasError_) return left;
        TokenType op = current_.type;
        if (op == TokenType::Eq || op == TokenType::Ne ||
            op == TokenType::Lt || op == TokenType::Gt ||
            op == TokenType::Le || op == TokenType::Ge) {
            advance();
            Value right = parseAdd();

            // String comparison when either side is a string
            if (left.type == Value::Str || right.type == Value::Str) {
                const std::string& ls = left.type == Value::Str ? left.strVal : std::to_string(left.intVal);
                const std::string& rs = right.type == Value::Str ? right.strVal : std::to_string(right.intVal);
                int cmp = ls.compare(rs);
                switch (op) {
                    case TokenType::Eq: return Value::makeInt(cmp == 0 ? 1 : 0);
                    case TokenType::Ne: return Value::makeInt(cmp != 0 ? 1 : 0);
                    case TokenType::Lt: return Value::makeInt(cmp < 0 ? 1 : 0);
                    case TokenType::Gt: return Value::makeInt(cmp > 0 ? 1 : 0);
                    case TokenType::Le: return Value::makeInt(cmp <= 0 ? 1 : 0);
                    case TokenType::Ge: return Value::makeInt(cmp >= 0 ? 1 : 0);
                    default: break;
                }
            }

            // Integer comparison
            switch (op) {
                case TokenType::Eq: return Value::makeInt(left.intVal == right.intVal ? 1 : 0);
                case TokenType::Ne: return Value::makeInt(left.intVal != right.intVal ? 1 : 0);
                case TokenType::Lt: return Value::makeInt(left.intVal < right.intVal ? 1 : 0);
                case TokenType::Gt: return Value::makeInt(left.intVal > right.intVal ? 1 : 0);
                case TokenType::Le: return Value::makeInt(left.intVal <= right.intVal ? 1 : 0);
                case TokenType::Ge: return Value::makeInt(left.intVal >= right.intVal ? 1 : 0);
                default: break;
            }
        }
        return left;
    }

    // add_expr = mul_expr ( ("+" | "-") mul_expr )*
    Value parseAdd() {
        Value left = parseMul();
        while (!hasError_ && (current_.type == TokenType::Plus || current_.type == TokenType::Minus)) {
            TokenType op = current_.type;
            advance();
            Value right = parseMul();
            // String concatenation with +
            if (op == TokenType::Plus && (left.type == Value::Str || right.type == Value::Str)) {
                const std::string& ls = left.type == Value::Str ? left.strVal : std::to_string(left.intVal);
                const std::string& rs = right.type == Value::Str ? right.strVal : std::to_string(right.intVal);
                left = Value::makeStr(ls + rs);
            } else if (op == TokenType::Plus) {
                left = Value::makeInt(left.toInt() + right.toInt());
            } else {
                left = Value::makeInt(left.toInt() - right.toInt());
            }
        }
        return left;
    }

    // mul_expr = unary ( "*" unary )*
    Value parseMul() {
        Value left = parseUnary();
        while (!hasError_ && current_.type == TokenType::Star) {
            advance();
            Value right = parseUnary();
            left = Value::makeInt(left.toInt() * right.toInt());
        }
        return left;
    }

    // unary = "!" unary | "-" unary | atom
    Value parseUnary() {
        if (current_.type == TokenType::Bang) {
            advance();
            return Value::makeInt(parseUnary().toBool() ? 0 : 1);
        }
        if (current_.type == TokenType::Minus) {
            advance();
            return Value::makeInt(-parseUnary().toInt());
        }
        return parseAtom();
    }

    // atom = number | string | register | flag | PEEK(...) | DEEK(...) |
    //        BV(...) | BA(...) | "(" expr ")"
    Value parseAtom() {
        if (hasError_) return Value::makeInt(0);

        // Number literal
        if (current_.type == TokenType::Number) {
            int32_t val = current_.numValue;
            advance();
            return Value::makeInt(val);
        }

        // String literal
        if (current_.type == TokenType::StringLiteral) {
            std::string val = current_.strValue;
            advance();
            return Value::makeStr(val);
        }

        // Hex literal via $
        if (current_.type == TokenType::Dollar) {
            advance();
            if (current_.type != TokenType::Number) {
                setError("Expected hex number after $");
                return Value::makeInt(0);
            }
            int32_t val = current_.numValue;
            advance();
            return Value::makeInt(val);
        }

        // Parenthesized expression
        if (current_.type == TokenType::LParen) {
            advance();
            Value val = parseOr();
            expect(TokenType::RParen);
            return val;
        }

        // Identifier: register, function, or flag prefix
        if (current_.type == TokenType::Identifier) {
            std::string id = current_.strValue;
            // Uppercase for case-insensitive matching
            std::string upper;
            for (char c : id) upper += static_cast<char>(std::toupper(c));

            // Check for FLAGS.x pattern
            if (upper == "FLAGS") {
                advance();
                if (current_.type == TokenType::Dot) {
                    advance();
                    if (current_.type != TokenType::Identifier) {
                        setError("Expected flag name after FLAGS.");
                        return Value::makeInt(0);
                    }
                    return Value::makeInt(resolveFlag(current_.strValue));
                }
                // FLAGS alone returns the F register
                return Value::makeInt(machine_.getAF() & 0xFF);
            }

            // Check for functions: PEEK, DEEK, BV, BA
            if (upper == "PEEK") {
                advance();
                expect(TokenType::LParen);
                Value addr = parseOr();
                expect(TokenType::RParen);
                if (hasError_) return Value::makeInt(0);
                return Value::makeInt(machine_.readMemory(static_cast<uint16_t>(addr.toInt() & 0xFFFF)));
            }

            if (upper == "DEEK") {
                advance();
                expect(TokenType::LParen);
                Value addr = parseOr();
                expect(TokenType::RParen);
                if (hasError_) return Value::makeInt(0);
                uint16_t a = static_cast<uint16_t>(addr.toInt() & 0xFFFF);
                return Value::makeInt(machine_.readMemory(a) |
                       (static_cast<int32_t>(machine_.readMemory((a + 1) & 0xFFFF)) << 8));
            }

            if (upper == "BV") {
                advance();
                return parseBV();
            }

            if (upper == "BA") {
                advance();
                return parseBA();
            }

            // Register lookup
            advance();
            return Value::makeInt(resolveRegister(upper));
        }

        setError("Unexpected token: " + current_.strValue);
        return Value::makeInt(0);
    }

    int32_t resolveRegister(const std::string& name) {
        if (name == "A")  return (machine_.getAF() >> 8) & 0xFF;
        if (name == "F")  return machine_.getAF() & 0xFF;
        if (name == "B")  return (machine_.getBC() >> 8) & 0xFF;
        if (name == "C")  return machine_.getBC() & 0xFF;
        if (name == "D")  return (machine_.getDE() >> 8) & 0xFF;
        if (name == "E")  return machine_.getDE() & 0xFF;
        if (name == "H")  return (machine_.getHL() >> 8) & 0xFF;
        if (name == "L")  return machine_.getHL() & 0xFF;
        if (name == "AF") return machine_.getAF();
        if (name == "BC") return machine_.getBC();
        if (name == "DE") return machine_.getDE();
        if (name == "HL") return machine_.getHL();
        if (name == "IX") return machine_.getIX();
        if (name == "IY") return machine_.getIY();
        if (name == "SP") return machine_.getSP();
        if (name == "PC") return machine_.getPC();
        if (name == "I")  return machine_.getI();
        if (name == "R")  return machine_.getR();
        setError("Unknown register: " + name);
        return 0;
    }

    int32_t resolveFlag(const std::string& flagName) {
        std::string upper;
        for (char c : flagName) upper += static_cast<char>(std::toupper(c));
        advance(); // consume flag name

        uint8_t f = machine_.getAF() & 0xFF;
        if (upper == "S")  return (f & Z80::FLAG_S) ? 1 : 0;
        if (upper == "Z")  return (f & Z80::FLAG_Z) ? 1 : 0;
        if (upper == "H")  return (f & Z80::FLAG_H) ? 1 : 0;
        if (upper == "PV") return (f & Z80::FLAG_P) ? 1 : 0;
        if (upper == "N")  return (f & Z80::FLAG_N) ? 1 : 0;
        if (upper == "C")  return (f & Z80::FLAG_C) ? 1 : 0;
        setError("Unknown flag: " + flagName);
        return 0;
    }

    // BV(encoded_bytes) — look up a BASIC variable by its encoded name bytes.
    // For numeric vars returns an integer value.
    // For string vars (name ends with $, i.e. byte 36) returns a string value.
    Value parseBV() {
        expect(TokenType::LParen);
        if (hasError_) return Value::makeInt(0);

        std::vector<uint8_t> nameBytes;
        nameBytes.push_back(static_cast<uint8_t>(parseOr().toInt() & 0xFF));
        while (!hasError_ && current_.type == TokenType::Comma) {
            advance();
            nameBytes.push_back(static_cast<uint8_t>(parseOr().toInt() & 0xFF));
        }
        expect(TokenType::RParen);
        if (hasError_) return Value::makeInt(0);

        // Check if this is a string variable (name ends with '$' = 0x24)
        bool isStringVar = !nameBytes.empty() && nameBytes.back() == 0x24;
        if (isStringVar) {
            return lookupBasicStringVar(nameBytes);
        }
        return Value::makeInt(lookupBasicNumericVar(nameBytes));
    }

    // BA(encoded_bytes,idx) — look up a BASIC array element
    Value parseBA() {
        expect(TokenType::LParen);
        if (hasError_) return Value::makeInt(0);

        // Format: BA(letter_byte, idx) for 1D or BA(letter_byte, idx1, idx2) for 2D
        // The first byte is always the variable letter
        std::vector<int32_t> args;
        args.push_back(parseOr().toInt());
        while (!hasError_ && current_.type == TokenType::Comma) {
            advance();
            args.push_back(parseOr().toInt());
        }
        expect(TokenType::RParen);
        if (hasError_) return Value::makeInt(0);

        if (args.size() < 2) {
            setError("BA() requires at least 2 arguments: letter and index");
            return Value::makeInt(0);
        }

        uint8_t varLetter = static_cast<uint8_t>(args[0] & 0xFF);
        std::vector<uint16_t> indices;
        for (size_t i = 1; i < args.size(); i++) {
            indices.push_back(static_cast<uint16_t>(args[i]));
        }

        return Value::makeInt(lookupBasicArray(varLetter, indices));
    }

    // Look up a simple numeric BASIC variable by walking VARS->E_LINE
    int32_t lookupBasicNumericVar(const std::vector<uint8_t>& nameBytes) {
        if (nameBytes.empty()) {
            setError("BV() requires at least one name byte");
            return 0;
        }

        uint16_t varsAddr = machine_.readMemory(basic::sys::VARS) |
                            (static_cast<uint16_t>(machine_.readMemory(basic::sys::VARS + 1)) << 8);
        uint16_t eLineAddr = machine_.readMemory(basic::sys::E_LINE) |
                             (static_cast<uint16_t>(machine_.readMemory(basic::sys::E_LINE + 1)) << 8);

        if (varsAddr < 0x5B00 || eLineAddr <= varsAddr) return 0;

        uint16_t addr = varsAddr;
        while (addr < eLineAddr) {
            uint8_t byte = machine_.readMemory(addr);
            if (byte == 0x80) break; // end marker

            uint8_t topBits = byte & 0xE0;
            uint8_t letterCode = byte & 0x1F;
            if (letterCode < 1 || letterCode > 26) break;

            switch (topBits) {
                case 0x60: {
                    // Single-letter numeric: match if nameBytes[0] is the letter
                    char letter = static_cast<char>(letterCode + 0x60);
                    if (nameBytes.size() == 1 && static_cast<char>(nameBytes[0]) == letter) {
                        uint8_t floatBytes[5];
                        for (int j = 0; j < 5; j++) {
                            floatBytes[j] = machine_.readMemory((addr + 1 + j) & 0xFFFF);
                        }
                        return static_cast<int32_t>(basic::decodeNumber(floatBytes));
                    }
                    addr += 6;
                    break;
                }

                case 0xA0: {
                    // Multi-letter numeric
                    std::vector<uint8_t> varName;
                    char firstLetter = static_cast<char>(letterCode + 0x60);
                    varName.push_back(static_cast<uint8_t>(firstLetter));
                    uint16_t a = addr + 1;
                    while (a < eLineAddr) {
                        uint8_t ch = machine_.readMemory(a);
                        if (ch & 0x80) {
                            varName.push_back(ch & 0x7F);
                            a++;
                            break;
                        }
                        varName.push_back(ch);
                        a++;
                    }
                    if (varName.size() == nameBytes.size() &&
                        std::equal(varName.begin(), varName.end(), nameBytes.begin())) {
                        uint8_t floatBytes[5];
                        for (int j = 0; j < 5; j++) {
                            floatBytes[j] = machine_.readMemory((a + j) & 0xFFFF);
                        }
                        return static_cast<int32_t>(basic::decodeNumber(floatBytes));
                    }
                    addr = a + 5;
                    break;
                }

                case 0xE0: {
                    // FOR loop variable — same as single-letter numeric for value
                    char letter = static_cast<char>(letterCode + 0x60);
                    if (nameBytes.size() == 1 && static_cast<char>(nameBytes[0]) == letter) {
                        uint8_t floatBytes[5];
                        for (int j = 0; j < 5; j++) {
                            floatBytes[j] = machine_.readMemory((addr + 1 + j) & 0xFFFF);
                        }
                        return static_cast<int32_t>(basic::decodeNumber(floatBytes));
                    }
                    addr += 19;
                    break;
                }

                case 0x40: {
                    // String variable — skip (use lookupBasicStringVar instead)
                    uint16_t strLen = machine_.readMemory(addr + 1) |
                                     (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                    addr += 3 + strLen;
                    break;
                }

                case 0x80: {
                    // Numeric array — skip
                    uint16_t totalLen = machine_.readMemory(addr + 1) |
                                       (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                    addr += 3 + totalLen;
                    break;
                }

                case 0xC0: {
                    // String array — skip
                    uint16_t totalLen = machine_.readMemory(addr + 1) |
                                       (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                    addr += 3 + totalLen;
                    break;
                }

                default:
                    return 0;
            }
        }

        setError("Variable not found");
        return 0;
    }

    // Look up a string BASIC variable (type 0x40)
    Value lookupBasicStringVar(const std::vector<uint8_t>& nameBytes) {
        if (nameBytes.empty()) {
            setError("BV() requires at least one name byte");
            return Value::makeStr("");
        }

        // The variable name in the VARS area is just the letter (without $).
        // nameBytes contains e.g. [97, 36] for "a$" — we match on the letter only.
        // The letter is the first byte of nameBytes.
        char targetLetter = static_cast<char>(nameBytes[0]);

        uint16_t varsAddr = machine_.readMemory(basic::sys::VARS) |
                            (static_cast<uint16_t>(machine_.readMemory(basic::sys::VARS + 1)) << 8);
        uint16_t eLineAddr = machine_.readMemory(basic::sys::E_LINE) |
                             (static_cast<uint16_t>(machine_.readMemory(basic::sys::E_LINE + 1)) << 8);

        if (varsAddr < 0x5B00 || eLineAddr <= varsAddr) return Value::makeStr("");

        uint16_t addr = varsAddr;
        while (addr < eLineAddr) {
            uint8_t byte = machine_.readMemory(addr);
            if (byte == 0x80) break;

            uint8_t topBits = byte & 0xE0;
            uint8_t letterCode = byte & 0x1F;
            if (letterCode < 1 || letterCode > 26) break;

            if (topBits == 0x40) {
                // String variable
                char letter = static_cast<char>(letterCode + 0x60);
                uint16_t strLen = machine_.readMemory(addr + 1) |
                                 (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                if (letter == targetLetter) {
                    // Read string contents
                    std::string result;
                    for (uint16_t j = 0; j < strLen; j++) {
                        result += static_cast<char>(machine_.readMemory((addr + 3 + j) & 0xFFFF));
                    }
                    return Value::makeStr(result);
                }
                addr += 3 + strLen;
            } else {
                // Skip non-string variables
                switch (topBits) {
                    case 0x60: addr += 6; break;
                    case 0xE0: addr += 19; break;
                    case 0xA0: {
                        addr++;
                        while (addr < eLineAddr && !(machine_.readMemory(addr) & 0x80)) addr++;
                        addr += 6;
                        break;
                    }
                    case 0x80:
                    case 0xC0: {
                        uint16_t tl = machine_.readMemory(addr + 1) |
                                     (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                        addr += 3 + tl;
                        break;
                    }
                    default:
                        setError("String variable not found");
                        return Value::makeStr("");
                }
            }
        }

        setError("String variable not found");
        return Value::makeStr("");
    }

    // Look up a BASIC array element
    int32_t lookupBasicArray(uint8_t varLetter, const std::vector<uint16_t>& indices) {
        uint16_t varsAddr = machine_.readMemory(basic::sys::VARS) |
                            (static_cast<uint16_t>(machine_.readMemory(basic::sys::VARS + 1)) << 8);
        uint16_t eLineAddr = machine_.readMemory(basic::sys::E_LINE) |
                             (static_cast<uint16_t>(machine_.readMemory(basic::sys::E_LINE + 1)) << 8);

        if (varsAddr < 0x5B00 || eLineAddr <= varsAddr) return 0;

        char targetLetter = static_cast<char>(varLetter);

        uint16_t addr = varsAddr;
        while (addr < eLineAddr) {
            uint8_t byte = machine_.readMemory(addr);
            if (byte == 0x80) break;

            uint8_t topBits = byte & 0xE0;
            uint8_t letterCode = byte & 0x1F;
            if (letterCode < 1 || letterCode > 26) break;
            char letter = static_cast<char>(letterCode + 0x60);

            if (topBits == 0x80 && letter == targetLetter) {
                // Found numeric array
                uint16_t totalLen = machine_.readMemory(addr + 1) |
                                   (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                uint16_t dataStart = addr + 3;
                uint8_t numDims = machine_.readMemory(dataStart);
                uint16_t dimPtr = dataStart + 1;

                std::vector<uint16_t> dims;
                for (uint8_t d = 0; d < numDims; d++) {
                    dims.push_back(machine_.readMemory(dimPtr) |
                                  (static_cast<uint16_t>(machine_.readMemory(dimPtr + 1)) << 8));
                    dimPtr += 2;
                }

                if (indices.size() != dims.size()) {
                    setError("Array dimension mismatch");
                    return 0;
                }

                // Calculate linear offset (row-major, 1-based indices)
                uint32_t offset = 0;
                for (size_t d = 0; d < dims.size(); d++) {
                    if (indices[d] < 1 || indices[d] > dims[d]) {
                        setError("Array index out of bounds");
                        return 0;
                    }
                    offset = offset * dims[d] + (indices[d] - 1);
                }

                // Each element is 5 bytes
                uint16_t elemAddr = dimPtr + offset * 5;
                uint8_t floatBytes[5];
                for (int j = 0; j < 5; j++) {
                    floatBytes[j] = machine_.readMemory((elemAddr + j) & 0xFFFF);
                }
                return static_cast<int32_t>(basic::decodeNumber(floatBytes));
            }

            // Skip this variable
            switch (topBits) {
                case 0x60: addr += 6; break;
                case 0xE0: addr += 19; break;
                case 0x40: {
                    uint16_t sl = machine_.readMemory(addr + 1) |
                                 (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                    addr += 3 + sl;
                    break;
                }
                case 0xA0: {
                    addr++;
                    while (addr < eLineAddr && !(machine_.readMemory(addr) & 0x80)) addr++;
                    addr += 6; // terminator byte + 5 float bytes
                    break;
                }
                case 0x80:
                case 0xC0: {
                    uint16_t tl = machine_.readMemory(addr + 1) |
                                 (static_cast<uint16_t>(machine_.readMemory(addr + 2)) << 8);
                    addr += 3 + tl;
                    break;
                }
                default:
                    return 0;
            }
        }

        setError("Array not found");
        return 0;
    }

    const Machine& machine_;
    Tokenizer tokenizer_;
    Token current_;
    bool hasError_;
    std::string error_;
};

// ============================================================================
// Public API
// ============================================================================

bool evaluateCondition(const Machine& machine, const std::string& expr, std::string& error) {
    if (expr.empty()) {
        error.clear();
        return true; // Empty condition always true
    }
    Parser parser(machine, expr);
    Value result = parser.parseExpression();
    if (parser.hasError()) {
        error = parser.error();
        return false;
    }
    error.clear();
    return result.toBool();
}

int32_t evaluateExpression(const Machine& machine, const std::string& expr, std::string& error) {
    if (expr.empty()) {
        error.clear();
        return 0;
    }
    Parser parser(machine, expr);
    Value result = parser.parseExpression();
    if (parser.hasError()) {
        error = parser.error();
        return 0;
    }
    error.clear();
    return result.toInt();
}

} // namespace debug
} // namespace zxspec
