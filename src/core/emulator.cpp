/*
 * emulator.cpp - Core emulator coordinator for ZX Spectrum
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "emulator.hpp"
#include <cstring>

#include "roms.cpp"

namespace zxspec {

Emulator::Emulator()
{
    z80_ = std::make_unique<Z80>();
}

Emulator::~Emulator() = default;

void Emulator::init()
{
    z80_->initialise(
        [this](uint16_t addr, void* param) { return memRead(addr, param); },
        [this](uint16_t addr, uint8_t data, void* param) { memWrite(addr, data, param); },
        [this](uint16_t addr, void* param) { return ioRead(addr, param); },
        [this](uint16_t addr, uint8_t data, void* param) { ioWrite(addr, data, param); },
        [this](uint16_t addr, uint32_t tstates, void* param) { memContention(addr, tstates, param); },
        this
    );

    // Load 48K ROM into first 16KB
    if (roms::ROM_48K_SIZE > 0)
    {
        std::memcpy(memory_.data(), roms::ROM_48K, roms::ROM_48K_SIZE);
    }

    reset();
}

void Emulator::reset()
{
    z80_->reset(true);
    paused_ = false;
}

void Emulator::runCycles(int cycles)
{
    if (paused_)
        return;

    z80_->execute(static_cast<uint32_t>(cycles), INT_LENGTH_TSTATES);
}

void Emulator::stepInstruction()
{
    z80_->execute(1, INT_LENGTH_TSTATES);
}

uint8_t Emulator::readMemory(uint16_t address) const
{
    return memory_[address];
}

void Emulator::writeMemory(uint16_t address, uint8_t data)
{
    if (address >= ROM_48K_SIZE)
    {
        memory_[address] = data;
    }
}

uint8_t Emulator::memRead(uint16_t address, void* /*param*/)
{
    return memory_[address];
}

void Emulator::memWrite(uint16_t address, uint8_t data, void* /*param*/)
{
    if (address >= ROM_48K_SIZE)
    {
        memory_[address] = data;
    }
}

uint8_t Emulator::ioRead(uint16_t /*address*/, void* /*param*/)
{
    return 0xff;
}

void Emulator::ioWrite(uint16_t /*address*/, uint8_t /*data*/, void* /*param*/)
{
}

void Emulator::memContention(uint16_t /*address*/, uint32_t /*tstates*/, void* /*param*/)
{
}

} // namespace zxspec
