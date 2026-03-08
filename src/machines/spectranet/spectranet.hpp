/*
 * spectranet.hpp - Spectranet Ethernet interface peripheral
 *
 * Emulates the Spectranet hardware that overlays 0x0000-0x3FFF with
 * its own Flash ROM, SRAM, and W5100 Ethernet controller, accessed
 * via 4KB sub-paging. The Spectranet is a toggleable peripheral on
 * existing 48K/128K machines.
 *
 * Memory overlay (when paged in, replaces slot 0):
 *   0x0000-0x0FFF: Flash page 0 (fixed)
 *   0x1000-0x1FFF: Mapped via pageA_ — Flash/W5100/SRAM
 *   0x2000-0x2FFF: Mapped via pageB_ — Flash/W5100/SRAM
 *   0x3000-0x3FFF: SRAM page 0 (fixed)
 *
 * I/O Ports (all match (address & 0xFF) == 0x3B):
 *   0x003B: Page A register (R/W)
 *   0x013B: Page B register (R/W)
 *   0x023B: Programmable trap address (W, 16-bit LSB-first)
 *   0x033B: Control/Status register (R/W)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "w5100.hpp"
#include <cstdint>
#include <cstring>
#include <array>

namespace zxspec {

// AM29F010 flash state machine states
enum class FlashState : uint8_t {
    IDLE,
    UNLOCK1,
    COMMAND,
    ERASE_UNLOCK1,
    ERASE_UNLOCK2,
    ERASE_CMD,
    PROGRAM
};

class Spectranet {
public:
    static constexpr uint32_t FLASH_SIZE = 128 * 1024;  // 128KB (pages 0x00-0x1F)
    static constexpr uint32_t SRAM_SIZE  = 128 * 1024;  // 128KB (pages 0xC0-0xDF)
    static constexpr uint32_t SNET_PAGE_SIZE = 4096;      // 4KB per page

    Spectranet();

    void reset();

    // Load Spectranet ROM into flash (up to 128KB)
    void loadROM(const uint8_t* data, uint32_t size);

    // Memory access (0x0000-0x3FFF when paged in)
    uint8_t memoryRead(uint16_t address) const;
    void memoryWrite(uint16_t address, uint8_t data);

    // I/O port handling
    bool isSpectranetPort(uint16_t address) const;
    uint8_t ioRead(uint16_t address, uint8_t borderColor, uint8_t pagingRegister) const;
    void ioWrite(uint16_t address, uint8_t data);

    // Paging state
    bool isPagedIn() const { return pagedIn_; }
    void setPagedIn(bool paged) { pagedIn_ = paged; }

    // Trap mechanism
    bool isTrapEnabled() const { return trapEnabled_; }
    uint16_t getTrapAddress() const { return progTrapAddr_; }

    // Check if address triggers a page-in trap (0x0000, 0x0008 when not paged in)
    bool isPageInTrap(uint16_t address) const;
    bool isTrapInhibited() const { return trapInhibit_; }
    uint8_t sramRead(uint16_t offset) const { return sram_[offset % sram_.size()]; }

    // Check if address triggers page-out (0x007C when paged in)
    bool isPageOutTrap(uint16_t address) const;

    // Check if address triggers a CALL page-in trap (0x3FF8-0x3FFF when not paged in)
    bool isCallTrap(uint16_t address) const;

    // Check if address triggers the programmable trap
    bool isProgrammableTrap(uint16_t address) const;

    // Page in (for traps)
    void pageIn();

    // Page out (for UNPAGE at 0x007C) — inhibits next trap
    void pageOut();

    // Must be called each instruction to clear trap inhibit
    void tickTrapInhibit();

    // Deferred page-in for programmable trap NMI
    bool isNMIPageInPending() const { return nmiPageInPending_; }
    void setNMIPageInPending(bool pending) { nmiPageInPending_ = pending; }

    // NMI flip-flop: prevents re-entrant NMI while handler is active
    bool isNMIBlocked() const { return nmiFlipFlop_; }
    void setNMIFlipFlop(bool state) { nmiFlipFlop_ = state; }
    void clearNMIFlipFlop() { nmiFlipFlop_ = false; }

    // State accessors for debug window
    uint8_t getPageA() const { return pageA_; }
    uint8_t getPageB() const { return pageB_; }
    uint8_t getControlReg() const { return controlReg_; }
    uint8_t debugReadFlash(uint32_t offset) const { return (offset < FLASH_SIZE) ? flash_[offset] : 0xFF; }

    // Update static IP config in flash and apply to W5100 registers.
    // All parameters are 4-byte arrays in network order.
    void setNetworkConfig(const uint8_t ip[4], const uint8_t gateway[4],
                          const uint8_t subnet[4], const uint8_t dns[4]);

    // Set whether to use static IP (true) or DHCP (false).
    // Modifies INITFLAGS bit 1 in flash config page 0x1F.
    void setStaticIP(bool useStatic);
    bool isStaticIP() const;

    // SRAM data access (for persistence)
    const uint8_t* getSRAMData() const { return sram_.data(); }
    uint8_t* getSRAMData() { return sram_.data(); }
    static constexpr uint32_t getSRAMSize() { return SRAM_SIZE; }

    // Full flash access (for persistence across sessions)
    const uint8_t* getFlashData() const { return flash_.data(); }
    uint8_t* getFlashData() { return flash_.data(); }
    static constexpr uint32_t getFlashSize() { return FLASH_SIZE; }

    // Flash config page 0x1F access (for persistence across sessions)
    static constexpr uint8_t CONFIG_PAGE = 0x1F;
    const uint8_t* getFlashConfigData() const { return &flash_[CONFIG_PAGE * SNET_PAGE_SIZE]; }
    uint8_t* getFlashConfigData() { return &flash_[CONFIG_PAGE * SNET_PAGE_SIZE]; }
    static constexpr uint32_t getFlashConfigSize() { return SNET_PAGE_SIZE; }

    // W5100 access
    W5100& getW5100() { return w5100_; }
    const W5100& getW5100() const { return w5100_; }

private:
    // Map a page number to a pointer within flash, SRAM, or W5100
    const uint8_t* mapPageRead(uint8_t page) const;
    uint8_t* mapPageWrite(uint8_t page);
    uint8_t readW5100Page(uint8_t page, uint16_t offset) const;
    void writeW5100Page(uint8_t page, uint16_t offset, uint8_t data);

    // AM29F010 flash write emulation
    bool isFlashPage(uint8_t page) const { return page <= 0x1F; }
    void flashWrite(uint8_t page, uint16_t offset, uint8_t data);

    // Page registers
    uint8_t pageA_ = 0;           // Area A page (port 0x003B)
    uint8_t pageB_ = 0;           // Area B page (port 0x013B)

    // Programmable trap
    uint16_t progTrapAddr_ = 0;   // Trap address (port 0x023B, 2-byte write)
    bool trapAddrLSBWritten_ = false;  // LSB-first write sequence state
    uint8_t trapAddrLSB_ = 0;    // Pending LSB value

    // Control register (port 0x033B)
    uint8_t controlReg_ = 0;
    bool pagedIn_ = false;        // Bit 0: page-in
    bool trapEnabled_ = false;    // Bit 3: trap enable
    bool denyA15_ = false;        // Bit 5: deny A15

    // After page-out, inhibit the next trap to prevent re-triggering
    bool trapInhibit_ = false;

    // Tracks whether page-in was via I/O (port 0x033B bit 0) vs trap.
    // I/O page-out (clearing bit 0) only works if paged in via I/O.
    bool pagedInViaIO_ = false;

    // Deferred page-in: set when programmable trap fires NMI,
    // cleared when the NMI handler at 0x0066 pages in the Spectranet
    bool nmiPageInPending_ = false;

    // NMI flip-flop: set when NMI fires, cleared on RETN
    bool nmiFlipFlop_ = false;

    // AM29F010 flash state machine
    FlashState flashState_ = FlashState::IDLE;

    // Flash ROM (erased state = 0xFF) and SRAM
    std::array<uint8_t, FLASH_SIZE> flash_;
    std::array<uint8_t, SRAM_SIZE> sram_{};

    // W5100 Ethernet controller
    W5100 w5100_;
};

} // namespace zxspec
