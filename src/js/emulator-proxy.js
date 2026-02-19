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
    this.onTapLoaded = null;
    this.onTapLoadError = null;
    this.onTapeRecordComplete = null;
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
        if (msg.recordedBlocks) this._recordedBlocks = msg.recordedBlocks;
        if (msg.beeperWaveform) this._beeperWaveform = msg.beeperWaveform;
        if (msg.ayRegisters) this._ayRegisters = msg.ayRegisters;
        if (msg.ayMutes) this._ayMutes = msg.ayMutes;
        if (msg.ayWaveforms) this._ayWaveforms = msg.ayWaveforms;
        if (this.onFrame) this.onFrame(msg.framebuffer, msg.audio, msg.sampleCount);
        break;

      case "snapshotLoaded":
        this.state = msg.state;
        if (this.onSnapshotLoaded) this.onSnapshotLoaded();
        break;

      case "tapLoaded":
        this.state = msg.state;
        if (this.onTapLoaded) this.onTapLoaded(msg.blocks, msg.metadata);
        break;

      case "tapLoadError":
        this.state = msg.state;
        if (this.onTapLoadError) this.onTapLoadError(msg.error);
        break;

      case "tapeRecordComplete":
        this.state = msg.state;
        if (msg.recordedBlocks) this._recordedBlocks = msg.recordedBlocks;
        if (this.onTapeRecordComplete) this.onTapeRecordComplete(msg.data, msg.size, msg.recordedBlocks);
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

  loadTAP(arrayBuffer) {
    this.worker.postMessage(
      { type: "loadTAP", data: arrayBuffer },
      [arrayBuffer],
    );
  }

  loadTZXTape(arrayBuffer) {
    this.worker.postMessage(
      { type: "loadTZXTape", data: arrayBuffer },
      [arrayBuffer],
    );
  }

  tapePlay() {
    this.worker.postMessage({ type: "tapePlay" });
  }

  tapeStop() {
    this.worker.postMessage({ type: "tapeStop" });
  }

  tapeRewind() {
    this.worker.postMessage({ type: "tapeRewind" });
  }

  tapeRewindBlock() {
    this.worker.postMessage({ type: "tapeRewindBlock" });
  }

  tapeForwardBlock() {
    this.worker.postMessage({ type: "tapeForwardBlock" });
  }

  tapeEject() {
    this.worker.postMessage({ type: "tapeEject" });
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
  tapeIsPlaying() { return this.state.tapeIsPlaying ?? false; }
  tapeIsLoaded() { return this.state.tapeIsLoaded ?? false; }
  tapeGetBlockCount() { return this.state.tapeBlockCount ?? 0; }
  tapeGetCurrentBlock() { return this.state.tapeCurrentBlock ?? 0; }
  tapeGetInstantLoad() { return this.state.tapeInstantLoad ?? false; }
  tapeGetBlockProgress() { return this.state.tapeBlockProgress ?? 0; }
  tapeIsRecording() { return this.state.tapeIsRecording ?? false; }
  tapeRecordGetBlockCount() { return this.state.tapeRecordBlockCount ?? 0; }
  tapeRecordGetBlocks() { return this._recordedBlocks || []; }

  // AY-3-8912 accessors (from cached frame data)
  _getAYRegister(reg) {
    return this._ayRegisters ? this._ayRegisters[reg] ?? 0 : 0;
  }

  _getAYChannelMute(ch) {
    return this._ayMutes ? this._ayMutes[ch] ?? false : false;
  }

  _setAYChannelMute(ch, muted) {
    if (this._ayMutes) this._ayMutes[ch] = muted;
    this.worker.postMessage({ type: "setAYChannelMute", ch, muted });
  }

  getBeeperWaveform() {
    return this._beeperWaveform ?? null;
  }

  getAYWaveform(ch) {
    return this._ayWaveforms ? this._ayWaveforms[ch] ?? null : null;
  }

  isAYEnabled() {
    return this.state.ayEnabled ?? false;
  }

  setAYEnabled(enabled) {
    this.worker.postMessage({ type: "setAYEnabled", enabled });
  }

  tapeRecordStart() {
    this._recordedBlocks = null;
    this.worker.postMessage({ type: "tapeRecordStart" });
  }

  tapeRecordStop() {
    this.worker.postMessage({ type: "tapeRecordStop" });
  }

  tapeSetBlockPause(blockIndex, pauseMs) {
    this.worker.postMessage({ type: "tapeSetBlockPause", blockIndex, pauseMs });
  }

  tapeSetInstantLoad(instant) {
    this.worker.postMessage({ type: "tapeSetInstantLoad", instant });
  }

  destroy() {
    this.worker.terminate();
  }
}
