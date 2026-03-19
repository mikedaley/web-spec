/*
 * upd765a.hpp - NEC µPD765A Floppy Disk Controller emulation
 *
 * Emulates the FDC used in the ZX Spectrum +3. Supports the core command
 * set used by +3DOS: Read Data, Write Data, Read ID, Format Track, Seek,
 * Recalibrate, Sense Interrupt Status, Sense Drive Status, and Specify.
 *
 * I/O ports on the +3:
 *   0x2FFD (read)       - Main Status Register (MSR)
 *   0x3FFD (read/write) - Data Register
 *   0x1FFD bit 3        - Motor on/off
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "disk_image.hpp"
#include <cstdint>
#include <vector>

namespace zxspec {

class UPD765A {
public:
    UPD765A();

    void reset();

    // Connect a disk image to drive A (drive 0) or B (drive 1).
    // The +3 only has drive A, but we support B for completeness.
    void insertDisk(int drive, DiskImage* image);
    void ejectDisk(int drive);
    bool hasDisk(int drive) const;
    DiskImage* getDisk(int drive) const;

    // Motor control (directly from port 0x1FFD bit 3)
    void setMotor(bool on);

    bool isMotorOn() const { return motorOn_; }

    // Read the Main Status Register (port 0x2FFD)
    uint8_t readMSR();

    // Read the Data Register (port 0x3FFD)
    uint8_t readData();

    // Write to the Data Register (port 0x3FFD)
    void writeData(uint8_t data);

    // FDC state for status queries
    uint8_t getCurrentTrack(int drive) const { return currentTrack_[drive & 1]; }
    int getPhase() const { return static_cast<int>(phase_); }
    bool isExecutionRead() const { return executionRead_; }
    bool isInExecution() const { return phase_ == Phase::Execution; }

    // Extended state for debug panel
    uint8_t getCurrentCommand() const { return currentCommand_; }
    uint8_t getXferSector() const { return xferSector_; }
    uint8_t getXferSide() const { return xferSide_; }
    uint8_t getXferSizeCode() const { return xferSizeCode_; }
    uint8_t getXferEOT() const { return xferEOT_; }
    int getDataIndex() const { return dataIndex_; }
    int getDataSize() const { return static_cast<int>(dataBuffer_.size()); }
    uint8_t getLastSectorC() const { return lastSectorC_; }
    uint8_t getLastSectorH() const { return lastSectorH_; }
    uint8_t getLastSectorR() const { return lastSectorR_; }
    uint8_t getLastSectorN() const { return lastSectorN_; }
    uint8_t getLastResultST0() const { return resultBuffer_.size() >= 1 ? resultBuffer_[0] : 0; }
    uint8_t getLastResultST1() const { return resultBuffer_.size() >= 2 ? resultBuffer_[1] : 0; }
    uint8_t getLastResultST2() const { return resultBuffer_.size() >= 3 ? resultBuffer_[2] : 0; }
    int getCommandLength() const { return static_cast<int>(commandBuffer_.size()); }
    int getResultLength() const { return static_cast<int>(resultBuffer_.size()); }
    int getResultIndex() const { return resultIndex_; }

private:
    // FDC operating phases
    enum class Phase {
        Command,        // Waiting for command bytes from CPU
        Execution,      // Transferring sector data
        Result          // Sending result bytes to CPU
    };

    // FDC command IDs (lower 5 bits of first command byte)
    enum Command : uint8_t {
        CMD_READ_TRACK          = 0x02,
        CMD_READ_DATA           = 0x06,
        CMD_READ_DELETED_DATA   = 0x0C,
        CMD_WRITE_DATA          = 0x05,
        CMD_WRITE_DELETED_DATA  = 0x09,
        CMD_READ_ID             = 0x0A,
        CMD_FORMAT_TRACK        = 0x0D,
        CMD_SCAN_EQUAL          = 0x11,
        CMD_SCAN_LOW_OR_EQUAL   = 0x19,
        CMD_SCAN_HIGH_OR_EQUAL  = 0x1D,
        CMD_RECALIBRATE         = 0x07,
        CMD_SENSE_INT_STATUS    = 0x08,
        CMD_SPECIFY             = 0x03,
        CMD_SENSE_DRIVE_STATUS  = 0x04,
        CMD_SEEK                = 0x0F,
    };

    // How many parameter bytes each command expects (after the command byte)
    int getCommandParamCount(uint8_t cmd) const;

    // Command execution handlers
    void executeCommand();
    void cmdReadData();
    void cmdReadTrack();
    void cmdWriteData();
    void cmdReadID();
    void cmdFormatTrack();
    void cmdRecalibrate();
    void cmdSenseInterruptStatus();
    void cmdSpecify();
    void cmdSenseDriveStatus();
    void cmdSeek();
    void cmdInvalid();

    // Helper to set up standard 7-byte result for read/write/format
    void setResult7(uint8_t st0, uint8_t st1, uint8_t st2,
                    uint8_t c, uint8_t h, uint8_t r, uint8_t n);

    // Advance to next sector during multi-sector read/write
    bool advanceToNextSector();

    // State
    Phase phase_ = Phase::Command;
    bool motorOn_ = false;

    // Command buffer
    std::vector<uint8_t> commandBuffer_;
    int commandParamCount_ = 0;
    uint8_t currentCommand_ = 0;

    // Result buffer
    std::vector<uint8_t> resultBuffer_;
    int resultIndex_ = 0;

    // Execution phase data buffer (for read/write sector data)
    std::vector<uint8_t> dataBuffer_;
    int dataIndex_ = 0;
    bool executionRead_ = false;  // true = FDC→CPU (read), false = CPU→FDC (write)

    // Multi-sector transfer state
    uint8_t xferDrive_ = 0;
    uint8_t xferTrack_ = 0;        // C from command (for sector search)
    uint8_t xferSide_ = 0;
    uint8_t xferSector_ = 0;       // Current R value being transferred
    uint8_t xferSizeCode_ = 0;
    uint8_t xferEOT_ = 0;          // End of track (last sector to transfer)
    bool xferMultiTrack_ = false;
    bool xferDeletedData_ = false;
    bool xferSkip_ = false;         // SK bit: skip deleted/non-deleted sectors
    bool xferWeakSector_ = false;   // Current sector has weak/fuzzy data
    bool xferCMTerminate_ = false;  // Terminate after current sector (CM mismatch)
    uint8_t xferST1_ = 0;          // Sector's stored ST1 flags
    uint8_t xferST2_ = 0;          // Sector's stored ST2 flags

    // Sector ID field values from the last sector read/written.
    // On the real µPD765A, result phase C/H/R/N reflect the sector's
    // ID field, not the command parameters. Copy protection schemes
    // (Speedlock etc.) depend on seeing the actual sector IDs in results.
    uint8_t lastSectorC_ = 0;
    uint8_t lastSectorH_ = 0;
    uint8_t lastSectorR_ = 0;
    uint8_t lastSectorN_ = 0;

    // Format state
    uint8_t formatSectorsRemaining_ = 0;
    uint8_t formatSizeCode_ = 0;
    uint8_t formatSectorsPerTrack_ = 0;
    uint8_t formatGap3_ = 0;
    uint8_t formatFiller_ = 0;
    std::vector<uint8_t> formatIdBuffer_;

    // Drive state
    DiskImage* disk_[2] = { nullptr, nullptr };
    uint8_t currentTrack_[2] = { 0, 0 };

    // Simulated disk rotation index for READ ID
    int readIdIndex_ = 0;

    // Overrun detection: on real hardware, unread data bytes cause an overrun
    // after ~26µs (one byte-time at 250Kbps MFM). We track consecutive MSR
    // reads without a data read during execution phase. After a threshold,
    // we abort with overrun — this is critical for Speedlock protection which
    // reads fewer bytes than the sector contains.
    int msrPollCount_ = 0;
    static constexpr int OVERRUN_THRESHOLD = 8;

    // Speedlock weak sector simulation: detect repeated reads of the CRC
    // protection sector on track 0 and corrupt data at 29-byte intervals
    // to simulate non-deterministic reads. Only activates when the disk
    // has no explicit weak sector data in the EDSK image.
    int speedlock_ = 0;              // 0=idle, >0=repeated read count
    uint32_t lastSectorRead_ = 0;    // encoded sector identifier

    // Interrupt status (for Sense Interrupt Status)
    bool seekCompleted_[2] = { false, false };
    uint8_t seekResultST0_[2] = { 0, 0 };
};

} // namespace zxspec
