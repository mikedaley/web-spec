/*
 * copy_protection.cpp - Disk copy protection detection and handling
 *
 * Detection and patching for ZX Spectrum +3 disk copy protection schemes.
 * Separated from disk_image.cpp and upd765a.cpp to keep protection-specific
 * logic isolated and prevent scheme-specific fixes from breaking each other.
 *
 * Disk image analysis (from protected-disk-images/):
 *
 * SPEEDLOCK +3 (boot sig: F3 01 FD 7F 3E 13 ED 79)
 *   Beyond The Ice Palace   CRC(2) CM(53)  tracks 0-10
 *   Batman Caped Crusader    CRC(1) CM(99)  tracks 0-21
 *   Dixons Premiere A        CRC(1) CM(187) tracks 0-37
 *   Dixons Premiere B        CRC(2) CM(171) tracks 0-33
 *   Chartbusters A/B         CRC(1) CM(325) tracks 3-39, non-std R on track 0
 *
 *   Detection: CRC error sector on track 0 + CM on data tracks
 *   Patch: Clear CM from all data tracks (tracks 1+)
 *   FDC: Vary CRC sector data on repeated reads (Speedlock check)
 *
 * CM-ONLY (boot sig: F3 31 00 FD or similar, no Speedlock ID)
 *   Batman The Movie         CM(55)  tracks 3-39
 *   Cabal                    CM(83)  tracks 3-39
 *   Chase HQ                 CM(249) tracks 3-39
 *   California Games A       CM(28)  tracks 34-37
 *
 *   Detection: CM on data tracks, no CRC on track 0
 *   Patch: Clear CM from all data tracks (tracks 1+)
 *   FDC: Standard — no special handling
 *
 * PAUL OWENS
 *   Captain Blood            BigN on track 40 (N=0-15, 16 sectors)
 *
 *   Detection: Sectors with N >= 7 (non-standard sizes)
 *   Patch: None — Read ID returns correct C/H/R/N naturally
 *   FDC: Standard — no special handling
 *
 * WEAK SECTORS (EDSK with multiple copies)
 *   Coin-Op Hits A           Weak(40) CM(40) tracks 1-40
 *
 *   Detection: EDSK sectors with actualSize > declaredSize (multiple copies)
 *   Patch: Clear CM from data tracks
 *   FDC: Cycle through weak copies on each read (handled in getReadData)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "copy_protection.hpp"
#include <cstdio>

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

    // Speedlock +3: CRC error on track 0 + CM on data tracks
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
// Patches applied at disk load time
// ============================================================================

// Clear CM (deleted data mark) flags from all sectors on tracks 1+.
// This allows +3DOS Read Data commands to access the sectors.
// Safe for all protection types because:
//   - Speedlock boot code reads one sector at a time (EOT=R) with SK=0,
//     so CM mismatch still transfers data (just sets ST2_CM).
//   - +3DOS uses Read Data + SK=1, which skips CM sectors — clearing
//     CM prevents the skip and allows normal data transfer.
//   - CM on track 0 is preserved (protection check sectors).
static void clearCMFromDataTracks(DiskImage& disk)
{
    int cleared = 0;
    for (int t = 1; t < disk.getTrackCount(); t++) {
        for (int s = 0; s < disk.getSideCount(); s++) {
            DiskTrack* track = disk.getTrack(t, s);
            if (!track) continue;
            for (auto& sec : track->sectors) {
                if (sec.fdcStatus2 & 0x40) {
                    sec.fdcStatus2 &= ~0x40;
                    cleared++;
                }
            }
        }
    }
    if (cleared > 0) {
        printf("[DSK] Cleared CM flags from %d data sectors\n", cleared);
    }
}

void applyProtectionPatches(DiskImage& disk, ProtectionScheme scheme)
{
    switch (scheme) {

        case ProtectionScheme::Speedlock:
            // Clear CM so +3DOS can read data tracks. The Speedlock boot
            // code may use Read Deleted Data for initial loading, but
            // subsequent game loading (especially on compilation disks
            // like Dixons Premiere Collection) goes through +3DOS.
            clearCMFromDataTracks(disk);
            break;

        case ProtectionScheme::CMOnly:
            // These disks have CM without CRC errors. The custom boot
            // code varies — some use Read Deleted Data directly, others
            // go through +3DOS. Clearing CM is safe for both paths.
            clearCMFromDataTracks(disk);
            break;

        case ProtectionScheme::WeakSectors:
            // Disks with explicit weak copies may also have CM flags.
            // Clear them for +3DOS compatibility.
            clearCMFromDataTracks(disk);
            break;

        case ProtectionScheme::PaulOwens:
            // No data patching needed. The protection track has sectors
            // with large N values for Read ID verification — the FDC
            // handles this naturally.
            break;

        case ProtectionScheme::None:
            break;
    }
}

// ============================================================================
// Speedlock +3 FDC data variation
// ============================================================================

bool applySpeedlockVariation(std::vector<uint8_t>& dataBuffer,
                             uint8_t /*sectorR*/, int readCount)
{
    // Only vary on 2nd+ reads of the same sector.
    // Speedlock reads the CRC error sector 2-3 times and compares bytes
    // at offsets ~105+ for differences. If data is identical, the check fails.
    if (readCount <= 1) return false;

    uint32_t seed = static_cast<uint32_t>(readCount) * 0x9E3779B1u;
    for (size_t i = 105; i < dataBuffer.size(); i++) {
        seed ^= seed << 13;
        seed ^= seed >> 17;
        seed ^= seed << 5;
        // XOR at regular intervals and all bytes past 256
        if ((i % 29) == 0 || i >= 256) {
            dataBuffer[i] ^= static_cast<uint8_t>(seed & 0xFF);
        }
    }
    return true;
}

} // namespace zxspec
