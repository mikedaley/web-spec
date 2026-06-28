// Runtime harness: assemble life.asm, load it, and actually execute the
// core routines on the project's Z80 core. Flags any wild memory write
// (the thing that resets a real Spectrum) and checks render's output.
#include "../src/core/z80/z80.hpp"
#include "../src/core/z80/z80_assembler.hpp"
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <map>
#include <string>

using ByteReg = zxspec::Z80::ByteReg;
using WordReg = zxspec::Z80::WordReg;

static uint8_t g_mem[65536];
static uint32_t g_origin, g_end;       // legal program region [origin,end)
static long     g_wildWrites = 0;
static uint16_t g_wildAddr = 0;

static bool legalWrite(uint16_t a) {
    if (a >= 0x4000 && a <= 0x5AFF) return true;   // display + attributes
    if (a >= g_origin && a < g_end)  return true;   // code + buffers + vars
    if (a >= 0xFD00)                 return true;   // our test stack
    return false;
}
static uint8_t  memRead (uint16_t a, void*)            { return g_mem[a]; }
static void     memWrite(uint16_t a, uint8_t d, void*) {
    if (!legalWrite(a)) { if (!g_wildWrites) g_wildAddr = a; g_wildWrites++; }
    g_mem[a] = d;
}
static uint8_t  ioRead (uint16_t, void*)         { return 0xFF; }   // no key pressed
static void     ioWrite(uint16_t, uint8_t, void*) {}
static void     noContend(uint16_t, uint32_t, void*) {}

static zxspec::Z80 g_cpu;

// Run the routine at addr until it RETs back to the sentinel 0x0000.
static bool runRoutine(uint16_t addr) {
    const uint16_t SENT = 0x0000;
    g_cpu.setRegister(WordReg::SP, 0xFF00);
    g_mem[0xFEFF] = SENT >> 8; g_mem[0xFEFE] = SENT & 0xFF;
    g_cpu.setRegister(WordReg::SP, 0xFEFE);   // sentinel return on stack
    g_cpu.setRegister(WordReg::PC, addr);
    for (long i = 0; i < 20'000'000; ++i) {
        g_cpu.execute(1);
        if (g_cpu.getRegister(WordReg::PC) == SENT) return true;
    }
    return false;   // ran away
}

static uint16_t rdw(uint16_t a) { return g_mem[a] | (g_mem[a+1] << 8); }

int main() {
    std::ifstream f("Testing/life.asm");
    std::stringstream ss; ss << f.rdbuf();
    auto r = zxspec::z80Assemble(ss.str().c_str(), 0x8000);
    if (!r.success) { std::printf("assembly FAILED\n"); return 1; }
    g_origin = r.origin; g_end = r.origin + (uint32_t)r.output.size();

    std::map<std::string, uint16_t> sym;
    for (auto& l : r.listing) {
        std::string s = l.source; size_t i = 0;
        while (i < s.size() && (s[i]==' '||s[i]=='\t')) i++;
        size_t st = i;
        while (i < s.size() && (isalnum((unsigned char)s[i])||s[i]=='_')) i++;
        if (i < s.size() && s[i]==':' && i > st) sym[s.substr(st,i-st)] = l.address;
    }

    std::memset(g_mem, 0, sizeof(g_mem));
    std::memcpy(&g_mem[r.origin], r.output.data(), r.output.size());
    g_cpu.reset(true);
    g_cpu.initialise(memRead, memWrite, ioRead, ioWrite, noContend, noContend, nullptr);
    g_cpu.setIMMode(1); g_cpu.setIFF1(1);

    auto countPop = [&]() {
        uint16_t cur = rdw(sym["curGrid"]);
        int pop = 0;
        for (int y = 1; y <= 24; ++y)
            for (int x = 1; x <= 32; ++x)
                if (g_mem[cur + y*34 + x]) pop++;
        return pop;
    };

    if (!runRoutine(sym["clear_grid"])) { std::printf("clear_grid ran away\n"); return 1; }
    if (!runRoutine(sym["seed"]))       { std::printf("seed ran away\n");       return 1; }
    std::printf("after seed: population = %d (expect ~300-450)\n", countPop());

    int badAttr = 0, generations = 0;
    for (int gen = 0; gen < 60; ++gen) {
        if (!runRoutine(sym["render"]))   { std::printf("render ran away (gen %d)\n", gen); return 1; }
        for (int i = 0x5800; i <= 0x5AFF; ++i)
            if (g_mem[i] != 0x00 && g_mem[i] != 0x44) badAttr++;
        if (!runRoutine(sym["wrap"]))     { std::printf("wrap ran away (gen %d)\n", gen); return 1; }
        if (!runRoutine(sym["step"]))     { std::printf("step ran away (gen %d)\n", gen); return 1; }
        if (!runRoutine(sym["swap"]))     { std::printf("swap ran away (gen %d)\n", gen); return 1; }
        if (!runRoutine(sym["check_pop"])){ std::printf("check_pop ran away (gen %d)\n", gen); return 1; }
        generations++;
    }
    std::printf("ran %d generations\n", generations);
    std::printf("population after %d gens = %d\n", generations, countPop());
    std::printf("invalid attribute bytes written: %d\n", badAttr);
    std::printf("wild memory writes (outside legal regions): %ld%s\n",
                g_wildWrites, g_wildWrites ? "" : "  <-- none, good");
    if (g_wildWrites) std::printf("  first wild write to $%04X\n", g_wildAddr);

    bool ok = g_wildWrites == 0 && badAttr == 0;
    std::printf("\n%s\n", ok ? "PASS: runs cleanly, no wild writes, valid render output"
                             : "FAIL");
    return ok ? 0 : 1;
}
