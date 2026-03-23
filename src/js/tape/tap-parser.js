/*
 * tap-parser.js - TAP format parser/assembler utility module
 *
 * Pure JavaScript TAP file handling: parse raw bytes into structured blocks,
 * assemble blocks back into TAP binary format, checksum computation, and
 * header field encoding/decoding.
 *
 * TAP format: repeating [2-byte LE length][flag byte][payload][checksum byte]
 */

/** Header type constants */
export const HEADER_PROGRAM = 0;
export const HEADER_NUM_ARRAY = 1;
export const HEADER_CHAR_ARRAY = 2;
export const HEADER_CODE = 3;

/** Flag byte constants */
export const FLAG_HEADER = 0x00;
export const FLAG_DATA = 0xff;

/** Header type display names */
export const HEADER_TYPE_NAMES = ["Program", "Num Array", "Char Array", "Code"];

/**
 * Compute XOR checksum for flag + payload bytes.
 * @param {number} flag - Flag byte (0x00 or 0xFF)
 * @param {Uint8Array} payload - Payload bytes
 * @returns {number} XOR checksum
 */
export function computeChecksum(flag, payload) {
  let cs = flag;
  for (let i = 0; i < payload.length; i++) {
    cs ^= payload[i];
  }
  return cs & 0xff;
}

/**
 * Decode a 17-byte header payload into its constituent fields.
 * @param {Uint8Array} payload - 17-byte header payload
 * @returns {{ headerType: number, filename: string, dataLength: number, param1: number, param2: number }}
 */
export function decodeHeaderPayload(payload) {
  const headerType = payload[0];
  let filename = "";
  for (let i = 1; i <= 10; i++) {
    filename += String.fromCharCode(payload[i]);
  }
  const dataLength = payload[11] | (payload[12] << 8);
  const param1 = payload[13] | (payload[14] << 8);
  const param2 = payload[15] | (payload[16] << 8);
  return { headerType, filename, dataLength, param1, param2 };
}

/**
 * Encode header fields into a 17-byte payload.
 * @param {number} headerType - 0=Program, 1=NumArray, 2=CharArray, 3=Code
 * @param {string} filename - Up to 10 characters (padded with spaces)
 * @param {number} dataLength - Data length in bytes
 * @param {number} param1 - Autostart line (Program) or start address (Code)
 * @param {number} param2 - Variable area offset (Program) or 32768 (Code)
 * @returns {Uint8Array} 17-byte header payload
 */
export function encodeHeaderPayload(headerType, filename, dataLength, param1, param2) {
  const payload = new Uint8Array(17);
  payload[0] = headerType & 0xff;
  // Pad filename to 10 chars with spaces
  const padded = (filename || "").padEnd(10, " ").substring(0, 10);
  for (let i = 0; i < 10; i++) {
    payload[1 + i] = padded.charCodeAt(i) & 0xff;
  }
  payload[11] = dataLength & 0xff;
  payload[12] = (dataLength >> 8) & 0xff;
  payload[13] = param1 & 0xff;
  payload[14] = (param1 >> 8) & 0xff;
  payload[15] = param2 & 0xff;
  payload[16] = (param2 >> 8) & 0xff;
  return payload;
}

/**
 * Parse raw TAP file bytes into an array of block objects.
 * @param {Uint8Array} data - Raw TAP file bytes
 * @returns {Array<Object>} Array of block objects
 */
export function parseTAP(data) {
  const blocks = [];
  let offset = 0;

  while (offset + 2 <= data.length) {
    const blockLength = data[offset] | (data[offset + 1] << 8);
    offset += 2;

    if (blockLength === 0 || offset + blockLength > data.length) {
      break;
    }

    const flag = data[offset];
    const checksum = data[offset + blockLength - 1];
    const payload = data.slice(offset + 1, offset + blockLength - 1);

    const expectedChecksum = computeChecksum(flag, payload);
    const checksumValid = checksum === expectedChecksum;

    const block = {
      flag,
      payload: new Uint8Array(payload),
      checksum,
      checksumValid,
    };

    // If it's a header block with exactly 17 bytes of payload, decode the header fields
    if (flag === FLAG_HEADER && payload.length === 17) {
      const header = decodeHeaderPayload(payload);
      block.headerType = header.headerType;
      block.filename = header.filename;
      block.dataLength = header.dataLength;
      block.param1 = header.param1;
      block.param2 = header.param2;
    }

    blocks.push(block);
    offset += blockLength;
  }

  return blocks;
}

