/*
 * currah_speech.hpp - Currah uSpeech Speech Synthesiser Interface
 *
 * The Currah uSpeech was a popular add-on for the ZX Spectrum that plugged
 * into the expansion port and gave the machine speech capability via a
 * GI SP0256-AL2 chip. It included a 2KB ROM that extended BASIC with
 * speech commands, hooking into the interrupt handler at 0x0038.
 *
 * The clever bit: the ROM paging uses a toggle at address 0x0038. Since
 * that's the IM1 interrupt vector, the Currah ROM automatically pages in
 * on every interrupt (50 times/sec), does its speech processing, then
 * jumps back to 0x0038 to page itself out and let the normal ROM handle
 * the rest of the interrupt. Elegant and slightly terrifying.
 *
 * Memory map when the ROM is paged in:
 *   0x0000-0x07FF  2KB Currah ROM (speech BIOS and BASIC extension)
 *   0x0800-0x0FFF  Mirror of the ROM
 *   0x1000-0x1FFF  Write: allophone number (bits 0-5) to SP0256
 *                  Read:  busy flag in bit 0 (1=processing, 0=ready)
 *   0x2000-0x2FFF  Falls through to normal Spectrum ROM
 *   0x3000-0x3FFF  Write: intonation control (even=low, odd=high pitch)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "sp0256.hpp"
#include <cstdint>
#include <array>

namespace zxspec {

class CurrahSpeech {
public:
    static constexpr uint32_t ROM_SIZE = 2048;

    CurrahSpeech();
    ~CurrahSpeech() = default;

    void reset();
    void loadROM(const uint8_t* data, uint32_t size);
    void loadAllophoneROM(const uint8_t* data, uint32_t size);

    uint8_t memoryRead(uint16_t address) const;
    void    memoryWrite(uint16_t address, uint8_t data);
    uint8_t debugRead(uint16_t address) const;

    bool isPagedIn() const { return pagedIn_; }
    void togglePaging() { pagedIn_ = !pagedIn_; }

    SP0256&       getSP0256()       { return sp0256_; }
    const SP0256& getSP0256() const { return sp0256_; }

    bool isHighIntonation() const { return sp0256_.isHighIntonation(); }

private:
    std::array<uint8_t, ROM_SIZE> rom_{};
    SP0256 sp0256_;
    bool pagedIn_ = false;
};

} // namespace zxspec
