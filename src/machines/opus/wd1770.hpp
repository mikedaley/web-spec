/*
 * wd1770.hpp - WD1770 Floppy Disk Controller emulation
 *
 * Emulates the WD1770 FDC used in the Opus Discovery disk interface for
 * the ZX Spectrum. Simpler than the µPD765A — uses 4 registers and
 * single-byte DRQ transfers.
 *
 * Registers:
 *   0: Command (write) / Status (read)
 *   1: Track
 *   2: Sector
 *   3: Data
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "../fdc/disk_image.hpp"
#include <cstdint>
#include <vector>

namespace zxspec {

class WD1770 {
public:
    WD1770();

    void reset();

    // Connect/disconnect disk images (up to 2 drives)
    void insertDisk(int drive, DiskImage* image);
    void ejectDisk(int drive);
    bool hasDisk(int drive) const;
    DiskImage* getDisk(int drive) const;

    // Drive selection (from external control latch)
    void selectDrive(int drive) { selectedDrive_ = drive & 1; }
    int getSelectedDrive() const { return selectedDrive_; }

    // Side selection (from external control latch)
    void selectSide(int side) { selectedSide_ = side & 1; }
    int getSelectedSide() const { return selectedSide_; }

    // Register access
    uint8_t readRegister(int reg);
    void writeRegister(int reg, uint8_t data);

    // Call once per frame to tick the motor timeout counter
    void updateMotorTimeout();

    // Status register (for external query)
    uint8_t getStatus() const { return statusRegister_; }
    uint8_t getCurrentTrack() const { return trackRegister_; }
    bool isMotorOn() const { return motorOn_; }
    bool isDRQ() const { return (statusRegister_ & STATUS_DRQ) != 0; }

    // NMI edge detection: returns true once per DRQ assertion
    bool shouldFireNMI() {
        if ((statusRegister_ & STATUS_DRQ) && !drqNmiPending_) {
            drqNmiPending_ = true;
            return true;
        }
        return false;
    }
    bool isBusy() const { return (statusRegister_ & STATUS_BUSY) != 0; }

private:
    // Status register bits
    static constexpr uint8_t STATUS_BUSY         = 0x01;
    static constexpr uint8_t STATUS_DRQ          = 0x02;  // Type II/III
    static constexpr uint8_t STATUS_INDEX         = 0x02;  // Type I
    static constexpr uint8_t STATUS_LOST_DATA    = 0x04;  // Type II/III
    static constexpr uint8_t STATUS_TRACK0       = 0x04;  // Type I
    static constexpr uint8_t STATUS_CRC_ERROR    = 0x08;
    static constexpr uint8_t STATUS_RNF          = 0x10;  // Type II/III: Record Not Found
    static constexpr uint8_t STATUS_SEEK_ERROR   = 0x10;  // Type I: Seek Error
    static constexpr uint8_t STATUS_RECORD_TYPE  = 0x20;  // Type II: deleted mark
    static constexpr uint8_t STATUS_HEAD_LOADED  = 0x20;  // Type I
    static constexpr uint8_t STATUS_WRITE_PROTECT = 0x40;
    static constexpr uint8_t STATUS_NOT_READY    = 0x80;  // Type II/III
    static constexpr uint8_t STATUS_MOTOR_ON     = 0x80;  // Type I

    // Command types
    enum class CommandType { NONE, TYPE_I, TYPE_II, TYPE_III, TYPE_IV };

    // Determine command type from command byte
    CommandType classifyCommand(uint8_t cmd) const;

    // Command handlers
    void executeCommand(uint8_t cmd);
    void cmdRestore(uint8_t cmd);
    void cmdSeek(uint8_t cmd);
    void cmdStep(uint8_t cmd, int direction);
    void cmdReadSector(uint8_t cmd);
    void cmdWriteSector(uint8_t cmd);
    void cmdReadAddress(uint8_t cmd);
    void cmdReadTrack(uint8_t cmd);
    void cmdWriteTrack(uint8_t cmd);
    void cmdForceInterrupt(uint8_t cmd);

    // Registers
    uint8_t statusRegister_ = 0;
    uint8_t trackRegister_ = 0;
    uint8_t sectorRegister_ = 1;
    uint8_t dataRegister_ = 0;

    // Internal state
    int selectedDrive_ = 0;
    int selectedSide_ = 0;
    int stepDirection_ = 1;  // +1 = in, -1 = out
    bool motorOn_ = false;
    int motorTimeoutFrames_ = 0;   // Frames remaining before motor auto-off
    CommandType lastCommandType_ = CommandType::NONE;

    // Sector data buffer for read/write operations
    std::vector<uint8_t> dataBuffer_;
    int dataIndex_ = 0;
    bool dataReading_ = false;   // true = FDC→CPU read
    bool dataWriting_ = false;   // true = CPU→FDC write
    bool multiSector_ = false;   // Multiple sector flag (m bit)
    bool drqNmiPending_ = false;  // Edge detection for NMI: set when NMI fired, cleared when DRQ cleared
    bool pendingComplete_ = false; // Transfer done but BUSY held until status read
    bool nextBytePending_ = false; // Next byte ready but DRQ deferred until status read

    // Drive state
    DiskImage* disk_[2] = { nullptr, nullptr };
    uint8_t physicalTrack_[2] = { 0, 0 };  // Actual head position
};

} // namespace zxspec
