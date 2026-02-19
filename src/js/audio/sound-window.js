/*
 * sound-window.js - Sound debug window with beeper visualization
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

export class SoundWindow extends BaseWindow {
  constructor(audioDriver) {
    super({
      id: "sound-debug",
      title: "Sound",
      defaultWidth: 340,
      defaultHeight: 260,
      minWidth: 300,
      minHeight: 220,
      maxWidth: 500,
      defaultPosition: { x: 60, y: 300 },
    });
    this.audioDriver = audioDriver;
    this.canvas = null;
    this.ctx = null;
    this.volumeSlider = null;
    this.volumeLabel = null;
    this.muteBtn = null;
    this._frameCount = 0;
  }

  renderContent() {
    const vol = Math.round(this.audioDriver.getVolume() * 100);
    return `
      <div class="sound-window-content">
        <div class="sound-section">
          <div class="sound-section-header">Beeper</div>
          <div class="sound-controls-row">
            <label class="sound-label">Volume</label>
            <input type="range" class="sound-volume-slider" id="sound-win-volume" min="0" max="100" value="${vol}" />
            <span class="sound-volume-value" id="sound-win-vol-label">${vol}%</span>
            <button class="sound-mute-btn" id="sound-win-mute" title="Mute">${this.audioDriver.isMuted() ? "🔇" : "🔊"}</button>
          </div>
          <div class="sound-waveform-container">
            <canvas class="sound-waveform-canvas" id="sound-win-canvas"></canvas>
          </div>
        </div>
      </div>
      ${this.renderStyles()}
    `;
  }

  renderStyles() {
    return `<style>
      .sound-window-content {
        padding: 8px;
        font-size: 12px;
        color: var(--text-primary);
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .sound-section {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
      .sound-section-header {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        margin-bottom: 6px;
      }
      .sound-controls-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .sound-label {
        font-size: 11px;
        color: var(--text-secondary);
        flex-shrink: 0;
      }
      .sound-volume-slider {
        flex: 1;
        height: 4px;
        cursor: pointer;
        accent-color: var(--accent-blue);
      }
      .sound-volume-value {
        font-size: 11px;
        color: var(--text-secondary);
        min-width: 32px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .sound-mute-btn {
        background: none;
        border: 1px solid var(--control-border, var(--glass-border));
        border-radius: 4px;
        padding: 2px 6px;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        color: var(--text-secondary);
      }
      .sound-mute-btn:hover {
        background: var(--glass-bg);
      }
      .sound-waveform-container {
        flex: 1;
        min-height: 80px;
        border: 1px solid var(--glass-border);
        border-radius: 4px;
        overflow: hidden;
        background: var(--bg-tertiary, #0a0a0b);
      }
      .sound-waveform-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
    </style>`;
  }

  onContentRendered() {
    this.canvas = this.contentElement.querySelector("#sound-win-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.volumeSlider = this.contentElement.querySelector("#sound-win-volume");
    this.volumeLabel = this.contentElement.querySelector("#sound-win-vol-label");
    this.muteBtn = this.contentElement.querySelector("#sound-win-mute");

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
        this.muteBtn.textContent = muted ? "🔇" : "🔊";

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
  }

  update() {
    // Throttle to every 3rd frame (~16fps)
    this._frameCount++;
    if (this._frameCount % 3 !== 0) return;

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
      const expected = muted ? "🔇" : "🔊";
      if (this.muteBtn.textContent !== expected) {
        this.muteBtn.textContent = expected;
      }
    }

    this.drawWaveform();
  }

  drawWaveform() {
    if (!this.canvas || !this.ctx) return;

    const samples = this.audioDriver.latestSamples;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.floor(rect.width * devicePixelRatio);
    const h = Math.floor(rect.height * devicePixelRatio);

    if (w <= 0 || h <= 0) return;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Center line
    const midY = h / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    if (!samples || samples.length === 0) return;

    // Compute DC offset and peak amplitude for centering + normalization
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i];
    const dc = sum / samples.length;

    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i] - dc);
      if (abs > peak) peak = abs;
    }
    const scale = peak > 0 ? 1 / peak : 1;

    // Draw waveform
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = samples.length / w;
    for (let i = 0; i < w; i++) {
      const idx = Math.floor(i * step);
      const val = (samples[idx] || 0) - dc;
      const y = midY - val * scale * midY * 0.85;
      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }
    ctx.stroke();
  }

  destroy() {
    this.canvas = null;
    this.ctx = null;
    super.destroy();
  }
}
