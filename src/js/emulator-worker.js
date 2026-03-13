/*
 * emulator-worker.js - Web Worker hosting the WASM emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

let wasm = null;
let speedMultiplier = 1;

// Per-socket overflow buffers for data that didn't fit in the W5100's 2KB RX buffer.
// Flushed into the W5100 each frame as the Z80 consumes data.
const rxOverflow = [[], [], [], []];

function flushRxOverflow() {
  if (!wasm || !wasm._isSpectranetEnabled()) return;
  for (let s = 0; s < 4; s++) {
    while (rxOverflow[s].length > 0) {
      const chunk = rxOverflow[s][0];
      const rxPtr = wasm._malloc(chunk.length);
      wasm.HEAPU8.set(chunk, rxPtr);
      const written = wasm._spectranetPushReceivedData(s, rxPtr, chunk.length);
      wasm._free(rxPtr);
      if (written === chunk.length) {
        rxOverflow[s].shift();
      } else if (written > 0) {
        rxOverflow[s][0] = chunk.slice(written);
        break;
      } else {
        break; // No space available
      }
    }
  }
}

function pollSpectranetCommands() {
  if (!wasm._isSpectranetEnabled()) return;

  // Drain the entire command queue (multiple commands may be queued per frame)
  let cmdPtr;
  while ((cmdPtr = wasm._spectranetGetPendingCommand()) !== 0) {
    // Read 16-byte serialized command
    const type = wasm.HEAPU8[cmdPtr];
    const socket = wasm.HEAPU8[cmdPtr + 1];
    const protocol = wasm.HEAPU8[cmdPtr + 2];
    const destIP = [wasm.HEAPU8[cmdPtr + 3], wasm.HEAPU8[cmdPtr + 4], wasm.HEAPU8[cmdPtr + 5], wasm.HEAPU8[cmdPtr + 6]];
    const destPort = (wasm.HEAPU8[cmdPtr + 7] << 8) | wasm.HEAPU8[cmdPtr + 8];
    const srcPort = (wasm.HEAPU8[cmdPtr + 9] << 8) | wasm.HEAPU8[cmdPtr + 10];
    const txOffset = wasm.HEAPU8[cmdPtr + 11] | (wasm.HEAPU8[cmdPtr + 12] << 8);
    const txLength = wasm.HEAPU8[cmdPtr + 13] | (wasm.HEAPU8[cmdPtr + 14] << 8);

    // Read TX data if this is a SEND command (type 6)
    let txData = null;
    if (type === 6 && txLength > 0) {
      const txBufPtr = wasm._spectranetGetTxBuffer();
      if (txBufPtr) {
        // TX buffer is circular: 2KB (0x800) per socket
        const sockBufSize = 0x800;
        const sockBase = socket * sockBufSize;
        const offsetInSock = txOffset - sockBase;
        if (offsetInSock + txLength > sockBufSize) {
          // Data wraps around the circular buffer boundary
          const firstChunk = sockBufSize - offsetInSock;
          txData = new Uint8Array(txLength);
          txData.set(new Uint8Array(wasm.HEAPU8.buffer, txBufPtr + txOffset, firstChunk));
          txData.set(new Uint8Array(wasm.HEAPU8.buffer, txBufPtr + sockBase, txLength - firstChunk), firstChunk);
        } else {
          txData = new Uint8Array(wasm.HEAPU8.buffer, txBufPtr + txOffset, txLength).slice();
        }
      }
    }

    wasm._spectranetClearPendingCommand();

    // Clear stale overflow data when a socket is opened or closed
    // (the C++ side has already reset the RX buffer state)
    if ((type === 1 || type === 5) && socket >= 0 && socket < 4) {
      rxOverflow[socket] = [];
    }

    const cmd = { type, socket, protocol, destIP, destPort, srcPort, txOffset, txLength };
    const transfer = [];
    if (txData) {
      cmd.txData = txData;
      transfer.push(txData.buffer);
    }
    self.postMessage({ type: "spectranetCommand", command: cmd }, transfer);
  }
}

function getState() {
  return {
    pc: wasm._getPC(),
    sp: wasm._getSP(),
    af: wasm._getAF(),
    bc: wasm._getBC(),
    de: wasm._getDE(),
    hl: wasm._getHL(),
    ix: wasm._getIX(),
    iy: wasm._getIY(),
    i: wasm._getI(),
    r: wasm._getR(),
    im: wasm._getIM(),
    iff1: wasm._getIFF1(),
    iff2: wasm._getIFF2(),
    ts: wasm._getTStates(),
    altAf: wasm._getAltAF(),
    altBc: wasm._getAltBC(),
    altDe: wasm._getAltDE(),
    altHl: wasm._getAltHL(),
    paused: wasm._isPaused(),
    breakpointHit: wasm._isBreakpointHit(),
    breakpointAddr: wasm._getBreakpointAddress(),
    machineId: wasm._getMachineId(),
    tapeIsPlaying: wasm._tapeIsPlaying(),
    tapeIsLoaded: wasm._tapeIsLoaded(),
    tapeBlockCount: wasm._tapeGetBlockCount(),
    tapeCurrentBlock: wasm._tapeGetCurrentBlock(),
    tapeInstantLoad: wasm._tapeGetInstantLoad(),
    tapeBlockProgress: wasm._tapeGetBlockProgress(),
    tapeIsRecording: wasm._tapeIsRecording(),
    tapeRecordBlockCount: wasm._tapeRecordGetBlockCount(),
    ayEnabled: wasm._isAYEnabled(),
    specdrumEnabled: !!wasm._isSpecdrumEnabled(),
    issueNumber: wasm._getIssueNumber(),
    pagingRegister: wasm._getPagingRegister(),
    hasBasicProgram: wasm._hasBasicProgram() !== 0,
    basicReportFired: wasm._isBasicReportFired() !== 0,
    spectranetEnabled: !!wasm._isSpectranetEnabled(),
    spectranetPagedIn: !!wasm._spectranetIsPagedIn(),
    spectranetPageA: wasm._spectranetGetPageA(),
    spectranetPageB: wasm._spectranetGetPageB(),
    spectranetControlReg: wasm._spectranetGetControlReg(),
    spectranetTrapAddr: wasm._spectranetGetTrapAddr(),
    spectranetTrapEnabled: !!wasm._spectranetIsTrapEnabled(),
    spectranetSocket0Status: wasm._spectranetGetSocketStatus(0),
    spectranetSocket1Status: wasm._spectranetGetSocketStatus(1),
    spectranetSocket2Status: wasm._spectranetGetSocketStatus(2),
    spectranetSocket3Status: wasm._spectranetGetSocketStatus(3),
    diskInserted: wasm._diskIsInserted(0) !== 0,
    diskModified: wasm._diskIsModified(0) !== 0,
    diskWriteProtected: wasm._diskIsWriteProtected(0) !== 0,
    diskMotorOn: wasm._diskIsMotorOn() !== 0,
    diskCurrentTrack: wasm._diskGetCurrentTrack(0),
    diskFDCPhase: wasm._diskGetFDCPhase(),
    diskReadMode: wasm._diskIsReadMode() !== 0,
  };
}

function runFrames(count) {
  const totalFrames = count * speedMultiplier;
  for (let i = 0; i < totalFrames; i++) {
    wasm._runFrame();

    // Check for BASIC breakpoint hit (filtering is done in C++)
    if (wasm._isBasicBreakpointHit()) {
      const ppc = wasm._getBasicBreakpointLine();
      const statementIndex = wasm._getBasicBreakpointStatement();
      wasm._clearBasicBreakpointHit();

      const fbPtr = wasm._getFramebuffer();
      const fbSize = wasm._getFramebufferSize();
      const fb = new Uint8Array(wasm.HEAPU8.buffer, fbPtr, fbSize).slice();

      // Copy signal buffer
      const sigPtr = wasm._getSignalBuffer();
      const sigSize = wasm._getSignalBufferSize();
      const signalBuf = new Uint8Array(wasm.HEAPU8.buffer, sigPtr, sigSize).slice();

      // Send a silent frame so the audio worklet stays alive
      const silenceCount = 960;
      const silence = new Float32Array(silenceCount);
      wasm._resetAudioBuffer();
      const frameState = getState();
      const frameFb = new Uint8Array(wasm.HEAPU8.buffer, fbPtr, fbSize).slice();
      const frameSig = new Uint8Array(wasm.HEAPU8.buffer, sigPtr, sigSize).slice();
      self.postMessage({
        type: "frame",
        framebuffer: frameFb,
        signalBuffer: frameSig,
        audio: silence,
        sampleCount: silenceCount,
        state: frameState,
        recordedBlocks: null,
        beeperWaveform: new Float32Array(256),
        ayRegisters: null,
        ayMutes: null,
        ayWaveforms: null
      }, [frameFb.buffer, frameSig.buffer, silence.buffer]);

      self.postMessage({
        type: "basicBreakpointHit",
        framebuffer: fb,
        signalBuffer: signalBuf,
        lineNumber: ppc,
        statementIndex,
        hit: true,
        state: frameState
      }, [fb.buffer, signalBuf.buffer]);
      return;
    }
  }

  // Copy framebuffer
  const fbPtr = wasm._getFramebuffer();
  const fbSize = wasm._getFramebufferSize();
  const fbData = new Uint8Array(wasm.HEAPU8.buffer, fbPtr, fbSize);
  const framebuffer = new Uint8Array(fbData);

  // Copy signal buffer (PAL composite)
  const sigPtr = wasm._getSignalBuffer();
  const sigSize = wasm._getSignalBufferSize();
  const signalBuffer = new Uint8Array(wasm.HEAPU8.buffer, sigPtr, sigSize).slice();

  // Copy audio
  let sampleCount = wasm._getAudioSampleCount();
  let audio = null;
  if (sampleCount > 0) {
    const audioPtr = wasm._getAudioBuffer();
    const audioData = new Float32Array(wasm.HEAPF32.buffer, audioPtr, sampleCount);
    // Downsample by speed multiplier so the buffer fits the normal playback rate
    if (speedMultiplier > 1) {
      const outLen = Math.ceil(sampleCount / speedMultiplier);
      const downsampled = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        let sum = 0;
        const start = i * speedMultiplier;
        const end = Math.min(start + speedMultiplier, sampleCount);
        for (let j = start; j < end; j++) sum += audioData[j];
        downsampled[i] = sum / (end - start);
      }
      audio = downsampled;
      sampleCount = outLen;
    } else {
      audio = new Float32Array(audioData);
    }
  }
  wasm._resetAudioBuffer();

  const state = getState();

  // If recording, read detected block info for the UI
  let recordedBlocks = null;
  if (state.tapeIsRecording && state.tapeRecordBlockCount > 0) {
    const recBlockCount = state.tapeRecordBlockCount;
    const recInfoPtr = wasm._tapeRecordGetBlockInfo();
    recordedBlocks = [];
    for (let i = 0; i < recBlockCount; i++) {
      const base = recInfoPtr + i * 20;
      const flagByte = wasm.HEAPU8[base];
      const headerType = wasm.HEAPU8[base + 1];
      let filename = "";
      for (let c = 0; c < 10; c++) {
        const ch = wasm.HEAPU8[base + 2 + c];
        if (ch >= 32 && ch < 127) filename += String.fromCharCode(ch);
      }
      filename = filename.trimEnd();
      const dataLength = wasm.HEAPU8[base + 12] | (wasm.HEAPU8[base + 13] << 8);
      const param1 = wasm.HEAPU8[base + 14] | (wasm.HEAPU8[base + 15] << 8);
      const param2 = wasm.HEAPU8[base + 16] | (wasm.HEAPU8[base + 17] << 8);
      recordedBlocks.push({ index: i, flagByte, headerType, filename, dataLength, param1, param2 });
    }
  }

  // Read beeper-only waveform from the C++ ring buffer (1024 samples max).
  // Cap to ring buffer size to avoid reading stale wrapped data.
  const beeperWaveCount = Math.min(Math.max(sampleCount, 256), 2048);
  const ayWaveCount = 256;
  const waveAllocSize = Math.max(beeperWaveCount, ayWaveCount);
  const wavePtr = wasm._malloc(waveAllocSize * 4);
  wasm._getBeeperWaveform(wavePtr, beeperWaveCount);
  const beeperHeapOffset = wavePtr >> 2;
  const beeperWaveform = new Float32Array(wasm.HEAPF32.buffer, beeperHeapOffset * 4, beeperWaveCount).slice();

  // Read AY state when enabled
  let ayRegisters = null;
  let ayMutes = null;
  let ayWaveforms = null;
  if (state.ayEnabled) {
    ayRegisters = new Uint8Array(16);
    for (let r = 0; r < 16; r++) {
      ayRegisters[r] = wasm._getAYRegister(r);
    }
    ayMutes = [
      !!wasm._getAYChannelMute(0),
      !!wasm._getAYChannelMute(1),
      !!wasm._getAYChannelMute(2),
    ];
    // Read waveform data for 3 channels (256 floats each)
    ayWaveforms = [];
    for (let ch = 0; ch < 3; ch++) {
      wasm._getAYWaveform(ch, wavePtr, ayWaveCount);
      const heapOffset = wavePtr >> 2;
      ayWaveforms.push(new Float32Array(wasm.HEAPF32.buffer, heapOffset * 4, ayWaveCount).slice());
    }
    // Collect AY internal state
    var ayInternals = {
      noiseLFSR: wasm._getAYNoiseLFSR(),
      envHolding: !!wasm._getAYEnvHolding(),
      envAttack: !!wasm._getAYEnvAttack(),
    };
  }
  wasm._free(wavePtr);

  // Transfer buffers for zero-copy
  const transfer = [framebuffer.buffer, signalBuffer.buffer, beeperWaveform.buffer];
  if (audio) transfer.push(audio.buffer);
  if (ayWaveforms) {
    for (const wf of ayWaveforms) transfer.push(wf.buffer);
  }

  self.postMessage({ type: "frame", framebuffer, signalBuffer, audio, sampleCount: sampleCount, state, recordedBlocks, beeperWaveform, ayRegisters, ayMutes, ayWaveforms, ayInternals }, transfer);

  // Flush any buffered RX data into W5100 before polling new commands
  flushRxOverflow();

  // Poll for Spectranet network commands after each frame
  pollSpectranetCommands();
}

self.onmessage = async function (e) {
  const msg = e.data;

  switch (msg.type) {
    case "init": {
      importScripts("/zxspec.js");
      wasm = await createZXSpecModule({
        locateFile: (path) => "/" + path,
      });
      if (msg.machineId !== undefined) {
        wasm._initMachine(msg.machineId);
      } else {
        wasm._init();
      }
      self.postMessage({ type: "ready" });
      break;
    }

    case "runFrames":
      if (wasm) runFrames(msg.count || 1);
      break;

    case "reset":
      if (wasm) {
        wasm._reset();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "triggerNMI":
      if (wasm) {
        wasm._triggerNMI();
      }
      break;

    case "keyDown":
      if (wasm) wasm._keyDown(msg.row, msg.bit);
      break;

    case "keyUp":
      if (wasm) wasm._keyUp(msg.row, msg.bit);
      break;

    case "loadSnapshot": {
      if (!wasm) break;
      const data = new Uint8Array(msg.data);
      const ptr = wasm._malloc(data.length);
      wasm.HEAPU8.set(data, ptr);

      // Detect required machine and switch if needed
      const fmtPtr = wasm._malloc(msg.format.length + 1);
      for (let i = 0; i < msg.format.length; i++) {
        wasm.HEAPU8[fmtPtr + i] = msg.format.charCodeAt(i);
      }
      wasm.HEAPU8[fmtPtr + msg.format.length] = 0;

      const requiredMachine = wasm._detectSnapshotMachine(ptr, data.length, fmtPtr);
      wasm._free(fmtPtr);

      let machineSwitched = false;
      if (requiredMachine >= 0) {
        const currentMachine = wasm._getMachineId();
        if (requiredMachine !== currentMachine) {
          wasm._initMachine(requiredMachine);
          machineSwitched = true;
        }
      }

      switch (msg.format) {
        case "sna": wasm._loadSNA(ptr, data.length); break;
        case "z80": wasm._loadZ80(ptr, data.length); break;
        case "tzx": wasm._loadTZX(ptr, data.length); break;
      }
      wasm._free(ptr);

      if (machineSwitched) {
        self.postMessage({ type: "machineSwitched", machineId: requiredMachine });
      }
      self.postMessage({ type: "snapshotLoaded", state: getState() });
      break;
    }

    case "pause":
      if (wasm) {
        wasm._setPaused(true);
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "resume":
      if (wasm) {
        wasm._clearBreakpointHit();
        wasm._setPaused(false);
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "step":
      if (wasm) {
        wasm._clearBreakpointHit();
        wasm._stepInstruction();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "stepOver":
      if (wasm) {
        wasm._stepOver();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "stepOut":
      if (wasm) {
        wasm._stepOut();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "addBreakpoint":
      if (wasm) wasm._addBreakpoint(msg.addr);
      break;

    case "removeBreakpoint":
      if (wasm) wasm._removeBreakpoint(msg.addr);
      break;

    case "enableBreakpoint":
      if (wasm) wasm._enableBreakpoint(msg.addr, msg.enabled);
      break;

    case "readMemory": {
      if (!wasm) break;
      const result = new Uint8Array(msg.length);
      for (let i = 0; i < msg.length; i++) {
        result[i] = wasm._readMemory((msg.addr + i) & 0xFFFF);
      }
      self.postMessage({ type: "memoryData", id: msg.id, data: result }, [result.buffer]);
      break;
    }

    case "readAccessFlags": {
      if (!wasm) break;
      const ptr = wasm._getAccessFlags();
      if (ptr) {
        const flags = new Uint8Array(wasm.HEAPU8.buffer, ptr, 65536);
        const copy = new Uint8Array(65536);
        copy.set(flags);
        self.postMessage({ type: "accessFlagsData", id: msg.id, data: copy }, [copy.buffer]);
      }
      break;
    }

    case "setAccessTracking":
      if (wasm) wasm._setAccessTracking(msg.enabled);
      break;

    case "writeMemory":
      if (wasm) wasm._writeMemory(msg.addr, msg.value);
      break;

    case "writeMemoryBulk": {
      if (!wasm) break;
      const bulkData = new Uint8Array(msg.data);
      console.log(`[WORKER] writeMemoryBulk addr=0x${msg.addr.toString(16)} len=${bulkData.length} data=[${bulkData.join(",")}]`);
      for (let i = 0; i < bulkData.length; i++) {
        wasm._writeMemory((msg.addr + i) & 0xFFFF, bulkData[i]);
      }
      break;
    }

    case "setRegister":
      if (wasm) {
        const setters = {
          PC: "_setPC", SP: "_setSP", AF: "_setAF", BC: "_setBC",
          DE: "_setDE", HL: "_setHL", IX: "_setIX", IY: "_setIY",
          I: "_setI", R: "_setR",
        };
        const fn = setters[msg.reg];
        if (fn && wasm[fn]) wasm[fn](msg.value);
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "switchMachine":
      if (wasm) {
        wasm._initMachine(msg.machineId);
        self.postMessage({ type: "ready" });
      }
      break;

    case "loadTAP": {
      if (!wasm) break;
      const tapData = new Uint8Array(msg.data);
      const tapPtr = wasm._malloc(tapData.length);
      wasm.HEAPU8.set(tapData, tapPtr);
      wasm._loadTAP(tapPtr, tapData.length);
      wasm._free(tapPtr);

      // Check if load succeeded (blocks were parsed)
      const blockCount = wasm._tapeGetBlockCount();
      if (blockCount === 0 || !wasm._tapeIsLoaded()) {
        self.postMessage({ type: "tapLoadError", error: "Invalid or empty TAP file", state: getState() });
        break;
      }

      // Read block info from WASM (20 bytes per block)
      const blocks = [];
      const infoPtr = wasm._tapeGetBlockInfo();
      for (let i = 0; i < blockCount; i++) {
        const base = infoPtr + i * 20;
        const flagByte = wasm.HEAPU8[base];
        const headerType = wasm.HEAPU8[base + 1];
        let filename = "";
        for (let c = 0; c < 10; c++) {
          const ch = wasm.HEAPU8[base + 2 + c];
          if (ch >= 32 && ch < 127) filename += String.fromCharCode(ch);
        }
        filename = filename.trimEnd();
        const dataLength = wasm.HEAPU8[base + 12] | (wasm.HEAPU8[base + 13] << 8);
        const param1 = wasm.HEAPU8[base + 14] | (wasm.HEAPU8[base + 15] << 8);
        const param2 = wasm.HEAPU8[base + 16] | (wasm.HEAPU8[base + 17] << 8);
        blocks.push({ index: i, flagByte, headerType, filename, dataLength, param1, param2 });
      }

      // Read metadata JSON
      const metaPtr = wasm._tapeGetMetadata();
      const metadataJson = wasm.UTF8ToString(metaPtr);
      const metadata = metadataJson ? JSON.parse(metadataJson) : {};

      self.postMessage({ type: "tapLoaded", blocks, metadata, state: getState() });
      break;
    }

    case "loadTZXTape": {
      if (!wasm) break;
      const tzxData = new Uint8Array(msg.data);
      const tzxPtr = wasm._malloc(tzxData.length);
      wasm.HEAPU8.set(tzxData, tzxPtr);
      wasm._loadTZXTape(tzxPtr, tzxData.length);
      wasm._free(tzxPtr);

      // Check if load succeeded
      const tzxBlockCount = wasm._tapeGetBlockCount();
      if (tzxBlockCount === 0 || !wasm._tapeIsLoaded()) {
        self.postMessage({ type: "tapLoadError", error: "Invalid or empty TZX file", state: getState() });
        break;
      }

      // Read block info from WASM (20 bytes per block)
      const tzxBlocks = [];
      const tzxInfoPtr = wasm._tapeGetBlockInfo();
      for (let i = 0; i < tzxBlockCount; i++) {
        const base = tzxInfoPtr + i * 20;
        const flagByte = wasm.HEAPU8[base];
        const headerType = wasm.HEAPU8[base + 1];
        let filename = "";
        for (let c = 0; c < 10; c++) {
          const ch = wasm.HEAPU8[base + 2 + c];
          if (ch >= 32 && ch < 127) filename += String.fromCharCode(ch);
        }
        filename = filename.trimEnd();
        const dataLength = wasm.HEAPU8[base + 12] | (wasm.HEAPU8[base + 13] << 8);
        const param1 = wasm.HEAPU8[base + 14] | (wasm.HEAPU8[base + 15] << 8);
        const param2 = wasm.HEAPU8[base + 16] | (wasm.HEAPU8[base + 17] << 8);
        tzxBlocks.push({ index: i, flagByte, headerType, filename, dataLength, param1, param2 });
      }

      // Read metadata JSON
      const tzxMetaPtr = wasm._tapeGetMetadata();
      const tzxMetadataJson = wasm.UTF8ToString(tzxMetaPtr);
      const tzxMetadata = tzxMetadataJson ? JSON.parse(tzxMetadataJson) : {};

      self.postMessage({ type: "tapLoaded", blocks: tzxBlocks, metadata: tzxMetadata, state: getState() });
      break;
    }

    case "loadP": {
      if (!wasm) break;
      // .P files require ZX81 (machine ID 5) — auto-switch if needed
      let pMachineSwitched = false;
      if (wasm._getMachineId() !== 5) {
        wasm._initMachine(5);
        pMachineSwitched = true;
      }
      const pData = new Uint8Array(msg.data);
      const pPtr = wasm._malloc(pData.length);
      wasm.HEAPU8.set(pData, pPtr);
      wasm._loadP(pPtr, pData.length);
      wasm._free(pPtr);
      if (pMachineSwitched) {
        self.postMessage({ type: "machineSwitched", machineId: 5 });
      }
      self.postMessage({ type: "snapshotLoaded", state: getState() });
      break;
    }

    case "tapePlay":
      if (wasm) {
        wasm._tapePlay();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "tapeStop":
      if (wasm) {
        wasm._tapeStop();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "tapeRewind":
      if (wasm) {
        wasm._tapeRewind();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "tapeRewindBlock":
      if (wasm) {
        wasm._tapeRewindBlock();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "tapeForwardBlock":
      if (wasm) {
        wasm._tapeForwardBlock();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "tapeEject":
      if (wasm) {
        wasm._tapeEject();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "tapeSetInstantLoad":
      if (wasm) wasm._tapeSetInstantLoad(msg.instant ? 1 : 0);
      break;

    case "tapeSetBlockPause":
      if (wasm) wasm._tapeSetBlockPause(msg.blockIndex, msg.pauseMs);
      break;

    case "tapeRecordStart":
      if (wasm) {
        wasm._tapeRecordStart();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "tapeRecordStop":
      if (wasm) {
        wasm._tapeRecordStop();
        const tapSize = wasm._tapeRecordGetSize();
        let tapData = null;
        if (tapSize > 0) {
          const tapPtr = wasm._tapeRecordGetData();
          const tapRaw = new Uint8Array(wasm.HEAPU8.buffer, tapPtr, tapSize);
          tapData = new Uint8Array(tapRaw);
        }
        // Read final block info (includes the flushed last block)
        const recBlockCount = wasm._tapeRecordGetBlockCount();
        let finalBlocks = null;
        if (recBlockCount > 0) {
          const recInfoPtr = wasm._tapeRecordGetBlockInfo();
          finalBlocks = [];
          for (let i = 0; i < recBlockCount; i++) {
            const base = recInfoPtr + i * 20;
            const flagByte = wasm.HEAPU8[base];
            const headerType = wasm.HEAPU8[base + 1];
            let filename = "";
            for (let c = 0; c < 10; c++) {
              const ch = wasm.HEAPU8[base + 2 + c];
              if (ch >= 32 && ch < 127) filename += String.fromCharCode(ch);
            }
            filename = filename.trimEnd();
            const dataLength = wasm.HEAPU8[base + 12] | (wasm.HEAPU8[base + 13] << 8);
            const param1 = wasm.HEAPU8[base + 14] | (wasm.HEAPU8[base + 15] << 8);
            const param2 = wasm.HEAPU8[base + 16] | (wasm.HEAPU8[base + 17] << 8);
            finalBlocks.push({ index: i, flagByte, headerType, filename, dataLength, param1, param2 });
          }
        }
        self.postMessage(
          { type: "tapeRecordComplete", data: tapData ? tapData.buffer : null, size: tapSize, recordedBlocks: finalBlocks, state: getState() },
          tapData ? [tapData.buffer] : []
        );
      }
      break;

    case "setSpeed":
      speedMultiplier = Math.max(1, Math.min(5, msg.speed));
      break;

    case "setAYChannelMute":
      if (wasm) wasm._setAYChannelMute(msg.ch, msg.muted ? 1 : 0);
      break;

    case "setAYEnabled":
      if (wasm) wasm._setAYEnabled(msg.enabled ? 1 : 0);
      break;

    case "setSpecdrumEnabled":
      if (wasm) wasm._setSpecdrumEnabled(msg.enabled ? 1 : 0);
      break;

    case "setIssueNumber":
      if (wasm) wasm._setIssueNumber(msg.issue);
      break;

    case "setBasicBreakpointMode": {
      if (!wasm) break;
      wasm._clearBasicBreakpointLines();
      if (msg.mode === "step") {
        wasm._setBasicBreakpointStep();
      } else if (msg.mode === "run") {
        for (const line of msg.lineNumbers) {
          wasm._addBasicBreakpointLine(line);
        }
        wasm._setBasicBreakpointRun();
      }
      self.postMessage({ type: "stateUpdate", state: getState() });
      break;
    }

    case "clearBasicBreakpointMode": {
      if (!wasm) break;
      wasm._clearBasicBreakpointMode();
      break;
    }

    case "setBasicProgramActive": {
      if (!wasm) break;
      wasm._setBasicProgramActive();
      break;
    }

    case "clearBasicReportFired": {
      if (!wasm) break;
      wasm._clearBasicReportFired();
      break;
    }

    case "basicTokenize": {
      if (!wasm) break;
      const encLen = wasm.lengthBytesUTF8(msg.text) + 1;
      const encPtr = wasm._malloc(encLen);
      wasm.stringToUTF8(msg.text, encPtr, encLen);
      const bufPtr = wasm._basicTokenize(encPtr);
      wasm._free(encPtr);
      const bufLen = wasm._basicTokenizeGetLength();
      const result = new Uint8Array(wasm.HEAPU8.buffer, bufPtr, bufLen).slice();
      self.postMessage({ type: "basicTokenizeResult", id: msg.id, data: result }, [result.buffer]);
      break;
    }

    case "basicParseProgram": {
      if (!wasm) break;
      const jsonPtr = wasm._basicParseProgram();
      const jsonStr = wasm.UTF8ToString(jsonPtr);
      self.postMessage({ type: "basicParseProgramResult", id: msg.id, json: jsonStr });
      break;
    }

    case "basicParseVariables": {
      if (!wasm) break;
      const varsJsonPtr = wasm._basicParseVariables();
      const varsJsonStr = wasm.UTF8ToString(varsJsonPtr);
      self.postMessage({ type: "basicParseVariablesResult", id: msg.id, json: varsJsonStr });
      break;
    }

    case "basicWriteProgram": {
      if (!wasm) break;
      const progData = new Uint8Array(msg.data);
      const progPtr = wasm._malloc(progData.length);
      wasm.HEAPU8.set(progData, progPtr);
      wasm._basicWriteProgram(progPtr, progData.length);
      wasm._free(progPtr);
      self.postMessage({ type: "basicWriteProgramResult", id: msg.id });
      break;
    }

    case "getBreakpointList": {
      if (!wasm) break;
      const bpPtr = wasm._getBreakpointList();
      const bpJson = wasm.UTF8ToString(bpPtr);
      self.postMessage({ type: "breakpointListResult", id: msg.id, json: bpJson });
      break;
    }

    case "basicRenumberProgram": {
      if (!wasm) break;
      const encLen = wasm.lengthBytesUTF8(msg.text) + 1;
      const encPtr = wasm._malloc(encLen);
      wasm.stringToUTF8(msg.text, encPtr, encLen);
      const resultPtr = wasm._basicRenumberProgram(encPtr, msg.startNum, msg.step);
      wasm._free(encPtr);
      const resultStr = wasm.UTF8ToString(resultPtr);
      self.postMessage({ type: "basicRenumberProgramResult", id: msg.id, text: resultStr });
      break;
    }

    case "basicAutoRenumber": {
      if (!wasm) break;
      const encLen = wasm.lengthBytesUTF8(msg.text) + 1;
      const encPtr = wasm._malloc(encLen);
      wasm.stringToUTF8(msg.text, encPtr, encLen);
      const resultPtr = wasm._basicAutoRenumber(encPtr);
      wasm._free(encPtr);
      const resultStr = wasm.UTF8ToString(resultPtr);
      self.postMessage({ type: "basicAutoRenumberResult", id: msg.id, text: resultStr });
      break;
    }

    case "disassemble": {
      if (!wasm) break;
      const disasmPtr = wasm._disassembleAt(msg.addr, msg.count);
      const disasmSize = wasm._disassembleGetSize();
      const disasmData = new Uint8Array(wasm.HEAPU8.buffer, disasmPtr, disasmSize).slice();
      self.postMessage({ type: "disassembleResult", id: msg.id, data: disasmData }, [disasmData.buffer]);
      break;
    }

    case "disassembleAroundPC": {
      if (!wasm) break;
      const daPtr = wasm._disassembleAroundPC(msg.pc, msg.rowsBefore, msg.rowsAfter);
      const daSize = wasm._disassembleGetSize();
      const daData = new Uint8Array(wasm.HEAPU8.buffer, daPtr, daSize).slice();
      self.postMessage({ type: "disassembleAroundPCResult", id: msg.id, data: daData }, [daData.buffer]);
      break;
    }

    case "getDisplayDimensions":
      if (wasm) {
        self.postMessage({
          type: "displayDimensionsResult",
          id: msg.id,
          width: wasm._getDisplayWidth(),
          height: wasm._getDisplayHeight()
        });
      }
      break;

    case "evaluateCondition": {
      if (!wasm) break;
      const encLen = wasm.lengthBytesUTF8(msg.expr) + 1;
      const encPtr = wasm._malloc(encLen);
      wasm.stringToUTF8(msg.expr, encPtr, encLen);
      const condResult = wasm._evaluateCondition(encPtr);
      wasm._free(encPtr);
      const errPtr = wasm._getConditionError();
      const condError = wasm.UTF8ToString(errPtr);
      self.postMessage({ type: "evaluateConditionResult", id: msg.id, result: condResult !== 0, error: condError || null });
      break;
    }

    case "evaluateExpression": {
      if (!wasm) break;
      const encLen = wasm.lengthBytesUTF8(msg.expr) + 1;
      const encPtr = wasm._malloc(encLen);
      wasm.stringToUTF8(msg.expr, encPtr, encLen);
      const exprResult = wasm._evaluateExpression(encPtr);
      wasm._free(encPtr);
      const errPtr = wasm._getConditionError();
      const exprError = wasm.UTF8ToString(errPtr);
      self.postMessage({ type: "evaluateExpressionResult", id: msg.id, result: exprResult, error: exprError || null });
      break;
    }

    case "assemble": {
      if (!wasm) break;
      const srcLen = wasm.lengthBytesUTF8(msg.source) + 1;
      const srcPtr = wasm._malloc(srcLen);
      wasm.stringToUTF8(msg.source, srcPtr, srcLen);
      const ok = wasm._assembleSource(srcPtr, msg.org);
      wasm._free(srcPtr);

      const outputSize = wasm._assemblerGetOutputSize();
      const origin = wasm._assemblerGetOrigin();
      let outputData = null;
      if (ok && outputSize > 0) {
        const outPtr = wasm._assemblerGetOutput();
        outputData = new Uint8Array(wasm.HEAPU8.buffer, outPtr, outputSize).slice();
      }

      const errCount = wasm._assemblerGetErrorCount();
      let errors = [];
      if (errCount > 0) {
        const errJsonPtr = wasm._assemblerGetErrors();
        const errJson = wasm.UTF8ToString(errJsonPtr);
        try { errors = JSON.parse(errJson); } catch (e) { /* ignore */ }
      }

      const listingJsonPtr = wasm._assemblerGetListing();
      const listingJson = wasm.UTF8ToString(listingJsonPtr);
      let listing = [];
      try { listing = JSON.parse(listingJson); } catch (e) { /* ignore */ }

      self.postMessage({
        type: "assembleResult",
        id: msg.id,
        success: ok !== 0,
        origin,
        output: outputData,
        errors,
        listing,
      });
      break;
    }

    case "exportState": {
      if (!wasm) break;
      const sizePtr = wasm._malloc(4);
      const statePtr = wasm._exportState(sizePtr);
      const size = new DataView(wasm.HEAPU8.buffer, sizePtr, 4).getUint32(0, true);
      wasm._free(sizePtr);
      if (size > 0 && statePtr) {
        const stateData = new Uint8Array(wasm.HEAPU8.buffer.slice(statePtr, statePtr + size));
        self.postMessage({ type: "exportStateResult", id: msg.id, data: stateData }, [stateData.buffer]);
      } else {
        self.postMessage({ type: "exportStateResult", id: msg.id, data: null });
      }
      break;
    }

    case "importState": {
      if (!wasm) break;
      const stateData = new Uint8Array(msg.data);
      const statePtr = wasm._malloc(stateData.length);
      wasm.HEAPU8.set(stateData, statePtr);
      const success = wasm._importState(statePtr, stateData.length);
      wasm._free(statePtr);
      const newMachineId = wasm._getMachineId();
      self.postMessage({ type: "importStateResult", id: msg.id, success: !!success, machineId: newMachineId, state: getState() });
      break;
    }

    case "getState":
      if (wasm) {
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "setSpectranetEnabled":
      if (wasm) {
        wasm._setSpectranetEnabled(msg.enabled ? 1 : 0);
        wasm._reset();
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;

    case "spectranetPushData": {
      if (!wasm) break;
      const rxData = new Uint8Array(msg.data);
      const rxPtr = wasm._malloc(rxData.length);
      wasm.HEAPU8.set(rxData, rxPtr);
      const written = wasm._spectranetPushReceivedData(msg.socket, rxPtr, rxData.length);
      wasm._free(rxPtr);
      // Buffer any data that didn't fit in the W5100's 2KB RX buffer
      if (written < rxData.length) {
        rxOverflow[msg.socket].push(rxData.slice(written));
      }
      break;
    }

    case "spectranetSetSocketStatus":
      if (wasm) wasm._spectranetSetSocketStatus(msg.socket, msg.status);
      // Clear stale overflow data when a socket is closed
      if (msg.status === 0x00 && msg.socket >= 0 && msg.socket < 4) {
        rxOverflow[msg.socket] = [];
      }
      break;

    case "spectranetSetNetworkConfig": {
      if (!wasm) break;
      const ipPtr = wasm._malloc(4);
      const gwPtr = wasm._malloc(4);
      const snPtr = wasm._malloc(4);
      const dnsPtr = wasm._malloc(4);
      const heap = new Uint8Array(wasm.HEAPU8.buffer);
      heap.set(msg.ip, ipPtr);
      heap.set(msg.gateway, gwPtr);
      heap.set(msg.subnet, snPtr);
      heap.set(msg.dns, dnsPtr);
      wasm._spectranetSetNetworkConfig(ipPtr, gwPtr, snPtr, dnsPtr);
      wasm._free(ipPtr);
      wasm._free(gwPtr);
      wasm._free(snPtr);
      wasm._free(dnsPtr);
      break;
    }
    case "spectranetSetStaticIP": {
      if (!wasm) break;
      wasm._spectranetSetStaticIP(msg.useStatic ? 1 : 0);
      break;
    }

    case "spectranetGetSRAM": {
      if (!wasm) {
        self.postMessage({ type: "spectranetSRAMData", data: null });
        break;
      }
      const sramPtr = wasm._spectranetGetSRAMData();
      const sramSize = wasm._spectranetGetSRAMSize();
      if (sramPtr && sramSize > 0) {
        const sramCopy = new Uint8Array(wasm.HEAPU8.buffer.slice(sramPtr, sramPtr + sramSize));
        self.postMessage({ type: "spectranetSRAMData", data: sramCopy.buffer }, [sramCopy.buffer]);
      } else {
        self.postMessage({ type: "spectranetSRAMData", data: null });
      }
      break;
    }

    case "spectranetSetSRAM": {
      if (!wasm || !msg.data) break;
      const sramData = new Uint8Array(msg.data);
      const sramBufPtr = wasm._malloc(sramData.length);
      wasm.HEAPU8.set(sramData, sramBufPtr);
      wasm._spectranetSetSRAMData(sramBufPtr, sramData.length);
      wasm._free(sramBufPtr);
      break;
    }

    case "spectranetGetFlashData": {
      if (!wasm) {
        self.postMessage({ type: "spectranetFlashData", data: null });
        break;
      }
      const flashPtr = wasm._spectranetGetFlashData();
      const flashSize = wasm._spectranetGetFlashSize();
      if (flashPtr && flashSize > 0) {
        const flashCopy = new Uint8Array(wasm.HEAPU8.buffer.slice(flashPtr, flashPtr + flashSize));
        self.postMessage({ type: "spectranetFlashData", data: flashCopy.buffer }, [flashCopy.buffer]);
      } else {
        self.postMessage({ type: "spectranetFlashData", data: null });
      }
      break;
    }

    case "spectranetReloadROM": {
      if (!wasm) break;
      wasm._spectranetReloadROM();
      break;
    }

    case "spectranetSetFlashData": {
      if (!wasm || !msg.data) break;
      const flashData = new Uint8Array(msg.data);
      const flashBufPtr = wasm._malloc(flashData.length);
      wasm.HEAPU8.set(flashData, flashBufPtr);
      wasm._spectranetSetFlashData(flashBufPtr, flashData.length);
      wasm._free(flashBufPtr);
      break;
    }

    case "spectranetGetFlashConfig": {
      if (!wasm) {
        self.postMessage({ type: "spectranetFlashConfigData", data: null });
        break;
      }
      const cfgPtr = wasm._spectranetGetFlashConfig();
      const cfgSize = wasm._spectranetGetFlashConfigSize();
      if (cfgPtr && cfgSize > 0) {
        const cfgCopy = new Uint8Array(wasm.HEAPU8.buffer.slice(cfgPtr, cfgPtr + cfgSize));
        self.postMessage({ type: "spectranetFlashConfigData", data: cfgCopy.buffer }, [cfgCopy.buffer]);
      } else {
        self.postMessage({ type: "spectranetFlashConfigData", data: null });
      }
      break;
    }

    case "spectranetSetFlashConfig": {
      if (!wasm || !msg.data) break;
      const cfgData = new Uint8Array(msg.data);
      const cfgBufPtr = wasm._malloc(cfgData.length);
      wasm.HEAPU8.set(cfgData, cfgBufPtr);
      wasm._spectranetSetFlashConfig(cfgBufPtr, cfgData.length);
      wasm._free(cfgBufPtr);
      break;
    }

    // ========================================================================
    // Disk drive (FDC) commands - +3 only
    // ========================================================================

    case "diskInsert": {
      if (!wasm || !msg.data) break;
      const diskData = new Uint8Array(msg.data);
      const diskPtr = wasm._malloc(diskData.length);
      wasm.HEAPU8.set(diskData, diskPtr);
      wasm._diskInsert(msg.drive || 0, diskPtr, diskData.length);
      wasm._free(diskPtr);
      self.postMessage({ type: "diskInserted", drive: msg.drive || 0, state: getState() });
      break;
    }

    case "diskInsertEmpty": {
      if (!wasm) break;
      wasm._diskInsertEmpty(msg.drive || 0);
      self.postMessage({ type: "diskInserted", drive: msg.drive || 0, state: getState() });
      break;
    }

    case "diskEject": {
      if (!wasm) break;
      wasm._diskEject(msg.drive || 0);
      self.postMessage({ type: "diskEjected", drive: msg.drive || 0, state: getState() });
      break;
    }

    case "diskSetWriteProtected": {
      if (!wasm) break;
      wasm._diskSetWriteProtected(msg.drive || 0, msg.wp ? 1 : 0);
      self.postMessage({ type: "stateUpdate", state: getState() });
      break;
    }

    case "diskExport": {
      if (!wasm) {
        self.postMessage({ type: "diskExportData", drive: msg.drive || 0, data: null });
        break;
      }
      const exportPtr = wasm._diskExportData(msg.drive || 0);
      const exportSize = wasm._diskExportDataSize(msg.drive || 0);
      if (exportPtr && exportSize > 0) {
        const exportCopy = new Uint8Array(wasm.HEAPU8.buffer.slice(exportPtr, exportPtr + exportSize));
        self.postMessage({ type: "diskExportData", drive: msg.drive || 0, data: exportCopy.buffer }, [exportCopy.buffer]);
      } else {
        self.postMessage({ type: "diskExportData", drive: msg.drive || 0, data: null });
      }
      break;
    }

    case "traceEnable": {
      if (!wasm) break;
      wasm._traceEnable(msg.enable ? 1 : 0);
      break;
    }

    case "traceGetData": {
      if (!wasm) {
        self.postMessage({ type: "traceDataResult", id: msg.id, data: null, entryCount: 0, writeIndex: 0, entrySize: 32, maxEntries: 10000 });
        break;
      }
      const entryCount = wasm._traceGetEntryCount();
      const writeIndex = wasm._traceGetWriteIndex();
      const entrySize = wasm._traceGetEntrySize();
      const maxEntries = wasm._traceGetMaxEntries();
      const bufPtr = wasm._traceGetBuffer();
      let data = null;
      if (bufPtr && entryCount > 0) {
        const totalBytes = maxEntries * entrySize;
        data = new Uint8Array(wasm.HEAPU8.buffer, bufPtr, totalBytes).slice();
      }
      const transfer = data ? [data.buffer] : [];
      self.postMessage({ type: "traceDataResult", id: msg.id, data, entryCount, writeIndex, entrySize, maxEntries }, transfer);
      break;
    }
  }
};
