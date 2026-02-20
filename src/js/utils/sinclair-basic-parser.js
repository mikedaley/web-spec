/*
 * sinclair-basic-parser.js - Read BASIC programs from Spectrum memory
 *
 * Thin wrapper around C++/WASM parser.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

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
    const json = await proxy.basicParseProgram();
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }
}