/**
 * Assemble an array of block objects back into raw TAP file bytes.
 * @param {Array<Object>} blocks - Array of block objects
 * @returns {Uint8Array} Raw TAP file bytes
 */
export function assembleTAP(blocks) {
  // Calculate total size: 2 bytes length + flag + payload + checksum per block
  let totalSize = 0;
  for (const block of blocks) {
    totalSize += 2 + 1 + block.payload.length + 1; // length word + flag + payload + checksum
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (const block of blocks) {
    const blockDataLength = 1 + block.payload.length + 1; // flag + payload + checksum

    // 2-byte LE length
    result[offset] = blockDataLength & 0xff;
    result[offset + 1] = (blockDataLength >> 8) & 0xff;
    offset += 2;

    // Flag byte
    result[offset] = block.flag;
    offset += 1;

    // Payload
    result.set(block.payload, offset);
    offset += block.payload.length;

    // Checksum
    result[offset] = block.checksum;
    offset += 1;
  }

  return result;
}

/**
 * Recalculate and fix the checksum for a block.
 * @param {Object} block - Block object to fix
 */
export function recalcChecksum(block) {
  block.checksum = computeChecksum(block.flag, block.payload);
  block.checksumValid = true;
}

/**
 * Update a header block's payload from its decoded fields.
 * Call this after modifying headerType, filename, dataLength, param1, or param2.
 * @param {Object} block - Header block to update
 */
export function updateHeaderPayload(block) {
  if (block.flag !== FLAG_HEADER || block.payload.length !== 17) return;
  block.payload = encodeHeaderPayload(
    block.headerType,
    block.filename,
    block.dataLength,
    block.param1,
    block.param2,
  );
  recalcChecksum(block);
}

/**
 * Create a new header block with sensible defaults.
 * @param {number} headerType - 0=Program, 1=NumArray, 2=CharArray, 3=Code
 * @param {string} filename - Up to 10 characters
 * @param {number} dataLength - Data length in bytes
 * @param {number} [param1=0] - Autostart line or start address
 * @param {number} [param2=32768] - Variable offset or 32768
 * @returns {Object} New header block
 */
export function createHeaderBlock(headerType, filename, dataLength, param1 = 0, param2 = 32768) {
  const payload = encodeHeaderPayload(headerType, filename, dataLength, param1, param2);
  const flag = FLAG_HEADER;
  const checksum = computeChecksum(flag, payload);

  return {
    flag,
    payload,
    checksum,
    checksumValid: true,
    headerType,
    filename: (filename || "").padEnd(10, " ").substring(0, 10),
    dataLength,
    param1,
    param2,
  };
}

/**
 * Create a new data block from payload bytes.
 * @param {Uint8Array} payload - Data payload bytes
 * @returns {Object} New data block
 */
export function createDataBlock(payload) {
  const flag = FLAG_DATA;
  const p = new Uint8Array(payload);
  const checksum = computeChecksum(flag, p);

  return {
    flag,
    payload: p,
    checksum,
    checksumValid: true,
  };
}

/**
 * Check if a block is a header block with decoded fields.
 * @param {Object} block
 * @returns {boolean}
 */
export function isHeader(block) {
  return block.flag === FLAG_HEADER && block.payload.length === 17;
}

/**
 * Get a human-readable description of a block.
 * @param {Object} block
 * @param {number} index - Block index in the list
 * @returns {{ badge: string, name: string, size: string, typeName: string }}
 */
export function describeBlock(block) {
  if (isHeader(block)) {
    const typeName = HEADER_TYPE_NAMES[block.headerType] || "Unknown";
    return {
      badge: "HDR",
      name: `${typeName}: "${block.filename}"`,
      size: `${block.dataLength}b`,
      typeName,
    };
  }
  return {
    badge: "DATA",
    name: "",
    size: `${block.payload.length}b`,
    typeName: "Data",
  };
}
