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
          // Read element values (5 bytes each)
          const totalElements = dims.reduce((a, b) => a * b, 1);
          const elements = [];
          for (let e = 0; e < totalElements && i + 4 < data.length; e++) {
            elements.push(this._decodeFloat(data, i));
            i += 5;
          }
          i = startOffset + totalLen;
          vars.push({ name: letter + "()", type: "numArray", dimensions: dims, elements });
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
          // Last dimension is string length for each element
          const strLen = dims2.length > 0 ? dims2[dims2.length - 1] : 0;
          const outerDims = dims2.slice(0, -1);
          const totalStrings = outerDims.length > 0 ? outerDims.reduce((a, b) => a * b, 1) : 1;
          const strElements = [];
          for (let e = 0; e < totalStrings && i + strLen - 1 < data.length; e++) {
            let s = "";
            for (let c = 0; c < strLen && i < data.length; c++, i++) {
              s += String.fromCharCode(data[i]);
            }
            strElements.push(s.trimEnd());
          }
          i = startOffset2 + totalLen2;
          vars.push({ name: letter + "$()", type: "strArray", dimensions: outerDims, strLen, elements: strElements });
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
      if (sign === 0xFF) {
        // Negative: low/high are two's complement
        return intVal >= 0x8000 ? intVal - 0x10000 : -intVal;
      }
      return intVal;
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
  /**
   * Render an array variable as an HTML table.
   * 1D: rows with index and value.
   * 2D: grid with row/column headers.
   */
  _renderArray(v) {
    const dims = v.dimensions;
    const elements = v.elements;
    const isString = v.type === "strArray";

    if (!elements || elements.length === 0) {
      return '<span class="bas-var-type">empty</span>';
    }

    const fmtVal = (val) => {
      if (isString) return '"' + escHtml(val) + '"';
      return this._formatNumber(val);
    };

    // 1D array
    if (dims.length <= 1) {
      let html = '<table class="bas-array-table">';
      html += '<thead><tr><th>#</th><th>Value</th></tr></thead><tbody>';
      for (let i = 0; i < elements.length; i++) {
        html += `<tr><td class="bas-array-idx">${i + 1}</td><td class="bas-var-value">${fmtVal(elements[i])}</td></tr>`;
      }
      html += '</tbody></table>';
      return html;
    }

    // 2D array
    if (dims.length === 2) {
      const rows = dims[0];
      const cols = dims[1];
      let html = '<table class="bas-array-table">';
      // Column headers
      html += '<thead><tr><th></th>';
      for (let c = 1; c <= cols; c++) {
        html += `<th>${c}</th>`;
      }
      html += '</tr></thead><tbody>';
      // Data rows
      for (let r = 0; r < rows; r++) {
        html += `<tr><td class="bas-array-idx">${r + 1}</td>`;
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const val = idx < elements.length ? fmtVal(elements[idx]) : "";
          html += `<td class="bas-var-value">${val}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      return html;
    }

    // Higher dimensions: just show flat list
    let html = '<table class="bas-array-table">';
    html += '<thead><tr><th>#</th><th>Value</th></tr></thead><tbody>';
    for (let i = 0; i < elements.length; i++) {
      html += `<tr><td class="bas-array-idx">${i + 1}</td><td class="bas-var-value">${fmtVal(elements[i])}</td></tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

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
        case "strArray": {
          type = v.type === "numArray" ? "Num()" : "Str()";
          const dims = v.dimensions;
          html += `<tr><td class="bas-var-name">${name}</td><td class="bas-var-type">${type}</td><td class="bas-var-value">[${dims.join("x")}]</td></tr>`;
          html += '<tr><td colspan="3" class="bas-var-array-cell">';
          html += this._renderArray(v);
          html += '</td></tr>';
          continue;
        }
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
