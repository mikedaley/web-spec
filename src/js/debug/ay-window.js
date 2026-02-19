/*
 * ay-window.js - AY-3-8912 debug window with channel cards,
 *   inline waveforms, mute controls, and level meters
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

// Note names for frequency-to-note conversion
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Channel badge background colors
const CHANNEL_BADGE_COLORS = { a: "#0000CD", b: "#00CD00", c: "#CD0000" };

// Channel waveform / meter colors — Spectrum bright palette
const CHANNEL_COLORS = { a: "#00FFFF", b: "#00FF00", c: "#FF0000" };

// ZX Spectrum AY PSG clock
const PSG_CLOCK = 1773400;

// Envelope shape SVG paths (48x16 viewBox)
const ENVELOPE_SVGS = {
  0x00: "M2,2 L24,14 L46,14",
  0x04: "M2,14 L24,2 L46,14",
  0x08: "M2,2 L12,14 L22,2 L32,14 L42,2 L46,6",
  0x09: "M2,2 L24,14 L46,14",
  0x0a: "M2,2 L12,14 L24,2 L36,14 L46,2",
  0x0b: "M2,2 L14,14 L14,2 L46,2",
  0x0c: "M2,14 L12,2 L22,14 L32,2 L42,14 L46,10",
  0x0d: "M2,14 L14,2 L14,14 L46,14",
  0x0e: "M2,14 L12,2 L24,14 L36,2 L46,14",
  0x0f: "M2,14 L24,2 L46,14",
};

/**
 * Convert a frequency in Hz to a musical note name + octave.
 */
