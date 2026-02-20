/*
 * basic-variable-inspector.js - Variable display sidebar for BASIC window
 *
 * Thin wrapper around C++/WASM variable parser. DOM rendering stays in JS.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

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
    const json = await proxy.basicParseVariables();
    try {
      this.variables = JSON.parse(json);
    } catch {
      this.variables = [];
    }
    return this.variables;
  }

  /**
   * Format a number for display.
   * @param {number} value
   * @returns {string}
   */
  _formatNumber(value) {
    if (Number.isInteger(value)) return value.toString();
    const str = value.toPrecision(8);
    return str.replace(/\.?0+$/, "");
  }

  /**
   * Render an array variable as an HTML table.
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
      const count = dims.length === 1 ? dims[0] : elements.length;
      let html = '<table class="bas-array-table">';
      html += '<thead><tr>';
      for (let i = 1; i <= count; i++) {
        html += `<th>${i}</th>`;
      }
      html += '</tr></thead><tbody><tr>';
      for (let i = 0; i < count; i++) {
        const val = i < elements.length ? fmtVal(elements[i]) : "";
        html += `<td class="bas-var-value">${val}</td>`;
      }
      html += '</tr></tbody></table>';
      return html;
    }

    // 2D array
    if (dims.length === 2) {
      const rows = dims[0];
      const cols = dims[1];
      let html = '<table class="bas-array-table">';
      html += '<thead><tr><th></th>';
      for (let c = 1; c <= cols; c++) {
        html += `<th>${c}</th>`;
      }
      html += '</tr></thead><tbody>';
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

    // Higher dimensions: flat table
    let html = '<table class="bas-array-table">';
    html += '<thead><tr>';
    for (let i = 1; i <= elements.length; i++) {
      html += `<th>${i}</th>`;
    }
    html += '</tr></thead><tbody><tr>';
    for (let i = 0; i < elements.length; i++) {
      html += `<td class="bas-var-value">${fmtVal(elements[i])}</td>`;
    }
    html += '</tr></tbody></table>';
    return html;
  }

  render(variables, container) {
    if (!container) return;

    if (!variables || variables.length === 0) {
      container.innerHTML = '<div class="bas-vars-empty">No variables</div>';
      return;
    }

    const scalars = variables.filter((v) => v.type !== "numArray" && v.type !== "strArray");
    const arrays = variables.filter((v) => v.type === "numArray" || v.type === "strArray");

    let html = '<table class="bas-vars-table">';
    html += '<thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>';
    html += '<tbody>';

    for (const v of scalars) {
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
      }

      html += `<tr><td class="bas-var-name">${name}</td><td class="bas-var-type">${type}</td><td class="bas-var-value">${value}</td></tr>`;
    }

    for (const v of arrays) {
      const name = escHtml(v.name);
      const type = v.type === "numArray" ? "Num()" : "Str()";
      const dims = v.dimensions;
      let dimsLabel = dims.join("x");
      if (v.type === "strArray" && v.strLen) {
        dimsLabel = dims.length > 0 ? `${dims.join("x")} x${v.strLen}chr` : `${v.strLen}chr`;
      }
      html += `<tr><td class="bas-var-name">${name}</td><td class="bas-var-type">${type}</td><td class="bas-var-value">[${dimsLabel}]</td></tr>`;
      html += '<tr><td colspan="3" class="bas-var-array-cell">';
      html += this._renderArray(v);
      html += '</td></tr>';
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
