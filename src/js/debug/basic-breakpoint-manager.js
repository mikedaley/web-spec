/*
 * basic-breakpoint-manager.js - BASIC breakpoint management with condition support
 *
 * Manages BASIC line breakpoints with optional condition expressions that are
 * evaluated by the C++ condition evaluator via WASM. Also supports condition-only
 * rules (no line number) that are checked every BASIC line.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const STORAGE_KEY = "zxspec-basic-breakpoints";

export class BasicBreakpointManager {
  constructor() {
    // Map of "lineNumber" or "lineNumber:stmtIndex" -> { enabled, condition, conditionRules }
    this.breakpoints = new Map();
    // Condition-only rules (no line) — always evaluated
    this.conditionRules = [];
    this._proxy = null;
    this.load();
  }

  _key(lineNumber, stmtIndex = 0) {
    return stmtIndex > 0 ? `${lineNumber}:${stmtIndex}` : `${lineNumber}`;
  }

  _parseKey(key) {
    const parts = key.split(":");
    return {
      lineNumber: parseInt(parts[0], 10),
      stmtIndex: parts.length > 1 ? parseInt(parts[1], 10) : 0,
    };
  }

  add(lineNumber, stmtIndex = 0) {
    const key = this._key(lineNumber, stmtIndex);
    if (this.breakpoints.has(key)) return;
    this.breakpoints.set(key, { enabled: true, condition: null, conditionRules: null });
    this.save();
  }

  remove(lineNumber, stmtIndex = 0) {
    const key = this._key(lineNumber, stmtIndex);
    this.breakpoints.delete(key);
    this.save();
  }

  toggle(lineNumber, stmtIndex = 0) {
    const key = this._key(lineNumber, stmtIndex);
    if (this.breakpoints.has(key)) {
      this.remove(lineNumber, stmtIndex);
    } else {
      this.add(lineNumber, stmtIndex);
    }
  }

  has(lineNumber, stmtIndex = 0) {
    return this.breakpoints.has(this._key(lineNumber, stmtIndex));
  }

  setEnabled(lineNumber, stmtIndex, enabled) {
    const key = this._key(lineNumber, stmtIndex);
    const bp = this.breakpoints.get(key);
    if (bp) {
      bp.enabled = enabled;
      this.save();
    }
  }

  isEnabled(lineNumber, stmtIndex = 0) {
    const bp = this.breakpoints.get(this._key(lineNumber, stmtIndex));
    return bp ? bp.enabled : false;
  }

  setCondition(lineNumber, stmtIndex, condition) {
    const key = this._key(lineNumber, stmtIndex);
    const bp = this.breakpoints.get(key);
    if (bp) {
      bp.condition = condition || null;
      this.save();
    }
  }

  getCondition(lineNumber, stmtIndex = 0) {
    const bp = this.breakpoints.get(this._key(lineNumber, stmtIndex));
    return bp ? bp.condition : null;
  }

  setConditionRules(lineNumber, stmtIndex, rules) {
    const key = this._key(lineNumber, stmtIndex);
    const bp = this.breakpoints.get(key);
    if (bp) {
      bp.conditionRules = rules || null;
      this.save();
    }
  }

  getConditionRules(lineNumber, stmtIndex = 0) {
    const bp = this.breakpoints.get(this._key(lineNumber, stmtIndex));
    return bp ? bp.conditionRules : null;
  }

  hasCondition(lineNumber, stmtIndex = 0) {
    const bp = this.breakpoints.get(this._key(lineNumber, stmtIndex));
    return bp ? !!bp.condition : false;
  }

  addConditionRule(condition, conditionRules) {
    this.conditionRules.push({ enabled: true, fired: false, condition, conditionRules });
    this.save();
  }

  removeConditionRule(index) {
    this.conditionRules.splice(index, 1);
    this.save();
  }

  updateConditionRule(index, condition, conditionRules) {
    const rule = this.conditionRules[index];
    if (rule) {
      rule.condition = condition;
      rule.conditionRules = conditionRules;
      this.save();
    }
  }

  setConditionRuleEnabled(index, enabled) {
    const rule = this.conditionRules[index];
    if (rule) {
      rule.enabled = enabled;
      rule.fired = false;
      this.save();
    }
  }

  resetConditionRuleFired() {
    for (const rule of this.conditionRules) {
      rule.fired = false;
    }
  }

  hasActiveConditionRules() {
    return this.conditionRules.some((r) => r.enabled && !r.fired && r.condition);
  }

  getAll() {
    return Array.from(this.breakpoints.entries()).map(([key, bp]) => {
      const { lineNumber, stmtIndex } = this._parseKey(key);
      return { lineNumber, stmtIndex, ...bp };
    });
  }

  getLineNumbers() {
    const lines = new Set();
    for (const [key, bp] of this.breakpoints) {
      if (bp.enabled) {
        const { lineNumber } = this._parseKey(key);
        lines.add(lineNumber);
      }
    }
    return lines;
  }

  /**
   * Check whether a breakpoint at the given line should actually pause.
   * If the breakpoint has no condition, always returns true.
   * If it has a condition, evaluates it via the C++ evaluator.
   * Returns a Promise<boolean>.
   */
  async shouldBreak(lineNumber, stmtIndex = 0) {
    const key = this._key(lineNumber, stmtIndex);
    const bp = this.breakpoints.get(key);
    if (!bp || !bp.enabled) return false;

    // No condition — always break
    if (!bp.condition) return true;

    // Evaluate condition via WASM
    if (this._proxy) {
      const { result } = await this._proxy.evaluateCondition(bp.condition);
      return result;
    }
    return true;
  }

  /**
   * Check all condition-only rules (no line number).
   * Returns the index of the first rule that fires, or -1 if none.
   */
  async shouldBreakOnConditionRules() {
    if (this.conditionRules.length === 0 || !this._proxy) return -1;
    for (let i = 0; i < this.conditionRules.length; i++) {
      const rule = this.conditionRules[i];
      if (!rule.enabled || !rule.condition || rule.fired) continue;
      const { result } = await this._proxy.evaluateCondition(rule.condition);
      if (result) {
        rule.fired = true;
        return i;
      }
    }
    return -1;
  }

  setProxy(proxy) {
    this._proxy = proxy;
  }

  save() {
    try {
      const data = {
        breakpoints: [],
        conditionRules: this.conditionRules.map(({ fired, ...rest }) => rest),
      };
      for (const [key, bp] of this.breakpoints) {
        data.breakpoints.push({ key, ...bp });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // ignore
    }
  }

  load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.breakpoints) {
          for (const item of data.breakpoints) {
            this.breakpoints.set(item.key, {
              enabled: item.enabled,
              condition: item.condition || null,
              conditionRules: item.conditionRules || null,
            });
          }
        }
        if (data.conditionRules) {
          this.conditionRules = data.conditionRules;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Export line numbers as a Set for compatibility with the existing
   * setBasicBreakpointMode API.
   */
  toLineNumberSet() {
    return this.getLineNumbers();
  }

  get size() {
    return this.breakpoints.size;
  }
}
