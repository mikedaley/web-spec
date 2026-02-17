/*
 * breakpoint-manager.js - Breakpoint management for Z80 CPU debugger
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const STORAGE_KEY = "zxspec-breakpoints";

export class BreakpointManager {
  constructor() {
    this.breakpoints = new Map(); // addr -> { enabled: bool }
    this.tempBreakpoint = null;
    this.load();
  }

  add(addr) {
    if (this.breakpoints.has(addr)) return;
    this.breakpoints.set(addr, { enabled: true });
    this.save();
  }

  remove(addr) {
    this.breakpoints.delete(addr);
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

  setTempBreakpoint(addr) {
    this.tempBreakpoint = addr;
  }

  clearTempBreakpoint() {
    this.tempBreakpoint = null;
  }

  getTempBreakpoint() {
    return this.tempBreakpoint;
  }

  syncToProxy(proxy) {
    if (!proxy) return;
    for (const [addr, bp] of this.breakpoints) {
      proxy.addBreakpoint(addr);
      proxy.enableBreakpoint(addr, bp.enabled);
    }
  }

  addToProxy(proxy, addr) {
    if (!proxy) return;
    proxy.addBreakpoint(addr);
  }

  removeFromProxy(proxy, addr) {
    if (!proxy) return;
    proxy.removeBreakpoint(addr);
  }

  enableInProxy(proxy, addr, enabled) {
    if (!proxy) return;
    proxy.enableBreakpoint(addr, enabled);
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
