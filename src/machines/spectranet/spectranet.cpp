/*
 * spectranet.cpp - Spectranet Ethernet interface peripheral
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "spectranet.hpp"

namespace zxspec {

Spectranet::Spectranet()
{
    // Flash is 0xFF when erased (ROM checks for this to detect unconfigured pages)
    flash_.fill(0xFF);
    reset();
}

void Spectranet::reset()
{
    pageA_ = 0;
    pageB_ = 0;
    progTrapAddr_ = 0;
    trapAddrLSBWritten_ = false;
    trapAddrLSB_ = 0;
    controlReg_ = 0;
    pagedIn_ = false;
    trapEnabled_ = false;
    denyA15_ = false;
    trapInhibit_ = false;
    nmiPageInPending_ = false;
    pagedInViaIO_ = false;
    nmiFlipFlop_ = false;
    flashState_ = FlashState::IDLE;

    // Don't clear flash_ (ROM data persists across reset)
    sram_.fill(0);
    w5100_.reset();
}

void Spectranet::loadROM(const uint8_t* data, uint32_t size)
{
    if (!data || size == 0) return;
    // Start with erased flash (0xFF), then overlay ROM data
    flash_.fill(0xFF);
    uint32_t copySize = (size < FLASH_SIZE) ? size : FLASH_SIZE;
    std::memcpy(flash_.data(), data, copySize);

    // Erase non-core module pages (0x08+) that try network I/O at init.
    // This ROM is a SpectranEXT build with modules that attempt WiFi scanning
    // (page 0x08), server connections (page 0x09 "Spectranet Index"), and
    // HTTPS filesystem mounts (page 0x0A). Without real networking, these
    // modules hang during their init routines. Core ROM pages 0x00-0x07
    // are preserved. F_initroms scans pages 2-0x1E and calls init vectors
    // for any page starting with 0xAA — erasing to 0xFF skips them.
    for (uint8_t page = 0x08; page < 0x1F; page++) {
        uint32_t pageBase = page * SNET_PAGE_SIZE;
        if (pageBase < copySize && flash_[pageBase] == 0xAA) {
            std::memset(&flash_[pageBase], 0xFF, SNET_PAGE_SIZE);
        }
    }

    // Flash pages beyond the ROM (pages 4-31) are erased (0xFF).
    // The ROM may copy from these pages' SRAM init areas (offset 0xF00)
    // into SRAM workspace. Fill empty SRAM init areas with RET (0xC9)
    // stubs so any code that calls into these areas returns cleanly
    // rather than triggering RST 38 (0xFF) cascades.
    for (uint8_t page = 0; page < 0x20; page++) {
        uint32_t base = page * SNET_PAGE_SIZE + 0xF00;
        bool allFF = true;
        for (uint32_t i = 0; i < 0xF8 && allFF; i++) {
            if (flash_[base + i] != 0xFF) allFF = false;
        }
        if (allFF) {
            std::memset(&flash_[base], 0xC9, 0xF8);
        }
        base = page * SNET_PAGE_SIZE + 0xFF8;
        allFF = true;
        for (uint32_t i = 0; i < 8 && allFF; i++) {
            if (flash_[base + i] != 0xFF) allFF = false;
        }
        if (allFF) {
            std::memset(&flash_[base], 0xC9, 8);
        }
    }

    // Config page 0x1F: static IP configuration.
    // DHCP cannot work in a browser (requires UDP broadcast on ports 67/68,
    // which browsers don't support). We must use static IP.
    // Layout from flashconf.inc — offsets relative to page start:
    //   0x0F00: Gateway IP (4 bytes)
    //   0x0F04: Subnet mask (4 bytes)
    //   0x0F08: MAC address (6 bytes)
    //   0x0F0E: IP address (4 bytes)
    //   0x0F12: INITFLAGS (1 byte) — bit 1 = static IP
    //   0x0F13: Hostname (16 bytes, null-terminated)
    //   0x0F24: Primary DNS (4 bytes)
    //   0x0F28: Secondary DNS (4 bytes)
    uint32_t cfgBase = 0x1F * SNET_PAGE_SIZE;

    // Gateway: 192.168.1.1
    flash_[cfgBase + 0x0F00] = 192; flash_[cfgBase + 0x0F01] = 168;
    flash_[cfgBase + 0x0F02] = 1;   flash_[cfgBase + 0x0F03] = 1;
    // Subnet: 255.255.255.0
    flash_[cfgBase + 0x0F04] = 255; flash_[cfgBase + 0x0F05] = 255;
    flash_[cfgBase + 0x0F06] = 255; flash_[cfgBase + 0x0F07] = 0;
    // MAC address: 00:AA:BB:CC:DD:EE
    flash_[cfgBase + 0x0F08] = 0x00; flash_[cfgBase + 0x0F09] = 0xAA;
    flash_[cfgBase + 0x0F0A] = 0xBB; flash_[cfgBase + 0x0F0B] = 0xCC;
    flash_[cfgBase + 0x0F0C] = 0xDD; flash_[cfgBase + 0x0F0D] = 0xEE;
    // IP: 192.168.1.100
    flash_[cfgBase + 0x0F0E] = 192; flash_[cfgBase + 0x0F0F] = 168;
    flash_[cfgBase + 0x0F10] = 1;   flash_[cfgBase + 0x0F11] = 100;
    // INITFLAGS: bit 1 = INIT_STATICIP (skip DHCP)
    // Default to DHCP (0x00) — can be overridden by setStaticIP()
    flash_[cfgBase + 0x0F12] = 0x00;
    // Hostname: "spectranet"
    const char* hostname = "spectranet";
    std::memcpy(&flash_[cfgBase + 0x0F13], hostname, 11);
    // Primary DNS: 8.8.8.8
    flash_[cfgBase + 0x0F24] = 8; flash_[cfgBase + 0x0F25] = 8;
    flash_[cfgBase + 0x0F26] = 8; flash_[cfgBase + 0x0F27] = 8;
    // Secondary DNS: 8.8.4.4
    flash_[cfgBase + 0x0F28] = 8; flash_[cfgBase + 0x0F29] = 8;
    flash_[cfgBase + 0x0F2A] = 4; flash_[cfgBase + 0x0F2B] = 4;
}

// ============================================================================
// Memory access (0x0000-0x3FFF)
// ============================================================================

uint8_t Spectranet::memoryRead(uint16_t address) const
{
    uint16_t offset = address & 0x0FFF;

    if (address < 0x1000) {
        // Area fixed: Flash page 0
        if (flashState_ == FlashState::AUTOSELECT) {
            if (offset == 0x0000) return 0x01;  // AMD manufacturer ID
            if (offset == 0x0001) return 0x20;  // AM29F010 device ID
            return 0x00;
        }
        return flash_[offset];
    }
    else if (address < 0x2000) {
        // Area A: mapped by pageA_
        if (pageA_ >= 0x00 && pageA_ <= 0x1F) {
            if (flashState_ == FlashState::AUTOSELECT) {
                if ((offset & 0xFF) == 0x00) return 0x01;
                if ((offset & 0xFF) == 0x01) return 0x20;
                return 0x00;
            }
            return flash_[pageA_ * SNET_PAGE_SIZE + offset];
        }
        else if (pageA_ >= 0x40 && pageA_ <= 0x48) {
            return readW5100Page(pageA_, offset);
        }
        else if (pageA_ >= 0xC0 && pageA_ <= 0xDF) {
            uint8_t sramPage = pageA_ - 0xC0;
            return sram_[sramPage * SNET_PAGE_SIZE + offset];
        }
        return 0xFF;
    }
    else if (address < 0x3000) {
        // Area B: mapped by pageB_
        if (pageB_ >= 0x00 && pageB_ <= 0x1F) {
            if (flashState_ == FlashState::AUTOSELECT) {
                if ((offset & 0xFF) == 0x00) return 0x01;
                if ((offset & 0xFF) == 0x01) return 0x20;
                return 0x00;
            }
            return flash_[pageB_ * SNET_PAGE_SIZE + offset];
        }
        else if (pageB_ >= 0x40 && pageB_ <= 0x48) {
            return readW5100Page(pageB_, offset);
        }
        else if (pageB_ >= 0xC0 && pageB_ <= 0xDF) {
            uint8_t sramPage = pageB_ - 0xC0;
            return sram_[sramPage * SNET_PAGE_SIZE + offset];
        }
        return 0xFF;
    }
    else {
        // Area fixed: SRAM page 0
        return sram_[offset];
    }
}

void Spectranet::memoryWrite(uint16_t address, uint8_t data)
{
    uint16_t offset = address & 0x0FFF;

    if (address < 0x1000) {
        // Flash page 0 — route through flash state machine
        flashWrite(0x00, offset, data);
        return;
    }
    else if (address < 0x2000) {
        // Area A
        if (isFlashPage(pageA_)) {
            flashWrite(pageA_, offset, data);
        }
        else if (pageA_ >= 0x40 && pageA_ <= 0x48) {
            writeW5100Page(pageA_, offset, data);
        }
        else if (pageA_ >= 0xC0 && pageA_ <= 0xDF) {
            uint8_t sramPage = pageA_ - 0xC0;
            sram_[sramPage * SNET_PAGE_SIZE + offset] = data;
        }
    }
    else if (address < 0x3000) {
        // Area B
        if (isFlashPage(pageB_)) {
            flashWrite(pageB_, offset, data);
        }
        else if (pageB_ >= 0x40 && pageB_ <= 0x48) {
            writeW5100Page(pageB_, offset, data);
        }
        else if (pageB_ >= 0xC0 && pageB_ <= 0xDF) {
            uint8_t sramPage = pageB_ - 0xC0;
            sram_[sramPage * SNET_PAGE_SIZE + offset] = data;
        }
    }
    else {
        // SRAM page 0
        sram_[offset] = data;
    }
}

// ============================================================================
// W5100 page mapping
// The W5100 has a 32KB address space mapped across pages 0x40-0x47:
//   Page 0x40 = W5100 0x0000-0x0FFF
//   Page 0x41 = W5100 0x1000-0x1FFF
//   ...
//   Page 0x47 = W5100 0x7000-0x7FFF
// Page 0x48 is sometimes used as an alias/extension.
// ============================================================================

uint8_t Spectranet::readW5100Page(uint8_t page, uint16_t offset) const
{
    uint16_t w5100Addr = (page - 0x40) * SNET_PAGE_SIZE + offset;
    if (w5100Addr >= 0x8000) return 0xFF;
    return w5100_.read(w5100Addr);
}

void Spectranet::writeW5100Page(uint8_t page, uint16_t offset, uint8_t data)
{
    uint16_t w5100Addr = (page - 0x40) * SNET_PAGE_SIZE + offset;
    if (w5100Addr >= 0x8000) return;
    w5100_.write(w5100Addr, data);
}

// ============================================================================
// I/O port handling
// ============================================================================

bool Spectranet::isSpectranetPort(uint16_t address) const
{
    // All Spectranet ports have low byte 0x3B
    return (address & 0xFF) == 0x3B;
}

uint8_t Spectranet::ioRead(uint16_t address, uint8_t borderColor, uint8_t pagingRegister) const
{
    uint8_t upperByte = (address >> 8) & 0xFF;

    switch (upperByte) {
    case 0x00:
        // Page A register
        return pageA_;

    case 0x01:
        // Page B register
        return pageB_;

    case 0x02:
        // Trap address — not readable, return 0xFF
        return 0xFF;

    case 0x03: {
        // Control/Status register (read)
        // Bits 0-2: border colour
        // Bit 3: trap enabled
        // Bit 4: 128K screen page (bit 3 of paging register)
        // Bit 5: deny A15
        // Bit 6: W5100 interrupt pending
        uint8_t status = borderColor & 0x07;
        if (trapEnabled_) status |= 0x08;
        if (pagingRegister & 0x08) status |= 0x10;
        if (denyA15_) status |= 0x20;
        if (w5100_.hasInterrupt()) status |= 0x40;
        return status;
    }

    default:
        return 0xFF;
    }
}

void Spectranet::ioWrite(uint16_t address, uint8_t data)
{
    uint8_t upperByte = (address >> 8) & 0xFF;

    switch (upperByte) {
    case 0x00:
        // Page A register
        pageA_ = data;
        break;

    case 0x01:
        // Page B register
        pageB_ = data;
        break;

    case 0x02:
        // Programmable trap address (16-bit, LSB-first write sequence)
        if (!trapAddrLSBWritten_) {
            trapAddrLSB_ = data;
            trapAddrLSBWritten_ = true;
        } else {
            progTrapAddr_ = trapAddrLSB_ | (static_cast<uint16_t>(data) << 8);
            trapAddrLSBWritten_ = false;
        }
        break;

    case 0x03:
        // Control register (write)
        controlReg_ = data;
        if (data & 0x01) {
            pagedIn_ = true;
            pagedInViaIO_ = true;
        } else {
            // I/O page-out only works if paged in via I/O, not via trap
            if (pagedInViaIO_) {
                pagedIn_ = false;
                pagedInViaIO_ = false;
            }
        }
        trapEnabled_ = (data & 0x08) != 0;
        denyA15_ = (data & 0x20) != 0;
        break;
    }
}

// ============================================================================
// Trap mechanism
// ============================================================================

bool Spectranet::isPageInTrap(uint16_t address) const
{
    // Fixed page-in traps at RST 0 (0x0000) and RST 8 (0x0008)
    // Inhibited for one instruction after page-out to prevent re-triggering
    if (trapInhibit_) return false;
    return address == 0x0000 || address == 0x0008;
}

bool Spectranet::isPageOutTrap(uint16_t address) const
{
    // Hardware page-out trap: fetching from 0x007C while paged in
    return address == 0x007C;
}

bool Spectranet::isCallTrap(uint16_t address) const
{
    // CALL trap: fetching from 0x3FF8-0x3FFF while NOT paged in
    // pages in the Spectranet (used by CALL 0x3FFF / JP 0x3FF8 etc.)
    return address >= 0x3FF8 && address <= 0x3FFF;
}

bool Spectranet::isProgrammableTrap(uint16_t address) const
{
    return trapEnabled_ && address == progTrapAddr_ && progTrapAddr_ != 0;
}

void Spectranet::pageIn()
{
    pagedIn_ = true;
    pagedInViaIO_ = false;
}

void Spectranet::pageOut()
{
    pagedIn_ = false;
    // Inhibit the next trap to prevent immediate re-triggering
    // (e.g., page-out via 0x007C → RET to 0x0000 must not re-trap)
    trapInhibit_ = true;
}

void Spectranet::tickTrapInhibit()
{
    trapInhibit_ = false;
}

// ============================================================================
// AM29F010 flash write state machine
// ============================================================================

void Spectranet::flashWrite(uint8_t page, uint16_t offset, uint8_t data)
{
    uint16_t cmdAddr = offset & 0x7FF;  // A0-A10 only for command matching

    // Writing 0xF0 at any time resets the state machine
    if (data == 0xF0) {
        flashState_ = FlashState::IDLE;
        return;
    }

    switch (flashState_) {
    case FlashState::IDLE:
        if (cmdAddr == 0x555 && data == 0xAA) {
            flashState_ = FlashState::UNLOCK1;
        }
        break;

    case FlashState::UNLOCK1:
        if (cmdAddr == 0x2AA && data == 0x55) {
            flashState_ = FlashState::COMMAND;
        } else {
            flashState_ = FlashState::IDLE;
        }
        break;

    case FlashState::COMMAND:
        if (cmdAddr == 0x555) {
            if (data == 0xA0) {
                flashState_ = FlashState::PROGRAM;
            } else if (data == 0x80) {
                flashState_ = FlashState::ERASE_UNLOCK1;
            } else if (data == 0x90) {
                flashState_ = FlashState::AUTOSELECT;
            } else {
                flashState_ = FlashState::IDLE;
            }
        } else {
            flashState_ = FlashState::IDLE;
        }
        break;

    case FlashState::AUTOSELECT:
        // Writing 0xF0 (handled above) or any reset exits autoselect
        flashState_ = FlashState::IDLE;
        break;

    case FlashState::ERASE_UNLOCK1:
        if (cmdAddr == 0x555 && data == 0xAA) {
            flashState_ = FlashState::ERASE_UNLOCK2;
        } else {
            flashState_ = FlashState::IDLE;
        }
        break;

    case FlashState::ERASE_UNLOCK2:
        if (cmdAddr == 0x2AA && data == 0x55) {
            flashState_ = FlashState::ERASE_CMD;
        } else {
            flashState_ = FlashState::IDLE;
        }
        break;

    case FlashState::ERASE_CMD:
        if (cmdAddr == 0x555 && data == 0x10) {
            // Chip erase: fill all 128KB with 0xFF
            flash_.fill(0xFF);
        } else if (data == 0x30) {
            // Sector erase: 16KB sector (4 pages)
            uint32_t sectorBase = (page / 4) * 4 * SNET_PAGE_SIZE;
            std::memset(&flash_[sectorBase], 0xFF, 4 * SNET_PAGE_SIZE);
        }
        flashState_ = FlashState::IDLE;
        break;

    case FlashState::PROGRAM:
        // Program byte: can only clear bits (AND with existing data)
        flash_[page * SNET_PAGE_SIZE + offset] &= data;
        flashState_ = FlashState::IDLE;
        break;
    }
}

void Spectranet::setNetworkConfig(const uint8_t ip[4], const uint8_t gateway[4],
                                  const uint8_t subnet[4], const uint8_t dns[4])
{
    uint32_t cfgBase = 0x1F * SNET_PAGE_SIZE;

    // Update flash config page 0x1F
    std::memcpy(&flash_[cfgBase + 0x0F00], gateway, 4);
    std::memcpy(&flash_[cfgBase + 0x0F04], subnet, 4);
    std::memcpy(&flash_[cfgBase + 0x0F0E], ip, 4);
    std::memcpy(&flash_[cfgBase + 0x0F24], dns, 4);

    // Apply to W5100 common registers so changes take effect immediately
    for (int i = 0; i < 4; i++) {
        w5100_.write(0x0001 + i, gateway[i]);  // GAR
        w5100_.write(0x0005 + i, subnet[i]);   // SUBR
        w5100_.write(0x000F + i, ip[i]);        // SIPR
    }
}

void Spectranet::setStaticIP(bool useStatic)
{
    uint32_t cfgBase = 0x1F * SNET_PAGE_SIZE;
    if (useStatic) {
        flash_[cfgBase + 0x0F12] |= 0x02;   // Set bit 1 = INIT_STATICIP
    } else {
        flash_[cfgBase + 0x0F12] &= ~0x02;  // Clear bit 1 = use DHCP
    }
}

bool Spectranet::isStaticIP() const
{
    uint32_t cfgBase = 0x1F * SNET_PAGE_SIZE;
    return (flash_[cfgBase + 0x0F12] & 0x02) != 0;
}

} // namespace zxspec
