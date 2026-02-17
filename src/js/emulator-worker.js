/*
 * emulator-worker.js - Web Worker hosting the WASM emulator
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

let wasm = null;

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
  };
}

function runFrames(count) {
  for (let i = 0; i < count; i++) {
    wasm._runFrame();
  }

  // Copy framebuffer
  const fbPtr = wasm._getFramebuffer();
  const fbSize = wasm._getFramebufferSize();
  const fbData = new Uint8Array(wasm.HEAPU8.buffer, fbPtr, fbSize);
  const framebuffer = new Uint8Array(fbData);

  // Copy audio
  const sampleCount = wasm._getAudioSampleCount();
  let audio = null;
  if (sampleCount > 0) {
    const audioPtr = wasm._getAudioBuffer();
    const audioData = new Float32Array(wasm.HEAPF32.buffer, audioPtr, sampleCount);
    audio = new Float32Array(audioData);
  }
  wasm._resetAudioBuffer();

  const state = getState();

  // Transfer buffers for zero-copy
  const transfer = [framebuffer.buffer];
  if (audio) transfer.push(audio.buffer);

  self.postMessage({ type: "frame", framebuffer, audio, sampleCount: sampleCount, state }, transfer);
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
      switch (msg.format) {
        case "sna": wasm._loadSNA(ptr, data.length); break;
        case "z80": wasm._loadZ80(ptr, data.length); break;
        case "tzx": wasm._loadTZX(ptr, data.length); break;
      }
      wasm._free(ptr);
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

    case "getState":
      if (wasm) {
        self.postMessage({ type: "stateUpdate", state: getState() });
      }
      break;
  }
};
