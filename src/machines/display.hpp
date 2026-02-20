/*
 * display.hpp - ULA display generation (shared across all machine variants)
 *
 * Generates the RGBA framebuffer texture from memory and border colour,
 * driven incrementally by T-state updates during CPU execution.
 *
 * The display is rendered progressively: as the CPU executes instructions,
 * the machine calls updateWithTs() with the number of T-states elapsed.
 * This renders exactly the pixels that the ULA would have output during
 * that time, allowing mid-frame border colour changes and screen writes
 * to appear at the correct scanline position (essential for colour-bar
 * effects, split-screen scrolling, etc.).
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

    // Render pixels for the given number of T-states, advancing the internal
    // display position. Called after each CPU instruction (or group) to keep
    // the framebuffer in sync with the CPU's progress through the frame.
    void updateWithTs(int32_t tStates, const uint8_t* memory,
                      uint8_t borderColor, uint32_t frameCounter);

    const uint8_t* getFramebuffer() const;
    int getFramebufferSize() const;

    // Returns the T-state position the display has been rendered up to so far
    // in the current frame. Used by the machine to calculate how many T-states
    // of display need catching up after a CPU instruction.
    uint32_t getCurrentDisplayTs() const { return currentDisplayTs_; }

    // Returns the byte the ULA would be reading from screen memory at the given
    // CPU T-state. Programs can observe this via a read from an unattached port
    // (the "floating bus" effect). Returns 0xFF when the ULA is not actively
    // fetching screen data.
    uint8_t floatingBus(uint32_t cpuTStates, const uint8_t* memory) const;

private:
    void buildTsTable();
    void buildLineAddressTable();

    // The RGBA framebuffer: 320×256 pixels × 4 bytes per pixel.
    // Written to progressively during each frame and read by the WebGL renderer.
    std::array<uint8_t, FRAMEBUFFER_SIZE> framebuffer_{};

    // How far through the frame the display has been rendered (in T-states).
    // Advances in steps of TSTATES_PER_CHAR (4) as each 8-pixel block is drawn.
    uint32_t currentDisplayTs_ = 0;

    // Write position in the framebuffer (in pixels, not bytes).
    // Only advances for visible pixels (border + paper), not during retrace.
    uint32_t bufferIndex_ = 0;

    // Machine-specific timing (copied from MachineInfo at init)
    uint32_t scanlines_ = 0;            // Total scanlines per frame (e.g. 312)
    uint32_t tsPerScanline_ = 0;        // T-states per scanline (e.g. 224)
    uint32_t pxVerticalBlank_ = 0;      // Scanlines in vertical blank (e.g. 8)
    uint32_t paperStartLine_ = 0;       // First scanline of the paper area (vblank + top border)
    uint32_t borderDrawingOffset_ = 0;  // Fine T-state offset for border rendering
    uint32_t paperDrawingOffset_ = 0;   // Fine T-state offset for paper rendering
    uint32_t ulaTsToDisplay_ = 0;       // T-state when ULA begins screen fetch
    uint32_t tsPerFrame_ = 0;           // Total T-states per frame

    // Pre-calculated action for every (scanline, T-state) position in the frame.
    // Values are DISPLAY_RETRACE, DISPLAY_BORDER, or DISPLAY_PAPER. This avoids
    // per-pixel branching in the hot rendering loop.
    uint32_t tstateTable_[MAX_SCANLINES][MAX_TS_PER_LINE]{};

    // Pre-calculated screen memory offset for each of the 192 paper lines.
    // The ZX Spectrum's screen memory layout is not linear — see buildLineAddressTable().
    uint16_t lineAddrTable_[SCREEN_HEIGHT]{};
};

} // namespace zxspec
