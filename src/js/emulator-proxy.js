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
    this.onMachineSwitched = null;
    this.onTapLoaded = null;
    this.onTapLoadError = null;
    this.onTapeRecordComplete = null;
    this.onDiskInserted = null;
    this.onDiskEjected = null;
    this.onOpusDiskInserted = null;
    this.onOpusDiskEjected = null;
    this.onBasicBreakpointHit = null;
    this.onSpectranetCommand = null;
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
        if (msg.ayInternals) this._ayInternals = msg.ayInternals;
        if (this.onFrame) this.onFrame(msg.framebuffer, msg.signalBuffer, msg.audio, msg.sampleCount);
        break;

      case "pausedFrame":
        // Minimal update when paused — no framebuffer/texture work.
        // Send silence to the audio worklet so it can reset pendingRequest.
        this.state = msg.state;
        if (this.onPausedFrame) this.onPausedFrame();
        break;

      case "stepFrame":
        // After step/stepOver/stepOut — display rendered at current T-state.
        this.state = msg.state;
        this._lastStepActualTs = msg.actualTs ?? 0;
        if (this.onFrame) this.onFrame(msg.framebuffer, msg.signalBuffer, null, 0);
        if (this.onStateUpdate) this.onStateUpdate();
        break;

      case "machineSwitched":
        if (this.onMachineSwitched) this.onMachineSwitched(msg.machineId);
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

      case "basicBreakpointHit": {
        this.state = msg.state;
        if (this.onBasicBreakpointHit) {
          this.onBasicBreakpointHit(msg.framebuffer, msg.lineNumber, msg.hit, msg.statementIndex);
        }
        break;
      }

      case "spectranetCommand":
        if (this.onSpectranetCommand) this.onSpectranetCommand(msg.command);
        break;

      case "spectranetSRAMData": {
        const resolve = this._pendingRequests.get("spectranetSRAM");
        if (resolve) {
          this._pendingRequests.delete("spectranetSRAM");
          resolve(msg.data ? new Uint8Array(msg.data) : null);
        }
        break;
      }

      case "spectranetFlashData": {
        const resolve = this._pendingRequests.get("spectranetFlash");
        if (resolve) {
          this._pendingRequests.delete("spectranetFlash");
          resolve(msg.data ? new Uint8Array(msg.data) : null);
        }
        break;
      }

      case "spectranetFlashConfigData": {
        const resolve = this._pendingRequests.get("spectranetFlashConfig");
        if (resolve) {
          this._pendingRequests.delete("spectranetFlashConfig");
          resolve(msg.data ? new Uint8Array(msg.data) : null);
        }
        break;
      }

      case "diskInserted":
        this.state = msg.state;
        if (this.onDiskInserted) this.onDiskInserted(msg.drive);
        break;

      case "diskEjected":
        this.state = msg.state;
        if (this.onDiskEjected) this.onDiskEjected(msg.drive);
        break;

      case "diskExportData": {
        const key = `diskExport_${msg.drive}`;
        const resolve = this._pendingRequests.get(key);
        if (resolve) {
          this._pendingRequests.delete(key);
          resolve(msg.data ? new Uint8Array(msg.data) : null);
        }
        break;
      }

      case "opusDiskInserted":
        this.state = msg.state;
        if (this.onOpusDiskInserted) this.onOpusDiskInserted(msg.drive);
        break;

      case "opusDiskEjected":
        this.state = msg.state;
        if (this.onOpusDiskEjected) this.onOpusDiskEjected(msg.drive);
        break;

      case "opusDiskExportData": {
        const opusKey = `opusDiskExport_${msg.drive}`;
        const opusResolve = this._pendingRequests.get(opusKey);
        if (opusResolve) {
          this._pendingRequests.delete(opusKey);
          opusResolve(msg.data ? new Uint8Array(msg.data) : null);
        }
        break;
      }

      case "memoryData": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.data);
        }
        break;
      }

      case "accessFlagsData": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.data);
        }
        break;
      }

      case "basicTokenizeResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.data);
        }
        break;
      }

      case "basicParseProgramResult":
      case "basicParseVariablesResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.json);
        }
        break;
      }

      case "basicWriteProgramResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve();
        }
        break;
      }

      case "displayDimensionsResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve({ width: msg.width, height: msg.height });
        }
        break;
      }

      case "beamPositionResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve({
            x: msg.x, y: msg.y,
            scanline: msg.scanline, hTs: msg.hTs,
            inVBL: msg.inVBL, inHBLANK: msg.inHBLANK
          });
        }
        break;
      }

      case "addBeamBreakpointResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.bpId);
        }
        break;
      }

      case "isBeamBreakpointHitResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve({
            hit: msg.hit, hitId: msg.hitId,
            hitScanline: msg.hitScanline, hitHTs: msg.hitHTs
          });
        }
        break;
      }

      case "breakpointListResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.json);
        }
        break;
      }

      case "basicRenumberProgramResult":
      case "basicAutoRenumberResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.text);
        }
        break;
      }

      case "disassembleResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.data);
        }
        break;
      }

      case "disassembleAroundPCResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.data);
        }
        break;
      }

      case "traceDataResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg);
        }
        break;
      }

      case "evaluateConditionResult":
      case "evaluateExpressionResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve({ result: msg.result, error: msg.error });
        }
        break;
      }

      case "assembleResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve({
            success: msg.success,
            origin: msg.origin,
            output: msg.output,
            errors: msg.errors,
            listing: msg.listing,
          });
        }
        break;
      }

      case "exportStateResult": {
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve(msg.data);
        }
        break;
      }

      case "importStateResult": {
        this.state = msg.state;
        if (msg.success && this.onMachineSwitched) {
          const currentMachineId = this.state.machineId;
          const savedMachineId = parseInt(localStorage.getItem("zxspec-machine-id") || "0", 10);
          if (currentMachineId !== savedMachineId) {
            this.onMachineSwitched(msg.machineId);
          }
        }
        const resolve = this._pendingRequests.get(msg.id);
        if (resolve) {
          this._pendingRequests.delete(msg.id);
          resolve({ success: msg.success, machineId: msg.machineId });
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

  triggerNMI() {
    this.worker.postMessage({ type: "triggerNMI" });
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

  setKempstonJoystick(value) {
    this.worker.postMessage({ type: "setKempstonJoystick", value });
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

  stepOver() {
    this.worker.postMessage({ type: "stepOver" });
  }

  stepOut() {
    this.worker.postMessage({ type: "stepOut" });
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

  loadP(arrayBuffer) {
    this.worker.postMessage(
      { type: "loadP", data: arrayBuffer },
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

  readAccessFlags() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "readAccessFlags", id });
    });
  }

  setAccessTracking(enabled) {
    this.worker.postMessage({ type: "setAccessTracking", enabled });
  }

  assemble(source, org = 0x8000) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "assemble", source, org, id });
    });
  }

  writeMemory(addr, value) {
    this.worker.postMessage({ type: "writeMemory", addr, value });
  }

  writeMemoryBulk(addr, data) {
    const buffer = new Uint8Array(data).buffer;
    this.worker.postMessage({ type: "writeMemoryBulk", addr, data: buffer }, [buffer]);
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

  setSpeed(speed) {
    this.worker.postMessage({ type: "setSpeed", speed });
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
  getLastStepActualTs() { return this._lastStepActualTs ?? 0; }
  isBreakpointHit() { return this.state.breakpointHit ?? false; }
  getBreakpointAddress() { return this.state.breakpointAddr ?? 0; }
  getMachineId() { return this.state.machineId ?? 0; }
  hasBasicProgram() { return this.state.hasBasicProgram ?? false; }
  isBasicReportFired() { return this.state.basicReportFired ?? false; }
  setBasicProgramActive() {
    this.worker.postMessage({ type: "setBasicProgramActive" });
  }
  clearBasicReportFired() {
    this.worker.postMessage({ type: "clearBasicReportFired" });
  }
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

  getAYInternals() {
    return this._ayInternals ?? null;
  }

  isAYEnabled() {
    return this.state.ayEnabled ?? false;
  }

  setAYEnabled(enabled) {
    this.worker.postMessage({ type: "setAYEnabled", enabled });
  }

  isSpecdrumEnabled() {
    return this.state.specdrumEnabled ?? false;
  }

  setSpecdrumEnabled(enabled) {
    this.worker.postMessage({ type: "setSpecdrumEnabled", enabled });
  }

  getIssueNumber() {
    return this.state.issueNumber ?? 3;
  }

  getPagingRegister() {
    return this.state.pagingRegister ?? 0;
  }

  getPagingRegister1FFD() {
    return this.state.pagingRegister1FFD ?? 0;
  }

  setIssueNumber(issue) {
    this.worker.postMessage({ type: "setIssueNumber", issue });
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

  setBasicBreakpointMode(mode, lineNumbers) {
    if (mode === "step") {
      this.worker.postMessage({ type: "setBasicBreakpointMode", mode: "step" });
    } else if (mode === "run") {
      this.worker.postMessage({ type: "setBasicBreakpointMode", mode: "run", lineNumbers: [...lineNumbers] });
    }
  }

  clearBasicBreakpointMode() {
    this.worker.postMessage({ type: "clearBasicBreakpointMode" });
  }

  basicTokenize(text) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "basicTokenize", text, id });
    });
  }

  basicParseProgram() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "basicParseProgram", id });
    });
  }

  basicParseVariables() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "basicParseVariables", id });
    });
  }

  disassemble(addr, count) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "disassemble", addr, count, id });
    });
  }

  disassembleAroundPC(pc, rowsBefore, rowsAfter) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "disassembleAroundPC", pc, rowsBefore, rowsAfter, id });
    });
  }

  getDisplayDimensions() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "getDisplayDimensions", id });
    });
  }

  getBeamPosition() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "getBeamPosition", id });
    });
  }

  addBeamBreakpoint(scanline, hTs) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "addBeamBreakpoint", id, scanline, hTs });
    });
  }

  removeBeamBreakpoint(bpId) {
    this.worker.postMessage({ type: "removeBeamBreakpoint", bpId });
  }

  enableBeamBreakpoint(bpId, enabled) {
    this.worker.postMessage({ type: "enableBeamBreakpoint", bpId, enabled });
  }

  clearAllBeamBreakpoints() {
    this.worker.postMessage({ type: "clearAllBeamBreakpoints" });
  }

  isBeamBreakpointHit() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "isBeamBreakpointHit", id });
    });
  }

  getBreakpointList() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "getBreakpointList", id });
    });
  }

  basicRenumberProgram(text, startNum = 10, step = 10) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "basicRenumberProgram", text, startNum, step, id });
    });
  }

  basicAutoRenumber(text) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "basicAutoRenumber", text, id });
    });
  }

  basicWriteProgram(programBytes) {
    const id = this._nextId++;
    const buffer = new Uint8Array(programBytes).buffer;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "basicWriteProgram", data: buffer, id }, [buffer]);
    });
  }

  evaluateCondition(expr) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "evaluateCondition", expr, id });
    });
  }

  evaluateExpression(expr) {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "evaluateExpression", expr, id });
    });
  }

  exportState() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "exportState", id });
    });
  }

  importState(data) {
    const id = this._nextId++;
    const buffer = new Uint8Array(data);
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "importState", id, data: buffer.buffer }, [buffer.buffer]);
    });
  }

  // Spectranet Ethernet interface
  isSpectranetEnabled() {
    return this.state.spectranetEnabled ?? false;
  }

  setSpectranetEnabled(enabled) {
    this.worker.postMessage({ type: "setSpectranetEnabled", enabled });
  }

  spectranetPushData(socket, data) {
    const buffer = new Uint8Array(data).buffer;
    this.worker.postMessage({ type: "spectranetPushData", socket, data: buffer }, [buffer]);
  }

  spectranetSetSocketStatus(socket, status) {
    this.worker.postMessage({ type: "spectranetSetSocketStatus", socket, status });
  }

  spectranetSetNetworkConfig(ip, gateway, subnet, dns) {
    this.worker.postMessage({
      type: "spectranetSetNetworkConfig",
      ip: new Uint8Array(ip),
      gateway: new Uint8Array(gateway),
      subnet: new Uint8Array(subnet),
      dns: new Uint8Array(dns),
    });
  }

  spectranetSetStaticIP(useStatic) {
    this.worker.postMessage({ type: "spectranetSetStaticIP", useStatic });
  }

  spectranetGetSRAM() {
    return new Promise((resolve) => {
      this._pendingRequests.set("spectranetSRAM", resolve);
      this.worker.postMessage({ type: "spectranetGetSRAM" });
    });
  }

  spectranetSetSRAM(data) {
    const buffer = new Uint8Array(data).buffer;
    this.worker.postMessage({ type: "spectranetSetSRAM", data: buffer }, [buffer]);
  }

  spectranetGetFlashData() {
    return new Promise((resolve) => {
      this._pendingRequests.set("spectranetFlash", resolve);
      this.worker.postMessage({ type: "spectranetGetFlashData" });
    });
  }

  spectranetReloadROM() {
    this.worker.postMessage({ type: "spectranetReloadROM" });
  }

  spectranetSetFlashData(data) {
    const buffer = new Uint8Array(data).buffer;
    this.worker.postMessage({ type: "spectranetSetFlashData", data: buffer }, [buffer]);
  }

  spectranetGetFlashConfig() {
    return new Promise((resolve) => {
      this._pendingRequests.set("spectranetFlashConfig", resolve);
      this.worker.postMessage({ type: "spectranetGetFlashConfig" });
    });
  }

  spectranetSetFlashConfig(data) {
    const buffer = new Uint8Array(data).buffer;
    this.worker.postMessage({ type: "spectranetSetFlashConfig", data: buffer }, [buffer]);
  }

  // Disk drive (FDC) - +3 only
  diskInsert(drive, arrayBuffer) {
    this.worker.postMessage(
      { type: "diskInsert", drive, data: arrayBuffer },
      [arrayBuffer],
    );
  }

  diskInsertEmpty(drive = 0) {
    this.worker.postMessage({ type: "diskInsertEmpty", drive });
  }

  diskEject(drive = 0) {
    this.worker.postMessage({ type: "diskEject", drive });
  }

  diskSetWriteProtected(drive, wp) {
    this.worker.postMessage({ type: "diskSetWriteProtected", drive, wp });
  }

  diskExport(drive = 0) {
    return new Promise((resolve) => {
      this._pendingRequests.set(`diskExport_${drive}`, resolve);
      this.worker.postMessage({ type: "diskExport", drive });
    });
  }

  // Opus Discovery disk interface
  isOpusEnabled() {
    return this.state.opusEnabled ?? false;
  }

  setOpusEnabled(enabled) {
    this.worker.postMessage({ type: "setOpusEnabled", enabled });
  }

  opusDiskInsert(drive, arrayBuffer) {
    this.worker.postMessage(
      { type: "opusDiskInsert", drive, data: arrayBuffer },
      [arrayBuffer],
    );
  }

  opusDiskInsertEmpty(drive = 0) {
    this.worker.postMessage({ type: "opusDiskInsertEmpty", drive });
  }

  opusDiskEject(drive = 0) {
    this.worker.postMessage({ type: "opusDiskEject", drive });
  }

  opusDiskSetWriteProtected(drive, wp) {
    this.worker.postMessage({ type: "opusDiskSetWriteProtected", drive, wp });
  }

  opusDiskExport(drive = 0) {
    return new Promise((resolve) => {
      this._pendingRequests.set(`opusDiskExport_${drive}`, resolve);
      this.worker.postMessage({ type: "opusDiskExport", drive });
    });
  }

  traceEnable(enable) {
    this.worker.postMessage({ type: "traceEnable", enable });
  }

  traceGetData() {
    const id = this._nextId++;
    return new Promise((resolve) => {
      this._pendingRequests.set(id, resolve);
      this.worker.postMessage({ type: "traceGetData", id });
    });
  }

  destroy() {
    this.worker.terminate();
  }
}
