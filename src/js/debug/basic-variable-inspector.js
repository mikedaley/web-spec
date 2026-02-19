/*
 * basic-variable-inspector.js - Variable display sidebar for BASIC window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { SYS } from "../utils/sinclair-basic-tokens.js";

/**
 * Reads and displays Sinclair BASIC variables from Spectrum memory.
 */
export class BasicVariableInspector {
  constructor() {
    this.container = null;
    this.variables = [];
  }

  /**
   * Read all variables from the VARS->E_LINE memory region.
   * @param {EmulatorProxy} proxy
   * @returns {Promise<Array<{name: string, type: string, value: any, dimensions?: number[]}>>}
   */
  async readVariables(proxy) {
    // Read VARS and E_LINE pointers
    const varsPtrs = await proxy.readMemory(SYS.VARS, 2);
    const varsAddr = varsPtrs[0] | (varsPtrs[1] << 8);

    const eLinePtrs = await proxy.readMemory(SYS.E_LINE, 2);
    const eLineAddr = eLinePtrs[0] | (eLinePtrs[1] << 8);

    if (eLineAddr <= varsAddr) return [];

    const size = eLineAddr - varsAddr;
    if (size <= 0 || size > 0xFFFF) return [];

    const data = await proxy.readMemory(varsAddr, size);
    return this._parseVariables(data);
  }

  /**
   * Parse variable entries from raw memory.
   * @param {Uint8Array} data
   * @returns {Array<{name: string, type: string, value: any}>}
   */
  _parseVariables(data) {
    const vars = [];
    let i = 0;

    while (i < data.length) {
      const byte = data[i];

      // End marker
      if (byte === 0x80) break;

      const topBits = byte & 0xE0; // Top 3 bits
      const letter = String.fromCharCode((byte & 0x1F) + 0x60); // Lower 5 bits -> letter

      switch (topBits) {
        case 0x60: {
          // 011xxxxx: Single-letter numeric variable
          if (i + 6 > data.length) return vars;
          const value = this._decodeFloat(data, i + 1);
          i += 6;
          vars.push({ name: letter, type: "number", value });
          break;
        }

        case 0x40: {
          // 010xxxxx: Single-letter string variable
          if (i + 3 > data.length) return vars;
          const strLen = data[i + 1] | (data[i + 2] << 8);
          i += 3;
          let str = "";
          for (let c = 0; c < strLen && i < data.length; c++, i++) {
            str += String.fromCharCode(data[i]);
          }
          vars.push({ name: letter + "$", type: "string", value: str });
          break;
        }

        case 0xA0: {
          // 101xxxxx: Multi-letter numeric variable
          let name = letter;
          i++;
          // Read additional letters until one with bit 7 set
          while (i < data.length) {
            const ch = data[i];
            if (ch & 0x80) {
              name += String.fromCharCode((ch & 0x7F));
              i++;
              break;
            }
            name += String.fromCharCode(ch);
            i++;
          }
          if (i + 5 > data.length) return vars;
          const val = this._decodeFloat(data, i);
          i += 5;
          vars.push({ name, type: "number", value: val });
          break;
        }

        case 0x80: {
          // 100xxxxx: Numeric array
          if (i + 3 > data.length) return vars;
          const totalLen = data[i + 1] | (data[i + 2] << 8);
          i += 3;
          const startOffset = i;
          if (i >= data.length) return vars;
          const numDims = data[i];
          i++;
          const dims = [];
          for (let d = 0; d < numDims && i + 1 < data.length; d++) {
            dims.push(data[i] | (data[i + 1] << 8));
            i += 2;
          }
          // Skip to end of array data
          i = startOffset + totalLen;
          vars.push({ name: letter + "()", type: "numArray", value: `[${dims.join("x")}]`, dimensions: dims });
          break;
        }

        case 0xC0: {
          // 110xxxxx: String array
          if (i + 3 > data.length) return vars;
          const totalLen2 = data[i + 1] | (data[i + 2] << 8);
          i += 3;
          const startOffset2 = i;
          if (i >= data.length) return vars;
          const numDims2 = data[i];
          i++;
          const dims2 = [];
          for (let d = 0; d < numDims2 && i + 1 < data.length; d++) {
            dims2.push(data[i] | (data[i + 1] << 8));
            i += 2;
          }
          i = startOffset2 + totalLen2;
          vars.push({ name: letter + "$()", type: "strArray", value: `[${dims2.join("x")}]`, dimensions: dims2 });
          break;
        }

        case 0xE0: {
          // 111xxxxx: FOR loop control variable
          if (i + 19 > data.length) return vars;
          const forVal = this._decodeFloat(data, i + 1);
          const limit = this._decodeFloat(data, i + 6);
          const step = this._decodeFloat(data, i + 11);
          const loopLine = data[i + 16] | (data[i + 17] << 8);
          const loopStmt = data[i + 18];
          i += 19;
          vars.push({
            name: letter,
            type: "for",
            value: forVal,
            limit,
            step,
            loopLine,
            loopStmt,
          });
          break;
        }

        default:
          // Unknown - bail out
          return vars;
      }
    }

    this.variables = vars;
    return vars;
  }

