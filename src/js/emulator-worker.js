/*
 * emulator-worker.js - Web Worker hosting the WASM emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

let wasm = null;
let speedMultiplier = 1;

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
    issueNumber: wasm._getIssueNumber(),
    pagingRegister: wasm._getPagingRegister(),
    hasBasicProgram: wasm._hasBasicProgram() !== 0,
    basicReportFired: wasm._isBasicReportFired() !== 0,
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
  }
  wasm._free(wavePtr);

  // Transfer buffers for zero-copy
  const transfer = [framebuffer.buffer, signalBuffer.buffer, beeperWaveform.buffer];
  if (audio) transfer.push(audio.buffer);
  if (ayWaveforms) {
    for (const wf of ayWaveforms) transfer.push(wf.buffer);
  }

  self.postMessage({ type: "frame", framebuffer, signalBuffer, audio, sampleCount: sampleCount, state, recordedBlocks, beeperWaveform, ayRegisters, ayMutes, ayWaveforms }, transfer);
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

    case "writeMemory":
      if (wasm) wasm._writeMemory(msg.addr, msg.value);
      break;

    case "writeMemoryBulk": {
      if (!wasm) break;
      const bulkData = new Uint8Array(msg.data);
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
  }
};
