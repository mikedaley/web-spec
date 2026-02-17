/*
 * contention.hpp - ULA memory and IO contention timing (shared across machines)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "machine_info.hpp"
#include <cstdint>

namespace zxspec {

class Z80;

class ULAContention {
public:
    void init(const MachineInfo& info);

    uint32_t memoryContention(uint32_t tstates) const;
    uint32_t ioContention(uint32_t tstates) const;

    void applyIOContention(Z80& z80, uint16_t address, bool contended) const;

private:
    void buildContentionTable();

    uint32_t tsPerFrame_ = 0;
    uint32_t tsPerScanline_ = 0;
    uint32_t tsToOrigin_ = 0;
    bool altContention_ = false;

    uint32_t memoryContentionTable_[MAX_TSTATES_PER_FRAME + 1]{};
    uint32_t ioContentionTable_[MAX_TSTATES_PER_FRAME + 1]{};
};

} // namespace zxspec
