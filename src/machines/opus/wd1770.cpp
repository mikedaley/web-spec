/*
 * wd1770.cpp - WD1770 Floppy Disk Controller emulation
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "wd1770.hpp"
#include <cstring>

namespace zxspec {

WD1770::WD1770()
{
    reset();
}

void WD1770::reset()
{
    statusRegister_ = 0;
    trackRegister_ = 0;
    sectorRegister_ = 1;
    dataRegister_ = 0;
    selectedDrive_ = 0;
    selectedSide_ = 0;
    stepDirection_ = 1;
    motorOn_ = false;
    motorTimeoutFrames_ = 0;
    lastCommandType_ = CommandType::NONE;
    dataBuffer_.clear();
    dataIndex_ = 0;
    dataReading_ = false;
    dataWriting_ = false;
    multiSector_ = false;
    drqNmiPending_ = false;
    pendingComplete_ = false;
    nextBytePending_ = false;
    physicalTrack_[0] = 0;
    physicalTrack_[1] = 0;
}

void WD1770::insertDisk(int drive, DiskImage* image)
{
    if (drive >= 0 && drive < 2) {
        disk_[drive] = image;
    }
}

void WD1770::ejectDisk(int drive)
{
    if (drive >= 0 && drive < 2) {
        disk_[drive] = nullptr;
    }
}

bool WD1770::hasDisk(int drive) const
{
    if (drive < 0 || drive > 1) return false;
    return disk_[drive] != nullptr && disk_[drive]->isLoaded();
}

DiskImage* WD1770::getDisk(int drive) const
{
    if (drive < 0 || drive > 1) return nullptr;
    return disk_[drive];
}

// ============================================================================
// Command classification
// ============================================================================

WD1770::CommandType WD1770::classifyCommand(uint8_t cmd) const
{
    uint8_t upper = cmd >> 4;
    if (upper <= 0x07) return CommandType::TYPE_I;
    if (upper <= 0x0B) return CommandType::TYPE_II;
    if (upper == 0x0D) return CommandType::TYPE_IV;
    return CommandType::TYPE_III;  // 0x0C, 0x0E, 0x0F
}

// ============================================================================
// Register access
// ============================================================================

uint8_t WD1770::readRegister(int reg)
{
    switch (reg & 0x03) {
    case 0: {
        // Status register read
        // If a byte is waiting (deferred from data register read),
        // assert DRQ now. This ensures NMI only fires AFTER the
        // NMI handler has returned (via RETN) and the main code
        // reads the status register in the WAIT_I/O loop.
        if (nextBytePending_) {
            nextBytePending_ = false;
            statusRegister_ |= STATUS_DRQ;
            drqNmiPending_ = false;  // Allow new NMI edge
        }
        uint8_t status = statusRegister_;
        // After NMI transfer completes, BUSY is held for one status read
        // so the ROM's WAIT_I/O loop sees BUSY=1 at least once (TST_BREAK
        // sets carry). On the next read, BUSY clears normally.
        if (pendingComplete_) {
            pendingComplete_ = false;
            statusRegister_ &= ~STATUS_BUSY;
        }
        return status;
    }
    case 1:
        return trackRegister_;
    case 2:
        return sectorRegister_;
    case 3: {
        // Data register — reading clears DRQ and advances buffer.
        // The next byte is NOT made available immediately (DRQ stays
        // cleared). Instead, nextBytePending_ is set and the next
        // DRQ is asserted when the status register is read. This
        // prevents nested NMIs: the NMI handler reads data, RETNs,
        // the main code reads status (triggering next DRQ + NMI).
        uint8_t data = dataRegister_;
        if (dataReading_ && dataIndex_ < static_cast<int>(dataBuffer_.size())) {
            statusRegister_ &= ~STATUS_DRQ;
            drqNmiPending_ = false;
            dataIndex_++;
            if (dataIndex_ < static_cast<int>(dataBuffer_.size())) {
                dataRegister_ = dataBuffer_[dataIndex_];
                // Defer DRQ until status register is read
                nextBytePending_ = true;
            } else {
                // Transfer complete
                if (multiSector_) {
                    // Advance to next sector
                    sectorRegister_++;
                    DiskImage* disk = disk_[selectedDrive_];
                    if (disk) {
                        DiskSector* sector = disk->findSector(
                            physicalTrack_[selectedDrive_], selectedSide_, sectorRegister_);
                        if (sector) {
                            dataBuffer_ = sector->getReadData();
                            dataIndex_ = 0;
                            dataRegister_ = dataBuffer_[0];
                            nextBytePending_ = true;  // Defer DRQ
                            return data;
                        }
                    }
                }
                // No more sectors or single-sector — done
                dataReading_ = false;
                multiSector_ = false;
                // Keep BUSY set; pendingComplete_ causes it to clear
                // on the next status register read (so WAIT_I/O loop
                // sees BUSY=1 at least once, allowing TST_BREAK to
                // set carry flag before the loop exits)
                pendingComplete_ = true;
            }
        }
        return data;
    }
    default:
        return 0xFF;
    }
}

void WD1770::writeRegister(int reg, uint8_t data)
{
    switch (reg & 0x03) {
    case 0:
        // Command register
        executeCommand(data);
        break;
    case 1:
        trackRegister_ = data;
        break;
    case 2:
        sectorRegister_ = data;
        break;
    case 3:
        dataRegister_ = data;
        if (dataWriting_ && dataIndex_ < static_cast<int>(dataBuffer_.size())) {
            statusRegister_ &= ~STATUS_DRQ;
            drqNmiPending_ = false;  // Clear edge flag so next DRQ can fire NMI
            dataBuffer_[dataIndex_] = data;
            dataIndex_++;
            if (dataIndex_ < static_cast<int>(dataBuffer_.size())) {
                nextBytePending_ = true;  // Defer DRQ until status read
            } else {
                // Write complete — flush to disk
                DiskImage* disk = disk_[selectedDrive_];
                if (disk) {
                    DiskSector* sector = disk->findSector(
                        physicalTrack_[selectedDrive_], selectedSide_, sectorRegister_);
                    if (sector) {
                        sector->data = dataBuffer_;
                    }
                }

                if (multiSector_) {
                    sectorRegister_++;
                    if (disk) {
                        DiskSector* nextSector = disk->findSector(
                            physicalTrack_[selectedDrive_], selectedSide_, sectorRegister_);
                        if (nextSector) {
                            int sectorSize = 128 << nextSector->sizeCode;
                            dataBuffer_.resize(sectorSize, 0);
                            dataIndex_ = 0;
                            statusRegister_ |= STATUS_DRQ;
                            return;
                        }
                    }
                }
                // Done
                dataWriting_ = false;
                multiSector_ = false;
                pendingComplete_ = true;
            }
        }
        break;
    }
}

// ============================================================================
// Command execution
// ============================================================================

void WD1770::executeCommand(uint8_t cmd)
{
    // Force Interrupt can be issued at any time
    if ((cmd & 0xF0) == 0xD0) {
        cmdForceInterrupt(cmd);
        return;
    }

    // Other commands can only start when not busy
    // (In practice, software should check status first)

    uint8_t upper = cmd >> 4;

    switch (upper) {
    case 0x00: // Restore
        cmdRestore(cmd);
        break;
    case 0x01: // Seek
        cmdSeek(cmd);
        break;
    case 0x02: // Step (no update)
    case 0x03: // Step (update track register)
        cmdStep(cmd, stepDirection_);
        break;
    case 0x04: // Step-In (no update)
    case 0x05: // Step-In (update track register)
        cmdStep(cmd, 1);
        break;
    case 0x06: // Step-Out (no update)
    case 0x07: // Step-Out (update track register)
        cmdStep(cmd, -1);
        break;
    case 0x08: // Read Sector
    case 0x09: // Read Sector (multi)
        cmdReadSector(cmd);
        break;
    case 0x0A: // Write Sector
    case 0x0B: // Write Sector (multi)
        cmdWriteSector(cmd);
        break;
    case 0x0C: // Read Address
        cmdReadAddress(cmd);
        break;
    case 0x0E: // Read Track
        cmdReadTrack(cmd);
        break;
    case 0x0F: // Write Track (format)
        cmdWriteTrack(cmd);
        break;
    default:
        break;
    }
}

// ============================================================================
// Type I commands
// ============================================================================

void WD1770::cmdRestore(uint8_t cmd)
{
    lastCommandType_ = CommandType::TYPE_I;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    statusRegister_ = STATUS_BUSY | STATUS_MOTOR_ON;

    // Move head to track 0
    physicalTrack_[selectedDrive_] = 0;
    trackRegister_ = 0;
    stepDirection_ = -1;

    // Complete immediately (instant seek)
    statusRegister_ = STATUS_MOTOR_ON | STATUS_HEAD_LOADED | STATUS_TRACK0;
    if (!hasDisk(selectedDrive_)) {
        statusRegister_ |= STATUS_SEEK_ERROR;
    }
}

void WD1770::cmdSeek(uint8_t cmd)
{
    lastCommandType_ = CommandType::TYPE_I;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    statusRegister_ = STATUS_BUSY | STATUS_MOTOR_ON;

    uint8_t target = dataRegister_;

    if (target > trackRegister_) {
        stepDirection_ = 1;
    } else if (target < trackRegister_) {
        stepDirection_ = -1;
    }

    physicalTrack_[selectedDrive_] = target;
    trackRegister_ = target;

    // Complete immediately
    statusRegister_ = STATUS_MOTOR_ON | STATUS_HEAD_LOADED;
    if (physicalTrack_[selectedDrive_] == 0) {
        statusRegister_ |= STATUS_TRACK0;
    }
    if (!hasDisk(selectedDrive_)) {
        statusRegister_ |= STATUS_SEEK_ERROR;
    }
}

void WD1770::cmdStep(uint8_t cmd, int direction)
{
    lastCommandType_ = CommandType::TYPE_I;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    stepDirection_ = direction;
    statusRegister_ = STATUS_BUSY | STATUS_MOTOR_ON;

    // Apply step
    int newTrack = static_cast<int>(physicalTrack_[selectedDrive_]) + direction;
    if (newTrack < 0) newTrack = 0;
    if (newTrack > 79) newTrack = 79;
    physicalTrack_[selectedDrive_] = static_cast<uint8_t>(newTrack);

    // Update track register if U bit (bit 4) is set
    if (cmd & 0x10) {
        trackRegister_ = physicalTrack_[selectedDrive_];
    }

    // Complete immediately
    statusRegister_ = STATUS_MOTOR_ON | STATUS_HEAD_LOADED;
    if (physicalTrack_[selectedDrive_] == 0) {
        statusRegister_ |= STATUS_TRACK0;
    }
}

// ============================================================================
// Type II commands
// ============================================================================

void WD1770::cmdReadSector(uint8_t cmd)
{
    lastCommandType_ = CommandType::TYPE_II;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    multiSector_ = (cmd & 0x10) != 0;  // m bit
    statusRegister_ = STATUS_BUSY;
    dataReading_ = false;
    dataWriting_ = false;

    DiskImage* disk = disk_[selectedDrive_];
    if (!disk || !disk->isLoaded()) {
        statusRegister_ = STATUS_NOT_READY;
        return;
    }

    DiskSector* sector = disk->findSector(
        physicalTrack_[selectedDrive_], selectedSide_, sectorRegister_);

    if (!sector) {
        statusRegister_ = STATUS_RNF;
        return;
    }

    // Load sector data into buffer
    dataBuffer_ = sector->getReadData();
    dataIndex_ = 0;
    dataReading_ = true;

    if (!dataBuffer_.empty()) {
        dataRegister_ = dataBuffer_[0];
        statusRegister_ = STATUS_BUSY | STATUS_DRQ;
    } else {
        statusRegister_ = STATUS_RNF;
        dataReading_ = false;
    }

    // Check for deleted data mark
    if (sector->fdcStatus2 & 0x40) {
        statusRegister_ |= STATUS_RECORD_TYPE;
    }
}

void WD1770::cmdWriteSector(uint8_t cmd)
{
    lastCommandType_ = CommandType::TYPE_II;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    multiSector_ = (cmd & 0x10) != 0;
    statusRegister_ = STATUS_BUSY;
    dataReading_ = false;
    dataWriting_ = false;

    DiskImage* disk = disk_[selectedDrive_];
    if (!disk || !disk->isLoaded()) {
        statusRegister_ = STATUS_NOT_READY;
        return;
    }

    if (disk->isWriteProtected()) {
        statusRegister_ = STATUS_WRITE_PROTECT;
        return;
    }

    DiskSector* sector = disk->findSector(
        physicalTrack_[selectedDrive_], selectedSide_, sectorRegister_);

    if (!sector) {
        statusRegister_ = STATUS_RNF;
        return;
    }

    // Prepare buffer for write
    int sectorSize = 128 << sector->sizeCode;
    dataBuffer_.resize(sectorSize, 0);
    dataIndex_ = 0;
    dataWriting_ = true;
    statusRegister_ = STATUS_BUSY | STATUS_DRQ;
}

// ============================================================================
// Type III commands
// ============================================================================

void WD1770::cmdReadAddress(uint8_t cmd)
{
    lastCommandType_ = CommandType::TYPE_III;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    statusRegister_ = STATUS_BUSY;
    dataReading_ = false;

    DiskImage* disk = disk_[selectedDrive_];
    if (!disk || !disk->isLoaded()) {
        statusRegister_ = STATUS_NOT_READY;
        return;
    }

    DiskTrack* track = disk->getTrack(physicalTrack_[selectedDrive_], selectedSide_);
    if (!track || track->sectors.empty()) {
        statusRegister_ = STATUS_RNF;
        return;
    }

    // Return the ID field of the first sector on the track
    const DiskSector& sector = track->sectors[0];
    dataBuffer_.resize(6);
    dataBuffer_[0] = sector.track;
    dataBuffer_[1] = sector.side;
    dataBuffer_[2] = sector.sectorId;
    dataBuffer_[3] = sector.sizeCode;
    dataBuffer_[4] = 0;  // CRC1
    dataBuffer_[5] = 0;  // CRC2
    dataIndex_ = 0;
    dataReading_ = true;
    dataRegister_ = dataBuffer_[0];
    statusRegister_ = STATUS_BUSY | STATUS_DRQ;
}

void WD1770::cmdReadTrack(uint8_t cmd)
{
    lastCommandType_ = CommandType::TYPE_III;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    statusRegister_ = STATUS_BUSY;
    dataReading_ = false;

    DiskImage* disk = disk_[selectedDrive_];
    if (!disk || !disk->isLoaded()) {
        statusRegister_ = STATUS_NOT_READY;
        return;
    }

    // Read Track is rarely used by Opus software; provide a minimal
    // implementation that returns sector data sequentially
    DiskTrack* track = disk->getTrack(physicalTrack_[selectedDrive_], selectedSide_);
    if (!track || track->sectors.empty()) {
        statusRegister_ = STATUS_RNF;
        return;
    }

    dataBuffer_.clear();
    for (const auto& sector : track->sectors) {
        auto sectorData = sector.getReadData();
        dataBuffer_.insert(dataBuffer_.end(), sectorData.begin(), sectorData.end());
    }

    if (dataBuffer_.empty()) {
        statusRegister_ = STATUS_RNF;
        return;
    }

    dataIndex_ = 0;
    dataReading_ = true;
    dataRegister_ = dataBuffer_[0];
    statusRegister_ = STATUS_BUSY | STATUS_DRQ;
}

void WD1770::cmdWriteTrack(uint8_t cmd)
{
    lastCommandType_ = CommandType::TYPE_III;
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
    statusRegister_ = STATUS_BUSY;
    dataWriting_ = false;

    DiskImage* disk = disk_[selectedDrive_];
    if (!disk || !disk->isLoaded()) {
        statusRegister_ = STATUS_NOT_READY;
        return;
    }

    if (disk->isWriteProtected()) {
        statusRegister_ = STATUS_WRITE_PROTECT;
        return;
    }

    // Write Track (format) — accept raw track data
    // Most Opus software uses a standard format: 10 sectors × 512 bytes
    // The buffer size is the raw track length
    dataBuffer_.resize(6250, 0);  // Standard MFM track length
    dataIndex_ = 0;
    dataWriting_ = true;
    statusRegister_ = STATUS_BUSY | STATUS_DRQ;
}

// ============================================================================
// Type IV command
// ============================================================================

void WD1770::cmdForceInterrupt(uint8_t cmd)
{
    // Force Interrupt: immediately terminates any command in progress
    dataReading_ = false;
    dataWriting_ = false;
    multiSector_ = false;
    pendingComplete_ = false;
    drqNmiPending_ = false;
    nextBytePending_ = false;
    dataBuffer_.clear();
    dataIndex_ = 0;

    // Status reflects Type I status after force interrupt
    lastCommandType_ = CommandType::TYPE_I;
    statusRegister_ = STATUS_MOTOR_ON | STATUS_HEAD_LOADED;
    if (physicalTrack_[selectedDrive_] == 0) {
        statusRegister_ |= STATUS_TRACK0;
    }
    if (!hasDisk(selectedDrive_)) {
        // Show not-ready for Type I equivalent
        statusRegister_ &= ~STATUS_MOTOR_ON;
    }
    motorOn_ = true;
    motorTimeoutFrames_ = 100;
}

// ============================================================================
// Motor timeout
// ============================================================================

void WD1770::updateMotorTimeout()
{
    if (motorOn_ && !isBusy() && motorTimeoutFrames_ > 0) {
        motorTimeoutFrames_--;
        if (motorTimeoutFrames_ == 0) {
            motorOn_ = false;
        }
    }
}

} // namespace zxspec
