/*
 * dsk-parser.js - Extended DSK / Standard DSK format parser
 *
 * Parses raw DSK disk image data into a structured object for the Disk Explorer.
 * Detects copy-protection mechanisms: weak/fuzzy sectors, CRC errors,
 * deleted data marks, and non-standard sector sizes.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const HEADER_SIZE = 256;
const TRACK_HEADER_SIZE = 256;
const SECTOR_INFO_SIZE = 8;

function sectorSize(n) {
  return 128 << Math.min(n, 6);
}

function readString(data, offset, length) {
  let s = "";
  for (let i = 0; i < length; i++) {
    const ch = data[offset + i];
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s.trim();
}

function readU16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

/**
 * Parse an Extended or Standard DSK image into structured data.
 * @param {Uint8Array} data - Raw DSK file data
 * @returns {object|null} Parsed disk info or null if invalid
 */
export function parseDSK(data) {
  if (!data || data.length < HEADER_SIZE) return null;

  const sig = readString(data, 0, 34);

  if (sig.startsWith("EXTENDED CPC DSK File")) {
    return parseExtendedDSK(data);
  }
  if (sig.startsWith("MV - CPC")) {
    return parseStandardDSK(data);
  }

  return null;
}

function parseExtendedDSK(data) {
  const creator = readString(data, 0x22, 14);
  const trackCount = data[0x30];
  const sideCount = data[0x31];

  if (trackCount === 0 || sideCount === 0) return null;

  const trackSizes = [];
  for (let i = 0; i < trackCount * sideCount; i++) {
    trackSizes.push(data[0x34 + i] * 256);
  }

  const result = {
    format: "Extended DSK",
    creator,
    trackCount,
    sideCount,
    tracks: [],
    protectionSummary: {
      weakSectors: 0,
      crcErrors: 0,
      deletedData: 0,
      sizeVariants: 0,
      totalProtected: 0,
    },
  };

  let offset = HEADER_SIZE;

  for (let idx = 0; idx < trackCount * sideCount; idx++) {
    const trackSize = trackSizes[idx];

    if (trackSize === 0) {
      // Unformatted track
      const t = Math.floor(idx / sideCount);
      const s = idx % sideCount;
      result.tracks.push({
        trackNumber: t,
        side: s,
        sectorCount: 0,
        gap3Length: 0,
        fillerByte: 0xe5,
        sectors: [],
        unformatted: true,
      });
      continue;
    }

    if (offset + TRACK_HEADER_SIZE > data.length) break;

    const trackNum = data[offset + 0x10];
    const sideNum = data[offset + 0x11];
    const defaultSizeCode = data[offset + 0x14];
    const sectorCount = Math.min(data[offset + 0x15], 29);
    const gap3 = data[offset + 0x16];
    const filler = data[offset + 0x17];

    const track = {
      trackNumber: trackNum,
      side: sideNum,
      sectorCount,
      defaultSizeCode,
      gap3Length: gap3,
      fillerByte: filler,
      sectors: [],
      unformatted: false,
    };

    // Parse sector info entries
    const sectorInfos = [];
    for (let i = 0; i < sectorCount; i++) {
      const si = offset + 0x18 + i * SECTOR_INFO_SIZE;
      if (si + SECTOR_INFO_SIZE > data.length) break;
      sectorInfos.push({
        c: data[si],
        h: data[si + 1],
        r: data[si + 2],
        n: data[si + 3],
        st1: data[si + 4],
        st2: data[si + 5],
        actualSize: readU16LE(data, si + 6),
      });
    }

    // Parse sector data
    let dataOffset = offset + TRACK_HEADER_SIZE;
    for (const si of sectorInfos) {
      const declaredSize = sectorSize(si.n);
      const actualSize = si.actualSize || declaredSize;

      const isWeak =
        actualSize > declaredSize &&
        declaredSize > 0 &&
        actualSize % declaredSize === 0;
      const weakCopyCount = isWeak ? actualSize / declaredSize : 0;
      const hasCRC = (si.st1 & 0x20) !== 0;
      const hasDeletedMark = (si.st2 & 0x40) !== 0;
      const sizeVariant = si.n !== defaultSizeCode;

      const readLen = Math.min(
        isWeak ? actualSize : declaredSize,
        data.length - dataOffset,
      );
      const sectorData =
        readLen > 0 ? data.slice(dataOffset, dataOffset + readLen) : new Uint8Array(0);

      const isProtected = isWeak || hasCRC || hasDeletedMark || sizeVariant;

      track.sectors.push({
        c: si.c,
        h: si.h,
        r: si.r,
        n: si.n,
        st1: si.st1,
        st2: si.st2,
        declaredSize,
        actualSize,
        data: sectorData,
        flags: {
          weak: isWeak,
          weakCopyCount,
          crcError: hasCRC,
          deletedData: hasDeletedMark,
          sizeVariant,
          protected: isProtected,
        },
      });

      if (isWeak) result.protectionSummary.weakSectors++;
      if (hasCRC) result.protectionSummary.crcErrors++;
      if (hasDeletedMark) result.protectionSummary.deletedData++;
      if (sizeVariant) result.protectionSummary.sizeVariants++;
      if (isProtected) result.protectionSummary.totalProtected++;

      dataOffset += actualSize;
    }

    result.tracks.push(track);
    offset += trackSize;
  }

  return result;
}

