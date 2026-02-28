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
    this._previousValues = new Map(); // name -> formatted display value
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
   * Format a variable's display value as a string.
   */
  formatValue(v) {
    switch (v.type) {
      case "number":
        return this._formatNumber(v.value);
      case "string":
        return '"' + (v.value.length > 24 ? v.value.slice(0, 24) + "..." : v.value) + '"';
      case "for":
        return `${this._formatNumber(v.value)} TO ${this._formatNumber(v.limit)} STEP ${this._formatNumber(v.step)}`;
      case "defFn":
        return v.expression;
      case "numArray":
      case "strArray":
        return v.elements ? v.elements.join(",") : "";
      default:
        return "";
    }
  }

  /**
   * Format a variable's type label.
   */
  _typeLabel(v) {
    switch (v.type) {
      case "number": return "Num";
      case "string": return "Str";
      case "for": return "FOR";
      case "numArray": return "Num()";
      case "strArray": return "Str()";
      case "defFn": return "DEF";
      default: return "";
    }
  }

  /**
   * Format array dimensions label for the summary row.
   */
  _dimsLabel(v) {
    const dims = v.dimensions;
    if (v.type === "strArray" && v.strLen) {
      return dims.length > 0 ? `[${dims.join("x")} x${v.strLen}chr]` : `[${v.strLen}chr]`;
    }
    return `[${dims.join("x")}]`;
  }

  /**
   * Render an array variable as an HTML table.
   */
  _renderArrayHtml(v) {
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
        html += `<td class="bas-var-value bas-arr-val">${val}</td>`;
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
          html += `<td class="bas-var-value bas-arr-val">${val}</td>`;
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
      html += `<td class="bas-var-value bas-arr-val">${fmtVal(elements[i])}</td>`;
    }
    html += '</tr></tbody></table>';
    return html;
  }

  /**
   * Group variables by type into sections.
   */
  _groupVariables(variables) {
    const groups = [
      { key: "numbers", label: "Numbers", types: ["number"] },
      { key: "strings", label: "Strings", types: ["string"] },
      { key: "forLoops", label: "FOR Loops", types: ["for"] },
      { key: "arrays", label: "Arrays", types: ["numArray", "strArray"] },
      { key: "defFns", label: "DEF FN", types: ["defFn"] },
    ];
    const result = [];
    for (const g of groups) {
      const items = variables.filter((v) => g.types.includes(v.type));
      if (items.length > 0) result.push({ label: g.label, items });
    }
    return result;
  }

  _fullRender(variables, container) {
    const newNames = new Set();
    const changedNames = new Set();
    for (const v of variables) {
      const displayValue = this.formatValue(v);
      const prev = this._previousValues.get(v.name);
      if (prev === undefined) {
        newNames.add(v.name);
      } else if (prev !== displayValue) {
        changedNames.add(v.name);
      }
    }

    const groups = this._groupVariables(variables);
    let html = '';

    for (const group of groups) {
      html += `<div class="bas-var-section-header">${group.label}</div>`;
      html += '<table class="bas-vars-table">';
      html += '<thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>';
      html += '<tbody>';

      for (const v of group.items) {
        const displayValue = this.formatValue(v);
        this._previousValues.set(v.name, displayValue);

        if (v.type === "numArray" || v.type === "strArray") {
          html += `<tr data-var="${escAttr(v.name)}"><td class="bas-var-name">${escHtml(v.name)}</td><td class="bas-var-type">${this._typeLabel(v)}</td><td class="bas-var-value">${this._dimsLabel(v)}</td></tr>`;
          html += `<tr data-var-array="${escAttr(v.name)}"><td colspan="3" class="bas-var-array-cell">`;
          html += this._renderArrayHtml(v);
          html += '</td></tr>';
        } else {
          html += `<tr data-var="${escAttr(v.name)}"><td class="bas-var-name">${escHtml(v.name)}</td><td class="bas-var-type">${this._typeLabel(v)}</td><td class="bas-var-value">${escHtml(displayValue)}</td></tr>`;
        }
      }

      html += '</tbody></table>';
    }

    container.innerHTML = html;

    // Flash new or changed variables after DOM is built
    for (const v of variables) {
      const isNew = newNames.has(v.name);
      const isChanged = changedNames.has(v.name);
      if (isNew || isChanged) {
        const row = container.querySelector(`tr[data-var="${escAttr(v.name)}"]`);
        if (row) row.classList.add("bas-var-changed");
      }
    }
  }

  /**
   * In-place update of existing DOM rows. Flashes changed values.
   * Returns false if the variable set has structurally changed (new/removed vars)
   * and a full rebuild is needed.
   */
  _incrementalUpdate(variables, container) {
    const tables = container.querySelectorAll(".bas-vars-table");
    if (!tables.length) return false;

    // Check structural match: same variable names in same order across all section tables
    const rows = container.querySelectorAll("tr[data-var]");
    if (rows.length !== variables.length) return false;
    for (let i = 0; i < variables.length; i++) {
      if (rows[i].dataset.var !== variables[i].name) return false;
    }

    // Update values in place
    for (let i = 0; i < variables.length; i++) {
      const v = variables[i];
      const row = rows[i];
      const displayValue = this.formatValue(v);
      const prevValue = this._previousValues.get(v.name);
      const changed = prevValue !== undefined && prevValue !== displayValue;
      this._previousValues.set(v.name, displayValue);

      // Update the value cell text
      const valueCell = row.querySelector(".bas-var-value");
      if (valueCell) {
        if (v.type === "numArray" || v.type === "strArray") {
          valueCell.textContent = this._dimsLabel(v);
        } else {
          valueCell.textContent = displayValue;
        }
      }

      // Flash on change: remove class, force reflow, re-add class
      if (changed) {
        row.classList.remove("bas-var-changed");
        void row.offsetWidth;
        row.classList.add("bas-var-changed");

        // For arrays, also update and flash individual elements
        if (v.type === "numArray" || v.type === "strArray") {
          const arrayRow = container.querySelector(`tr[data-var-array="${escAttr(v.name)}"]`);
          if (arrayRow) {
            const valCells = arrayRow.querySelectorAll(".bas-arr-val");
            const elements = v.elements || [];
            const isString = v.type === "strArray";
            for (let j = 0; j < valCells.length && j < elements.length; j++) {
              const formatted = isString ? '"' + elements[j] + '"' : this._formatNumber(elements[j]);
              if (valCells[j].textContent !== formatted) {
                valCells[j].textContent = formatted;
                valCells[j].classList.remove("bas-var-changed");
                void valCells[j].offsetWidth;
                valCells[j].classList.add("bas-var-changed");
              }
            }
          }
        }
      }
    }

    return true;
  }

  render(variables, container) {
    if (!container) return;

    if (!variables || variables.length === 0) {
      container.innerHTML = '<div class="bas-vars-empty">No variables</div>';
      this._previousValues.clear();
      return;
    }

    // Try in-place update first; fall back to full rebuild if structure changed
    if (!this._incrementalUpdate(variables, container)) {
      this._fullRender(variables, container);
    }
  }
}

function escHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(text) {
  return escHtml(text).replace(/"/g, "&quot;");
}
