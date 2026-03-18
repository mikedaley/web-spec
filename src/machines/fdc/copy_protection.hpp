/*
 * copy_protection.hpp - Disk copy protection detection and handling
 *
 * Detects and patches copy protection schemes found on ZX Spectrum +3
 * disk images. Each scheme requires different FDC behaviour:
 *
 *   Speedlock +3   CRC error on track 0 + CM (deleted marks) on data tracks.
 *                  Needs: CM clearing + CRC data variation on repeated reads.
 *
 *   PaulOwens      Protection track with non-standard sector sizes (N >= 7).
 *                  Needs: Read ID returns correct C/H/R/N for large N sectors.
 *
 *   CMOnly         Deleted data marks on data tracks without CRC errors.
 *                  Needs: CM clearing so +3DOS Read Data can access sectors.
 *
 *   WeakSectors    Explicit weak copies stored in EDSK format.
 *                  Needs: FDC cycles through copies on each read.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "disk_image.hpp"
#include <cstdint>
#include <vector>

namespace zxspec {

const char* protectionName(ProtectionScheme scheme);

// Analyse a loaded disk image and return the detected protection scheme.
ProtectionScheme detectProtection(const DiskImage& disk);

// Apply protection-specific patches to a disk image after loading.
// This modifies the disk in-place (e.g., clearing CM flags).
void applyProtectionPatches(DiskImage& disk, ProtectionScheme scheme);

// Speedlock +3 FDC hack: apply synthetic data variation to a sector's
// data buffer when the same CRC-error sector is read repeatedly.
// Returns true if variation was applied.
// Called from UPD765A::cmdReadData for Speedlock-protected disks.
bool applySpeedlockVariation(std::vector<uint8_t>& dataBuffer,
                             uint8_t sectorR, int readCount);

} // namespace zxspec
