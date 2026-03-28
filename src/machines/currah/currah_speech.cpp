/*
 * currah_speech.cpp - Currah uSpeech Speech Synthesiser Interface
 *
 * Handles the Currah hardware: ROM overlay paging, memory-mapped registers
 * for allophone output and busy status, and the intonation control.
 * The actual speech synthesis is delegated to the SP0256 class.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "currah_speech.hpp"
#include <cstring>

namespace zxspec {

CurrahSpeech::CurrahSpeech()
{
    rom_.fill(0xFF);
}

void CurrahSpeech::reset()
{
    pagedIn_ = false;
    sp0256_.reset();
}

void CurrahSpeech::loadROM(const uint8_t* data, uint32_t size)
{
    if (!data || size == 0) return;
    uint32_t copySize = (size < ROM_SIZE) ? size : ROM_SIZE;
    std::memcpy(rom_.data(), data, copySize);
}

void CurrahSpeech::loadAllophoneROM(const uint8_t* data, uint32_t size)
{
    sp0256_.loadROM(data, size);
}

uint8_t CurrahSpeech::memoryRead(uint16_t address) const
{
    if (address < 0x1000) {
        // 2KB ROM mirrored across 0x0000-0x0FFF
        return rom_[address & 0x07FF];
    }
    if (address < 0x2000) {
        // SP0256 busy status in bit 0 — the Currah ROM polls this before
        // writing the next allophone to avoid overrunning the chip's FIFO
        return sp0256_.isBusy() ? 0x01 : 0x00;
    }
    return 0xFF;
}

void CurrahSpeech::memoryWrite(uint16_t address, uint8_t data)
{
    if (address >= 0x1000 && address < 0x2000) {
        // Allophone number in bits 0-5 — this is what makes it speak.
        // The Currah ROM converts ASCII text and phoneme codes into these
        // 6-bit allophone numbers during its interrupt handler.
        sp0256_.writeAllophone(data & 0x3F);
    } else if (address >= 0x3000 && address < 0x4000) {
        // Intonation control — a nice touch by Currah. Even addresses set
        // low pitch, odd addresses set high pitch (~7% up). The BASIC
        // extension uses uppercase letters in the speech string to trigger
        // the high intonation, giving speech a bit more life.
        sp0256_.setHighIntonation((address & 1) != 0);
    }
}

uint8_t CurrahSpeech::debugRead(uint16_t address) const
{
    return memoryRead(address);
}

} // namespace zxspec
