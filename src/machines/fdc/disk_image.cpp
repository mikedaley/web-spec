/*
 * disk_image.cpp - DSK / Extended DSK disk image format parser
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "disk_image.hpp"
#include "copy_protection.hpp"
#include <cstring>

namespace zxspec {

std::vector<uint8_t> DiskSector::getReadData() const
{
    // Explicit weak copies: cycle through them and randomize weak bytes
    // (matching FUSE: bytes that differ between copies are randomized)
    if (!weakCopies.empty()) {
        uint32_t idx = readCount % static_cast<uint32_t>(weakCopies.size());
        readCount++;
        return weakCopies[idx];
    }

    // All other sectors (including CRC error sectors): return data as-is.
    // Speedlock data variation for CRC sectors is handled by the FDC's
    // Speedlock hack (detecting repeated reads of the same sector).
    readCount++;
    return data;
}

// DSK header signatures
static constexpr char EXTENDED_SIG[] = "EXTENDED CPC DSK File\r\nDisk-Info\r\n";
static constexpr int HEADER_SIZE = 256;
static constexpr int TRACK_HEADER_SIZE = 256;
static constexpr int SECTOR_INFO_SIZE = 8;

// Sector size from size code: 128 << N (max 6 = 8192 bytes, largest the FDC supports)
static inline uint32_t sectorSize(uint8_t sizeCode)
{
    if (sizeCode > 6) sizeCode = 6;
    return 128u << sizeCode;
}

// OPD format: raw sector dump, no header.
// Single-sided: 40 tracks × 18 sectors × 256 bytes = 184,320 bytes
// Double-sided: 40 tracks × 18 sectors × 256 bytes × 2 sides = 368,640 bytes
static constexpr uint32_t OPD_SS_SIZE = 40 * 18 * 256;   // 184320
static constexpr uint32_t OPD_DS_SIZE = 40 * 18 * 256 * 2; // 368640

bool DiskImage::load(const uint8_t* data, uint32_t size)
{
    if (!data || size == 0) return false;

    // Detect OPD by exact file size (raw format, no header)
    if (size == OPD_SS_SIZE || size == OPD_DS_SIZE) {
        return loadOPD(data, size);
    }

    if (size < HEADER_SIZE) return false;

    // Detect format from header signature
    // Extended DSK has a standardized signature
    if (std::memcmp(data, EXTENDED_SIG, 22) == 0) {
        return loadExtendedDSK(data, size);
    }
    // Standard DSK varies by creator - only the "MV - CPC" prefix is reliable
    if (std::memcmp(data, "MV - CPC", 8) == 0) {
        return loadStandardDSK(data, size);
    }

    return false;
}

bool DiskImage::loadStandardDSK(const uint8_t* data, uint32_t size)
{
    trackCount_ = data[0x30];
    sideCount_ = data[0x31];
    uint16_t trackSize = data[0x32] | (data[0x33] << 8);

    if (trackCount_ <= 0 || sideCount_ <= 0 || trackSize == 0) return false;

    tracks_.clear();
    tracks_.reserve(trackCount_ * sideCount_);

    uint32_t offset = HEADER_SIZE;

    for (int t = 0; t < trackCount_; t++) {
        for (int s = 0; s < sideCount_; s++) {
            if (offset + TRACK_HEADER_SIZE > size) return false;

            // Verify track header signature
            if (std::memcmp(data + offset, "Track-Info\r\n", 12) != 0) return false;

            DiskTrack track;
            track.trackNumber = data[offset + 0x10];
            track.sideNumber = data[offset + 0x11];
            track.sectorSizeCode = data[offset + 0x14];
            uint8_t numSectors = data[offset + 0x15];

            // Max 29 sector info entries fit in the 256-byte track header
            if (numSectors > 29) return false;
            track.gap3Length = data[offset + 0x16];
            track.fillerByte = data[offset + 0x17];

            uint32_t dataOffset = offset + TRACK_HEADER_SIZE;
            uint32_t defaultSectorSize = sectorSize(track.sectorSizeCode);

            for (int sec = 0; sec < numSectors; sec++) {
                uint32_t infoOffset = offset + 0x18 + (sec * SECTOR_INFO_SIZE);
                if (infoOffset + SECTOR_INFO_SIZE > size) return false;

                DiskSector sector;
                sector.track = data[infoOffset + 0];
                sector.side = data[infoOffset + 1];
                sector.sectorId = data[infoOffset + 2];
                sector.sizeCode = data[infoOffset + 3];
                sector.fdcStatus1 = data[infoOffset + 4];
                sector.fdcStatus2 = data[infoOffset + 5];

                uint32_t secSize = defaultSectorSize;
                if (dataOffset + secSize > size) return false;

                sector.data.assign(data + dataOffset, data + dataOffset + secSize);
                dataOffset += secSize;
                track.sectors.push_back(std::move(sector));
            }

            tracks_.push_back(std::move(track));
            offset += trackSize;
        }
    }

    loaded_ = true;
    modified_ = false;
    extended_ = false;
    printf("[DSK] Loaded standard DSK: %d tracks, %d sides\n", trackCount_, sideCount_);
    return true;
}

bool DiskImage::loadExtendedDSK(const uint8_t* data, uint32_t size)
{
    trackCount_ = data[0x30];
    sideCount_ = data[0x31];

    if (trackCount_ <= 0 || sideCount_ <= 0) return false;

    // Track size table starts at offset 0x34 (high bytes only, multiply by 256)
    // Table occupies bytes 0x34–0xFF (204 bytes max)
    int totalTracks = trackCount_ * sideCount_;
    if (totalTracks > 204) return false;

    tracks_.clear();
    tracks_.reserve(totalTracks);

    uint32_t offset = HEADER_SIZE;

    for (int i = 0; i < totalTracks; i++) {
        uint32_t trackSize = static_cast<uint32_t>(data[0x34 + i]) * 256;

        if (trackSize == 0) {
            // Unformatted track
            DiskTrack track;
            track.trackNumber = i / sideCount_;
            track.sideNumber = i % sideCount_;
            track.sectorSizeCode = 0;
            track.gap3Length = 0;
            track.fillerByte = 0xE5;
            tracks_.push_back(std::move(track));
            continue;
        }

        if (offset + TRACK_HEADER_SIZE > size) return false;
        if (std::memcmp(data + offset, "Track-Info\r\n", 12) != 0) return false;

        DiskTrack track;
        track.trackNumber = data[offset + 0x10];
        track.sideNumber = data[offset + 0x11];
        track.sectorSizeCode = data[offset + 0x14];
        uint8_t numSectors = data[offset + 0x15];

        // Max 29 sector info entries fit in the 256-byte track header
        if (numSectors > 29) return false;

        track.gap3Length = data[offset + 0x16];
        track.fillerByte = data[offset + 0x17];

        uint32_t dataOffset = offset + TRACK_HEADER_SIZE;

        for (int sec = 0; sec < numSectors; sec++) {
            uint32_t infoOffset = offset + 0x18 + (sec * SECTOR_INFO_SIZE);
            if (infoOffset + SECTOR_INFO_SIZE > size) return false;

            DiskSector sector;
            sector.track = data[infoOffset + 0];
            sector.side = data[infoOffset + 1];
            sector.sectorId = data[infoOffset + 2];
            sector.sizeCode = data[infoOffset + 3];
            sector.fdcStatus1 = data[infoOffset + 4];
            sector.fdcStatus2 = data[infoOffset + 5];

            // Extended DSK: actual data length in bytes 6-7 of sector info.
            // A value of 0 means no data is stored for this sector (common on
            // protection tracks with non-standard size codes N >= 7). The sector
            // exists in the ID field but has no readable data.
            uint32_t actualSize = data[infoOffset + 6] | (data[infoOffset + 7] << 8);

            if (dataOffset + actualSize > size) {
                // Truncate to available data to handle malformed images
                actualSize = (dataOffset < size) ? (size - dataOffset) : 0;
            }

            uint32_t declaredSize = sectorSize(sector.sizeCode);

            // Detect weak/fuzzy sectors: if actual data is a multiple of declared
            // size and larger than it, the extra data holds additional read copies
            // (used by Speedlock and similar copy protection schemes)
            if (actualSize > declaredSize && declaredSize > 0 && (actualSize % declaredSize) == 0) {
                uint32_t copyCount = actualSize / declaredSize;
                sector.data.assign(data + dataOffset, data + dataOffset + declaredSize);
                sector.weakCopies.resize(copyCount);
                hasWeakSectors_ = true;
                for (uint32_t c = 0; c < copyCount; c++) {
                    uint32_t copyOffset = dataOffset + c * declaredSize;
                    sector.weakCopies[c].assign(data + copyOffset, data + copyOffset + declaredSize);
                }
            } else {
                sector.data.assign(data + dataOffset, data + dataOffset + actualSize);
            }

            dataOffset += actualSize;
            track.sectors.push_back(std::move(sector));
        }

        tracks_.push_back(std::move(track));
        offset += trackSize;
    }

    loaded_ = true;
    modified_ = false;
    extended_ = true;

    // Detect protection scheme (informational — no patching applied).
    // Protection is handled at FDC runtime via correct uPD765A behaviour.
    protection_ = zxspec::detectProtection(*this);
    if (protection_ != ProtectionScheme::None) {
        printf("[DSK] Protection detected: %s\n", zxspec::protectionName(protection_));
    }

    printf("[DSK] Loaded extended DSK: %d tracks, %d sides, %d total track entries\n",
           trackCount_, sideCount_, totalTracks);
    return true;
}

bool DiskImage::loadOPD(const uint8_t* data, uint32_t size)
{
    // OPD: raw sector dump — 40 tracks, 18 sectors/track, 256 bytes/sector
    int sides = (size == OPD_DS_SIZE) ? 2 : 1;
    trackCount_ = 40;
    sideCount_ = sides;

    tracks_.clear();
    tracks_.reserve(trackCount_ * sideCount_);

    uint32_t offset = 0;

    for (int t = 0; t < trackCount_; t++) {
        for (int s = 0; s < sideCount_; s++) {
            DiskTrack track;
            track.trackNumber = static_cast<uint8_t>(t);
            track.sideNumber = static_cast<uint8_t>(s);
            track.sectorSizeCode = 1;   // 256 bytes
            track.gap3Length = 0x17;
            track.fillerByte = 0xE5;
            track.sectors.reserve(18);

            for (int sec = 0; sec < 18; sec++) {
                DiskSector sector;
                sector.track = static_cast<uint8_t>(t);
                sector.side = static_cast<uint8_t>(s);
                sector.sectorId = static_cast<uint8_t>(sec);  // Opus uses 0-based sector IDs
                sector.sizeCode = 1;  // 256 bytes
                sector.fdcStatus1 = 0;
                sector.fdcStatus2 = 0;
                sector.data.assign(data + offset, data + offset + 256);
                offset += 256;
                track.sectors.push_back(std::move(sector));
            }

            tracks_.push_back(std::move(track));
        }
    }

    loaded_ = true;
    modified_ = false;
    writeProtected_ = false;
    extended_ = false;
    return true;
}

void DiskImage::createEmpty()
{
    trackCount_ = 40;
    sideCount_ = 1;
    tracks_.clear();
    tracks_.reserve(40);

    for (int t = 0; t < 40; t++) {
        DiskTrack track;
        track.trackNumber = t;
        track.sideNumber = 0;
        track.sectorSizeCode = 2;   // 512 bytes
        track.gap3Length = 0x4E;
        track.fillerByte = 0xE5;

        for (int s = 0; s < 9; s++) {
            DiskSector sector;
            sector.track = t;
            sector.side = 0;
            sector.sectorId = s + 1;    // +3DOS uses sectors 1-9
            sector.sizeCode = 2;
            sector.fdcStatus1 = 0;
            sector.fdcStatus2 = 0;
            sector.data.assign(512, 0xE5);
            track.sectors.push_back(std::move(sector));
        }

        tracks_.push_back(std::move(track));
    }

    loaded_ = true;
    modified_ = false;
    extended_ = true;
}

void DiskImage::createEmptyOPD()
{
    trackCount_ = 40;
    sideCount_ = 1;
    tracks_.clear();
    tracks_.reserve(40);

    for (int t = 0; t < 40; t++) {
        DiskTrack track;
        track.trackNumber = t;
        track.sideNumber = 0;
        track.sectorSizeCode = 1;   // 256 bytes
        track.gap3Length = 0x17;
        track.fillerByte = 0xE5;

        for (int s = 0; s < 18; s++) {
            DiskSector sector;
            sector.track = t;
            sector.side = 0;
            sector.sectorId = s;        // Opus uses 0-based sector IDs
            sector.sizeCode = 1;        // 256 bytes
            sector.fdcStatus1 = 0;
            sector.fdcStatus2 = 0;
            sector.data.assign(256, 0xE5);
            track.sectors.push_back(std::move(sector));
        }

        tracks_.push_back(std::move(track));
    }

    loaded_ = true;
    modified_ = false;
    extended_ = false;
}

std::vector<uint8_t> DiskImage::exportDSK() const
{
    if (!loaded_) return {};

    std::vector<uint8_t> out;
    int totalTracks = trackCount_ * sideCount_;

    // Reserve approximate size
    out.reserve(HEADER_SIZE + totalTracks * (TRACK_HEADER_SIZE + 9 * 512));

    // Write Extended DSK header
    out.resize(HEADER_SIZE, 0);
    std::memcpy(out.data(), EXTENDED_SIG, std::strlen(EXTENDED_SIG));

    // Creator name at offset 0x22 (14 bytes)
    const char* creator = "web-spec    ";
    std::memcpy(out.data() + 0x22, creator, 14);

    out[0x30] = static_cast<uint8_t>(trackCount_);
    out[0x31] = static_cast<uint8_t>(sideCount_);

    // Build track size table and track data
    for (int i = 0; i < totalTracks && i < static_cast<int>(tracks_.size()); i++) {
        const auto& track = tracks_[i];
        if (track.sectors.empty()) {
            out[0x34 + i] = 0;
            continue;
        }

        // Calculate track data size (max 29 sectors)
        size_t secCount = track.sectors.size() > 29 ? 29 : track.sectors.size();
        uint32_t trackDataSize = TRACK_HEADER_SIZE;
        for (size_t si = 0; si < secCount; si++) {
            const auto& sec = track.sectors[si];
            if (sec.isWeak()) {
                // Weak sectors store all copies concatenated
                for (const auto& copy : sec.weakCopies) {
                    trackDataSize += static_cast<uint32_t>(copy.size());
                }
            } else {
                trackDataSize += static_cast<uint32_t>(sec.data.size());
            }
        }
        // Round up to 256-byte boundary
        trackDataSize = (trackDataSize + 255) & ~255u;
        out[0x34 + i] = static_cast<uint8_t>(trackDataSize / 256);
    }

    // Write track data
    for (int i = 0; i < totalTracks && i < static_cast<int>(tracks_.size()); i++) {
        const auto& track = tracks_[i];
        if (track.sectors.empty()) continue;

        size_t trackStart = out.size();
        size_t maxSectors = track.sectors.size() > 29 ? 29 : track.sectors.size();

        // Track header (256 bytes)
        out.resize(trackStart + TRACK_HEADER_SIZE, 0);
        std::memcpy(out.data() + trackStart, "Track-Info\r\n", 12);
        out[trackStart + 0x10] = track.trackNumber;
        out[trackStart + 0x11] = track.sideNumber;
        out[trackStart + 0x14] = track.sectorSizeCode;
        out[trackStart + 0x15] = static_cast<uint8_t>(maxSectors);
        out[trackStart + 0x16] = track.gap3Length;
        out[trackStart + 0x17] = track.fillerByte;

        // Sector info entries (max 29 fit in track header)
        for (size_t sec = 0; sec < maxSectors; sec++) {
            const auto& sector = track.sectors[sec];
            size_t infoOff = trackStart + 0x18 + sec * SECTOR_INFO_SIZE;
            out[infoOff + 0] = sector.track;
            out[infoOff + 1] = sector.side;
            out[infoOff + 2] = sector.sectorId;
            out[infoOff + 3] = sector.sizeCode;
            out[infoOff + 4] = sector.fdcStatus1;
            out[infoOff + 5] = sector.fdcStatus2;
            uint16_t dataLen;
            if (sector.isWeak()) {
                // Actual size is all copies concatenated
                uint32_t totalSize = 0;
                for (const auto& copy : sector.weakCopies) {
                    totalSize += static_cast<uint32_t>(copy.size());
                }
                dataLen = static_cast<uint16_t>(totalSize);
            } else {
                dataLen = static_cast<uint16_t>(sector.data.size());
            }
            out[infoOff + 6] = dataLen & 0xFF;
            out[infoOff + 7] = (dataLen >> 8) & 0xFF;
        }

        // Sector data (only export clamped count)
        for (size_t sec = 0; sec < maxSectors; sec++) {
            const auto& sector = track.sectors[sec];
            if (sector.isWeak()) {
                for (const auto& copy : sector.weakCopies) {
                    out.insert(out.end(), copy.begin(), copy.end());
                }
            } else {
                out.insert(out.end(), sector.data.begin(), sector.data.end());
            }
        }

        // Pad to 256-byte boundary
        size_t trackEnd = out.size() - trackStart;
        size_t padded = (trackEnd + 255) & ~255u;
        out.resize(trackStart + padded, 0);
    }

    return out;
}

DiskSector* DiskImage::findSector(int track, int side, uint8_t sectorId)
{
    auto* t = getTrack(track, side);
    if (!t) return nullptr;

    for (auto& sec : t->sectors) {
        if (sec.sectorId == sectorId) return &sec;
    }
    return nullptr;
}

const DiskSector* DiskImage::findSector(int track, int side, uint8_t sectorId) const
{
    const auto* t = getTrack(track, side);
    if (!t) return nullptr;

    for (const auto& sec : t->sectors) {
        if (sec.sectorId == sectorId) return &sec;
    }
    return nullptr;
}

DiskTrack* DiskImage::getTrack(int track, int side)
{
    if (track < 0 || track >= trackCount_ || side < 0 || side >= sideCount_) return nullptr;
    int idx = track * sideCount_ + side;
    if (idx < 0 || idx >= static_cast<int>(tracks_.size())) return nullptr;
    return &tracks_[idx];
}

const DiskTrack* DiskImage::getTrack(int track, int side) const
{
    if (track < 0 || track >= trackCount_ || side < 0 || side >= sideCount_) return nullptr;
    int idx = track * sideCount_ + side;
    if (idx < 0 || idx >= static_cast<int>(tracks_.size())) return nullptr;
    return &tracks_[idx];
}

void DiskImage::formatTrack(int track, int side, uint8_t sectorSizeCode,
                             uint8_t sectorsPerTrack, uint8_t gap3Length,
                             uint8_t fillerByte,
                             const uint8_t* sectorIds)
{
    auto* t = getTrack(track, side);
    if (!t) return;

    t->sectorSizeCode = sectorSizeCode;
    t->gap3Length = gap3Length;
    t->fillerByte = fillerByte;
    t->sectors.clear();

    uint32_t secSize = sectorSize(sectorSizeCode);

    for (int s = 0; s < sectorsPerTrack; s++) {
        DiskSector sector;
        sector.track = sectorIds[s * 4 + 0];
        sector.side = sectorIds[s * 4 + 1];
        sector.sectorId = sectorIds[s * 4 + 2];
        sector.sizeCode = sectorIds[s * 4 + 3];
        sector.fdcStatus1 = 0;
        sector.fdcStatus2 = 0;
        sector.data.assign(secSize, fillerByte);
        t->sectors.push_back(std::move(sector));
    }

    modified_ = true;
}

void DiskImage::eject()
{
    tracks_.clear();
    trackCount_ = 0;
    sideCount_ = 0;
    loaded_ = false;
    modified_ = false;
    writeProtected_ = false;
}

} // namespace zxspec
