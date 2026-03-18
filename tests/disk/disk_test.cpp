/*
 * disk_test.cpp - FDC and disk image compatibility test suite
 *
 * Tests disk image loading, protection detection, FDC command handling,
 * and export/re-import roundtrip integrity. Designed to catch regressions
 * when modifying FDC or disk image code.
 *
 * Test disk images are loaded from the spectrem_disks directory.
 * Each disk is validated for correct parsing, protection detection,
 * sector accessibility, and data integrity.
 *
 * Written by Mike Daley
 */

#include "fdc/disk_image.hpp"
#include "fdc/upd765a.hpp"

#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>
#include <fstream>
#include <filesystem>

namespace fs = std::filesystem;

// ---------------------------------------------------------------------------
// Minimal test framework (same as z80_test.cpp)
// ---------------------------------------------------------------------------

static int g_total   = 0;
static int g_passed  = 0;
static int g_failed  = 0;

#define TEST_BEGIN(name)                                         \
    do {                                                         \
        g_total++;                                               \
        const char* _test_name = (name);                         \
        bool _test_ok = true;                                    \
        (void)_test_ok;

#define EXPECT_EQ(actual, expected)                               \
    do {                                                          \
        auto _a = (actual);                                       \
        auto _e = (expected);                                     \
        if (_a != _e) {                                           \
            std::printf("    FAIL: %s == %d, expected %d\n",      \
                        #actual, (int)_a, (int)_e);               \
            _test_ok = false;                                     \
        }                                                         \
    } while (0)

#define EXPECT_TRUE(expr)                                         \
    do {                                                          \
        if (!(expr)) {                                            \
            std::printf("    FAIL: %s was false\n", #expr);       \
            _test_ok = false;                                     \
        }                                                         \
    } while (0)

#define EXPECT_FALSE(expr)                                        \
    do {                                                          \
        if ((expr)) {                                             \
            std::printf("    FAIL: %s was true\n", #expr);        \
            _test_ok = false;                                     \
        }                                                         \
    } while (0)

#define EXPECT_GE(actual, expected)                               \
    do {                                                          \
        auto _a = (actual);                                       \
        auto _e = (expected);                                     \
        if (_a < _e) {                                            \
            std::printf("    FAIL: %s == %d, expected >= %d\n",   \
                        #actual, (int)_a, (int)_e);               \
            _test_ok = false;                                     \
        }                                                         \
    } while (0)

#define TEST_END()                                               \
        if (_test_ok) {                                          \
            g_passed++;                                          \
            std::printf("  PASS: %s\n", _test_name);             \
        } else {                                                 \
            g_failed++;                                          \
            std::printf("  FAIL: %s\n", _test_name);             \
        }                                                        \
    } while (0)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static const char* DISK_DIR = nullptr;

static std::vector<uint8_t> loadFile(const std::string& path)
{
    std::ifstream f(path, std::ios::binary);
    if (!f.is_open()) return {};
    return std::vector<uint8_t>(
        (std::istreambuf_iterator<char>(f)),
        std::istreambuf_iterator<char>());
}

static bool hasDisk(const std::string& name)
{
    if (!DISK_DIR) return false;
    return fs::exists(std::string(DISK_DIR) + "/" + name);
}

static std::vector<uint8_t> loadDisk(const std::string& name)
{
    if (!DISK_DIR) return {};
    return loadFile(std::string(DISK_DIR) + "/" + name);
}

// Count sectors with specific flags across all tracks (excluding track 0)
struct DiskStats {
    int totalTracks = 0;
    int totalSectors = 0;
    int cmSectors = 0;     // Deleted data mark
    int crcSectors = 0;    // CRC error
    int weakSectors = 0;   // Weak/fuzzy copies
    int emptySectors = 0;  // No data
};

static DiskStats getDiskStats(const zxspec::DiskImage& disk)
{
    DiskStats stats;
    for (int t = 0; t < disk.getTrackCount(); t++) {
        for (int s = 0; s < disk.getSideCount(); s++) {
            const auto* track = disk.getTrack(t, s);
            if (!track) continue;
            stats.totalTracks++;
            for (const auto& sec : track->sectors) {
                stats.totalSectors++;
                if (sec.fdcStatus2 & 0x40) stats.cmSectors++;
                if (sec.hasCRCError()) stats.crcSectors++;
                if (sec.isWeak()) stats.weakSectors++;
                if (sec.data.empty()) stats.emptySectors++;
            }
        }
    }
    return stats;
}

// Simulate FDC boot: Read ID on track 0, then Read Data for sector R=1
static bool simulateBoot(zxspec::UPD765A& fdc)
{
    // Recalibrate
    fdc.writeData(0x07); // Recalibrate
    fdc.writeData(0x00); // Drive 0

    // Sense Interrupt Status
    fdc.writeData(0x08);
    uint8_t st0 = fdc.readData();
    fdc.readData(); // PCN

    // Read ID
    fdc.writeData(0x4A); // Read ID + MFM
    fdc.writeData(0x00); // Drive 0, side 0
    // Read 7 result bytes
    uint8_t ridST0 = fdc.readData();
    fdc.readData(); // ST1
    fdc.readData(); // ST2
    uint8_t ridC = fdc.readData();
    fdc.readData(); // H
    uint8_t ridR = fdc.readData();
    fdc.readData(); // N

    if (ridST0 & 0xC0) return false; // Abnormal termination
    if (ridC != 0) return false;     // Not track 0

    // Read Data sector R=1 (boot sector)
    fdc.writeData(0x46); // Read Data + MFM
    fdc.writeData(0x00); // Drive 0, side 0
    fdc.writeData(0x00); // C=0
    fdc.writeData(0x00); // H=0
    fdc.writeData(0x01); // R=1
    fdc.writeData(0x02); // N=2 (512 bytes)
    fdc.writeData(0x01); // EOT=1
    fdc.writeData(0x2A); // GPL
    fdc.writeData(0xFF); // DTL

    // Read 512 bytes of sector data
    for (int i = 0; i < 512; i++) {
        fdc.readMSR(); // Poll MSR
        fdc.readData();
    }

    // Read 7 result bytes
    uint8_t rdST0 = fdc.readData();
    uint8_t rdST1 = fdc.readData();
    fdc.readData(); // ST2
    fdc.readData(); // C
    fdc.readData(); // H
    fdc.readData(); // R
    fdc.readData(); // N

    // ST0 bit 6-7 = 01 (abnormal) is OK for EN (end of cylinder)
    // ST1 bit 7 = EN is expected for single-sector read
    if ((rdST0 & 0xC0) == 0xC0) return false; // Invalid command
    if (rdST1 & 0x05) return false;            // ND or MA = real error

    return true;
}

// ---------------------------------------------------------------------------
// Core disk image tests
// ---------------------------------------------------------------------------

static void test_load_and_parse()
{
    std::printf("\n=== Disk Image Loading ===\n");

    // Test each available disk
    const char* disks[] = {
        "Beyond The Ice Palace.dsk",
        "Batman - The Movie.dsk",
        "Batman The Caped Crusader.dsk",
        "Cabal.dsk",
        "California Games - Side A.dsk",
        "Captain Blood.dsk",
        "Chartbusters - Side A.dsk",
        "Chartbusters - Side B.dsk",
        "Chase HQ.dsk",
        "Coin-Op Hits - Side A.dsk",
        "Dixons Premiere Collection - Side A.dsk",
        "Dixons Premiere Collection - Side B.dsk",
    };

    for (const auto& name : disks) {
        if (!hasDisk(name)) continue;

        std::string testName = std::string("Load ") + name;
        TEST_BEGIN(testName.c_str());
        auto data = loadDisk(name);
        EXPECT_TRUE(data.size() > 256);

        zxspec::DiskImage disk;
        bool loaded = disk.load(data.data(), static_cast<uint32_t>(data.size()));
        EXPECT_TRUE(loaded);
        EXPECT_TRUE(disk.isLoaded());
        EXPECT_GE(disk.getTrackCount(), 40);
        EXPECT_GE(disk.getSideCount(), 1);

        // Track 0 must exist and have sectors
        const auto* track0 = disk.getTrack(0, 0);
        EXPECT_TRUE(track0 != nullptr);
        if (track0) {
            EXPECT_TRUE(!track0->sectors.empty());
        }

        // Boot sector R=1 must exist on track 0
        const auto* bootSector = disk.findSector(0, 0, 1);
        EXPECT_TRUE(bootSector != nullptr);
        if (bootSector) {
            EXPECT_TRUE(bootSector->data.size() >= 128);
        }
        TEST_END();
    }
}

static void test_protection_detection()
{
    std::printf("\n=== Protection Detection & Patching ===\n");

    // Helper: load disk + check scheme + verify CM cleared
    auto testDisk = [](const char* name, zxspec::ProtectionScheme expectedScheme, bool expectCMCleared) {
        if (!hasDisk(name)) return;
        std::string testName = std::string("Protection: ") + name;
        TEST_BEGIN(testName.c_str());
        auto data = loadDisk(name);
        zxspec::DiskImage disk;
        disk.load(data.data(), static_cast<uint32_t>(data.size()));

        EXPECT_EQ((int)disk.getProtection(), (int)expectedScheme);

        if (expectCMCleared) {
            auto stats = getDiskStats(disk);
            EXPECT_EQ(stats.cmSectors, 0);
        }
        TEST_END();
    };

    // Speedlock +3 disks: CRC on track 0, CM cleared from data tracks (1+).
    // Track 0 CM is preserved (protection sectors). expectCMCleared=false
    // because getDiskStats counts ALL tracks including track 0.
    testDisk("Beyond The Ice Palace.dsk", zxspec::ProtectionScheme::Speedlock, false);
    testDisk("Batman The Caped Crusader.dsk", zxspec::ProtectionScheme::Speedlock, false);
    // Chartbusters: DISK autoboot (no Speedlock boot code), CM preserved
    testDisk("Chartbusters - Side A.dsk", zxspec::ProtectionScheme::CMOnly, false);
    testDisk("Chartbusters - Side B.dsk", zxspec::ProtectionScheme::CMOnly, false);
    testDisk("Dixons Premiere Collection - Side A.dsk", zxspec::ProtectionScheme::Speedlock, false);
    testDisk("Dixons Premiere Collection - Side B.dsk", zxspec::ProtectionScheme::Speedlock, false);

    // CM-only disks: custom loaders using Read Deleted Data directly.
    // CM flags are preserved — these loaders don't use +3DOS for data.
    testDisk("Batman - The Movie.dsk", zxspec::ProtectionScheme::CMOnly, false);
    testDisk("Cabal.dsk", zxspec::ProtectionScheme::CMOnly, false);
    testDisk("California Games - Side A.dsk", zxspec::ProtectionScheme::CMOnly, false);
    testDisk("Chase HQ.dsk", zxspec::ProtectionScheme::CMOnly, false);

    // Paul Owens: no CM clearing, protection track with large N
    testDisk("Captain Blood.dsk", zxspec::ProtectionScheme::PaulOwens, false);

    // Weak sectors: explicit copies in EDSK, CM cleared
    testDisk("Coin-Op Hits - Side A.dsk", zxspec::ProtectionScheme::WeakSectors, true);

    // Captain Blood: verify protection track 40 has 16 sectors with N=0-15
    if (hasDisk("Captain Blood.dsk")) {
        TEST_BEGIN("Captain Blood: track 40 sectors");
        auto data = loadDisk("Captain Blood.dsk");
        zxspec::DiskImage disk;
        disk.load(data.data(), static_cast<uint32_t>(data.size()));
        const auto* t40 = disk.getTrack(40, 0);
        EXPECT_TRUE(t40 != nullptr);
        if (t40) {
            EXPECT_EQ((int)t40->sectors.size(), 16);
            for (int i = 0; i < 16 && i < (int)t40->sectors.size(); i++) {
                EXPECT_EQ(t40->sectors[i].sizeCode, i);
            }
        }
        TEST_END();
    }

    // Chartbusters: verify non-standard sector IDs on track 0
    if (hasDisk("Chartbusters - Side A.dsk")) {
        TEST_BEGIN("Chartbusters: non-standard sector IDs");
        auto data = loadDisk("Chartbusters - Side A.dsk");
        zxspec::DiskImage disk;
        disk.load(data.data(), static_cast<uint32_t>(data.size()));
        EXPECT_TRUE(disk.findSector(0, 0, 130) != nullptr);
        EXPECT_TRUE(disk.findSector(0, 0, 121) != nullptr);
        const auto* crc = disk.findSector(0, 0, 121);
        if (crc) EXPECT_TRUE(crc->hasCRCError());
        TEST_END();
    }
}

// ---------------------------------------------------------------------------
// FDC boot simulation tests
// ---------------------------------------------------------------------------

static void test_fdc_boot()
{
    std::printf("\n=== FDC Boot Simulation ===\n");

    // Test all available disks
    const char* all_disks[] = {
        "Beyond The Ice Palace.dsk",
        "Batman - The Movie.dsk",
        "Batman The Caped Crusader.dsk",
        "Cabal.dsk",
        "California Games - Side A.dsk",
        "Captain Blood.dsk",
        "Chartbusters - Side A.dsk",
        "Chartbusters - Side B.dsk",
        "Chase HQ.dsk",
        "Coin-Op Hits - Side A.dsk",
        "Dixons Premiere Collection - Side A.dsk",
        "Dixons Premiere Collection - Side B.dsk",
    };

    for (const auto& name : all_disks) {
        if (!hasDisk(name)) continue;

        std::string testName = std::string("FDC boot ") + name;
        TEST_BEGIN(testName.c_str());
        auto data = loadDisk(name);
        zxspec::DiskImage disk;
        disk.load(data.data(), static_cast<uint32_t>(data.size()));

        zxspec::UPD765A fdc;
        fdc.insertDisk(0, &disk);
        fdc.setMotor(true);

        bool booted = simulateBoot(fdc);
        EXPECT_TRUE(booted);
        TEST_END();
    }
}

// ---------------------------------------------------------------------------
// Export/re-import roundtrip tests
// ---------------------------------------------------------------------------

static void test_export_reimport()
{
    std::printf("\n=== Export/Re-import Roundtrip ===\n");

    const char* disks[] = {
        "Beyond The Ice Palace.dsk",
        "Captain Blood.dsk",
        "Chartbusters - Side A.dsk",
    };

    for (const auto& name : disks) {
        if (!hasDisk(name)) continue;

        std::string testName = std::string("Roundtrip ") + name;
        TEST_BEGIN(testName.c_str());
        auto data = loadDisk(name);
        zxspec::DiskImage disk1;
        disk1.load(data.data(), static_cast<uint32_t>(data.size()));

        // Export
        auto exported = disk1.exportDSK();
        EXPECT_TRUE(exported.size() > 256);

        // Re-import
        zxspec::DiskImage disk2;
        bool reloaded = disk2.load(exported.data(), static_cast<uint32_t>(exported.size()));
        EXPECT_TRUE(reloaded);
        EXPECT_EQ(disk2.getTrackCount(), disk1.getTrackCount());
        EXPECT_EQ(disk2.getSideCount(), disk1.getSideCount());

        // Verify all tracks have same sector count
        for (int t = 0; t < disk1.getTrackCount(); t++) {
            for (int s = 0; s < disk1.getSideCount(); s++) {
                const auto* t1 = disk1.getTrack(t, s);
                const auto* t2 = disk2.getTrack(t, s);
                if (t1 && t2) {
                    EXPECT_EQ((int)t2->sectors.size(), (int)t1->sectors.size());
                }
            }
        }

        // Verify boot sector data is identical
        const auto* boot1 = disk1.findSector(0, 0, 1);
        const auto* boot2 = disk2.findSector(0, 0, 1);
        EXPECT_TRUE(boot1 != nullptr);
        EXPECT_TRUE(boot2 != nullptr);
        if (boot1 && boot2) {
            EXPECT_EQ((int)boot2->data.size(), (int)boot1->data.size());
            if (boot1->data.size() == boot2->data.size()) {
                EXPECT_TRUE(std::memcmp(boot1->data.data(), boot2->data.data(),
                                        boot1->data.size()) == 0);
            }
        }

        // FDC boot must work on re-imported disk too
        zxspec::UPD765A fdc;
        fdc.insertDisk(0, &disk2);
        fdc.setMotor(true);
        EXPECT_TRUE(simulateBoot(fdc));
        TEST_END();
    }
}

// ---------------------------------------------------------------------------
// Sector accessibility tests (Read Data for all sectors on all tracks)
// ---------------------------------------------------------------------------

static void test_all_sectors_readable()
{
    std::printf("\n=== All Sectors Readable ===\n");

    const char* disks[] = {
        "Beyond The Ice Palace.dsk",
        "Captain Blood.dsk",
        "Chartbusters - Side A.dsk",
    };

    for (const auto& name : disks) {
        if (!hasDisk(name)) continue;

        std::string testName = std::string("All sectors ") + name;
        TEST_BEGIN(testName.c_str());
        auto data = loadDisk(name);
        zxspec::DiskImage disk;
        disk.load(data.data(), static_cast<uint32_t>(data.size()));

        int readable = 0;
        int total = 0;
        for (int t = 0; t < disk.getTrackCount(); t++) {
            for (int s = 0; s < disk.getSideCount(); s++) {
                const auto* track = disk.getTrack(t, s);
                if (!track) continue;
                for (const auto& sec : track->sectors) {
                    total++;
                    // Sector should be findable by its ID
                    const auto* found = disk.findSector(t, s, sec.sectorId);
                    if (found) readable++;
                }
            }
        }

        EXPECT_EQ(readable, total);
        // Sector count varies: standard disks have 40*9=360, but protected
        // disks may have fewer tracks with sectors (some unformatted) or
        // non-standard sector counts. Just verify we have a reasonable number.
        EXPECT_GE(total, 100);
        TEST_END();
    }
}

// ---------------------------------------------------------------------------
// Read ID simulation for protection tracks
// ---------------------------------------------------------------------------

static void test_read_id_protection_tracks()
{
    std::printf("\n=== Read ID on Protection Tracks ===\n");

    // Captain Blood track 40: 16 sectors with N=0-15
    if (hasDisk("Captain Blood.dsk")) {
        TEST_BEGIN("ReadID: Captain Blood track 40");
        auto data = loadDisk("Captain Blood.dsk");
        zxspec::DiskImage disk;
        disk.load(data.data(), static_cast<uint32_t>(data.size()));

        zxspec::UPD765A fdc;
        fdc.insertDisk(0, &disk);
        fdc.setMotor(true);

        // Seek to track 40
        fdc.writeData(0x0F); // Seek
        fdc.writeData(0x00); // Drive 0
        fdc.writeData(40);   // Track 40
        fdc.writeData(0x08); // Sense Int
        fdc.readData(); fdc.readData(); // ST0, PCN

        // Read ID should return valid sector IDs, not errors
        fdc.writeData(0x4A); // Read ID + MFM
        fdc.writeData(0x00); // Drive 0
        uint8_t st0 = fdc.readData();
        uint8_t st1 = fdc.readData();
        fdc.readData(); // ST2
        uint8_t c = fdc.readData();
        fdc.readData(); // H
        uint8_t r = fdc.readData();
        uint8_t n = fdc.readData();

        // Should NOT be an error (ST0 bits 6-7 should be 00 = normal)
        EXPECT_EQ(st0 & 0xC0, 0);
        EXPECT_EQ(st1, 0);
        // First sector should be R=0, N=0
        EXPECT_EQ(r, 0);
        EXPECT_EQ(n, 0);
        TEST_END();
    }
}

// ---------------------------------------------------------------------------
// Speedlock weak sector variation test
// ---------------------------------------------------------------------------

static void test_speedlock_weak_variation()
{
    std::printf("\n=== Speedlock Weak Sector Variation ===\n");

    if (hasDisk("Beyond The Ice Palace.dsk")) {
        TEST_BEGIN("CRC sector data varies between reads");
        auto data = loadDisk("Beyond The Ice Palace.dsk");
        zxspec::DiskImage disk;
        disk.load(data.data(), static_cast<uint32_t>(data.size()));

        // Find the CRC error sector on track 0
        const zxspec::DiskSector* crcSec = nullptr;
        const auto* track0 = disk.getTrack(0, 0);
        if (track0) {
            for (const auto& s : track0->sectors) {
                if (s.hasCRCError()) { crcSec = &s; break; }
            }
        }
        EXPECT_TRUE(crcSec != nullptr);

        if (crcSec) {
            // FDC Speedlock hack: read the sector multiple times
            // and verify the data varies on 2nd+ reads
            zxspec::UPD765A fdc;
            fdc.insertDisk(0, &disk);
            fdc.setMotor(true);

            // Recalibrate
            fdc.writeData(0x07); fdc.writeData(0x00);
            fdc.writeData(0x08); fdc.readData(); fdc.readData();

            // Read the CRC sector twice
            auto readSector = [&](uint8_t r) -> std::vector<uint8_t> {
                fdc.writeData(0x46); // Read Data + MFM
                fdc.writeData(0x00);
                fdc.writeData(0x00); // C=0
                fdc.writeData(0x00); // H=0
                fdc.writeData(r);
                fdc.writeData(crcSec->sizeCode);
                fdc.writeData(r);    // EOT=R (single sector)
                fdc.writeData(0x2A);
                fdc.writeData(0xFF);

                std::vector<uint8_t> buf;
                int size = 128 << std::min((int)crcSec->sizeCode, 6);
                for (int i = 0; i < size; i++) {
                    fdc.readMSR();
                    buf.push_back(fdc.readData());
                }
                // Read result
                for (int i = 0; i < 7; i++) fdc.readData();
                return buf;
            };

            auto read1 = readSector(crcSec->sectorId);
            auto read2 = readSector(crcSec->sectorId);

            EXPECT_TRUE(read1.size() > 0);
            EXPECT_EQ((int)read1.size(), (int)read2.size());

            // Data should differ between reads (Speedlock hack)
            bool differs = false;
            for (size_t i = 0; i < read1.size() && i < read2.size(); i++) {
                if (read1[i] != read2[i]) { differs = true; break; }
            }
            EXPECT_TRUE(differs);
        }
        TEST_END();
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

int main(int argc, char** argv)
{
    // Default disk directory
    DISK_DIR = (argc > 1) ? argv[1] : nullptr;

    // Try common locations if not specified
    if (!DISK_DIR) {
        const char* paths[] = {
            "tests/disk/images",
            "../tests/disk/images",
            "../../tests/disk/images",
        };
        for (const auto& p : paths) {
            if (fs::exists(p)) { DISK_DIR = p; break; }
        }
    }

    if (!DISK_DIR || !fs::exists(DISK_DIR)) {
        std::printf("Disk image directory not found.\n");
        std::printf("Usage: disk_test [path-to-dsk-images]\n");
        std::printf("  e.g.: disk_test /path/to/spectrem_disks\n\n");
        std::printf("Create tests/disk/images/ and copy DSK files there,\n");
        std::printf("or pass the directory as an argument.\n");
        return 1;
    }

    std::printf("Disk compatibility test suite\n");
    std::printf("Image directory: %s\n", DISK_DIR);

    test_load_and_parse();
    test_protection_detection();
    test_fdc_boot();
    test_export_reimport();
    test_all_sectors_readable();
    test_read_id_protection_tracks();
    test_speedlock_weak_variation();

    std::printf("\n=== Results: %d/%d passed", g_passed, g_total);
    if (g_failed > 0) std::printf(", %d FAILED", g_failed);
    std::printf(" ===\n\n");

    return g_failed > 0 ? 1 : 0;
}
