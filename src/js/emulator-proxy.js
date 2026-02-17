/*
 * emulator-proxy.js - Main-thread proxy wrapping the Web Worker
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class EmulatorProxy {
  constructor() {
    this.worker = new Worker("/src/js/emulator-worker.js");
    this.state = {};
    this.onFrame = null;
    this.onReady = null;
    this.onSnapshotLoaded = null;
    this.onStateUpdate = null;
    this._nextId = 1;
    this._pendingRequests = new Map();

    this.worker.onmessage = (e) => this._handleMessage(e.data);
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case "ready":
        if (this.onReady) this.onReady();
        break;

      case "frame":
        this.state = msg.state;
        if (this.onFrame) this.onFrame(msg.framebuffer, msg.audio, msg.sampleCount);
        break;

      case "snapshotLoaded":
        this.state = msg.state;
        if (this.onSnapshotLoaded) this.onSnapshotLoaded();
        break;

      case "stateUpdate":
        this.state = msg.state;
        if (this.onStateUpdate) this.onStateUpdate();
        break;

      case "memoryData": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.data);
        }
        break;
      }
    }
  }

  init(machineId) {
    return new Promise((resolve) => {
      this.onReady = resolve;
      this.worker.postMessage({ type: "init", machineId });
    });
  }

  reset() {
    this.worker.postMessage({ type: "reset" });
  }

  runFrames(count) {
    this.worker.postMessage({ type: "runFrames", count });
  }

  keyDown(row, bit) {
    this.worker.postMessage({ type: "keyDown", row, bit });
  }

  keyUp(row, bit) {
    this.worker.postMessage({ type: "keyUp", row, bit });
  }

  pause() {
    this.worker.postMessage({ type: "pause" });
  }

  resume() {
    this.worker.postMessage({ type: "resume" });
  }

  step() {
    this.worker.postMessage({ type: "step" });
  }

  addBreakpoint(addr) {
    this.worker.postMessage({ type: "addBreakpoint", addr });
  }

  removeBreakpoint(addr) {
    this.worker.postMessage({ type: "removeBreakpoint", addr });
  }

  enableBreakpoint(addr, enabled) {
    this.worker.postMessage({ type: "enableBreakpoint", addr, enabled });
  }

  loadSnapshot(format, arrayBuffer) {
    this.worker.postMessage(
      { type: "loadSnapshot", format, data: arrayBuffer },
      [arrayBuffer],
    );
  }

  readMemory(addr, length) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "readMemory", addr, length, id });
    });
  }

  writeMemory(addr, value) {
    this.worker.postMessage({ type: "writeMemory", addr, value });
  }

  setRegister(reg, value) {
    this.worker.postMessage({ type: "setRegister", reg, value });
  }

  switchMachine(machineId) {
    return new Promise((resolve) => {
      this.onReady = resolve;
      this.worker.postMessage({ type: "switchMachine", machineId });
    });
  }

  requestState() {
    this.worker.postMessage({ type: "getState" });
  }

  // State getters (synchronous, return latest cached snapshot)
  getPC() { return this.state.pc ?? 0; }
  getSP() { return this.state.sp ?? 0; }
  getAF() { return this.state.af ?? 0; }
  getBC() { return this.state.bc ?? 0; }
  getDE() { return this.state.de ?? 0; }
  getHL() { return this.state.hl ?? 0; }
  getIX() { return this.state.ix ?? 0; }
  getIY() { return this.state.iy ?? 0; }
  getI() { return this.state.i ?? 0; }
  getR() { return this.state.r ?? 0; }
  getIM() { return this.state.im ?? 0; }
  getIFF1() { return this.state.iff1 ?? 0; }
  getIFF2() { return this.state.iff2 ?? 0; }
  getTStates() { return this.state.ts ?? 0; }
  getAltAF() { return this.state.altAf ?? 0; }
  getAltBC() { return this.state.altBc ?? 0; }
  getAltDE() { return this.state.altDe ?? 0; }
  getAltHL() { return this.state.altHl ?? 0; }
  isPaused() { return this.state.paused ?? false; }
  isBreakpointHit() { return this.state.breakpointHit ?? false; }
  getBreakpointAddress() { return this.state.breakpointAddr ?? 0; }
  getMachineId() { return this.state.machineId ?? 0; }

  destroy() {
    this.worker.terminate();
  }
}