  /**
   * Decode a 5-byte Spectrum floating point number.
   * @param {Uint8Array} data
   * @param {number} offset
   * @returns {number}
   */
  _decodeFloat(data, offset) {
    const exp = data[offset];

    // Integer shorthand: exponent = 0
    if (exp === 0) {
      const sign = data[offset + 1];
      const low = data[offset + 2];
      const high = data[offset + 3];
      const intVal = low | (high << 8);
      return sign === 0xFF ? -intVal : intVal;
    }

    // Full floating point
    const signBit = data[offset + 1] & 0x80;
    // Restore implied leading 1
    const b1 = (data[offset + 1] & 0x7F) | 0x80;
    const b2 = data[offset + 2];
    const b3 = data[offset + 3];
    const b4 = data[offset + 4];

    // Mantissa as fraction in [0.5, 1)
    const mantissa = (b1 * 0x1000000 + b2 * 0x10000 + b3 * 0x100 + b4) / 0x100000000;

    // Value = mantissa * 2^(exp - 128)
    const value = mantissa * Math.pow(2, exp - 128);

    return signBit ? -value : value;
  }

  /**
   * Format a number for display.
   * @param {number} value
   * @returns {string}
   */
  _formatNumber(value) {
    if (Number.isInteger(value)) return value.toString();
    // Show up to 8 significant digits
    const str = value.toPrecision(8);
    // Remove trailing zeros after decimal
    return str.replace(/\.?0+$/, "");
  }

  /**
   * Render variables into a container element.
   * @param {Array} variables
   * @param {HTMLElement} container
   */
  render(variables, container) {
    if (!container) return;

    if (!variables || variables.length === 0) {
      container.innerHTML = '<div class="bas-vars-empty">No variables</div>';
      return;
    }

    let html = '<table class="bas-vars-table">';
    html += '<thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>';
    html += '<tbody>';

    for (const v of variables) {
      const name = escHtml(v.name);
      let type = "";
      let value = "";

      switch (v.type) {
        case "number":
          type = "Num";
          value = this._formatNumber(v.value);
          break;
        case "string":
          type = "Str";
          value = '"' + escHtml(v.value.length > 24 ? v.value.slice(0, 24) + "..." : v.value) + '"';
          break;
        case "for":
          type = "FOR";
          value = `${this._formatNumber(v.value)} TO ${this._formatNumber(v.limit)} STEP ${this._formatNumber(v.step)}`;
          break;
        case "numArray":
          type = "Num()";
          value = escHtml(v.value);
          break;
        case "strArray":
          type = "Str()";
          value = escHtml(v.value);
          break;
      }

      html += `<tr><td class="bas-var-name">${name}</td><td class="bas-var-type">${type}</td><td class="bas-var-value">${value}</td></tr>`;
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }
}

function escHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
