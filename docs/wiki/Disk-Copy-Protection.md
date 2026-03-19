# Disk Copy Protection

How the emulator handles copy-protected ZX Spectrum +3 disk images.

## Design Principle

Disk images are **never modified** at load time. All protection handling happens at FDC runtime through correct µPD765A behaviour. The disk data in memory always matches the original EDSK file, which simplifies debugging, export/re-import round-trips, and ensures no patching decision can silently corrupt a disk.

Detection runs at load time purely for informational purposes (Disk Explorer display, console logging).

## Protection Schemes

### Speedlock +3

The most common +3 protection. Uses two mechanisms:

**CRC error sector on track 0** — A deliberately corrupted sector (typically R=2) that the Speedlock boot code reads multiple times. On real hardware, each read returns different data because the CRC error correction fails non-deterministically. The boot code compares reads and verifies the data differs — if identical, the disk is a copy.

**CM (Control Mark / deleted data) flags on data tracks** — Sectors on tracks 1+ are written with deleted data address marks. The Speedlock boot code reads these sectors using Read Data with SK=0 (single-sector reads, EOT=R). The µPD765A transfers the data despite the CM mismatch, sets ST2_CM in the result, and terminates after the sector. For single-sector reads this is indistinguishable from a normal completion — the loader ignores ST2_CM and gets its data.

**Known Speedlock disks:**

| Disk | CRC sectors | CM sectors | Tracks with CM |
|------|------------|------------|----------------|
| Beyond The Ice Palace | 2 | 53 | 0–10 |
| Batman Caped Crusader | 1 | 99 | 0–21 |
| Dixons Premiere A | 1 | 187 | 0–37 |
| Dixons Premiere B | 2 | 171 | 0–33 |
| Chartbusters A/B | 1 | 325 | 3–39 |
| Dragon Ninja | 1 | 117 | 3–41 |

**Detection criteria:** CRC error sector on track 0 AND more than 5 CM-flagged sectors on tracks 1+.

### CM-Only

Custom loaders that use Read Deleted Data directly for all disk I/O, without going through +3DOS. The sectors have CM flags (deleted data marks) which **match** the Read Deleted Data command, so data transfers normally with no mismatch.

No special FDC handling is needed — the standard µPD765A CM logic works correctly because the command type matches the sector type.

**Known CM-Only disks:**

| Disk | CM sectors | Tracks with CM |
|------|------------|----------------|
| Batman The Movie | 55 | 3–39 |
| Cabal | 83 | 3–39 |
| Chase HQ | 249 | 3–39 |
| California Games A | 28 | 34–37 |

**Detection criteria:** More than 5 CM-flagged sectors on tracks 1+, no CRC error sectors on track 0.

### Paul Owens

Uses a protection track (typically track 40) with sectors that have non-standard size codes (N >= 7). The loader issues Read ID commands on the protection track and verifies the returned N values match expected values. The µPD765A's Read ID naturally returns the correct C/H/R/N from the sector ID fields, so no special handling is needed.

**Known disk:** Captain Blood (track 40 has 16 sectors with N=0 through N=15).

**Detection criteria:** Any sector with size code N >= 7.

### Weak Sectors

EDSK disk images that store multiple copies of the same sector's data. Each copy has slightly different content, representing the non-deterministic reads that occur on real hardware with deliberately corrupted sectors. The FDC cycles through copies on each read via `DiskSector::getReadData()`.

**Known disk:** Coin-Op Hits A (40 weak sectors, 40 CM sectors, tracks 1–40).

**Detection criteria:** Any EDSK sector where the actual stored data size is a multiple of the declared sector size (128 << N), indicating multiple copies.

## FDC Runtime Handling

### CM / SK Mismatch Logic

The µPD765A has two read commands that interact with the sector's data address mark:

- **Read Data** expects normal data marks. Hitting a sector with a deleted mark (CM) is a mismatch.
- **Read Deleted Data** expects deleted marks. Hitting a normal sector is a mismatch.

The **SK (Skip)** bit in the command byte controls what happens on a mismatch:

| SK | Mismatch action |
|----|-----------------|
| SK=0 | Data is transferred. ST2_CM is set. Command terminates after this sector. |
| SK=1 | Sector is skipped entirely (no data transferred). FDC advances to the next sector. |

