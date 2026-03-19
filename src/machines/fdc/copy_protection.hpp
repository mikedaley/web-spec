/*
 * copy_protection.hpp - Disk copy protection detection
 *
 * Detects copy protection schemes found on ZX Spectrum +3 disk images.
 * Protection is handled at FDC runtime via correct uPD765A behaviour:
 *
 *   Speedlock +3   CRC error on track 0 + CM (deleted marks) on data tracks.
 *                  CRC sectors return varied data via DiskSector::getReadData().
 *                  CM sectors handled by standard SK/CM mismatch logic.
 *
 *   PaulOwens      Protection track with non-standard sector sizes (N >= 7).
 *                  Read ID returns correct C/H/R/N naturally.
 *
 *   CMOnly         Deleted data marks on data tracks without CRC errors.
 *                  Loaders use Read Deleted Data directly — CM matches.
 *
 *   WeakSectors    Explicit weak copies stored in EDSK format.
 *                  FDC cycles through copies on each read.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include "disk_image.hpp"
#include <cstdint>

namespace zxspec {

const char* protectionName(ProtectionScheme scheme);

// Check if the boot sector contains the Speedlock +3 boot code signature.
bool hasSpeedlockBootSignature(const DiskImage& disk);

// Analyse a loaded disk image and return the detected protection scheme.
ProtectionScheme detectProtection(const DiskImage& disk);

} // namespace zxspec
