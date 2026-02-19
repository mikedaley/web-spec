/*
 * sinclair-basic-tokenizer.js - Write BASIC programs to Spectrum memory
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { KEYWORDS_BY_LENGTH, KEYWORD_TO_TOKEN, NUMBER_MARKER, SYS } from "./sinclair-basic-tokens.js";

/**
 * Tokenize Sinclair BASIC text and write to Spectrum memory.
 */
export class SinclairBasicTokenizer {
  /**
   * Tokenize a complete BASIC program from text lines.
   * @param {string} text - Program text, one line per line
   * @returns {Uint8Array} - Complete tokenized program bytes
   */
  tokenize(text) {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const allBytes = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse line number
      let i = 0;
      while (i < trimmed.length && trimmed[i] >= "0" && trimmed[i] <= "9") i++;
      if (i === 0) continue; // No line number - skip

      const lineNumber = parseInt(trimmed.slice(0, i), 10);
      if (lineNumber < 0 || lineNumber > 9999) continue;

      // Skip whitespace after line number
      while (i < trimmed.length && trimmed[i] === " ") i++;

      const bodyText = trimmed.slice(i);
      const bodyBytes = this._tokenizeLine(bodyText);

      // Line format: [hi][lo] line number (big endian), [lo][hi] length (little endian), body..., 0x0D
      const lineLength = bodyBytes.length + 1; // +1 for 0x0D
      allBytes.push(lineNumber >> 8, lineNumber & 0xFF);
      allBytes.push(lineLength & 0xFF, (lineLength >> 8) & 0xFF);
      allBytes.push(...bodyBytes);
      allBytes.push(0x0D);
    }

