/*
 * copy_protection.cpp - Disk copy protection detection
 *
 * Identifies copy protection schemes on ZX Spectrum +3 disk images.
 * Disk data is never modified — protection is handled at FDC runtime
 * via correct µPD765A behaviour (CM/SK mismatch logic, CRC error
 * reporting, weak sector cycling, and Speedlock data variation).
 *
 * Supported schemes (from protected-disk-images/):
 *
 * SPEEDLOCK +3 (boot sig: F3 01 FD 7F 3E 13 ED 79)
 *   Beyond The Ice Palace   CRC(2) CM(53)  tracks 0-10
 *   Batman Caped Crusader    CRC(1) CM(99)  tracks 0-21
 *   Dixons Premiere A        CRC(1) CM(187) tracks 0-37
 *   Dixons Premiere B        CRC(2) CM(171) tracks 0-33
 *   Chartbusters A/B         CRC(1) CM(325) tracks 3-39, non-std R on track 0
 *
 * CM-ONLY (custom loaders using Read Deleted Data)
 *   Batman The Movie         CM(55)  tracks 3-39
 *   Cabal                    CM(83)  tracks 3-39
 *   Chase HQ                 CM(249) tracks 3-39
 *   California Games A       CM(28)  tracks 34-37
 *
 * PAUL OWENS
 *   Captain Blood            BigN on track 40 (N=0-15, 16 sectors)
 *
 * WEAK SECTORS (EDSK with multiple copies)
 *   Coin-Op Hits A           Weak(40) CM(40) tracks 1-40
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "copy_protection.hpp"
#include <cstring>

namespace zxspec {

const char* protectionName(ProtectionScheme scheme)
{
    switch (scheme) {
        case ProtectionScheme::None:        return "None";
        case ProtectionScheme::Speedlock:   return "Speedlock +3";
        case ProtectionScheme::PaulOwens:   return "Paul Owens";
        case ProtectionScheme::CMOnly:      return "CM-only";
        case ProtectionScheme::WeakSectors: return "Weak sectors";
    }
    return "Unknown";
}

// ============================================================================
// Detection
// ============================================================================

ProtectionScheme detectProtection(const DiskImage& disk)
{
    if (disk.getTrackCount() == 0) return ProtectionScheme::None;

    // Gather statistics from track 0
    const DiskTrack* track0 = disk.getTrack(0, 0);
    if (!track0) return ProtectionScheme::None;

    bool hasCRCOnTrack0 = false;
    bool hasWeakOnTrack0 = false;
    for (const auto& sec : track0->sectors) {
        if (sec.hasCRCError()) hasCRCOnTrack0 = true;
        if (sec.isWeak()) hasWeakOnTrack0 = true;
    }

    // Check for Speedlock +3 boot code signature at offset 0x10 in boot sector.
    // Speedlock +3 starts with: F3 01 FD 7F 3E 13 ED 79 (DI; LD BC,0x7FFD; LD A,0x13; OUT (C),A)
    bool hasSpeedlockBootCode = false;
    const DiskSector* bootSector = disk.findSector(0, 0, 1);
    if (bootSector && bootSector->data.size() >= 0x18) {
        static const uint8_t speedlockSig[] = { 0xF3, 0x01, 0xFD, 0x7F, 0x3E, 0x13, 0xED, 0x79 };
        hasSpeedlockBootCode = (std::memcmp(bootSector->data.data() + 0x10,
                                            speedlockSig, sizeof(speedlockSig)) == 0);
    }

    // Gather statistics from data tracks (1+)
    int cmCount = 0;
    int weakCount = 0;
    bool hasLargeN = false;

    for (int t = 0; t < disk.getTrackCount(); t++) {
        for (int s = 0; s < disk.getSideCount(); s++) {
            const DiskTrack* track = disk.getTrack(t, s);
            if (!track) continue;
            for (const auto& sec : track->sectors) {
                if (t > 0 && (sec.fdcStatus2 & 0x40)) cmCount++;
                if (sec.isWeak()) weakCount++;
                if (sec.sizeCode >= 7) hasLargeN = true;
            }
        }
    }

    bool hasCM = cmCount > 5;

    // Classify — most specific first

    // Explicit weak copies in EDSK (Coin-Op Hits etc.)
    if (weakCount > 0) {
        return ProtectionScheme::WeakSectors;
    }

    // Speedlock +3: CRC error sector on track 0 + CM on data tracks.
    // The CRC sector is the Speedlock protection check — its presence
    // distinguishes these from CMOnly disks (like Chase HQ) that have
    // no CRC on track 0.
    if (hasCRCOnTrack0 && hasCM) {
        return ProtectionScheme::Speedlock;
    }

    // Paul Owens: protection track with non-standard sector sizes
    if (hasLargeN) {
        return ProtectionScheme::PaulOwens;
    }

    // CM-only: deleted data marks without CRC or weak sectors
    if (hasCM) {
        return ProtectionScheme::CMOnly;
    }

    return ProtectionScheme::None;
}

// ============================================================================
// Utility
// ============================================================================

bool hasSpeedlockBootSignature(const DiskImage& disk)
{
    const DiskSector* boot = disk.findSector(0, 0, 1);
    if (!boot || boot->data.size() < 0x18) return false;
    static const uint8_t sig[] = { 0xF3, 0x01, 0xFD, 0x7F, 0x3E, 0x13, 0xED, 0x79 };
    return std::memcmp(boot->data.data() + 0x10, sig, sizeof(sig)) == 0;
}

} // namespace zxspec
