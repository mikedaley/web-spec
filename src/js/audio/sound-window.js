/*
 * sound-window.js - Sound debug window with beeper visualization
 *   and AY-3-8912 channel display
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

// Note names for frequency-to-note conversion
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Channel badge background colors
const CHANNEL_BADGE_COLORS = { a: "#0000CD", b: "#00CD00", c: "#CD0000" };

// Channel waveform / meter colors — Spectrum bright palette
const CHANNEL_COLORS = { a: "#00FFFF", b: "#00FF00", c: "#FF0000" };

// Beeper color — Spectrum bright green
const BEEPER_COLOR = "#00FF00";

// Beeper max amplitude (must match BEEPER_VOLUME in audio.hpp)
const BEEPER_VOLUME = 0.6;

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
  if (!path) return '<span class="snd-env-unknown">?</span>';
  return (
    `<svg class="snd-env-svg" viewBox="0 0 48 16" width="48" height="16" preserveAspectRatio="none">` +
    `<polyline points="${path.replace(/M|L/g, "").replace(/\s+/g, " ").trim()}" ` +
    `fill="none" stroke="var(--accent-green)" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

export class SoundWindow extends BaseWindow {
  constructor(audioDriver, proxy) {
    super({
      id: "sound-debug",
      title: "Sound",
      defaultWidth: 575,
      defaultHeight: 230,
      minWidth: 575,
      minHeight: 230,
      defaultPosition: { x: 60, y: 300 },
      resizeDirections: ["e", "w"],
    });
    this.audioDriver = audioDriver;
    this.proxy = proxy;
    this._frameCount = 0;

    // Beeper canvas refs
    this.beeperCanvas = null;
    this.beeperCtx = null;

    // AY channel state
    this.ayElements = null;
    this.ayPrevValues = {};
    this.canvasBg = "#05050a";
    this.canvasLine = "#1a1a2a";
    this.ayMuteHandlerAttached = false;
    this._pendingMuteState = null;
  }

  renderContent() {
    const vol = Math.round(this.audioDriver.getVolume() * 100);
    const muted = this.audioDriver.isMuted();

    const channels = ["a", "b", "c"];
    const channelLabels = ["A", "B", "C"];

    const channelRows = channels
      .map(
        (ch, i) => `
      <div class="snd-ch-row" data-channel="${ch}">
        <button class="snd-ch-mute" data-ch="${i}" title="Mute/Unmute Channel ${channelLabels[i]}">
          <span class="snd-ch-mute-on"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M1 4.2h2l2.5-2.5v8.6L3 7.8H1z" fill="currentColor"/><path d="M8 3.5q2 2.5 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>
          <span class="snd-ch-mute-off"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M1 4.2h2l2.5-2.5v8.6L3 7.8H1z" fill="currentColor"/><line x1="7.5" y1="3.5" x2="11" y2="8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><line x1="11" y1="3.5" x2="7.5" y2="8.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>
        </button>
        <div class="snd-ch-badge snd-ch-badge-${ch}">${channelLabels[i]}</div>
        <span class="snd-ch-freq" id="snd-ch${ch}-freq">--</span>
        <span class="snd-tn" id="snd-ch${ch}-tone">T</span>
        <span class="snd-tn" id="snd-ch${ch}-noise">N</span>
        <div class="snd-ch-meter">
          <div class="snd-ch-meter-track">
            <div class="snd-ch-meter-fill snd-ch-meter-fill-${ch}" id="snd-ch${ch}-fill"></div>
          </div>
        </div>
        <span class="snd-ch-vol" id="snd-ch${ch}-vol">0/15</span>
        <canvas class="snd-ch-wave" id="snd-ch${ch}-wave"></canvas>
      </div>
    `,
      )
      .join("");

    return `
      <div class="snd-root">
        <!-- Master Volume -->
        <div class="snd-card snd-card-master">
          <div class="snd-master-row">
            <button class="snd-master-mute${muted ? " muted" : ""}" id="snd-beep-mute" title="${muted ? "Unmute" : "Mute"}">
              <span class="snd-ch-mute-on"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 5.5h2.5l3-3v11l-3-3H1z" fill="currentColor"/><path d="M10 4.5q2.5 3.5 0 7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12.5 2.5q4 5.5 0 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
              <span class="snd-ch-mute-off"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M1 5.5h2.5l3-3v11l-3-3H1z" fill="currentColor"/><line x1="10" y1="4.5" x2="15" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="15" y1="4.5" x2="10" y2="11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
            </button>
            <span class="snd-master-label">Master</span>
            <input type="range" class="snd-slider snd-master-slider" id="snd-vol-slider" min="0" max="100" value="${vol}" />
            <span class="snd-vol-val" id="snd-vol-label">${vol}%</span>
          </div>
        </div>

        <!-- Beeper Section -->
        <div class="snd-card">
          <div class="snd-card-head">
            <span class="snd-card-title">Beeper</span>
          </div>
          <div class="snd-ch-list">
            <div class="snd-ch-row snd-beeper-row">
              <canvas class="snd-ch-wave snd-beep-wave" id="snd-beep-wave"></canvas>
            </div>
          </div>
        </div>

        <!-- AY-3-8912 Section -->
        <div class="snd-card snd-ay-card" id="snd-ay-card">
          <div class="snd-card-head snd-card-head-ay">
            <span class="snd-card-title">AY-3-8912</span>
            <span class="snd-ay-chip-label">1.7734 MHz</span>
          </div>
          <div class="snd-ch-list">
            ${channelRows}
          </div>
          <div class="snd-env-row">
            <span class="snd-env-label">Env</span>
            <span id="snd-env-shape" class="snd-env-shape"></span>
            <span id="snd-env-freq" class="snd-env-freq"></span>
            <span class="snd-env-phase" id="snd-env-phase">
              <span class="snd-env-phase-arrow" id="snd-env-phase-arrow">&#x25B2;</span>
              <span class="snd-env-phase-label" id="snd-env-phase-label">Attack</span>
            </span>
            <span class="snd-env-sep"></span>
            <span class="snd-env-label">Noise</span>
            <span id="snd-noise-freq" class="snd-noise-freq"></span>
            <span class="snd-env-sep"></span>
            <span class="snd-env-label">LFSR</span>
            <span class="snd-int-val" id="snd-int-lfsr">00000</span>
          </div>
        </div>

      </div>
      ${this.renderStyles()}
    `;
  }

  renderStyles() {
    return `<style>
      #sound-debug {
        height: auto !important;
      }
      #sound-debug .debug-window-content {
        overflow: hidden;
        padding: 0;
      }

      /* Root container */
      .snd-root {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        overflow-y: auto;
        font-family: var(--font-sans);
        font-size: 11px;
        color: var(--text-primary);
      }
      .snd-root::-webkit-scrollbar { width: 5px; }
      .snd-root::-webkit-scrollbar-track { background: transparent; }
      .snd-root::-webkit-scrollbar-thumb { background: var(--overlay-active); border-radius: 3px; }

      /* Section cards */
      .snd-card {
        background: var(--input-bg-dark);
        border: 1px solid var(--border-muted);
        border-radius: var(--radius-sm);
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }

      /* Card header */
      .snd-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        border-bottom: 1px solid var(--border-muted);
      }
      .snd-card-title {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent-green);
      }
      .snd-card-head-ay .snd-card-title {
        color: var(--accent-blue);
      }
      .snd-ay-chip-label {
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--text-muted);
        padding: 1px 6px;
        background: var(--overlay-subtle);
        border-radius: 3px;
        border: 1px solid var(--border-muted);
      }

      /* =============================================
         Channel Rows (shared by beeper + AY)
         ============================================= */
      .snd-ch-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 6px;
      }
      .snd-ch-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        background: var(--overlay-subtle);
        border-radius: var(--radius-sm);
        height: 52px;
        font-family: var(--font-mono);
        font-size: 10px;
        transition: opacity 0.15s;
      }
      .snd-ch-row.muted { opacity: 0.35; }

      /* Channel mute */
      .snd-ch-mute {
        width: 22px; height: 22px;
        border: 1px solid var(--border-muted);
        border-radius: 3px;
        background: transparent;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        padding: 0; flex-shrink: 0;
        color: var(--text-muted);
        transition: all 0.15s;
      }
      .snd-ch-mute:hover { background: var(--overlay-hover); border-color: var(--text-muted); }
      .snd-ch-mute .snd-ch-mute-off { display: none; }
      .snd-ch-mute.muted .snd-ch-mute-on { display: none; }
      .snd-ch-mute.muted .snd-ch-mute-off { display: flex; }
      .snd-ch-mute.muted {
        background: var(--accent-red-bg);
        border-color: var(--accent-red-border);
        color: var(--accent-red);
      }

      /* =============================================
         Master Volume Card
         ============================================= */
      .snd-card-master {
        padding: 8px 10px;
      }
      .snd-master-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .snd-master-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .snd-master-mute {
        width: 26px; height: 26px;
        border: 1px solid var(--border-muted);
        border-radius: 4px;
        background: transparent;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        padding: 0; flex-shrink: 0;
        color: var(--text-secondary);
        transition: all 0.15s;
      }
      .snd-master-mute:hover { background: var(--overlay-hover); border-color: var(--text-muted); }
      .snd-master-mute .snd-ch-mute-off { display: none; }
      .snd-master-mute.muted .snd-ch-mute-on { display: none; }
      .snd-master-mute.muted .snd-ch-mute-off { display: flex; }
      .snd-master-mute.muted {
        background: var(--accent-red-bg);
        border-color: var(--accent-red-border);
        color: var(--accent-red);
      }
      .snd-master-slider {
        flex: 1;
      }

      /* Channel badge */
      .snd-ch-badge {
        width: 18px; height: 18px;
        display: flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: 700;
        border-radius: 3px; color: #fff; flex-shrink: 0;
        letter-spacing: 0.5px;
      }
      .snd-ch-badge-beep { background: ${CHANNEL_BADGE_COLORS.b}; box-shadow: 0 0 6px rgba(0, 205, 0, 0.4); }
      .snd-ch-badge-a { background: ${CHANNEL_BADGE_COLORS.a}; box-shadow: 0 0 6px rgba(0, 0, 205, 0.4); }
      .snd-ch-badge-b { background: ${CHANNEL_BADGE_COLORS.b}; box-shadow: 0 0 6px rgba(0, 205, 0, 0.4); }
      .snd-ch-badge-c { background: ${CHANNEL_BADGE_COLORS.c}; box-shadow: 0 0 6px rgba(205, 0, 0, 0.4); }

      .snd-vol-val {
        font-family: var(--font-mono);
        font-size: 9px;
        color: var(--text-muted);
        min-width: 28px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      /* Custom range slider */
      .snd-slider {
        flex: 1;
        height: 4px;
        background: var(--input-bg-deeper);
        border-radius: 2px;
        -webkit-appearance: none;
        appearance: none;
        cursor: pointer;
      }
      .snd-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        background: var(--accent-green);
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.1s;
        box-shadow: 0 0 6px var(--accent-green-bg-stronger);
      }
      .snd-slider::-webkit-slider-thumb:hover {
        transform: scale(1.15);
        box-shadow: 0 0 10px var(--accent-green-border-light);
      }
      .snd-slider::-moz-range-thumb {
        width: 10px;
        height: 10px;
        background: var(--accent-green);
        border: none;
        border-radius: 50%;
        cursor: pointer;
      }
      .snd-slider::-moz-range-track {
        height: 4px;
        background: var(--input-bg-deeper);
        border-radius: 2px;
      }

      /* Beeper and AY rows — taller for waveform visibility */
      .snd-beep-wave {
        min-width: 80px;
      }

      /* Frequency display */
      .snd-ch-freq {
        width: 80px; flex-shrink: 0;
        color: var(--text-secondary);
        font-size: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* T/N indicators */
      .snd-tn {
        width: 18px; height: 16px;
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 9px; font-weight: 700;
        border-radius: 3px; flex-shrink: 0;
        background: var(--overlay-subtle);
        border: 1px solid var(--border-muted);
        color: var(--text-muted);
        transition: all 0.15s;
      }
      .snd-tn.on {
        background: var(--accent-green-bg-strong);
        border-color: var(--accent-green-border-light);
        color: var(--accent-green);
        box-shadow: 0 0 4px var(--accent-green-bg);
      }

      /* Volume meter */
      .snd-ch-meter { width: 60px; flex-shrink: 0; }
      .snd-ch-meter-track {
        height: 6px;
        background: var(--input-bg-deeper);
        border-radius: 3px;
        position: relative;
        overflow: hidden;
        border: 1px solid var(--border-muted);
      }
      .snd-ch-meter-fill {
        position: absolute; left: 0; top: 0;
        height: 100%; width: 0%;
        border-radius: 2px;
        transition: width 0.06s linear;
      }
      .snd-ch-meter-fill-a { background: var(--channel-a); box-shadow: 0 0 4px color-mix(in srgb, var(--channel-a) 25%, transparent); }
      .snd-ch-meter-fill-b { background: var(--channel-b); box-shadow: 0 0 4px color-mix(in srgb, var(--channel-b) 25%, transparent); }
      .snd-ch-meter-fill-c { background: var(--channel-c); box-shadow: 0 0 4px color-mix(in srgb, var(--channel-c) 25%, transparent); }

      /* Volume text */
      .snd-ch-vol {
        width: 30px; flex-shrink: 0;
        font-size: 9px;
        color: var(--text-muted);
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .snd-ch-vol.env-mode { color: var(--accent-purple); }

      /* Channel waveform */
      .snd-ch-wave {
        flex: 1; min-width: 50px; min-height: 0;
        height: 100%;
        background: var(--canvas-bg);
        border-radius: 3px;
        border: 1px solid var(--border-muted);
        display: block;
      }

      /* Envelope / noise row */
      .snd-env-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 7px;
        font-size: 10px;
        border-top: 1px solid var(--border-muted);
      }
      .snd-env-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        flex-shrink: 0;
      }
      .snd-env-svg { vertical-align: middle; }
      .snd-env-freq { width: 52px; flex-shrink: 0; color: var(--accent-green); font-family: var(--font-mono); font-size: 10px; font-variant-numeric: tabular-nums; }
      .snd-noise-freq { width: 60px; flex-shrink: 0; color: var(--accent-blue); font-family: var(--font-mono); font-size: 10px; font-variant-numeric: tabular-nums; }
      .snd-env-unknown { color: var(--text-muted); }
      .snd-env-sep {
        width: 1px;
        height: 12px;
        background: var(--border-muted);
        margin: 0 4px;
      }

      /* Envelope phase badge */
      .snd-env-phase {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        width: 62px;
        flex-shrink: 0;
        padding: 1px 0;
        border-radius: 3px;
        font-family: var(--font-mono);
        font-size: 9px;
        font-weight: 600;
        border: 1px solid var(--border-muted);
        background: var(--overlay-subtle);
        color: var(--text-muted);
        transition: all 0.15s;
      }
      .snd-env-phase[data-phase="attack"] {
        background: var(--accent-green-bg);
        border-color: var(--accent-green-border);
        color: var(--accent-green);
      }
      .snd-env-phase[data-phase="decay"] {
        background: var(--accent-red-bg);
        border-color: var(--accent-red-border);
        color: var(--accent-red);
      }
      .snd-env-phase[data-phase="hold"] {
        background: var(--overlay-subtle);
        border-color: var(--border-muted);
        color: var(--text-muted);
      }
      .snd-env-phase-arrow {
        font-size: 8px;
        line-height: 1;
      }
      .snd-env-phase-label {
        letter-spacing: 0.04em;
      }
      .snd-int-val {
        width: 42px;
        flex-shrink: 0;
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: 10px;
        font-variant-numeric: tabular-nums;
      }

    </style>`;
  }

  onContentRendered() {
    this.beeperCanvas = this.contentElement.querySelector("#snd-beep-wave");
    this.beeperCtx = this.beeperCanvas
      ? this.beeperCanvas.getContext("2d", { alpha: false })
      : null;
    this.volumeSlider = this.contentElement.querySelector("#snd-vol-slider");
    this.volumeLabel = this.contentElement.querySelector("#snd-vol-label");
    this.muteBtn = this.contentElement.querySelector("#snd-beep-mute");

    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", (e) => {
        const vol = parseInt(e.target.value, 10);
        this.audioDriver.setVolume(vol / 100);
        if (this.volumeLabel) this.volumeLabel.textContent = `${vol}%`;

        // Sync header popup slider
        const headerSlider = document.getElementById("volume-slider");
        const headerLabel = document.getElementById("volume-value");
        if (headerSlider) headerSlider.value = vol;
        if (headerLabel) headerLabel.textContent = `${vol}%`;
      });
    }

    if (this.muteBtn) {
      this.muteBtn.addEventListener("click", () => {
        this.audioDriver.toggleMute();
        const muted = this.audioDriver.isMuted();
        this.muteBtn.classList.toggle("muted", muted);
        this.muteBtn.setAttribute("title", muted ? "Unmute" : "Mute");

        // Sync header mute toggle
        const headerMute = document.getElementById("mute-toggle");
        if (headerMute) headerMute.checked = muted;

        // Update header sound button icons
        const soundBtn = document.getElementById("btn-sound");
        if (soundBtn) {
          const iconUnmuted = soundBtn.querySelector(".icon-unmuted");
          const iconMuted = soundBtn.querySelector(".icon-muted");
          if (muted) {
            iconUnmuted?.classList.add("hidden");
            iconMuted?.classList.remove("hidden");
          } else {
            iconUnmuted?.classList.remove("hidden");
            iconMuted?.classList.add("hidden");
          }
        }
      });
    }

    // Watch for theme changes and update canvas/waveform colors
    if (!this._themeObserver) {
      this._themeObserver = new MutationObserver(() => {
        this._canvasColorsInit = false;
      });
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }

    // AY mute click handler via event delegation
    if (!this.ayMuteHandlerAttached && this.contentElement) {
      this.ayMuteHandlerAttached = true;
      this.contentElement.addEventListener("click", (e) => {
        const muteBtn = e.target.closest(".snd-ch-mute:not(.snd-master-mute)");
        if (muteBtn && this.proxy?._setAYChannelMute) {
          const ch = parseInt(muteBtn.dataset.ch, 10);
          const currentlyMuted = this.proxy._getAYChannelMute(ch);
          this.proxy._setAYChannelMute(ch, !currentlyMuted);
          this.updateAYMuteState(this.proxy);
          if (this.onStateChange) this.onStateChange();
        }
      });
    }
  }

  cacheAYElements() {
    const el = this.contentElement;
    const channelNames = ["a", "b", "c"];

    this.ayElements = {
      section: el.querySelector("#snd-ay-card"),
      channels: [],
      mute: [],
      freq: [],
      tone: [],
      noise: [],
      volFill: [],
      volText: [],
      canvases: [],
      canvasCtx: [],
      envShape: el.querySelector("#snd-env-shape"),
      envFreq: el.querySelector("#snd-env-freq"),
      noiseFreq: el.querySelector("#snd-noise-freq"),
      intLFSR: el.querySelector("#snd-int-lfsr"),
      envPhase: el.querySelector("#snd-env-phase"),
      envPhaseArrow: el.querySelector("#snd-env-phase-arrow"),
      envPhaseLabel: el.querySelector("#snd-env-phase-label"),
    };

    for (let ch = 0; ch < 3; ch++) {
      const chName = channelNames[ch];
      this.ayElements.channels[ch] = el.querySelector(
        `.snd-ch-row[data-channel="${chName}"]`,
      );
      this.ayElements.mute[ch] = el.querySelector(
        `.snd-ch-mute[data-ch="${ch}"]`,
      );
      this.ayElements.freq[ch] = el.querySelector(`#snd-ch${chName}-freq`);
      this.ayElements.tone[ch] = el.querySelector(`#snd-ch${chName}-tone`);
      this.ayElements.noise[ch] = el.querySelector(`#snd-ch${chName}-noise`);
      this.ayElements.volFill[ch] = el.querySelector(`#snd-ch${chName}-fill`);
      this.ayElements.volText[ch] = el.querySelector(`#snd-ch${chName}-vol`);
      const canvas = el.querySelector(`#snd-ch${chName}-wave`);
      this.ayElements.canvases[ch] = canvas;
      this.ayElements.canvasCtx[ch] = canvas
        ? canvas.getContext("2d", { alpha: false })
        : null;
    }
  }

  resizeCanvases() {
    // Beeper canvas
    if (this.beeperCanvas) {
      const w = this.beeperCanvas.clientWidth;
      const h = this.beeperCanvas.clientHeight;
      if (
        w > 0 &&
        h > 0 &&
        (this.beeperCanvas.width !== w || this.beeperCanvas.height !== h)
      ) {
        this.beeperCanvas.width = w;
        this.beeperCanvas.height = h;
      }
    }
    // AY canvases
    if (!this.ayElements) return;
    for (let ch = 0; ch < 3; ch++) {
      const canvas = this.ayElements.canvases[ch];
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
    this.canvasLine =
      style.getPropertyValue("--canvas-line").trim() || "#1a1a2a";
    this.channelColorA =
      style.getPropertyValue("--channel-a").trim() || "#00FFFF";
    this.channelColorB =
      style.getPropertyValue("--channel-b").trim() || "#00FF00";
    this.channelColorC =
      style.getPropertyValue("--channel-c").trim() || "#FF0000";
    this.beeperColor =
      style.getPropertyValue("--beeper-color").trim() || "#00FF00";
  }

  drawWaveformBase(ctx, canvas, samples, color) {
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return false;

    ctx.fillStyle = this.canvasBg;
    ctx.fillRect(0, 0, width, height);

    // Center line
    ctx.strokeStyle = this.canvasLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!samples || samples.length === 0) return false;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    return true;
  }

  drawFixedWaveform(ctx, canvas, samples, color, maxAmplitude) {
    if (!this.drawWaveformBase(ctx, canvas, samples, color)) return;

    const width = canvas.width;
    const height = canvas.height;
    const sampleCount = samples.length;
    const xScale = width / (sampleCount - 1);

    // Fixed scale: map [-maxAmplitude, +maxAmplitude] to full canvas height
    // Beeper is 0-to-positive so center it by subtracting half the max
    const mid = maxAmplitude / 2;
    const scale = 1 / maxAmplitude;

    for (let i = 0; i < sampleCount; i++) {
      const x = i * xScale;
      const y = height / 2 - (samples[i] - mid) * scale * (height - 2);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  drawChannelWaveform(ctx, canvas, samples, color) {
    if (!this.drawWaveformBase(ctx, canvas, samples, color)) return;

    const width = canvas.width;
    const height = canvas.height;
    const sampleCount = samples.length;
    const xScale = width / (sampleCount - 1);

    // Find min/max for normalization and centering
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < sampleCount; i++) {
      if (samples[i] < min) min = samples[i];
      if (samples[i] > max) max = samples[i];
    }
    const mid = (min + max) / 2;
    const range = max - min;
    const scale = range > 0.001 ? 1 / (range / 2) : 1;

    for (let i = 0; i < sampleCount; i++) {
      const x = i * xScale;
      const y = height / 2 - (samples[i] - mid) * scale * (height / 2 - 1);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  updateAYChannels(proxy) {
    if (!proxy._getAYRegister) return;

    const channelRegs = [
      [0, 1], // Channel A tone fine/coarse
      [2, 3], // Channel B
      [4, 5], // Channel C
    ];

    const r7 = proxy._getAYRegister(7);

    for (let ch = 0; ch < 3; ch++) {
      const fine = proxy._getAYRegister(channelRegs[ch][0]);
      const coarse = proxy._getAYRegister(channelRegs[ch][1]);
      const period = fine | ((coarse & 0x0f) << 8);
      const freq = period > 0 ? Math.round(PSG_CLOCK / (16 * period)) : 0;

      const freqKey = `ch${ch}freq`;
      if (this.ayPrevValues[freqKey] !== freq) {
        this.ayPrevValues[freqKey] = freq;
        const freqEl = this.ayElements.freq[ch];
        if (freqEl) {
          if (freq > 0) {
            const note = frequencyToNote(freq);
            freqEl.textContent = note ? `${note} ${freq}Hz` : `${freq}Hz`;
          } else {
            freqEl.textContent = "--";
          }
        }
      }

      const toneEnabled = !(r7 & (1 << ch));
      const toneKey = `ch${ch}tone`;
      if (this.ayPrevValues[toneKey] !== toneEnabled) {
        this.ayPrevValues[toneKey] = toneEnabled;
        if (this.ayElements.tone[ch])
          this.ayElements.tone[ch].classList.toggle("on", toneEnabled);
      }

      const noiseEnabled = !(r7 & (1 << (ch + 3)));
      const noiseKey = `ch${ch}noise`;
      if (this.ayPrevValues[noiseKey] !== noiseEnabled) {
        this.ayPrevValues[noiseKey] = noiseEnabled;
        if (this.ayElements.noise[ch])
          this.ayElements.noise[ch].classList.toggle("on", noiseEnabled);
      }

      const ampReg = proxy._getAYRegister(8 + ch);
      const useEnv = (ampReg & 0x10) !== 0;
      const vol = ampReg & 0x0f;

      const volKey = `ch${ch}vol`;
      const volVal = useEnv ? -1 : vol;
      if (this.ayPrevValues[volKey] !== volVal) {
        this.ayPrevValues[volKey] = volVal;

        const fillEl = this.ayElements.volFill[ch];
        if (fillEl) {
          fillEl.style.width = useEnv ? "50%" : `${(vol / 15) * 100}%`;
        }

        const volTextEl = this.ayElements.volText[ch];
        if (volTextEl) {
          volTextEl.textContent = useEnv ? "ENV" : `${vol}/15`;
          volTextEl.classList.toggle("env-mode", useEnv);
        }
      }
    }

    // Envelope shape and frequency
    const envShape = proxy._getAYRegister(13);
    if (this.ayPrevValues.envShape !== envShape) {
      this.ayPrevValues.envShape = envShape;
      if (this.ayElements.envShape) {
        this.ayElements.envShape.innerHTML = getEnvelopeShapeSVG(envShape);
      }
    }

    const envFine = proxy._getAYRegister(11);
    const envCoarse = proxy._getAYRegister(12);
    const envPeriod = envFine | (envCoarse << 8);
    const envFreq =
      envPeriod > 0 ? (PSG_CLOCK / (256 * envPeriod)).toFixed(1) : 0;
    if (this.ayPrevValues.envFreq !== envFreq) {
      this.ayPrevValues.envFreq = envFreq;
      if (this.ayElements.envFreq) {
        this.ayElements.envFreq.textContent = envFreq > 0 ? `${envFreq}Hz` : "";
      }
    }

    const noisePeriod = proxy._getAYRegister(6);
    const noiseFreq =
      noisePeriod > 0 ? (PSG_CLOCK / (16 * noisePeriod)).toFixed(1) : 0;
    if (this.ayPrevValues.noiseFreq !== noiseFreq) {
      this.ayPrevValues.noiseFreq = noiseFreq;
      if (this.ayElements.noiseFreq) {
        this.ayElements.noiseFreq.textContent =
          noiseFreq > 0 ? `${noiseFreq}Hz` : "";
      }
    }
  }

  updateAYWaveforms(proxy) {
    const colors = [
      this.channelColorA || CHANNEL_COLORS.a,
      this.channelColorB || CHANNEL_COLORS.b,
      this.channelColorC || CHANNEL_COLORS.c,
    ];
    const ayOn = proxy.isAYEnabled();

    for (let ch = 0; ch < 3; ch++) {
      const ctx = this.ayElements.canvasCtx[ch];
      if (!ctx) continue;
      const canvas = this.ayElements.canvases[ch];
      const samples =
        ayOn && proxy.getAYWaveform ? proxy.getAYWaveform(ch) : null;
      this.drawChannelWaveform(ctx, canvas, samples, colors[ch]);
    }
  }

  updateAYMuteState(proxy) {
    if (!proxy?._getAYChannelMute) return;

    for (let ch = 0; ch < 3; ch++) {
      const isMuted = proxy._getAYChannelMute(ch);
      const key = `mute${ch}`;
      if (this.ayPrevValues[key] !== isMuted) {
        this.ayPrevValues[key] = isMuted;
        if (this.ayElements.mute[ch])
          this.ayElements.mute[ch].classList.toggle("muted", isMuted);
        if (this.ayElements.channels[ch])
          this.ayElements.channels[ch].classList.toggle("muted", isMuted);
      }
    }
  }

  updateAYInternals(proxy) {
    const internals = proxy.getAYInternals ? proxy.getAYInternals() : null;
    if (!internals || !this.ayElements) return;

    // Noise LFSR
    const lfsr = internals.noiseLFSR;
    if (this.ayPrevValues.intLFSR !== lfsr) {
      this.ayPrevValues.intLFSR = lfsr;
      if (this.ayElements.intLFSR) {
        this.ayElements.intLFSR.textContent = lfsr
          .toString(16)
          .toUpperCase()
          .padStart(5, "0");
      }
    }

    // Envelope phase (attack / decay / hold)
    const attack = internals.envAttack;
    const holding = internals.envHolding;
    const stateLabel = holding ? "Hold" : attack ? "Attack" : "Decay";
    if (this.ayPrevValues.intEnvState !== stateLabel) {
      this.ayPrevValues.intEnvState = stateLabel;
      if (this.ayElements.envPhaseArrow) {
        this.ayElements.envPhaseArrow.textContent = holding
          ? "\u25A0"
          : attack
            ? "\u25B2"
            : "\u25BC";
      }
      if (this.ayElements.envPhaseLabel) {
        this.ayElements.envPhaseLabel.textContent = stateLabel;
      }
      if (this.ayElements.envPhase) {
        this.ayElements.envPhase.dataset.phase = stateLabel.toLowerCase();
      }
    }
  }

  getState() {
    const base = super.getState();
    if (this._pendingMuteState) {
      base.ayChannelMutes = this._pendingMuteState;
    } else if (this.proxy?._getAYChannelMute) {
      const muteState = [];
      for (let ch = 0; ch < 3; ch++) {
        muteState.push(!!this.proxy._getAYChannelMute(ch));
      }
      base.ayChannelMutes = muteState;
    }
    return base;
  }

  restoreState(state) {
    if (state.ayChannelMutes) {
      this._pendingMuteState = state.ayChannelMutes;
    }
    super.restoreState(state);
  }

  /**
   * Apply any pending restored state to the proxy.
   * Called every frame regardless of window visibility.
   */
  applyPendingState() {
    const proxy = this.proxy;
    if (!proxy) return;

    if (this._pendingMuteState && proxy._setAYChannelMute) {
      let allApplied = true;
      for (let ch = 0; ch < 3; ch++) {
        if (this._pendingMuteState[ch] && !proxy._getAYChannelMute(ch)) {
          proxy._setAYChannelMute(ch, true);
          allApplied = false;
        }
      }
      if (allApplied) {
        this._pendingMuteState = null;
      }
    }
  }

  update() {
    // Apply pending state every frame even if we skip the visual update
    this.applyPendingState();

    this._frameCount++;
    if (this._frameCount % 2 !== 0) return;

    const proxy = this.proxy;

    // Sync volume slider if changed externally
    if (this.volumeSlider) {
      const currentVol = Math.round(this.audioDriver.getVolume() * 100);
      if (parseInt(this.volumeSlider.value, 10) !== currentVol) {
        this.volumeSlider.value = currentVol;
        if (this.volumeLabel) this.volumeLabel.textContent = `${currentVol}%`;
      }
    }

    // Sync mute button
    if (this.muteBtn) {
      const muted = this.audioDriver.isMuted();
      const isMutedClass = this.muteBtn.classList.contains("muted");
      if (isMutedClass !== muted) {
        this.muteBtn.classList.toggle("muted", muted);
      }
    }

    // Initialize canvas colors on first update
    if (!this._canvasColorsInit) {
      this._canvasColorsInit = true;
      this.updateCanvasColors();
    }

    // Resize all canvases
    this.resizeCanvases();

    // Draw beeper waveform
    if (this.beeperCtx && this.beeperCanvas && proxy) {
      const beeperSamples = proxy.getBeeperWaveform
        ? proxy.getBeeperWaveform()
        : null;
      this.drawFixedWaveform(
        this.beeperCtx,
        this.beeperCanvas,
        beeperSamples,
        this.beeperColor || BEEPER_COLOR,
        BEEPER_VOLUME,
      );
    }

    // AY section: show/hide based on AY enabled state
    if (proxy) {
      if (!this.ayElements) {
        this.cacheAYElements();
      }

      const ayEnabled = proxy.isAYEnabled();
      if (this.ayElements.section) {
        this.ayElements.section.style.display = ayEnabled ? "" : "none";
      }

      if (ayEnabled) {
        this.updateAYChannels(proxy);
        this.updateAYWaveforms(proxy);
        this.updateAYMuteState(proxy);
        this.updateAYInternals(proxy);
      }
    }
  }

  destroy() {
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
    this.beeperCanvas = null;
    this.beeperCtx = null;
    this.ayElements = null;
    super.destroy();
  }
}