**Result status for CM termination:**
- Single-sector read (EOT=R): ST0=0 (normal), ST2=CM. The loader sees a successful read.
- Multi-sector read (EOT>R): ST0=Abnormal, ST2=CM. Indicates the transfer was cut short.

This standard behaviour handles all protection schemes without any special cases:

- **Speedlock** boot code uses Read Data + SK=0 for single-sector reads on CM tracks. Data transfers, ST2_CM is set but ignored by the loader.
- **CM-Only** loaders use Read Deleted Data on CM sectors. The marks match, so there is no mismatch at all.
- **+3DOS** uses Read Data + SK=1. CM sectors are skipped, non-CM sectors are read normally.

### CRC Error Reporting

Sectors with CRC error flags in the EDSK (ST1 bit 5 set) are reported to the CPU via:
- ST1_DE (Data Error) — bit 5 of ST1
- ST2_DD (Data Error in Data Field) — bit 5 of ST2

The data is still transferred; only the status flags indicate the error. Speedlock checks these flags as part of its protection verification.

### Speedlock Weak Sector Simulation

Many EDSK disk images store CRC error sectors with the error flags but without explicit weak copies (multiple data copies). On real hardware, every read of such a sector returns different data. The FDC includes a targeted simulation for this:

**Detection:** The FDC monitors Read Data commands. When it detects repeated single-sector reads of sector R=2 on track 0, head 0 (the standard Speedlock CRC sector location), it activates data corruption.

**Corruption:** During byte-by-byte data transfer, every 29th byte is XORed with its offset within the sector. This produces different data on each read, satisfying the Speedlock protection check. A variant is detected when the first 64 bytes are not all 0xE5, triggering more aggressive corruption across the entire sector.

**Guard:** The simulation only activates when the disk has no explicit weak sector data in the EDSK image. Disks with genuine weak copies use the copy-cycling mechanism in `DiskSector::getReadData()` instead.

### Overrun Detection

The FDC tracks consecutive MSR (Main Status Register) reads without a corresponding data read during the execution phase. After 8 consecutive polls, an overrun is triggered:
- ST0 = Abnormal termination
- ST1 = OR (Overrun) combined with any existing flags (e.g., ST1_DE for CRC errors)

Speedlock exploits this by reading fewer bytes than the sector contains, then polling the MSR until overrun occurs. The combined ST1_DE + ST1_OR result confirms a genuine CRC error sector (not a copy).

### Weak Sector Cycling

For EDSK sectors with multiple data copies, `DiskSector::getReadData()` cycles through copies using a per-sector read counter:

```
copy_index = readCount % number_of_copies
```

Each call returns the next copy and increments the counter. This produces the non-deterministic read pattern that copy protection code expects.

## Source Files

| File | Purpose |
|------|---------|
| `src/machines/fdc/copy_protection.cpp` | Detection logic (`detectProtection()`) and boot signature checking |
| `src/machines/fdc/copy_protection.hpp` | Protection scheme enum and function declarations |
| `src/machines/fdc/upd765a.cpp` | µPD765A FDC emulation — CM/SK logic, CRC reporting, Speedlock simulation, overrun detection |
| `src/machines/fdc/disk_image.cpp` | EDSK parsing, weak copy detection, `getReadData()` cycling |
| `tests/disk/disk_test.cpp` | Compatibility test suite covering all protected disk images |

## Test Coverage

The disk compatibility test suite (`tests/disk/disk_test.cpp`) validates:

1. **Loading** — All protected disk images parse correctly
2. **Detection** — Each disk is classified with the correct protection scheme
3. **FDC boot simulation** — Recalibrate, Seek, Read ID, Read Data sequence succeeds for the boot sector on every disk
4. **Sector accessibility** — All sectors are findable by ID on representative disks
5. **Export/re-import** — DSK round-trip preserves track counts, sector counts, and boot capability
6. **Read ID on protection tracks** — Captain Blood's track 40 returns correct N values
7. **CRC sector variation** — Beyond The Ice Palace's CRC sector returns different data on repeated reads
8. **Read Deleted Data** — Dragon Ninja's track 0 sectors R=3–R=8 transfer correctly via Read Deleted Data