function frequencyToNote(freq) {
  if (freq < 20 || freq > 20000) return null;
  const noteNum = 12 * Math.log2(freq / 440) + 69;
  const rounded = Math.round(noteNum);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Build an inline SVG string for an envelope shape value (R13 & 0x0F).
 */
function getEnvelopeShapeSVG(value) {
  const path = ENVELOPE_SVGS[value & 0x0f];
  if (!path) return '<span class="ay-env-unknown">?</span>';
  return `<svg class="ay-env-svg" viewBox="0 0 48 16" width="48" height="16" preserveAspectRatio="none">` +
    `<polyline points="${path.replace(/M|L/g, '').replace(/\s+/g, ' ').trim()}" ` +
    `fill="none" stroke="var(--accent-green)" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`;
}

export class AYWindow extends BaseWindow {
  constructor() {
    super({
      id: "ay-debug",
      title: "AY-3-8912",
      minWidth: 440,
      minHeight: 280,
      defaultWidth: 560,
      defaultHeight: 320,
      defaultPosition: { x: window.innerWidth - 640, y: 100 },
    });

    this.muteHandlerAttached = false;
    this._pendingMuteState = null;

    // Cached DOM element references
    this.elements = null;

    // Previous values for dirty checking
    this.prevValues = {};

    // Waveform buffer
    this.waveformSampleCount = 256;
    this.waveformBufferPtr = null;

    // Canvas drawing colors
    this.canvasBg = "#05050a";
    this.canvasLine = "#1a1a2a";
  }

  renderContent() {
    const channels = ["a", "b", "c"];
    const channelLabels = ["A", "B", "C"];

    const channelRows = channels.map((ch, i) => `
      <div class="ay-channel-row" data-channel="${ch}">
        <button class="ay-mute-btn" data-ch="${i}" title="Mute/Unmute Channel ${channelLabels[i]}">
          <svg class="ay-icon-on" viewBox="0 0 12 12" width="12" height="12"><path d="M1 4.2h2l2.5-2.5v8.6L3 7.8H1z" fill="currentColor"/><path d="M8 3.5q2 2.5 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <svg class="ay-icon-off" viewBox="0 0 12 12" width="12" height="12"><path d="M1 4.2h2l2.5-2.5v8.6L3 7.8H1z" fill="currentColor"/><line x1="7.5" y1="3.5" x2="11" y2="8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="11" y1="3.5" x2="7.5" y2="8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        </button>
        <div class="ay-ch-label ay-ch-label-${ch}">${channelLabels[i]}</div>
        <span class="ay-ch-freq" id="ay-ch${ch}-freq">--</span>
        <span class="ay-tn-badge ay-tn-tone" id="ay-ch${ch}-tone">T</span>
        <span class="ay-tn-badge ay-tn-noise" id="ay-ch${ch}-noise">N</span>
        <div class="ay-vol-bar-container">
          <div class="ay-vol-bar">
            <div class="ay-vol-fill ay-vol-fill-${ch}" id="ay-ch${ch}-fill"></div>
          </div>
        </div>
        <span class="ay-vol-text" id="ay-ch${ch}-vol">0/15</span>
        <canvas class="ay-waveform" id="ay-ch${ch}-waveform"></canvas>
      </div>
    `).join("");

    return `
      <div class="ay-content">
        <div class="ay-section">
          <div class="ay-section-title">PSG (AY-3-8912 @ 1.7734 MHz)</div>
          <div class="ay-channels">
            ${channelRows}
          </div>
          <div class="ay-env-noise-row">
            <span class="ay-label">Env:</span>
            <span id="ay-env-shape" class="ay-env-shape"></span>
            <span id="ay-env-freq" class="ay-env-freq"></span>
            <span class="ay-label" style="margin-left:12px">Noise:</span>
            <span id="ay-noise-freq" class="ay-noise-freq"></span>
          </div>
        </div>
      </div>
      ${this.renderStyles()}
    `;
  }

  renderStyles() {
    return `<style>
      .ay-content {
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 11px;
        padding: 8px;
        overflow-y: auto;
        height: 100%;
      }
      .ay-label { color: var(--text-muted); margin-right: 6px; }
      .ay-section {
        padding: 8px;
        background: var(--input-bg-dark);
        border-radius: 4px;
      }
      .ay-section-title {
        color: var(--accent-blue);
        font-weight: bold;
        margin-bottom: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--border-default);
      }

      /* Channel rows */
      .ay-channels { display: flex; flex-direction: column; gap: 3px; }
      .ay-channel-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        background: var(--overlay-white-02);
        border-radius: 4px;
        height: 36px;
      }
      .ay-channel-row.muted { opacity: 0.5; }

      /* Mute button */
      .ay-mute-btn {
        width: 20px; height: 20px;
        border: none; border-radius: 3px;
        background: var(--badge-dim-bg);
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        padding: 0; flex-shrink: 0;
        color: var(--text-muted);
      }
      .ay-mute-btn:hover { background: var(--overlay-hover); }
      .ay-mute-btn .ay-icon-off { display: none; }
      .ay-mute-btn.muted .ay-icon-on { display: none; }
      .ay-mute-btn.muted .ay-icon-off { display: block; }
      .ay-mute-btn.muted { background: var(--accent-red-bg-stronger); color: var(--accent-red); }

      /* Channel label badge */
      .ay-ch-label {
        width: 16px; height: 16px;
        display: flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: bold;
        border-radius: 3px; color: #fff; flex-shrink: 0;
      }
      .ay-ch-label-a { background: ${CHANNEL_BADGE_COLORS.a}; }
      .ay-ch-label-b { background: ${CHANNEL_BADGE_COLORS.b}; }
      .ay-ch-label-c { background: ${CHANNEL_BADGE_COLORS.c}; }

      /* Frequency / note display */
      .ay-ch-freq {
        width: 85px; flex-shrink: 0;
        color: var(--text-secondary);
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* T/N indicator badges */
      .ay-tn-badge {
        width: 18px; height: 16px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: bold;
        border-radius: 3px; flex-shrink: 0;
        background: var(--badge-dim-bg); color: var(--text-muted);
      }
      .ay-tn-badge.on {
        background: var(--accent-green-bg-stronger);
        color: var(--accent-green);
      }

      /* Volume bar */
      .ay-vol-bar-container { width: 60px; flex-shrink: 0; }
      .ay-vol-bar {
        height: 8px;
        background: var(--input-bg-deeper);
        border-radius: 2px;
        position: relative;
        overflow: hidden;
        border: 1px solid var(--border-muted);
      }
      .ay-vol-fill {
        position: absolute; left: 0; top: 0;
        height: 100%; width: 0%;
        border-radius: 1px;
      }
      .ay-vol-fill-a { background: ${CHANNEL_COLORS.a}; }
      .ay-vol-fill-b { background: ${CHANNEL_COLORS.b}; }
      .ay-vol-fill-c { background: ${CHANNEL_COLORS.c}; }

      /* Volume text */
      .ay-vol-text {
        width: 30px; flex-shrink: 0;
        font-size: 9px;
        color: var(--text-muted);
        text-align: center;
      }
      .ay-vol-text.env-mode { color: var(--accent-purple); }

      /* Waveform canvas */
      .ay-waveform {
        flex: 1; min-width: 60px; min-height: 0;
        height: 100%;
        background: var(--input-bg-deeper);
        border-radius: 3px;
        border: 1px solid var(--border-muted);
        display: block;
      }

      /* Envelope / noise summary row */
      .ay-env-noise-row {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 6px;
        padding: 3px 6px;
        font-size: 10px;
      }
      .ay-env-svg { vertical-align: middle; margin: 0 4px; }
      .ay-env-freq { color: var(--accent-green); }
      .ay-noise-freq { color: var(--accent-blue); }
      .ay-env-unknown { color: var(--text-muted); }
    </style>`;
  }

  cacheElements() {
    const el = this.contentElement;
    const channelNames = ["a", "b", "c"];

    this.elements = {
      channels: [],
      mute: [],
      freq: [],
      tone: [],
      noise: [],
      volFill: [],
      volText: [],
      canvases: [],
      canvasCtx: [],
      envShape: el.querySelector("#ay-env-shape"),
      envFreq: el.querySelector("#ay-env-freq"),
      noiseFreq: el.querySelector("#ay-noise-freq"),
    };

    for (let ch = 0; ch < 3; ch++) {
      const chName = channelNames[ch];
      this.elements.channels[ch] = el.querySelector(`.ay-channel-row[data-channel="${chName}"]`);
      this.elements.mute[ch] = el.querySelector(`.ay-mute-btn[data-ch="${ch}"]`);
      this.elements.freq[ch] = el.querySelector(`#ay-ch${chName}-freq`);
      this.elements.tone[ch] = el.querySelector(`#ay-ch${chName}-tone`);
      this.elements.noise[ch] = el.querySelector(`#ay-ch${chName}-noise`);
      this.elements.volFill[ch] = el.querySelector(`#ay-ch${chName}-fill`);
      this.elements.volText[ch] = el.querySelector(`#ay-ch${chName}-vol`);
      const canvas = el.querySelector(`#ay-ch${chName}-waveform`);
      this.elements.canvases[ch] = canvas;
      this.elements.canvasCtx[ch] = canvas ? canvas.getContext("2d", { alpha: false }) : null;
    }
  }

  allocateWaveformBuffer(wasmModule) {
    if (!this.waveformBufferPtr && wasmModule?._malloc) {
      this.waveformBufferPtr = wasmModule._malloc(this.waveformSampleCount * 4);
    }
  }

  resizeCanvases() {
    for (let ch = 0; ch < 3; ch++) {
      const canvas = this.elements.canvases[ch];
      if (!canvas) continue;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    }
  }

  updateCanvasColors() {
    const style = getComputedStyle(document.documentElement);
    this.canvasBg = style.getPropertyValue("--canvas-bg").trim() || "#05050a";
    this.canvasLine = style.getPropertyValue("--canvas-line").trim() || "#1a1a2a";
  }

  destroy() {
    if (this.waveformBufferPtr && this._lastWasmModule?._free) {
      this._lastWasmModule._free(this.waveformBufferPtr);
      this.waveformBufferPtr = null;
    }
    super.destroy();
  }

  getState() {
    const base = super.getState();
    if (this._lastWasmModule?._getAYChannelMute) {
      const muteState = [];
      for (let ch = 0; ch < 3; ch++) {
        muteState.push(!!this._lastWasmModule._getAYChannelMute(ch));
      }
      base.channelMutes = muteState;
    }
    return base;
  }

  restoreState(state) {
    if (state.channelMutes) {
      this._pendingMuteState = state.channelMutes;
    }
    super.restoreState(state);
  }

  update(wasmModule) {
    if (!wasmModule) return;
    this._lastWasmModule = wasmModule;

    // Cache elements on first update
    if (!this.elements) {
      this.cacheElements();
      this.allocateWaveformBuffer(wasmModule);
      this.updateCanvasColors();
    }

    // Apply pending mute state from session restore
    if (this._pendingMuteState && wasmModule._setAYChannelMute) {
      const mutes = this._pendingMuteState;
      this._pendingMuteState = null;
      for (let ch = 0; ch < 3; ch++) {
        if (mutes[ch]) {
          wasmModule._setAYChannelMute(ch, true);
        }
      }
    }

    // Sync canvas drawing buffers
    this.resizeCanvases();

    // Set up mute handlers once
    if (!this.muteHandlerAttached && this.contentElement) {
      this.muteHandlerAttached = true;
      this.contentElement.addEventListener("click", (e) => {
        const muteBtn = e.target.closest(".ay-mute-btn");
        if (muteBtn && wasmModule._setAYChannelMute) {
          const ch = parseInt(muteBtn.dataset.ch, 10);
          const currentlyMuted = wasmModule._getAYChannelMute(ch);
          wasmModule._setAYChannelMute(ch, !currentlyMuted);
          this.updateMuteState(wasmModule);
          if (this.onStateChange) this.onStateChange();
        }
      });
    }

    // Update all sections
    this.updateChannels(wasmModule);
    this.updateWaveforms(wasmModule);
    this.updateMuteState(wasmModule);
  }

  updateChannels(wasmModule) {
    if (!wasmModule._getAYRegister) return;

    const channelRegs = [
      [0, 1],  // Channel A tone fine/coarse
      [2, 3],  // Channel B
      [4, 5],  // Channel C
    ];

    const r7 = wasmModule._getAYRegister(7);

    for (let ch = 0; ch < 3; ch++) {
      // Frequency and note
      const fine = wasmModule._getAYRegister(channelRegs[ch][0]);
      const coarse = wasmModule._getAYRegister(channelRegs[ch][1]);
      const period = fine | ((coarse & 0x0f) << 8);
      const freq = period > 0 ? Math.round(PSG_CLOCK / (16 * period)) : 0;

      const freqKey = `ch${ch}freq`;
      if (this.prevValues[freqKey] !== freq) {
        this.prevValues[freqKey] = freq;
        const freqEl = this.elements.freq[ch];
        if (freqEl) {
          if (freq > 0) {
            const note = frequencyToNote(freq);
            freqEl.textContent = note ? `${note} ${freq}Hz` : `${freq}Hz`;
          } else {
            freqEl.textContent = "--";
          }
        }
      }

      // Tone enabled (bit 0,1,2 of R7 — 0 = enabled)
      const toneEnabled = !(r7 & (1 << ch));
      const toneKey = `ch${ch}tone`;
      if (this.prevValues[toneKey] !== toneEnabled) {
        this.prevValues[toneKey] = toneEnabled;
        if (this.elements.tone[ch]) this.elements.tone[ch].classList.toggle("on", toneEnabled);
      }

      // Noise enabled (bits 3,4,5 of R7 — 0 = enabled)
      const noiseEnabled = !(r7 & (1 << (ch + 3)));
      const noiseKey = `ch${ch}noise`;
      if (this.prevValues[noiseKey] !== noiseEnabled) {
        this.prevValues[noiseKey] = noiseEnabled;
        if (this.elements.noise[ch]) this.elements.noise[ch].classList.toggle("on", noiseEnabled);
      }

      // Volume / envelope mode
      const ampReg = wasmModule._getAYRegister(8 + ch);
      const useEnv = (ampReg & 0x10) !== 0;
      const vol = ampReg & 0x0f;

      const volKey = `ch${ch}vol`;
      const volVal = useEnv ? -1 : vol;
      if (this.prevValues[volKey] !== volVal) {
        this.prevValues[volKey] = volVal;

        const fillEl = this.elements.volFill[ch];
        if (fillEl) {
          fillEl.style.width = useEnv ? "50%" : `${(vol / 15) * 100}%`;
        }

        const volTextEl = this.elements.volText[ch];
        if (volTextEl) {
          volTextEl.textContent = useEnv ? "ENV" : `${vol}/15`;
          volTextEl.classList.toggle("env-mode", useEnv);
        }
      }
    }

    // Envelope shape and frequency
    const envShape = wasmModule._getAYRegister(13);
    const envShapeKey = "envShape";
    if (this.prevValues[envShapeKey] !== envShape) {
      this.prevValues[envShapeKey] = envShape;
      if (this.elements.envShape) {
        this.elements.envShape.innerHTML = getEnvelopeShapeSVG(envShape);
      }
    }

    const envFine = wasmModule._getAYRegister(11);
    const envCoarse = wasmModule._getAYRegister(12);
    const envPeriod = envFine | (envCoarse << 8);
    const envFreq = envPeriod > 0 ? (PSG_CLOCK / (256 * envPeriod)).toFixed(1) : 0;
    const envFreqKey = "envFreq";
    if (this.prevValues[envFreqKey] !== envFreq) {
      this.prevValues[envFreqKey] = envFreq;
      if (this.elements.envFreq) {
        this.elements.envFreq.textContent = envFreq > 0 ? `${envFreq}Hz` : "";
      }
    }

    // Noise frequency
    const noisePeriod = wasmModule._getAYRegister(6);
    const noiseFreq = noisePeriod > 0 ? (PSG_CLOCK / (16 * noisePeriod)).toFixed(1) : 0;
    const noiseFreqKey = "noiseFreq";
    if (this.prevValues[noiseFreqKey] !== noiseFreq) {
      this.prevValues[noiseFreqKey] = noiseFreq;
      if (this.elements.noiseFreq) {
        this.elements.noiseFreq.textContent = noiseFreq > 0 ? `${noiseFreq}Hz` : "";
      }
    }
  }

  updateMuteState(wasmModule) {
    if (!wasmModule?._getAYChannelMute) return;

    for (let ch = 0; ch < 3; ch++) {
      const isMuted = wasmModule._getAYChannelMute(ch);
      const key = `mute${ch}`;
      if (this.prevValues[key] !== isMuted) {
        this.prevValues[key] = isMuted;
        if (this.elements.mute[ch]) this.elements.mute[ch].classList.toggle("muted", isMuted);
        if (this.elements.channels[ch]) this.elements.channels[ch].classList.toggle("muted", isMuted);
      }
    }
  }

  updateWaveforms(wasmModule) {
    if (!wasmModule._getAYWaveform || !this.waveformBufferPtr) return;

    const colors = [CHANNEL_COLORS.a, CHANNEL_COLORS.b, CHANNEL_COLORS.c];
    const sampleCount = this.waveformSampleCount;
    const heapOffset = this.waveformBufferPtr >> 2;

    for (let ch = 0; ch < 3; ch++) {
      const ctx = this.elements.canvasCtx[ch];
      if (!ctx) continue;

      const canvas = this.elements.canvases[ch];
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) continue;

      wasmModule._getAYWaveform(ch, this.waveformBufferPtr, sampleCount);

      // Clear canvas
      ctx.fillStyle = this.canvasBg;
      ctx.fillRect(0, 0, width, height);

      // Draw center line
      ctx.strokeStyle = this.canvasLine;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Draw waveform scaled to canvas width
      ctx.strokeStyle = colors[ch];
      ctx.lineWidth = 1;
      ctx.beginPath();

      const xScale = width / (sampleCount - 1);
      for (let i = 0; i < sampleCount; i++) {
        const sample = wasmModule.HEAPF32[heapOffset + i];
        const x = i * xScale;
        const y = height - sample * (height - 2) - 1;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }
}