    return new Uint8Array(allBytes);
  }

  /**
   * Tokenize the body of a single BASIC line (after the line number).
   * @param {string} text
   * @returns {number[]} - Array of bytes
   */
  _tokenizeLine(text) {
    const bytes = [];
    let i = 0;
    const len = text.length;
    let inRem = false;

    while (i < len) {
      // After REM, everything is literal
      if (inRem) {
        bytes.push(text.charCodeAt(i));
        i++;
        continue;
      }

      // String literal - pass through verbatim
      if (text[i] === '"') {
        bytes.push(0x22); // "
        i++;
        while (i < len && text[i] !== '"') {
          bytes.push(text.charCodeAt(i));
          i++;
        }
        if (i < len) {
          bytes.push(0x22); // closing "
          i++;
        }
        continue;
      }

      // Try keyword match (longest first, case-insensitive)
      let matched = false;
      const remaining = text.slice(i).toUpperCase();
      for (const kw of KEYWORDS_BY_LENGTH) {
        if (remaining.startsWith(kw)) {
          // Verify word boundary
          const afterKw = i + kw.length;
          if (afterKw < len) {
            const nextChar = text[afterKw];
            if (/[A-Za-z]/.test(kw[kw.length - 1]) && /[A-Za-z0-9]/.test(nextChar)) {
              continue;
            }
          }

          const token = KEYWORD_TO_TOKEN[kw];
          bytes.push(token);
          i += kw.length;
          matched = true;

          // Skip trailing space after keyword (it was added by parser)
          if (i < len && text[i] === " ") i++;

          if (kw === "REM") {
            inRem = true;
          }
          break;
        }
      }
      if (matched) continue;

      // Numeric literal - emit ASCII digits + number marker + 5-byte float
      if (text[i] >= "0" && text[i] <= "9") {
        let numEnd = i;
        let hasDot = false;
        while (numEnd < len) {
          if (text[numEnd] >= "0" && text[numEnd] <= "9") {
            numEnd++;
          } else if (text[numEnd] === "." && !hasDot) {
            hasDot = true;
            numEnd++;
          } else if ((text[numEnd] === "e" || text[numEnd] === "E") && numEnd > i) {
            numEnd++;
            if (numEnd < len && (text[numEnd] === "+" || text[numEnd] === "-")) numEnd++;
          } else {
            break;
          }
        }

        const numStr = text.slice(i, numEnd);
        // Emit ASCII representation
        for (let c = 0; c < numStr.length; c++) {
          bytes.push(numStr.charCodeAt(c));
        }

        // Emit number marker + 5-byte encoding
        const numVal = parseFloat(numStr);
        bytes.push(NUMBER_MARKER);
        bytes.push(...this._encodeNumber(numVal));

        i = numEnd;
        continue;
      }

      // Regular character
      bytes.push(text.charCodeAt(i));
      i++;
    }

    return bytes;
  }

  /**
   * Encode a JS number into 5-byte Sinclair BASIC floating point format.
   * Uses integer shorthand for small non-negative integers 0-65535.
   * @param {number} value
   * @returns {number[]} - 5 bytes
   */
  _encodeNumber(value) {
    // Integer shorthand: 0-65535 stored as [0x00, 0x00, low, high, 0x00]
    if (Number.isInteger(value) && value >= -65535 && value <= 65535) {
      if (value >= 0) {
        return [0x00, 0x00, value & 0xFF, (value >> 8) & 0xFF, 0x00];
      } else {
        // Negative integer: use two's complement in the low/high bytes
        const abs = Math.abs(value);
        return [0x00, 0xFF, abs & 0xFF, (abs >> 8) & 0xFF, 0x00];
      }
    }

    // Full floating point encoding
    return this._encodeFloat(value);
  }

  /**
   * Encode a floating point number in Spectrum 5-byte format.
   * Format: [exponent] [mantissa byte 1-4]
   * Exponent is biased by 128. Mantissa has implied leading 1.
   * Sign is stored in bit 7 of mantissa byte 1.
   * @param {number} value
   * @returns {number[]}
   */
  _encodeFloat(value) {
    if (value === 0) return [0x00, 0x00, 0x00, 0x00, 0x00];

    const negative = value < 0;
    let abs = Math.abs(value);

    // Find exponent: abs = mantissa * 2^exp where 0.5 <= mantissa < 1
    let exp = 0;
    let m = abs;
    if (m >= 1) {
      while (m >= 1) { m /= 2; exp++; }
    } else {
      while (m < 0.5) { m *= 2; exp--; }
    }

    // Now m is in [0.5, 1), abs = m * 2^exp
    // Spectrum stores exponent biased by 128
    const biasedExp = exp + 128;
    if (biasedExp <= 0 || biasedExp > 255) {
      // Overflow/underflow - store as zero
      return [0x00, 0x00, 0x00, 0x00, 0x00];
    }

    // Mantissa: 4 bytes. Leading 1 is implied (not stored), replaced by sign bit.
    // m is in [0.5, 1), multiply by 2^32 to get 32-bit mantissa
    // But first subtract the implied 0.5 (the leading 1 bit)
    m -= 0.5;
    let mantissa32 = Math.round(m * 2 * 0x100000000);

    const b1 = (mantissa32 >>> 24) & 0xFF;
    const b2 = (mantissa32 >>> 16) & 0xFF;
    const b3 = (mantissa32 >>> 8) & 0xFF;
    const b4 = mantissa32 & 0xFF;

    // Set sign bit in mantissa byte 1
    const signedB1 = negative ? (b1 | 0x80) : (b1 & 0x7F);

    return [biasedExp, signedB1, b2, b3, b4];
  }

  /**
   * Write a tokenized program to Spectrum memory.
   * @param {EmulatorProxy} proxy
   * @param {Uint8Array} programBytes
   */
  async writeTo(proxy, programBytes) {
    // Pause emulation during write
    const wasPaused = proxy.isPaused();
    if (!wasPaused) proxy.pause();

    try {
      // Read PROG address
      const progPtrs = await proxy.readMemory(SYS.PROG, 2);
      const progAddr = progPtrs[0] | (progPtrs[1] << 8);

      // Write program bytes
      await proxy.writeMemoryBulk(progAddr, programBytes);

      // Calculate new VARS address (right after program)
      const varsAddr = progAddr + programBytes.length;

      // Write end marker at VARS
      proxy.writeMemory(varsAddr, 0x80);

      // Update VARS system variable
      proxy.writeMemory(SYS.VARS, varsAddr & 0xFF);
      proxy.writeMemory(SYS.VARS + 1, (varsAddr >> 8) & 0xFF);

      // Update E_LINE (one byte after VARS end marker)
      const eLineAddr = varsAddr + 1;
      proxy.writeMemory(SYS.E_LINE, eLineAddr & 0xFF);
      proxy.writeMemory(SYS.E_LINE + 1, (eLineAddr >> 8) & 0xFF);

      // Write empty edit line: 0x0D + 0x80 at E_LINE
      proxy.writeMemory(eLineAddr, 0x0D);
      proxy.writeMemory(eLineAddr + 1, 0x80);

      // Update WORKSP (after E_LINE content)
      const workspAddr = eLineAddr + 2;
      proxy.writeMemory(SYS.WORKSP, workspAddr & 0xFF);
      proxy.writeMemory(SYS.WORKSP + 1, (workspAddr >> 8) & 0xFF);

      // Update STKBOT and STKEND to WORKSP
      proxy.writeMemory(SYS.STKBOT, workspAddr & 0xFF);
      proxy.writeMemory(SYS.STKBOT + 1, (workspAddr >> 8) & 0xFF);
      proxy.writeMemory(SYS.STKEND, workspAddr & 0xFF);
      proxy.writeMemory(SYS.STKEND + 1, (workspAddr >> 8) & 0xFF);
    } finally {
      if (!wasPaused) proxy.resume();
    }
  }
}
