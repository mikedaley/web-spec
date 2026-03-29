/*
 * zip.js - Minimal ZIP file create/extract for save state import/export
 *
 * Creates and reads ZIP files with STORE (uncompressed) entries.
 * No external dependencies — just the raw ZIP format.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// ── CRC-32 lookup table ─────────────────────────────────────────────────────

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Helper: write little-endian values into a DataView ───────────────────────

function writeU16(view, offset, val) { view.setUint16(offset, val, true); }
function writeU32(view, offset, val) { view.setUint32(offset, val, true); }

// ── Create a ZIP file from an array of { name, data } entries ────────────────
// Each entry: { name: string, data: Uint8Array }
// Returns: Uint8Array (the complete ZIP file)

export function createZip(entries) {
  const localHeaders = [];
  const fileDataBlocks = [];
  let offset = 0;

  // Build local file headers + data
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const headerSize = 30 + nameBytes.length;
    const header = new ArrayBuffer(headerSize);
    const hv = new DataView(header);

    writeU32(hv, 0, 0x04034B50);    // Local file header signature
    writeU16(hv, 4, 20);             // Version needed (2.0)
    writeU16(hv, 6, 0);              // Flags
    writeU16(hv, 8, 0);              // Compression: STORE
    writeU16(hv, 10, 0);             // Mod time
    writeU16(hv, 12, 0);             // Mod date
    writeU32(hv, 14, crc);           // CRC-32
    writeU32(hv, 18, entry.data.length); // Compressed size
    writeU32(hv, 22, entry.data.length); // Uncompressed size
    writeU16(hv, 26, nameBytes.length);  // Filename length
    writeU16(hv, 28, 0);             // Extra field length

    new Uint8Array(header, 30).set(nameBytes);

    localHeaders.push({ offset, nameBytes, crc, size: entry.data.length });
    fileDataBlocks.push(new Uint8Array(header), entry.data);
    offset += headerSize + entry.data.length;
  }

  // Build central directory
  const cdStart = offset;
  const cdEntries = [];

  for (let i = 0; i < entries.length; i++) {
    const { nameBytes, crc, size, offset: localOffset } = localHeaders[i];
    const cdSize = 46 + nameBytes.length;
    const cd = new ArrayBuffer(cdSize);
    const cv = new DataView(cd);

    writeU32(cv, 0, 0x02014B50);     // Central directory signature
    writeU16(cv, 4, 20);              // Version made by
    writeU16(cv, 6, 20);              // Version needed
    writeU16(cv, 8, 0);               // Flags
    writeU16(cv, 10, 0);              // Compression: STORE
    writeU16(cv, 12, 0);              // Mod time
    writeU16(cv, 14, 0);              // Mod date
    writeU32(cv, 16, crc);            // CRC-32
    writeU32(cv, 20, size);           // Compressed size
    writeU32(cv, 24, size);           // Uncompressed size
    writeU16(cv, 28, nameBytes.length); // Filename length
    writeU16(cv, 30, 0);              // Extra field length
    writeU16(cv, 32, 0);              // Comment length
    writeU16(cv, 34, 0);              // Disk number start
    writeU16(cv, 36, 0);              // Internal attributes
    writeU32(cv, 38, 0);              // External attributes
    writeU32(cv, 42, localOffset);    // Local header offset

    new Uint8Array(cd, 46).set(nameBytes);
    cdEntries.push(new Uint8Array(cd));
    offset += cdSize;
  }

  // End of central directory
  const cdEnd = offset;
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);

  writeU32(ev, 0, 0x06054B50);        // EOCD signature
  writeU16(ev, 4, 0);                  // Disk number
  writeU16(ev, 6, 0);                  // CD start disk
  writeU16(ev, 8, entries.length);      // CD entries on this disk
  writeU16(ev, 10, entries.length);     // Total CD entries
  writeU32(ev, 12, cdEnd - cdStart);    // CD size
  writeU32(ev, 16, cdStart);           // CD offset
  writeU16(ev, 20, 0);                 // Comment length

  // Concatenate everything
  const totalSize = offset + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (const block of fileDataBlocks) {
    result.set(block, pos);
    pos += block.length;
  }
  for (const cd of cdEntries) {
    result.set(cd, pos);
    pos += cd.length;
  }
  result.set(new Uint8Array(eocd), pos);

  return result;
}

// ── Extract files from a ZIP buffer ──────────────────────────────────────────
// Input: Uint8Array (ZIP file data)
// Returns: Array of { name: string, data: Uint8Array }

export function extractZip(zipData) {
  const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
  const entries = [];

  // Find End of Central Directory (scan backwards)
  let eocdOffset = -1;
  for (let i = zipData.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054B50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Not a valid ZIP file");

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdCount = view.getUint16(eocdOffset + 10, true);

  // Read central directory entries
  let pos = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (view.getUint32(pos, true) !== 0x02014B50) break;

    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(zipData.slice(pos + 46, pos + 46 + nameLen));

    // Read from local file header to get the actual data
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataSize = view.getUint32(localOffset + 18, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = zipData.slice(dataStart, dataStart + dataSize);

    entries.push({ name, data: new Uint8Array(data) });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}
