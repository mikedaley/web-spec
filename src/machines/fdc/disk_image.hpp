/*
 * disk_image.hpp - DSK / Extended DSK / OPD disk image format parser
 *
 * Supports standard CPC DSK, Extended DSK, and Opus Discovery OPD formats.
 * Provides sector-level read/write access for FDC emulation.
 *
 * +3DOS standard format: 40 tracks, 1 side, 9 sectors/track, 512 bytes/sector
 * Opus OPD format: 40 tracks, 1 side, 18 sectors/track, 256 bytes/sector (raw)
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <vector>

namespace zxspec {

// Copy protection scheme detected on the disk image.
enum class ProtectionScheme {
    None,           // Standard +3DOS / unprotected
    Speedlock,      // Speedlock +3: CRC on track 0 + CM on data tracks
    PaulOwens,      // Non-standard sector sizes on protection track (N >= 7)
    CMOnly,         // Deleted data marks without CRC errors on track 0
    WeakSectors,    // EDSK with explicit weak sector copies
};

struct DiskSector {
    uint8_t track;          // C - track number in sector ID
    uint8_t side;           // H - side number in sector ID
    uint8_t sectorId;       // R - sector ID
    uint8_t sizeCode;       // N - size code (0=128, 1=256, 2=512, 3=1024)
    uint8_t fdcStatus1;     // FDC ST1 flags (for copy-protection)
    uint8_t fdcStatus2;     // FDC ST2 flags (for copy-protection)
    std::vector<uint8_t> data;

    // Weak/fuzzy sector support (Speedlock etc.)
    // When an EDSK sector's actual data is a multiple of the declared size,
    // the extra data represents additional read copies with different content.
    // Each read cycles through copies to simulate non-deterministic reads.
    std::vector<std::vector<uint8_t>> weakCopies;  // Empty = normal sector
    mutable uint32_t readCount = 0;                // Tracks reads for copy cycling

    // True only if this sector has explicit weak copies from the EDSK image
    bool isWeak() const {
        return !weakCopies.empty();
    }

    bool hasCRCError() const {
        return (fdcStatus1 & 0x20) != 0;  // ST1_DE
    }

    // Get the data to return for the current read.
    // - Sectors with explicit weak copies: cycles through them.
    // - Sectors with CRC error flags but no copies: generates synthetic
    //   random variation to simulate weak/fuzzy bits (Speedlock protection).
    // - Normal sectors: returns data unchanged.
    std::vector<uint8_t> getReadData() const;
};

struct DiskTrack {
    uint8_t trackNumber;
    uint8_t sideNumber;
    uint8_t sectorSizeCode;     // Default sector size code
    uint8_t gap3Length;
    uint8_t fillerByte;
    std::vector<DiskSector> sectors;
};

class DiskImage {
public:
    DiskImage() = default;

    // Load a DSK or Extended DSK image from raw data.
    // Returns true on success.
    bool load(const uint8_t* data, uint32_t size);

    // Create an empty formatted disk (40 tracks, 1 side, 9 sectors, 512 bytes)
    void createEmpty();

    // Create an empty Opus-format disk (40 tracks, 1 side, 18 sectors, 256 bytes)
    void createEmptyOPD();

    // Export the current disk state as Extended DSK format
    std::vector<uint8_t> exportDSK() const;

    bool isLoaded() const { return loaded_; }
    bool isModified() const { return modified_; }
    void clearModified() { modified_ = false; }
    bool isWriteProtected() const { return writeProtected_; }
    void setWriteProtected(bool wp) { writeProtected_ = wp; }

    int getTrackCount() const { return trackCount_; }
    int getSideCount() const { return sideCount_; }
    ProtectionScheme getProtection() const { return protection_; }

    // Find a sector by physical track, side, and sector ID.
    // Returns nullptr if not found.
    DiskSector* findSector(int track, int side, uint8_t sectorId);
    const DiskSector* findSector(int track, int side, uint8_t sectorId) const;

    // Get a track by physical position. Returns nullptr if out of range.
    DiskTrack* getTrack(int track, int side);
    const DiskTrack* getTrack(int track, int side) const;

    // Format a track with the given sector layout
    void formatTrack(int track, int side, uint8_t sectorSizeCode,
                     uint8_t sectorsPerTrack, uint8_t gap3Length,
                     uint8_t fillerByte,
                     const uint8_t* sectorIds);

    void eject();

private:
    bool loadStandardDSK(const uint8_t* data, uint32_t size);
    bool loadExtendedDSK(const uint8_t* data, uint32_t size);
    bool loadOPD(const uint8_t* data, uint32_t size);

    std::vector<DiskTrack> tracks_;
    int trackCount_ = 0;
    int sideCount_ = 0;
    bool loaded_ = false;
    bool modified_ = false;
    bool writeProtected_ = false;
    bool extended_ = false;
    ProtectionScheme protection_ = ProtectionScheme::None;
};

} // namespace zxspec
