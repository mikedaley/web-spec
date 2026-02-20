/*
 * breakpoint-manager.js - Breakpoint management for Z80 CPU debugger
 *
 * C++ is the single source of truth for breakpoint state at runtime.
 * localStorage provides persistence across page reloads.
 * On startup, saved breakpoints are synced to C++ via syncToProxy().
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const STORAGE_KEY = "zxspec-breakpoints";

export class BreakpointManager {
  constructor() {
    this.breakpoints = new Map(); // addr -> { enabled: bool } - localStorage cache
    this._proxy = null;
    this.load();
  }

  add(addr) {
    if (this.breakpoints.has(addr)) return;
    this.breakpoints.set(addr, { enabled: true });
    if (this._proxy) this._proxy.addBreakpoint(addr);
    this.save();
  }

  remove(addr) {
    this.breakpoints.delete(addr);
    if (this._proxy) this._proxy.removeBreakpoint(addr);
    this.save();
  }

  toggle(addr) {
    if (this.breakpoints.has(addr)) {
      this.remove(addr);
    } else {
      this.add(addr);
    }
  }

  enable(addr, enabled) {
    const bp = this.breakpoints.get(addr);
    if (bp) {
      bp.enabled = enabled;
      if (this._proxy) this._proxy.enableBreakpoint(addr, enabled);
      this.save();
    }
  }

  has(addr) {
    return this.breakpoints.has(addr);
  }

  isEnabled(addr) {
    const bp = this.breakpoints.get(addr);
    return bp ? bp.enabled : false;
  }

  getAll() {
    return Array.from(this.breakpoints.entries()).map(([addr, bp]) => ({
      addr,
      enabled: bp.enabled,
    }));
  }

  /**
   * Query C++ for the canonical breakpoint list and update the local cache.
   * Returns a Promise that resolves to the breakpoint array.
   */
  async refreshFromCpp() {
    if (!this._proxy) return this.getAll();
    try {
      const json = await this._proxy.getBreakpointList();
      const list = JSON.parse(json);
      this.breakpoints.clear();
      for (const bp of list) {
        this.breakpoints.set(bp.addr, { enabled: bp.enabled });
      }
      this.save();
      return this.getAll();
    } catch (e) {
      return this.getAll();
    }
  }

  syncToProxy(proxy) {
    this._proxy = proxy;
    if (!proxy) return;
    for (const [addr, bp] of this.breakpoints) {
      proxy.addBreakpoint(addr);
      proxy.enableBreakpoint(addr, bp.enabled);
    }
  }

  save() {
    try {
      const data = [];
      for (const [addr, bp] of this.breakpoints) {
        data.push({ addr, enabled: bp.enabled });
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
        for (const item of data) {
          this.breakpoints.set(item.addr, { enabled: item.enabled });
        }
      }
    } catch (e) {
      // ignore
    }
  }
}
