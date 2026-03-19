/*
 * upd765a.cpp - NEC µPD765A Floppy Disk Controller emulation
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "upd765a.hpp"
#include <cstring>
#include <cstdio>

namespace zxspec {

// Main Status Register bits
static constexpr uint8_t MSR_RQM = 0x80;   // Request for Master
static constexpr uint8_t MSR_DIO = 0x40;   // Data direction: 1 = FDC→CPU
static constexpr uint8_t MSR_EXM = 0x20;   // Execution mode
static constexpr uint8_t MSR_CB  = 0x10;   // Controller busy

// Status Register 0 bits
static constexpr uint8_t ST0_IC_NORMAL    = 0x00;  // Normal termination
static constexpr uint8_t ST0_IC_ABNORMAL  = 0x40;  // Abnormal termination
static constexpr uint8_t ST0_IC_INVALID   = 0x80;  // Invalid command
static constexpr uint8_t ST0_SE           = 0x20;  // Seek end
static constexpr uint8_t ST0_NR           = 0x08;  // Not ready

// Status Register 1 bits
static constexpr uint8_t ST1_EN = 0x80;   // End of cylinder
static constexpr uint8_t ST1_DE = 0x20;   // Data error (CRC)
static constexpr uint8_t ST1_OR = 0x10;   // Overrun
static constexpr uint8_t ST1_ND = 0x04;   // No data
static constexpr uint8_t ST1_NW = 0x02;   // Not writable
static constexpr uint8_t ST1_MA = 0x01;   // Missing address mark

// Status Register 2 bits
static constexpr uint8_t ST2_CM = 0x40;   // Control mark (deleted data)
static constexpr uint8_t ST2_DD = 0x20;   // Data error in data field
static constexpr uint8_t ST2_WC = 0x10;   // Wrong cylinder
static constexpr uint8_t ST2_BC = 0x02;   // Bad cylinder
static constexpr uint8_t ST2_MD = 0x01;   // Missing data address mark

// Status Register 3 bits
static constexpr uint8_t ST3_WP  = 0x40;  // Write protected
static constexpr uint8_t ST3_RDY = 0x20;  // Ready
static constexpr uint8_t ST3_T0  = 0x10;  // Track 0
static constexpr uint8_t ST3_TS  = 0x08;  // Two side

UPD765A::UPD765A()
{
    reset();
}

void UPD765A::reset()
{
    phase_ = Phase::Command;
    motorOn_ = false;
    commandBuffer_.clear();
    commandParamCount_ = 0;
    currentCommand_ = 0;
    resultBuffer_.clear();
    resultIndex_ = 0;
    dataBuffer_.clear();
    dataIndex_ = 0;
    executionRead_ = false;
    currentTrack_[0] = 0;
    currentTrack_[1] = 0;
    msrPollCount_ = 0;

    // After power-on/reset, the µPD765A generates a seek-complete interrupt
    // for each drive. The +3 ROM sends Sense Interrupt Status to clear these
    // before issuing any other commands.
    seekCompleted_[0] = true;
    seekCompleted_[1] = true;
    seekResultST0_[0] = 0xC0;  // Abnormal termination (ready line changed), drive 0
    seekResultST0_[1] = 0xC1;  // Abnormal termination (ready line changed), drive 1
}

void UPD765A::insertDisk(int drive, DiskImage* image)
{
    if (drive >= 0 && drive <= 1) {
        disk_[drive] = image;
    }
}

void UPD765A::ejectDisk(int drive)
{
    if (drive >= 0 && drive <= 1) {
        disk_[drive] = nullptr;
    }
}

void UPD765A::setMotor(bool on)
{
    motorOn_ = on;

    // Motor off during execution: abort the current operation.
    // On real hardware, the disk spins down and the FDC loses sync,
    // eventually producing an overrun or timeout. Some loaders
    // (Batman The Movie, Cabal) turn the motor off when they've read
    // enough data, leaving the FDC mid-transfer.
    if (!on && phase_ == Phase::Execution) {
        uint8_t st0 = ST0_IC_ABNORMAL | (xferSide_ << 2) | xferDrive_;
        setResult7(st0, ST1_OR | xferST1_, xferST2_,
                   lastSectorC_, lastSectorH_, lastSectorR_, lastSectorN_);
        phase_ = Phase::Result;
    }
}

bool UPD765A::hasDisk(int drive) const
{
    return (drive >= 0 && drive <= 1) && disk_[drive] != nullptr && disk_[drive]->isLoaded();
}

DiskImage* UPD765A::getDisk(int drive) const
{
    if (drive >= 0 && drive <= 1) return disk_[drive];
    return nullptr;
}

// ============================================================================
// Main Status Register
// ============================================================================

uint8_t UPD765A::readMSR()
{
    uint8_t msr = 0;

    switch (phase_) {
        case Phase::Command:
            // Ready for CPU to write command/parameter bytes
            msr = MSR_RQM;
            // Set CB (Controller Busy) once we've received the first command byte
            // and are waiting for parameter bytes. The +3 ROM checks this.
            if (!commandBuffer_.empty()) {
                msr |= MSR_CB;
            }
            break;

        case Phase::Execution:
            if (executionRead_) {
                // Track consecutive MSR polls without data reads.
                // On real hardware, the disk keeps rotating and if the CPU
                // doesn't read a data byte within ~26µs, the byte is lost
                // and the FDC flags an overrun. Speedlock protection exploits
                // this by reading fewer bytes than the sector contains, then
                // polling MSR until execution ends.
                msrPollCount_++;
                if (msrPollCount_ > OVERRUN_THRESHOLD) {
                    // printf("[FDC] Overrun: %d polls, sector R=%d, %d/%d bytes read\n",
                    //        msrPollCount_, xferSector_, dataIndex_, (int)dataBuffer_.size());
                    // Overrun: abort execution, enter result phase.
                    // Preserve weak sector CRC error flags alongside overrun —
                    // Speedlock reads fewer bytes than the sector contains, then
                    // checks both overrun and CRC error status.
                    uint8_t st0 = ST0_IC_ABNORMAL | (xferSide_ << 2) | xferDrive_;
                    uint8_t st1 = ST1_OR | xferST1_;
                    uint8_t st2 = xferST2_;
                    setResult7(st0, st1, st2, lastSectorC_, lastSectorH_,
                               lastSectorR_, lastSectorN_);
                    phase_ = Phase::Result;
                    msrPollCount_ = 0;
                    // Return result-phase MSR
                    msr = MSR_RQM | MSR_DIO | MSR_CB;
                    break;
                }
                // FDC has data for CPU to read
                msr = MSR_RQM | MSR_DIO | MSR_EXM | MSR_CB;
            } else {
                // FDC waiting for CPU to write data
                msr = MSR_RQM | MSR_EXM | MSR_CB;
            }
            break;

        case Phase::Result:
            // FDC has result bytes for CPU to read
            msr = MSR_RQM | MSR_DIO | MSR_CB;
            break;
    }

    return msr;
}

// ============================================================================
// Data Register Read (port 0x3FFD)
// ============================================================================

uint8_t UPD765A::readData()
{
    if (phase_ == Phase::Execution && executionRead_) {
        // CPU is reading data — reset overrun counter
        msrPollCount_ = 0;

        // Reading sector data during execution phase
        if (dataIndex_ < static_cast<int>(dataBuffer_.size())) {
            uint8_t data = dataBuffer_[dataIndex_];

            // Speedlock weak sector simulation: corrupt data at every 29th
            // byte when repeated reads of the protection sector are detected.
            // Also handles the variant where the first 64 bytes are not all
            // 0xE5 (triggers more aggressive corruption across the sector).
            if (speedlock_ > 0) {
                int drv = xferDrive_;
                if (hasDisk(drv) && !disk_[drv]->hasWeakSectors()) {
                    if (dataIndex_ < 64 && data != 0xE5)
                        speedlock_ = 2;  // W.E.C Le Mans type
                    if ((speedlock_ > 1 || dataIndex_ < 64) &&
                        (dataIndex_ % 29) == 0) {
                        data ^= static_cast<uint8_t>(dataIndex_);
                    }
                }
            }

            dataIndex_++;

            // Check if we've read the entire sector
            if (dataIndex_ >= static_cast<int>(dataBuffer_.size())) {
                // Try to advance to next sector
                if (!advanceToNextSector()) {
                    // Result status depends on the termination reason.
                    uint8_t st0 = (xferSide_ << 2) | xferDrive_;
                    uint8_t st1 = xferST1_;
                    uint8_t st2 = xferST2_;
                    bool hasErrors = (xferST1_ != 0);

                    if (xferCMTerminate_) {
                        // CM mismatch termination: only set abnormal if there
                        // were more sectors to read (EOT > R). For single-sector
                        // reads (EOT=R) this is a normal termination with ST2_CM.
                        if (xferEOT_ > xferSector_)
                            st0 |= ST0_IC_ABNORMAL;
                    } else if (!hasErrors) {
                        // Normal end-of-cylinder with no prior errors:
                        // set abnormal + EN.
                        st0 |= ST0_IC_ABNORMAL;
                        st1 |= ST1_EN;
                    } else {
                        // CRC error or other ST1 error already set —
                        // add abnormal termination, preserve existing flags.
                        st0 |= ST0_IC_ABNORMAL;
                    }

                    setResult7(st0, st1, st2, lastSectorC_, lastSectorH_,
                               lastSectorR_, lastSectorN_);
                    phase_ = Phase::Result;
                }
            }
            return data;
        }
    }

    if (phase_ == Phase::Result) {
        if (resultIndex_ < static_cast<int>(resultBuffer_.size())) {
            uint8_t data = resultBuffer_[resultIndex_++];

            // Check if all result bytes read
            if (resultIndex_ >= static_cast<int>(resultBuffer_.size())) {
                phase_ = Phase::Command;
                commandBuffer_.clear();
            }
            return data;
        }
    }

    return 0xFF;
}

// ============================================================================
// Data Register Write (port 0x3FFD)
// ============================================================================

void UPD765A::writeData(uint8_t data)
{
    if (phase_ == Phase::Execution && !executionRead_) {
        // Writing sector data during execution phase (Write Data or Format Track)
        if (currentCommand_ == CMD_FORMAT_TRACK) {
            // Collecting 4-byte sector ID entries (C, H, R, N)
            formatIdBuffer_.push_back(data);

            if (static_cast<int>(formatIdBuffer_.size()) >= formatSectorsPerTrack_ * 4) {
                // Got all sector IDs - format the track
                int drive = commandBuffer_[1] & 0x03;
                int side = (commandBuffer_[1] >> 2) & 0x01;
                int track = currentTrack_[drive];

                if (hasDisk(drive) && !disk_[drive]->isWriteProtected()) {
                    disk_[drive]->formatTrack(track, side, formatSizeCode_,
                                               formatSectorsPerTrack_, formatGap3_,
                                               formatFiller_, formatIdBuffer_.data());
                    uint8_t st0 = ST0_IC_NORMAL | (side << 2) | drive;
                    setResult7(st0, 0, 0, track, side, formatSectorsPerTrack_, formatSizeCode_);
                } else {
                    uint8_t st0 = ST0_IC_ABNORMAL | (side << 2) | drive;
                    uint8_t st1 = disk_[drive] && disk_[drive]->isWriteProtected() ? ST1_NW : ST1_MA;
                    setResult7(st0, st1, 0, track, side, 0, formatSizeCode_);
                }
                phase_ = Phase::Result;
            }
            return;
        }

        // Write Data command
        if (dataIndex_ < static_cast<int>(dataBuffer_.size())) {
            dataBuffer_[dataIndex_++] = data;

            if (dataIndex_ >= static_cast<int>(dataBuffer_.size())) {
                // Sector complete - write to disk
                int drive = xferDrive_;
                DiskSector* sector = nullptr;
                if (hasDisk(drive)) {
                    sector = disk_[drive]->findSector(xferTrack_, xferSide_, xferSector_);
                }

                if (sector) {
                    // Store actual sector ID fields for result phase
                    lastSectorC_ = sector->track;
                    lastSectorH_ = sector->side;
                    lastSectorR_ = sector->sectorId;
                    lastSectorN_ = sector->sizeCode;
                }

                if (sector && !disk_[drive]->isWriteProtected()) {
                    uint32_t secSize = static_cast<uint32_t>(sector->data.size());
                    uint32_t writeSize = static_cast<uint32_t>(dataBuffer_.size());
                    if (writeSize > secSize) writeSize = secSize;
                    std::memcpy(sector->data.data(), dataBuffer_.data(), writeSize);

                    // Mark the deleted data flag in sector info if writing deleted data
                    if (xferDeletedData_) {
                        sector->fdcStatus2 |= ST2_CM;
                    } else {
                        sector->fdcStatus2 &= ~ST2_CM;
                    }
                }

                if (!advanceToNextSector()) {
                    // End of cylinder: abnormal termination with EN flag
                    uint8_t st0 = ST0_IC_ABNORMAL | (xferSide_ << 2) | xferDrive_;
                    uint8_t st1 = ST1_EN;
                    if (sector && disk_[drive]->isWriteProtected()) {
                        st1 |= ST1_NW;
                    }
                    setResult7(st0, st1, 0, lastSectorC_, lastSectorH_,
                               lastSectorR_, lastSectorN_);
                    phase_ = Phase::Result;
                }
            }
        }
        return;
    }

    // On real hardware, writes are ignored during Result phase (DIO pin
    // forces FDC→CPU direction). Stay in Result phase until all bytes read.
    if (phase_ != Phase::Command) return;

    commandBuffer_.push_back(data);

    if (commandBuffer_.size() == 1) {
        // First byte: determine command and expected parameter count
        currentCommand_ = data & 0x1F;
        commandParamCount_ = getCommandParamCount(currentCommand_);
    }

    // Check if we have all command + parameter bytes
    if (static_cast<int>(commandBuffer_.size()) >= 1 + commandParamCount_) {
        executeCommand();
    }
}

// ============================================================================
// Command parameter counts
// ============================================================================

int UPD765A::getCommandParamCount(uint8_t cmd) const
{
    switch (cmd) {
        case CMD_READ_TRACK:
        case CMD_READ_DATA:
        case CMD_READ_DELETED_DATA:
        case CMD_WRITE_DATA:
        case CMD_WRITE_DELETED_DATA:
        case CMD_SCAN_EQUAL:
        case CMD_SCAN_LOW_OR_EQUAL:
        case CMD_SCAN_HIGH_OR_EQUAL:
            return 8;   // HD US, C, H, R, N, EOT, GPL, DTL
        case CMD_READ_ID:
            return 1;   // HD US
        case CMD_FORMAT_TRACK:
            return 5;   // HD US, N, SC, GPL, D
        case CMD_RECALIBRATE:
            return 1;   // US
        case CMD_SENSE_INT_STATUS:
            return 0;
        case CMD_SPECIFY:
            return 2;   // SRT/HUT, HLT/ND
        case CMD_SENSE_DRIVE_STATUS:
            return 1;   // HD US
        case CMD_SEEK:
            return 2;   // HD US, NCN
        default:
            return 0;   // Invalid command
    }
}

// ============================================================================
// Command dispatch
// ============================================================================

void UPD765A::executeCommand()
{
    switch (currentCommand_) {
        case CMD_READ_TRACK:
            cmdReadTrack();
            break;
        case CMD_READ_DATA:
        case CMD_READ_DELETED_DATA:
            cmdReadData();
            break;
        case CMD_WRITE_DATA:
        case CMD_WRITE_DELETED_DATA:
            cmdWriteData();
            break;
        case CMD_READ_ID:
            cmdReadID();
            break;
        case CMD_FORMAT_TRACK:
            cmdFormatTrack();
            break;
        case CMD_RECALIBRATE:
            cmdRecalibrate();
            break;
        case CMD_SENSE_INT_STATUS:
            cmdSenseInterruptStatus();
            break;
        case CMD_SPECIFY:
            cmdSpecify();
            break;
        case CMD_SENSE_DRIVE_STATUS:
            cmdSenseDriveStatus();
            break;
        case CMD_SEEK:
            cmdSeek();
            break;
        default:
            cmdInvalid();
            break;
    }
}

// ============================================================================
// Read Data / Read Deleted Data
// ============================================================================

void UPD765A::cmdReadData()
{
    xferDrive_ = commandBuffer_[1] & 0x01;  // +3 only has drives 0-1
    xferSide_ = (commandBuffer_[1] >> 2) & 0x01;
    xferTrack_ = commandBuffer_[2];    // C
    // commandBuffer_[3] = H (head, usually same as side)
    xferSector_ = commandBuffer_[4];   // R
    xferSizeCode_ = commandBuffer_[5]; // N
    xferEOT_ = commandBuffer_[6];      // EOT
    xferMultiTrack_ = (commandBuffer_[0] & 0x80) != 0;
    xferDeletedData_ = (currentCommand_ == CMD_READ_DELETED_DATA);
    xferSkip_ = (commandBuffer_[0] & 0x20) != 0;
    xferWeakSector_ = false;
    xferCMTerminate_ = false;
    xferST1_ = 0;
    xferST2_ = 0;

    int drive = xferDrive_;

    if (!hasDisk(drive)) {
        uint8_t st0 = ST0_IC_ABNORMAL | ST0_NR | (xferSide_ << 2) | drive;
        setResult7(st0, 0, 0, xferTrack_, xferSide_, xferSector_, xferSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    // Speedlock weak sector simulation: detect repeated single-sector reads
    // of the CRC protection sector (R=2, track 0, head 0). Only activates
    // when the disk has no explicit weak sector data in the EDSK image.
    if (!disk_[drive]->hasWeakSectors()) {
        // Encode sector identity: (H & 1) + (C << 1) + (R << 8)
        uint32_t u = (xferSide_ & 0x01) + (xferTrack_ << 1) + (xferSector_ << 8);
        bool singleSector = (xferSector_ == xferEOT_);
        if (singleSector && u == 0x0200) {
            if (u == lastSectorRead_) {
                speedlock_++;
            } else {
                speedlock_ = 0;
                lastSectorRead_ = u;
            }
        } else {
            lastSectorRead_ = 0;
            speedlock_ = 0;
        }
    }

    printf("[FDC] ReadData: cmd=%02X phys=%d C=%d H=%d R=%d N=%d EOT=%d del=%d SK=%d\n",
           commandBuffer_[0], currentTrack_[drive], xferTrack_, xferSide_, xferSector_,
           xferSizeCode_, xferEOT_, xferDeletedData_ ? 1 : 0, xferSkip_ ? 1 : 0);

    // Find the requested sector (no EOT guard — R can exceed EOT for single-sector reads)
    const DiskSector* sector = disk_[drive]->findSector(currentTrack_[drive], xferSide_, xferSector_);

    // SK=1: skip sectors with data mark mismatch until we find a match or reach EOT.
    // This is standard uPD765A behaviour — Read Data skips CM sectors, Read Deleted
    // Data skips non-CM sectors. No special handling needed for protected disks.
    while (sector && xferSkip_) {
        bool sectorHasCM = (sector->fdcStatus2 & ST2_CM) != 0;
        if (xferDeletedData_ == sectorHasCM) break;  // Match found
        xferSector_++;
        if (xferSector_ > xferEOT_) { sector = nullptr; break; }
        sector = disk_[drive]->findSector(currentTrack_[drive], xferSide_, xferSector_);
    }

    if (!sector) {
        printf("[FDC] ReadData: SECTOR NOT FOUND phys=%d side=%d R=%d\n",
               currentTrack_[drive], xferSide_, xferSector_);
        uint8_t st0 = ST0_IC_ABNORMAL | (xferSide_ << 2) | drive;
        setResult7(st0, ST1_ND | ST1_MA, 0, xferTrack_, xferSide_, xferSector_, xferSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    // Store the sector's actual ID field values. On the real µPD765A, result
    // phase C/H/R/N reflect the sector's ID field, not the command parameters.
    // Copy protection schemes (Speedlock etc.) depend on seeing mismatched IDs.
    lastSectorC_ = sector->track;
    lastSectorH_ = sector->side;
    lastSectorR_ = sector->sectorId;
    lastSectorN_ = sector->sizeCode;

    // Get read data (cycles through copies for weak/fuzzy sectors)
    dataBuffer_ = sector->getReadData();
    dataIndex_ = 0;
    executionRead_ = true;



    // Initialize status flags
    xferWeakSector_ = sector->isWeak();
    xferST1_ = 0;
    xferST2_ = 0;

    // Weak/fuzzy sector detection (Speedlock copy protection):
    // If the sector has multiple data copies in the EDSK image, it's a weak
    // sector. Real hardware returns CRC errors on every read of such sectors.
    if (xferWeakSector_) {
        xferST1_ = ST1_DE;   // Data Error (CRC error in ID or data)
        xferST2_ = ST2_DD;   // Data Error in Data Field
        printf("[FDC] ReadData: weak sector detected (R=%d, %zu copies) - will report CRC error\n",
               xferSector_, sector->weakCopies.size());
    }

    // CRC error propagation: report CRC errors from EDSK sector flags.
    // Data variation for CRC sectors is handled in DiskSector::getReadData().
    if (!xferWeakSector_ && sector->hasCRCError()) {
        xferST1_ |= ST1_DE;
        xferST2_ |= ST2_DD;
    }

    // Data Address Mark mismatch (CM flag): Read Data hitting a Deleted
    // sector, or Read Deleted Data hitting a Normal sector. With SK=0,
    // data is still transferred but ST2_CM is set and the command
    // terminates after this sector. Standard uPD765A behaviour.
    bool sectorHasCM = (sector->fdcStatus2 & ST2_CM) != 0;
    bool cmMismatch = (xferDeletedData_ != sectorHasCM);
    if (cmMismatch) {
        xferST2_ |= ST2_CM;
        xferCMTerminate_ = true;
    }

    phase_ = Phase::Execution;
}

// ============================================================================
// Read Track (Read Diagnostic) — command 0x02
// Reads sectors in physical order from the track, ignoring sector IDs
// and deleted data marks. Used by some copy protection loaders (Cabal etc.)
// ============================================================================

void UPD765A::cmdReadTrack()
{
    int drive = commandBuffer_[1] & 0x01;
    int side = (commandBuffer_[1] >> 2) & 0x01;
    xferDrive_ = drive;
    xferSide_ = side;
    xferTrack_ = commandBuffer_[2];    // C
    xferSector_ = commandBuffer_[4];   // R (starting sector for count)
    xferSizeCode_ = commandBuffer_[5]; // N
    xferEOT_ = commandBuffer_[6];      // EOT (number of sectors to read)
    xferWeakSector_ = false;
    xferCMTerminate_ = false;
    xferDeletedData_ = false;
    xferSkip_ = false;
    xferST1_ = 0;
    xferST2_ = 0;

    printf("[FDC] ReadTrack: drive=%d phys=%d side=%d C=%d R=%d N=%d EOT=%d\n",
           drive, currentTrack_[drive], side, xferTrack_, xferSector_,
           xferSizeCode_, xferEOT_);

    if (!hasDisk(drive)) {
        uint8_t st0 = ST0_IC_ABNORMAL | ST0_NR | (side << 2) | drive;
        setResult7(st0, 0, 0, xferTrack_, side, xferSector_, xferSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    const DiskTrack* track = disk_[drive]->getTrack(currentTrack_[drive], side);
    if (!track || track->sectors.empty()) {
        uint8_t st0 = ST0_IC_ABNORMAL | (side << 2) | drive;
        setResult7(st0, ST1_MA, 0, xferTrack_, side, xferSector_, xferSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    // Read Track reads sectors in physical order (array index order),
    // starting from sector index 0, for EOT sectors total.
    // Build a combined data buffer with all sector data.
    dataBuffer_.clear();
    int sectorsRead = 0;
    int totalSectors = static_cast<int>(track->sectors.size());

    for (int i = 0; i < totalSectors && sectorsRead < xferEOT_; i++) {
        const auto& sec = track->sectors[i];
        auto secData = sec.getReadData();
        dataBuffer_.insert(dataBuffer_.end(), secData.begin(), secData.end());
        sectorsRead++;

        // Track the last sector's ID for the result phase
        lastSectorC_ = sec.track;
        lastSectorH_ = sec.side;
        lastSectorR_ = sec.sectorId;
        lastSectorN_ = sec.sizeCode;

        // Propagate CRC errors
        if (sec.hasCRCError()) {
            xferST1_ |= ST1_DE;
            xferST2_ |= ST2_DD;
        }
    }

    if (dataBuffer_.empty()) {
        uint8_t st0 = ST0_IC_ABNORMAL | (side << 2) | drive;
        setResult7(st0, ST1_ND, 0, xferTrack_, side, xferSector_, xferSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    dataIndex_ = 0;
    executionRead_ = true;

    // Set xferSector_ past xferEOT_ so advanceToNextSector() returns false
    // immediately when the combined buffer is consumed. This prevents the
    // readData() function from replacing our combined buffer with a single
    // sector's data via advanceToNextSector().
    xferSector_ = xferEOT_ + 1;

    phase_ = Phase::Execution;
}

// ============================================================================
// Write Data / Write Deleted Data
// ============================================================================

void UPD765A::cmdWriteData()
{
    xferDrive_ = commandBuffer_[1] & 0x01;  // +3 only has drives 0-1
    xferSide_ = (commandBuffer_[1] >> 2) & 0x01;
    xferTrack_ = commandBuffer_[2];
    xferSector_ = commandBuffer_[4];
    xferSizeCode_ = commandBuffer_[5];
    xferEOT_ = commandBuffer_[6];
    xferMultiTrack_ = (commandBuffer_[0] & 0x80) != 0;
    xferDeletedData_ = (currentCommand_ == CMD_WRITE_DELETED_DATA);

    int drive = xferDrive_;

    if (!hasDisk(drive)) {
        uint8_t st0 = ST0_IC_ABNORMAL | ST0_NR | (xferSide_ << 2) | drive;
        setResult7(st0, 0, 0, xferTrack_, xferSide_, xferSector_, xferSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    if (disk_[drive]->isWriteProtected()) {
        uint8_t st0 = ST0_IC_ABNORMAL | (xferSide_ << 2) | drive;
        setResult7(st0, ST1_NW, 0, xferTrack_, xferSide_, xferSector_, xferSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    // Prepare buffer for incoming data
    uint32_t secSize = 128u << xferSizeCode_;
    dataBuffer_.resize(secSize, 0);
    dataIndex_ = 0;
    executionRead_ = false;
    phase_ = Phase::Execution;
}

// ============================================================================
// Read ID
// ============================================================================

void UPD765A::cmdReadID()
{
    int drive = commandBuffer_[1] & 0x03;
    int side = (commandBuffer_[1] >> 2) & 0x01;
    printf("[FDC] ReadID: drive=%d phys=%d side=%d\n", drive, currentTrack_[drive], side);

    if (!hasDisk(drive)) {
        uint8_t st0 = ST0_IC_ABNORMAL | ST0_NR | (side << 2) | drive;
        setResult7(st0, ST1_MA, 0, 0, 0, 0, 0);
        phase_ = Phase::Result;
        return;
    }

    const DiskTrack* track = disk_[drive]->getTrack(currentTrack_[drive], side);
    if (!track || track->sectors.empty()) {
        uint8_t st0 = ST0_IC_ABNORMAL | (side << 2) | drive;
        setResult7(st0, ST1_MA, 0, currentTrack_[drive], side, 0, 0);
        phase_ = Phase::Result;
        return;
    }

    // Simulate disk rotation: return successive sector IDs on each call
    int secIdx = readIdIndex_ % static_cast<int>(track->sectors.size());
    readIdIndex_++;
    const DiskSector& sec = track->sectors[secIdx];
    uint8_t st0 = ST0_IC_NORMAL | (side << 2) | drive;
    setResult7(st0, 0, 0, sec.track, sec.side, sec.sectorId, sec.sizeCode);
    phase_ = Phase::Result;
}

// ============================================================================
// Format Track
// ============================================================================

void UPD765A::cmdFormatTrack()
{
    int drive = commandBuffer_[1] & 0x03;
    int side = (commandBuffer_[1] >> 2) & 0x01;

    formatSizeCode_ = commandBuffer_[2];         // N
    formatSectorsPerTrack_ = commandBuffer_[3];   // SC
    formatGap3_ = commandBuffer_[4];              // GPL
    formatFiller_ = commandBuffer_[5];            // D

    if (!hasDisk(drive)) {
        uint8_t st0 = ST0_IC_ABNORMAL | ST0_NR | (side << 2) | drive;
        setResult7(st0, 0, 0, currentTrack_[drive], side, 0, formatSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    if (disk_[drive]->isWriteProtected()) {
        uint8_t st0 = ST0_IC_ABNORMAL | (side << 2) | drive;
        setResult7(st0, ST1_NW, 0, currentTrack_[drive], side, 0, formatSizeCode_);
        phase_ = Phase::Result;
        return;
    }

    // Enter execution phase to receive sector ID data (4 bytes per sector: C, H, R, N)
    formatIdBuffer_.clear();
    formatIdBuffer_.reserve(formatSectorsPerTrack_ * 4);
    executionRead_ = false;
    phase_ = Phase::Execution;
}

// ============================================================================
// Recalibrate (seek to track 0)
// ============================================================================

void UPD765A::cmdRecalibrate()
{
    int drive = commandBuffer_[1] & 0x03;
    printf("[FDC] Recalibrate: drive=%d\n", drive);
    currentTrack_[drive] = 0;
    readIdIndex_ = 0;

    // Set up interrupt status for Sense Interrupt Status
    seekCompleted_[drive] = true;
    if (hasDisk(drive)) {
        seekResultST0_[drive] = ST0_SE | drive;
    } else {
        seekResultST0_[drive] = ST0_IC_ABNORMAL | ST0_SE | ST0_NR | drive;
    }

    // No result phase - CPU must use Sense Interrupt Status
    phase_ = Phase::Command;
    commandBuffer_.clear();
}

// ============================================================================
// Sense Interrupt Status
// ============================================================================

void UPD765A::cmdSenseInterruptStatus()
{
    // Check drives for completed seeks
    for (int d = 0; d < 2; d++) {
        if (seekCompleted_[d]) {
            seekCompleted_[d] = false;
            printf("[FDC] SenseInt: drive=%d ST0=%02X PCN=%d\n",
                   d, seekResultST0_[d], currentTrack_[d]);
            resultBuffer_.clear();
            resultBuffer_.push_back(seekResultST0_[d]);
            resultBuffer_.push_back(currentTrack_[d]);
            resultIndex_ = 0;
            phase_ = Phase::Result;
            return;
        }
    }

    // No pending interrupt - return invalid command
    // printf("[FDC] SenseInt: no pending interrupt\n");
    resultBuffer_.clear();
    resultBuffer_.push_back(ST0_IC_INVALID);
    resultIndex_ = 0;
    phase_ = Phase::Result;
}

// ============================================================================
// Specify
// ============================================================================

void UPD765A::cmdSpecify()
{
    // SRT (step rate time) and HUT (head unload time) in commandBuffer_[1]
    // HLT (head load time) and ND (non-DMA mode) in commandBuffer_[2]
    // We don't need to emulate these timings, just accept the command.
    phase_ = Phase::Command;
    commandBuffer_.clear();
}

// ============================================================================
// Sense Drive Status
// ============================================================================

void UPD765A::cmdSenseDriveStatus()
{
    int drive = commandBuffer_[1] & 0x03;
    int side = (commandBuffer_[1] >> 2) & 0x01;

    uint8_t st3 = drive | (side << 2);

    if (hasDisk(drive)) {
        st3 |= ST3_RDY;
        if (disk_[drive]->getSideCount() > 1) {
            st3 |= ST3_TS;
        }
        if (currentTrack_[drive] == 0) {
            st3 |= ST3_T0;
        }
        if (disk_[drive]->isWriteProtected()) {
            st3 |= ST3_WP;
        }
    }

    resultBuffer_.clear();
    resultBuffer_.push_back(st3);
    resultIndex_ = 0;
    phase_ = Phase::Result;
}

// ============================================================================
// Seek
// ============================================================================

void UPD765A::cmdSeek()
{
    int drive = commandBuffer_[1] & 0x03;
    uint8_t newTrack = commandBuffer_[2];

    printf("[FDC] Seek: drive=%d track=%d\n", drive, newTrack);
    currentTrack_[drive] = newTrack;
    readIdIndex_ = 0;

    // Set up interrupt status
    seekCompleted_[drive] = true;
    if (hasDisk(drive)) {
        seekResultST0_[drive] = ST0_SE | drive;
    } else {
        seekResultST0_[drive] = ST0_IC_ABNORMAL | ST0_SE | ST0_NR | drive;
    }

    phase_ = Phase::Command;
    commandBuffer_.clear();
}

// ============================================================================
// Invalid command
// ============================================================================

void UPD765A::cmdInvalid()
{
    resultBuffer_.clear();
    resultBuffer_.push_back(ST0_IC_INVALID);
    resultIndex_ = 0;
    phase_ = Phase::Result;
}

// ============================================================================
// Helper: Set standard 7-byte result
// ============================================================================

void UPD765A::setResult7(uint8_t st0, uint8_t st1, uint8_t st2,
                          uint8_t c, uint8_t h, uint8_t r, uint8_t n)
{
    printf("[FDC] Result: ST0=%02X ST1=%02X ST2=%02X C=%d H=%d R=%d N=%d\n",
           st0, st1, st2, c, h, r, n);
    resultBuffer_.clear();
    resultBuffer_.reserve(7);
    resultBuffer_.push_back(st0);
    resultBuffer_.push_back(st1);
    resultBuffer_.push_back(st2);
    resultBuffer_.push_back(c);
    resultBuffer_.push_back(h);
    resultBuffer_.push_back(r);
    resultBuffer_.push_back(n);
    resultIndex_ = 0;
}

// ============================================================================
// Advance to next sector during multi-sector transfer
// ============================================================================

bool UPD765A::advanceToNextSector()
{
    // CM mismatch with SK=0: terminate after the current sector
    if (xferCMTerminate_) {
        return false;
    }

    // Check if we've reached the end of track
    if (xferSector_ >= xferEOT_) {
        return false;
    }

    int drive = xferDrive_;
    if (!hasDisk(drive)) return false;

    // Move to next sector, skipping CM-mismatched sectors when SK=1
    DiskSector* sector = nullptr;
    while (true) {
        xferSector_++;
        if (xferSector_ > xferEOT_) return false;

        sector = disk_[drive]->findSector(currentTrack_[drive], xferSide_, xferSector_);
        if (!sector) return false;

        // Check CM mismatch — standard uPD765A behaviour
        bool sectorHasCM = (sector->fdcStatus2 & ST2_CM) != 0;
        bool cmMismatch = (xferDeletedData_ != sectorHasCM);

        if (cmMismatch && xferSkip_) {
            // SK=1: skip this sector
            continue;
        }
        if (cmMismatch) {
            // SK=0: read this sector but terminate after it
            xferCMTerminate_ = true;
        }
        break;
    }

    // Store actual sector ID field values for result phase
    lastSectorC_ = sector->track;
    lastSectorH_ = sector->side;
    lastSectorR_ = sector->sectorId;
    lastSectorN_ = sector->sizeCode;

    if (executionRead_) {
        // Read: fill buffer with next sector's data (cycles copies for weak sectors)
        dataBuffer_ = sector->getReadData();
        dataIndex_ = 0;

        // Update status flags for this sector
        xferWeakSector_ = sector->isWeak();
        xferST1_ = 0;
        xferST2_ = 0;

        if (xferWeakSector_) {
            xferST1_ = ST1_DE;
            xferST2_ = ST2_DD;
        }

        // Propagate EDSK CRC errors for non-weak sectors
        if (!xferWeakSector_ && sector->hasCRCError()) {
            xferST1_ |= ST1_DE;
            xferST2_ |= ST2_DD;
        }

        // CM mismatch flag
        if (xferCMTerminate_) {
            xferST2_ |= ST2_CM;
        }
    } else {
        // Write: prepare buffer for next sector
        uint32_t secSize = 128u << xferSizeCode_;
        dataBuffer_.resize(secSize, 0);
        dataIndex_ = 0;
    }

    return true;
}

} // namespace zxspec
