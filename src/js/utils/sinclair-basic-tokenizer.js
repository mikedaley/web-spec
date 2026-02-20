/*
 * sinclair-basic-tokenizer.js - Write BASIC programs to Spectrum memory
 *
 * Thin wrapper around C++/WASM tokenizer and writer.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

/**
 * Tokenize Sinclair BASIC text and write to Spectrum memory.
 */
export class SinclairBasicTokenizer {
  /**
   * Tokenize a complete BASIC program from text lines.
   * @param {EmulatorProxy} proxy
   * @param {string} text - Program text, one line per line
   * @returns {Promise<Uint8Array>} - Complete tokenized program bytes
   */
  async tokenize(proxy, text) {
    return await proxy.basicTokenize(text);
  }

  /**
   * Write a tokenized program to Spectrum memory.
   * @param {EmulatorProxy} proxy
   * @param {Uint8Array} programBytes
   */
  async writeTo(proxy, programBytes) {
    proxy.pause();
    try {
      await proxy.basicWriteProgram(programBytes);
    } finally {
      proxy.resume();
    }
  }
}