function parseStandardDSK(data) {
  const creator = readString(data, 0x22, 14);
  const trackCount = data[0x30];
  const sideCount = data[0x31];
  const trackSize = readU16LE(data, 0x32);

  if (trackCount === 0 || sideCount === 0 || trackSize === 0) return null;

  const result = {
    format: "Standard DSK",
    creator,
    trackCount,
    sideCount,
    tracks: [],
    protectionSummary: {
      weakSectors: 0,
      crcErrors: 0,
      deletedData: 0,
      sizeVariants: 0,
      totalProtected: 0,
    },
  };

  let offset = HEADER_SIZE;

  for (let idx = 0; idx < trackCount * sideCount; idx++) {
    if (offset + TRACK_HEADER_SIZE > data.length) break;

    const trackNum = data[offset + 0x10];
    const sideNum = data[offset + 0x11];
    const defaultSizeCode = data[offset + 0x14];
    const sectorCount = Math.min(data[offset + 0x15], 29);
    const gap3 = data[offset + 0x16];
    const filler = data[offset + 0x17];

    const track = {
      trackNumber: trackNum,
      side: sideNum,
      sectorCount,
      defaultSizeCode,
      gap3Length: gap3,
      fillerByte: filler,
      sectors: [],
      unformatted: sectorCount === 0,
    };

    let dataOffset = offset + TRACK_HEADER_SIZE;
    for (let i = 0; i < sectorCount; i++) {
      const si = offset + 0x18 + i * SECTOR_INFO_SIZE;
      if (si + SECTOR_INFO_SIZE > data.length) break;

      const c = data[si];
      const h = data[si + 1];
      const r = data[si + 2];
      const n = data[si + 3];
      const st1 = data[si + 4];
      const st2 = data[si + 5];
      const declaredSize = sectorSize(n);

      const hasCRC = (st1 & 0x20) !== 0;
      const hasDeletedMark = (st2 & 0x40) !== 0;
      const sizeVariant = n !== defaultSizeCode;
      const isProtected = hasCRC || hasDeletedMark || sizeVariant;

      const readLen = Math.min(declaredSize, data.length - dataOffset);
      const sectorData =
        readLen > 0 ? data.slice(dataOffset, dataOffset + readLen) : new Uint8Array(0);

      track.sectors.push({
        c,
        h,
        r,
        n,
        st1,
        st2,
        declaredSize,
        actualSize: declaredSize,
        data: sectorData,
        flags: {
          weak: false,
          weakCopyCount: 0,
          crcError: hasCRC,
          deletedData: hasDeletedMark,
          sizeVariant,
          protected: isProtected,
        },
      });

      if (hasCRC) result.protectionSummary.crcErrors++;
      if (hasDeletedMark) result.protectionSummary.deletedData++;
      if (sizeVariant) result.protectionSummary.sizeVariants++;
      if (isProtected) result.protectionSummary.totalProtected++;

      dataOffset += declaredSize;
    }

    result.tracks.push(track);
    offset += trackSize;
  }

  return result;
}
