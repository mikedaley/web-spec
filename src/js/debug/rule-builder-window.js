/*
 * rule-builder-window.js - Visual rule builder for conditional breakpoints
 *
 * Provides a tree-based UI for constructing breakpoint conditions with
 * AND/OR logic groups, nestable rules, and subject types including
 * Z80 registers, flags, memory (PEEK/DEEK), and BASIC variables.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import "../css/rule-builder.css";
import { BaseWindow } from "../windows/base-window.js";

// Z80 registers available as condition subjects
const Z80_REGISTERS = [
  "A", "B", "C", "D", "E", "H", "L", "F",
  "BC", "DE", "HL", "IX", "IY", "SP", "PC", "I", "R",
];

// Z80 flags
const Z80_FLAGS = ["S", "Z", "H", "PV", "N", "C"];

// All subject types
const ALL_SUBJECT_TYPES = [
  { value: "register", label: "Register" },
  { value: "flag", label: "Flag" },
  { value: "byte", label: "Byte (PEEK)" },
  { value: "word", label: "Word (DEEK)" },
  { value: "basicVar", label: "BASIC Variable" },
  { value: "basicArray", label: "BASIC Array" },
];

// BASIC-only subject types (no raw Z80 registers/flags)
const BASIC_SUBJECT_TYPES = [
  { value: "basicVar", label: "BASIC Variable" },
  { value: "basicArray", label: "BASIC Array" },
  { value: "byte", label: "Byte (PEEK)" },
  { value: "word", label: "Word (DEEK)" },
];

// Comparison operators
const OPERATORS = [
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: "<", label: "<" },
  { value: ">", label: ">" },
  { value: "<=", label: "<=" },
  { value: ">=", label: ">=" },
];

let nextNodeId = 1;

function createGroup(logic = "and", children = []) {
  return { id: nextNodeId++, type: "group", logic, children };
}

function createRule(subjectType = "register", subject = "A", operator = "==", value = "0") {
  return { id: nextNodeId++, type: "rule", subjectType, subject, operator, value };
}

export class RuleBuilderWindow extends BaseWindow {
  constructor() {
    super({
      id: "rule-builder",
      title: "Condition Builder",
      defaultWidth: 480,
      defaultHeight: 360,
      minWidth: 360,
      minHeight: 240,
    });

    this._rootNode = null;
    this._onSave = null;
    this._editKey = null;
    this._labelText = null;
    this._mode = "cpu"; // "cpu" = all types, "basic" = BASIC-only types
  }

  renderContent() {
    return `
      <div class="rule-builder-content">
        <div class="rule-builder-header">
          Editing condition for: <span class="rule-label"></span>
        </div>
        <div class="rule-builder-tree"></div>
        <div class="rule-builder-preview">
          <div class="rule-builder-preview-label">Expression</div>
          <div class="rule-builder-preview-expr"></div>
        </div>
        <div class="rule-builder-footer">
          <button class="cancel" data-action="cancel">Cancel</button>
          <button class="clear" data-action="clear">Clear</button>
          <button class="primary" data-action="save">Save</button>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this._treeEl = this.contentElement.querySelector(".rule-builder-tree");
    this._previewEl = this.contentElement.querySelector(".rule-builder-preview-expr");
    this._labelEl = this.contentElement.querySelector(".rule-label");

    this.contentElement.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "save") this._save();
        else if (action === "cancel") this.hide();
        else if (action === "clear") this._clear();
      });
    });
  }

  /**
   * Open the builder for a specific breakpoint.
   * @param {string} key - Breakpoint key (e.g., "10" or "10:0" or "cpu:$4000")
   * @param {object} entry - { condition, conditionRules } from the breakpoint manager
   * @param {string} labelText - Human-readable label (e.g., "Line 10" or "$4000")
   * @param {function} onSave - Callback: (key, condition, conditionRules) => void
   * @param {string} mode - "basic" for BASIC-only subjects, "cpu" for all (default)
   */
  editBreakpoint(key, entry, labelText, onSave, mode = "cpu") {
    this._editKey = key;
    this._onSave = onSave;
    this._labelText = labelText;
    this._mode = mode;

    if (this._labelEl) this._labelEl.textContent = labelText;

    // Restore saved rule tree or create a fresh one
    if (entry && entry.conditionRules) {
      this._rootNode = this._deserialize(entry.conditionRules);
    } else {
      const defaultType = mode === "basic" ? "basicVar" : "register";
      const defaultSubject = mode === "basic" ? "i" : "A";
      this._rootNode = createGroup("and", [createRule(defaultType, defaultSubject)]);
    }

    this._renderTree();
    this._updatePreview();
    this.show();
  }

  _save() {
    const condition = this.serializeToExpression(this._rootNode);
    const conditionRules = this._serialize(this._rootNode);
    if (this._onSave) {
      this._onSave(this._editKey, condition, conditionRules);
    }
    this.hide();
  }

  _clear() {
    this._rootNode = createGroup("and", [this._createDefaultRule()]);
    this._renderTree();
    this._updatePreview();
    if (this._onSave) {
      this._onSave(this._editKey, null, null);
    }
    this.hide();
  }

  /** Create a rule with mode-appropriate defaults. */
  _createDefaultRule() {
    if (this._mode === "basic") {
      return createRule("basicVar", "i", "==", "0");
    }
    return createRule("register", "A", "==", "0");
  }

  // ============================================================================
  // Tree rendering
  // ============================================================================

  _renderTree() {
    if (!this._treeEl) return;
    this._treeEl.innerHTML = "";
    this._treeEl.appendChild(this._renderNode(this._rootNode, 0));
  }

  _renderNode(node, depth) {
    if (node.type === "group") return this._renderGroup(node, depth);
    return this._renderRule(node, depth);
  }

  _renderGroup(node, depth) {
    const el = document.createElement("div");
    el.className = "rule-group";
    el.dataset.depth = depth % 5;

    // Header with AND/OR toggle and action buttons
    const header = document.createElement("div");
    header.className = "rule-group-header";

    const logicToggle = document.createElement("div");
    logicToggle.className = "rule-group-logic";
    for (const logic of ["and", "or"]) {
      const btn = document.createElement("button");
      btn.textContent = logic.toUpperCase();
      if (node.logic === logic) btn.classList.add("active");
      btn.addEventListener("click", () => {
        node.logic = logic;
        this._renderTree();
        this._updatePreview();
      });
      logicToggle.appendChild(btn);
    }
    header.appendChild(logicToggle);

    const actions = document.createElement("div");
    actions.className = "rule-group-actions";

    const addRuleBtn = document.createElement("button");
    addRuleBtn.textContent = "+ Rule";
    addRuleBtn.addEventListener("click", () => {
      node.children.push(this._createDefaultRule());
      this._renderTree();
      this._updatePreview();
    });
    actions.appendChild(addRuleBtn);

    const addGroupBtn = document.createElement("button");
    addGroupBtn.textContent = "+ Group";
    addGroupBtn.addEventListener("click", () => {
      node.children.push(createGroup(node.logic === "and" ? "or" : "and", [this._createDefaultRule()]));
      this._renderTree();
      this._updatePreview();
    });
    actions.appendChild(addGroupBtn);

    if (depth > 0) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        this._removeNode(this._rootNode, node.id);
        this._renderTree();
        this._updatePreview();
      });
      actions.appendChild(removeBtn);
    }

    header.appendChild(actions);
    el.appendChild(header);

    // Children
    for (const child of node.children) {
      el.appendChild(this._renderNode(child, depth + 1));
    }

    return el;
  }

  _renderRule(node, depth) {
    const row = document.createElement("div");
    row.className = "rule-row";

    // Subject type (filtered by mode)
    const types = this._mode === "basic" ? BASIC_SUBJECT_TYPES : ALL_SUBJECT_TYPES;
    const typeSelect = this._createSelect(
      types.map((t) => ({ value: t.value, label: t.label })),
      node.subjectType,
      (val) => {
        node.subjectType = val;
        // Reset subject to a sensible default
        if (val === "register") node.subject = "A";
        else if (val === "flag") node.subject = "Z";
        else if (val === "byte" || val === "word") node.subject = "$5C00";
        else if (val === "basicVar") node.subject = "i";
        else if (val === "basicArray") node.subject = "a(1)";
        this._renderTree();
        this._updatePreview();
      }
    );
    row.appendChild(typeSelect);

    // Subject-specific input
    if (node.subjectType === "register") {
      const regSelect = this._createSelect(
        Z80_REGISTERS.map((r) => ({ value: r, label: r })),
        node.subject,
        (val) => { node.subject = val; this._updatePreview(); }
      );
      row.appendChild(regSelect);
    } else if (node.subjectType === "flag") {
      const flagSelect = this._createSelect(
        Z80_FLAGS.map((f) => ({ value: f, label: f })),
        node.subject,
        (val) => { node.subject = val; this._updatePreview(); }
      );
      row.appendChild(flagSelect);
    } else if (node.subjectType === "byte" || node.subjectType === "word") {
      const addrInput = document.createElement("input");
      addrInput.type = "text";
      addrInput.value = node.subject;
      addrInput.placeholder = "$FFFF";
      addrInput.addEventListener("change", () => {
        node.subject = addrInput.value;
        this._updatePreview();
      });
      row.appendChild(addrInput);
    } else if (node.subjectType === "basicVar" || node.subjectType === "basicArray") {
      const varInput = document.createElement("input");
      varInput.type = "text";
      varInput.className = "wide";
      varInput.value = node.subject;
      varInput.placeholder = node.subjectType === "basicVar" ? "i" : "a(1)";
      varInput.addEventListener("change", () => {
        node.subject = varInput.value;
        this._updatePreview();
      });
      row.appendChild(varInput);
    }

    // Operator
    const opSelect = this._createSelect(
      OPERATORS.map((o) => ({ value: o.value, label: o.label })),
      node.operator,
      (val) => { node.operator = val; this._updatePreview(); }
    );
    row.appendChild(opSelect);

    // Value
    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.value = node.value;
    valInput.placeholder = "0";
    valInput.addEventListener("change", () => {
      node.value = valInput.value;
      this._updatePreview();
    });
    row.appendChild(valInput);

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "rule-remove";
    removeBtn.innerHTML = "&times;";
    removeBtn.title = "Remove rule";
    removeBtn.addEventListener("click", () => {
      this._removeNode(this._rootNode, node.id);
      this._renderTree();
      this._updatePreview();
    });
    row.appendChild(removeBtn);

    return row;
  }

  _createSelect(options, currentValue, onChange) {
    const select = document.createElement("select");
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === currentValue) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }

  _removeNode(parent, targetId) {
    if (parent.type !== "group") return false;
    const idx = parent.children.findIndex((c) => c.id === targetId);
    if (idx >= 0) {
      parent.children.splice(idx, 1);
      return true;
    }
    for (const child of parent.children) {
      if (this._removeNode(child, targetId)) return true;
    }
    return false;
  }

  // ============================================================================
  // Expression serialization
  // ============================================================================

  serializeToExpression(node) {
    if (!node) return "";
    if (node.type === "rule") return this._ruleToExpression(node);

    if (node.type === "group") {
      const parts = node.children
        .map((c) => this.serializeToExpression(c))
        .filter((s) => s.length > 0);
      if (parts.length === 0) return "";
      if (parts.length === 1) return parts[0];
      const joiner = node.logic === "and" ? " && " : " || ";
      return "(" + parts.join(joiner) + ")";
    }

    return "";
  }

  _ruleToExpression(node) {
    const left = this._subjectToExpression(node);
    if (!left) return "";
    const value = this._normalizeValue(node.value, node);
    return `${left} ${node.operator} ${value}`;
  }

  _subjectToExpression(node) {
    switch (node.subjectType) {
      case "register":
        return node.subject;
      case "flag":
        return `FLAGS.${node.subject}`;
      case "byte":
        return `PEEK(${this._normalizeAddress(node.subject)})`;
      case "word":
        return `DEEK(${this._normalizeAddress(node.subject)})`;
      case "basicVar":
        return this._basicVarToExpression(node.subject);
      case "basicArray":
        return this._basicArrayToExpression(node.subject);
      default:
        return null;
    }
  }

  _normalizeAddress(addr) {
    if (!addr) return "$0000";
    const trimmed = addr.trim().replace(/^0x/i, "");
    if (trimmed.startsWith("$")) return trimmed;
    // If it's all hex digits, prefix with $
    if (/^[0-9a-fA-F]+$/.test(trimmed)) return "$" + trimmed;
    return trimmed;
  }

  _normalizeValue(val, node = null) {
    if (!val) return "0";
    const trimmed = val.trim();
    if (trimmed.startsWith("$") || trimmed.startsWith("0x")) {
      return "$" + trimmed.replace(/^\$|^0x/i, "");
    }
    // String variable: quote the value if it's not already a number or hex
    if (node && this._isStringSubject(node) && !/^-?\d+$/.test(trimmed) && !trimmed.startsWith("$")) {
      // Strip existing quotes if user already typed them
      const unquoted = trimmed.replace(/^"|"$/g, "");
      return `"${unquoted}"`;
    }
    return trimmed;
  }

  _isStringSubject(node) {
    if (node.subjectType === "basicVar") {
      return node.subject && node.subject.trim().endsWith("$");
    }
    return false;
  }

  /**
   * Convert a BASIC variable name (e.g., "i", "score") to a BV() expression
   * with the ASCII byte values of the variable name.
   */
  _basicVarToExpression(name) {
    if (!name) return null;
    const clean = name.trim().toLowerCase();
    if (clean.length === 0) return null;
    const bytes = [];
    for (let i = 0; i < clean.length; i++) {
      bytes.push(clean.charCodeAt(i));
    }
    return `BV(${bytes.join(",")})`;
  }

  /**
   * Convert a BASIC array access (e.g., "a(1)" or "a(1,2)") to a BA() expression.
   */
  _basicArrayToExpression(expr) {
    if (!expr) return null;
    const match = expr.trim().match(/^([a-zA-Z])\((.+)\)$/);
    if (!match) return null;
    const letter = match[1].toLowerCase().charCodeAt(0);
    const indices = match[2].split(",").map((s) => s.trim());
    return `BA(${letter},${indices.join(",")})`;
  }

  /**
   * Generate a human-readable label for a rule node.
   */
  toDisplayLabel(node) {
    if (!node) return "";
    if (node.type === "group") {
      const parts = node.children.map((c) => this.toDisplayLabel(c)).filter((s) => s);
      return parts.join(node.logic === "and" ? " AND " : " OR ");
    }
    if (node.type === "rule") {
      let subject;
      switch (node.subjectType) {
        case "register": subject = node.subject; break;
        case "flag": subject = `Flag ${node.subject}`; break;
        case "byte": subject = `PEEK(${node.subject})`; break;
        case "word": subject = `DEEK(${node.subject})`; break;
        case "basicVar": subject = node.subject; break;
        case "basicArray": subject = node.subject; break;
        default: subject = "?";
      }
      return `${subject} ${node.operator} ${node.value}`;
    }
    return "";
  }

  // ============================================================================
  // Preview
  // ============================================================================

  _updatePreview() {
    if (!this._previewEl) return;
    const expr = this.serializeToExpression(this._rootNode);
    this._previewEl.textContent = expr || "(no condition)";
  }

  // ============================================================================
  // Serialization (for persistence)
  // ============================================================================

  _serialize(node) {
    if (!node) return null;
    if (node.type === "rule") {
      return {
        type: "rule",
        subjectType: node.subjectType,
        subject: node.subject,
        operator: node.operator,
        value: node.value,
      };
    }
    if (node.type === "group") {
      return {
        type: "group",
        logic: node.logic,
        children: node.children.map((c) => this._serialize(c)),
      };
    }
    return null;
  }

  _deserialize(data) {
    if (!data) return createGroup("and", [this._createDefaultRule()]);
    if (data.type === "rule") {
      return createRule(data.subjectType, data.subject, data.operator, data.value);
    }
    if (data.type === "group") {
      const children = (data.children || []).map((c) => this._deserialize(c));
      return createGroup(data.logic || "and", children.length > 0 ? children : [this._createDefaultRule()]);
    }
    return createGroup("and", [this._createDefaultRule()]);
  }
}
