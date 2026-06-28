// Harness: assemble life.asm with the project's own assembler and dump
// errors + a byte listing so we can spot mis-encodings / PC desync.
#include "../src/core/z80/z80_assembler.hpp"
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

int main(int argc, char** argv) {
    const char* path = argc > 1 ? argv[1] : "Testing/life.asm";
    std::ifstream f(path);
    if (!f) { std::printf("cannot open %s\n", path); return 1; }
    std::stringstream ss; ss << f.rdbuf();
    std::string src = ss.str();

    auto r = zxspec::z80Assemble(src.c_str(), 0x8000);
    std::printf("success=%d origin=$%04X bytes=%zu\n", r.success, r.origin, r.output.size());
    if (!r.errors.empty()) {
        std::printf("ERRORS:\n");
        for (auto& e : r.errors) std::printf("  line %d: %s\n", e.line, e.message.c_str());
    }
    std::printf("\nLISTING:\n");
    for (auto& l : r.listing) {
        std::printf("%04X  ", l.address);
        for (size_t i = 0; i < 5; ++i) {
            if (i < l.bytes.size()) std::printf("%02X ", l.bytes[i]);
            else std::printf("   ");
        }
        std::printf(" | %s\n", l.source.c_str());
    }
    return 0;
}
