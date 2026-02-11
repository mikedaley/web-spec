/*
 * display.hpp - ULA display generation for ZX Spectrum
 *
 * Generates the RGBA framebuffer texture from memory and border colour,
 * driven incrementally by T-state updates during CPU execution.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../types.hpp"
#include <array>
#include <cstdint>

namespace zxspec {

class Display {
public:
    void init();
    void frameReset();

    // Advance display rendering by the given number of T-states.
    // memory must point to the full 64KB address space.
    void updateWithTs(int32_t tStates, const uint8_t* memory,
                      uint8_t borderColor, uint32_t frameCounter);

    const uint8_t* getFramebuffer() const;
    int getFramebufferSize() const;

    uint32_t getCurrentDisplayTs() const { return currentDisplayTs_; }

    // Floating bus value based on current T-state (reads from screen memory)
    uint8_t floatingBus(uint32_t cpuTStates, const uint8_t* memory) const;

private:
    void buildTsTable();
    void buildLineAddressTable();

    std::array<uint8_t, FRAMEBUFFER_SIZE> framebuffer_{};

    // Current display rendering position
    uint32_t currentDisplayTs_ = 0;
    uint32_t bufferIndex_ = 0;

    // Display lookup tables
    uint32_t tstateTable_[PX_VERTICAL_TOTAL][TSTATES_PER_SCANLINE]{};
    uint16_t lineAddrTable_[PX_VERTICAL_DISPLAY]{};
};

} // namespace zxspec
