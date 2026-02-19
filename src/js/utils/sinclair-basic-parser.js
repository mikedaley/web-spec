/*
 * sinclair-basic-parser.js - Read BASIC programs from Spectrum memory
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { TOKENS, NUMBER_MARKER, SYS } from "./sinclair-basic-tokens.js";

/**
 * Parse a Sinclair BASIC program from Spectrum memory.
 * Reads the PROG->VARS region and converts tokenized lines to text.
 */
export class SinclairBasicParser {
  /**
   * Parse the BASIC program currently in memory.
   * @param {EmulatorProxy} proxy
   * @returns {Promise<Array<{lineNumber: number, text: string}>>}
   */
  async parse(proxy) {
    // Read PROG and VARS pointers
    const ptrs = await proxy.readMemory(SYS.VARS, 2);
    const varsAddr = ptrs[0] | (ptrs[1] << 8);

    const progPtrs = await proxy.readMemory(SYS.PROG, 2);
    const progAddr = progPtrs[0] | (progPtrs[1] << 8);

    if (varsAddr <= progAddr) return [];

    const programSize = varsAddr - progAddr;
    if (programSize <= 0 || programSize > 0xFFFF) return [];

    const data = await proxy.readMemory(progAddr, programSize);
    return this.parseBytes(data);
  }

  /**
   * Parse raw BASIC program bytes into lines.
   * @param {Uint8Array} data
   * @returns {Array<{lineNumber: number, text: string}>}
   */
  parseBytes(data) {
    const lines = [];
    let offset = 0;

    while (offset + 4 <= data.length) {
      // Line number: 2 bytes big-endian
      const lineNumber = (data[offset] << 8) | data[offset + 1];
      // Line length: 2 bytes little-endian
      const lineLength = data[offset + 2] | (data[offset + 3] << 8);

      if (lineNumber > 9999 || lineLength === 0) break;

      offset += 4;
      const lineEnd = offset + lineLength;
      if (lineEnd > data.length) break;

      let text = "";
      let i = offset;

      while (i < lineEnd) {
        const byte = data[i];

        // End of line marker
        if (byte === 0x0D) {
          i++;
          break;
        }

        // Number marker: skip 0x0E + 5 bytes of floating point
        if (byte === NUMBER_MARKER) {
          i += 6; // 0x0E + 5 bytes
          continue;
        }

        // Colour control codes (INK, PAPER, etc.): 0x10-0x15 + 1 param byte
        if (byte >= 0x10 && byte <= 0x15) {
          i += 2;
          continue;
        }

        // AT/TAB control: 0x16-0x17 + 2 param bytes
        if (byte >= 0x16 && byte <= 0x17) {
          i += 3;
          continue;
        }

        // Token
        if (byte >= 0xA5) {
          const keyword = TOKENS[byte];
          if (keyword) {
            // Add space before keyword if previous char wasn't space
            if (text.length > 0 && text[text.length - 1] !== " ") {
              text += " ";
            }
            text += keyword;
            // Add space after keyword if it ends with a letter
            if (/[A-Za-z$#]/.test(keyword[keyword.length - 1])) {
              text += " ";
            }
          }
          i++;
          continue;
        }

        // Printable ASCII
        if (byte >= 0x20 && byte < 0x80) {
          text += String.fromCharCode(byte);
          i++;
          continue;
        }

        // Skip other control codes
        i++;
      }

      // Clean up double spaces
      text = text.replace(/  +/g, " ").trim();

      lines.push({ lineNumber, text });
      offset = lineEnd;
    }

    return lines;
  }
}
