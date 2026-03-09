/*
 * z80_tables.hpp - Shared Z80 instruction tables
 *
 * Used by both the disassembler and assembler to avoid duplicate definitions
 * of register names, ALU operations, bit operations, and ED-prefix entries.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>

namespace zxspec {

// 8-bit register names indexed by 3-bit encoding (bits [2:0] or [5:3])
// B=0, C=1, D=2, E=3, H=4, L=5, (HL)=6, A=7
inline constexpr const char* REG8_NAMES[] = {
    "B", "C", "D", "E", "H", "L", "(HL)", "A"
};

// ALU operation mnemonics indexed by 3-bit encoding (bits [5:3] of 0x80-0xBF)
inline constexpr const char* ALU_OP_NAMES[] = {
    "ADD A,", "ADC A,", "SUB ", "SBC A,", "AND ", "XOR ", "OR ", "CP "
};

// CB-prefix shift/rotate operation names indexed by 3-bit encoding (bits [5:3])
inline constexpr const char* CB_OP_NAMES[] = {
    "RLC", "RRC", "RL", "RR", "SLA", "SRA", "SLL", "SRL"
};

// 16-bit register pair names for BC/DE/HL/SP group (bits [5:4])
inline constexpr const char* REG16_NAMES[] = {
    "BC", "DE", "HL", "SP"
};

// 16-bit register pair names for PUSH/POP group (AF instead of SP)
inline constexpr const char* REG16AF_NAMES[] = {
    "BC", "DE", "HL", "AF"
};

// Condition code names indexed by 3-bit encoding (bits [5:3])
inline constexpr const char* COND_NAMES[] = {
    "NZ", "Z", "NC", "C", "PO", "PE", "P", "M"
};

// ED-prefix opcode table entry
struct EdEntry {
    uint8_t code;
    const char* mnem;
};

// ED-prefix opcode table (sparse)
inline constexpr EdEntry ED_TABLE[] = {
    {0x40, "IN B,(C)"},   {0x41, "OUT (C),B"},  {0x42, "SBC HL,BC"}, {0x43, "LD (%w),BC"},
    {0x44, "NEG"},        {0x45, "RETN"},       {0x46, "IM 0"},      {0x47, "LD I,A"},
    {0x48, "IN C,(C)"},   {0x49, "OUT (C),C"},  {0x4A, "ADC HL,BC"}, {0x4B, "LD BC,(%w)"},
    {0x4C, "NEG"},        {0x4D, "RETI"},       {0x4E, "IM 0"},      {0x4F, "LD R,A"},
    {0x50, "IN D,(C)"},   {0x51, "OUT (C),D"},  {0x52, "SBC HL,DE"}, {0x53, "LD (%w),DE"},
    {0x54, "NEG"},        {0x55, "RETN"},       {0x56, "IM 1"},      {0x57, "LD A,I"},
    {0x58, "IN E,(C)"},   {0x59, "OUT (C),E"},  {0x5A, "ADC HL,DE"}, {0x5B, "LD DE,(%w)"},
    {0x5C, "NEG"},        {0x5D, "RETN"},       {0x5E, "IM 2"},      {0x5F, "LD A,R"},
    {0x60, "IN H,(C)"},   {0x61, "OUT (C),H"},  {0x62, "SBC HL,HL"}, {0x63, "LD (%w),HL"},
    {0x64, "NEG"},        {0x65, "RETN"},       {0x67, "RRD"},
    {0x68, "IN L,(C)"},   {0x69, "OUT (C),L"},  {0x6A, "ADC HL,HL"}, {0x6B, "LD HL,(%w)"},
    {0x6C, "NEG"},        {0x6D, "RETN"},       {0x6F, "RLD"},
    {0x70, "IN F,(C)"},   {0x71, "OUT (C),0"},  {0x72, "SBC HL,SP"}, {0x73, "LD (%w),SP"},
    {0x74, "NEG"},        {0x75, "RETN"},
    {0x78, "IN A,(C)"},   {0x79, "OUT (C),A"},  {0x7A, "ADC HL,SP"}, {0x7B, "LD SP,(%w)"},
    {0x7C, "NEG"},        {0x7D, "RETN"},
    {0xA0, "LDI"},        {0xA1, "CPI"},        {0xA2, "INI"},       {0xA3, "OUTI"},
    {0xA8, "LDD"},        {0xA9, "CPD"},        {0xAA, "IND"},       {0xAB, "OUTD"},
    {0xB0, "LDIR"},       {0xB1, "CPIR"},       {0xB2, "INIR"},      {0xB3, "OTIR"},
    {0xB8, "LDDR"},       {0xB9, "CPDR"},       {0xBA, "INDR"},      {0xBB, "OTDR"},
};
inline constexpr int ED_TABLE_SIZE = sizeof(ED_TABLE) / sizeof(ED_TABLE[0]);

// Look up an ED-prefix mnemonic by opcode byte
inline const char* edLookup(uint8_t code) {
    for (int i = 0; i < ED_TABLE_SIZE; i++) {
        if (ED_TABLE[i].code == code) return ED_TABLE[i].mnem;
    }
    return nullptr;
}

} // namespace zxspec
