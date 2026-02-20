/*
 * display.hpp - ULA display generation (shared across all machine variants)
 *
 * Generates the RGBA framebuffer texture from memory and border colour,
 * driven incrementally by T-state updates during CPU execution.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "machine_info.hpp"
#include <array>
#include <cstdint>

namespace zxspec {

class Display {
public:
    void init(const MachineInfo& info);
    void frameReset();

    void updateWithTs(int32_t tStates, const uint8_t* memory,
                      uint8_t borderColor, uint32_t frameCounter);

    const uint8_t* getFramebuffer() const;
    int getFramebufferSize() const;

    uint32_t getCurrentDisplayTs() const { return currentDisplayTs_; }

    uint8_t floatingBus(uint32_t cpuTStates, const uint8_t* memory) const;

private:
    void buildTsTable();
    void buildLineAddressTable();

    std::array<uint8_t, FRAMEBUFFER_SIZE> framebuffer_{};

    uint32_t currentDisplayTs_ = 0;
    uint32_t bufferIndex_ = 0;

    // Machine-specific timing (from MachineInfo)
    uint32_t scanlines_ = 0;
    uint32_t tsPerScanline_ = 0;
    uint32_t pxVerticalBlank_ = 0;
    uint32_t paperStartLine_ = 0;
    uint32_t borderDrawingOffset_ = 0;
    uint32_t paperDrawingOffset_ = 0;
    uint32_t ulaTsToDisplay_ = 0;
    uint32_t tsPerFrame_ = 0;

    // Display lookup tables (sized for max machine variant)
    uint32_t tstateTable_[MAX_SCANLINES][MAX_TS_PER_LINE]{};
    uint16_t lineAddrTable_[SCREEN_HEIGHT]{};
};

} // namespace zxspec
