/*
 * time-travel-window.js - Time-travel scrubber for rewind/replay
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import "../css/time-travel.css";
import { BaseWindow } from "../windows/base-window.js";

// Depth presets: { label, maxEntries } at 10 captures/sec
const DEPTH_PRESETS = [
  { label: "15s", maxEntries: 150 },
  { label: "30s", maxEntries: 300 },
  { label: "1m",  maxEntries: 600 },
  { label: "2.5m", maxEntries: 1500 },
];

const CAPTURE_INTERVAL = 5; // frames between captures

export class TimeTravelWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "time-travel",
      title: "Time Travel",
      defaultWidth: 480,
      defaultHeight: 68,
      minWidth: 360,
      minHeight: 68,
      maxHeight: 68,
      resizeDirections: ["e", "w"],
    });

    this._proxy = proxy;
    this._enabled = false;
    this._scrubbing = false;
    this._dragging = false;
    this._status = null;
    this._scrubIndex = 0;
    this._depthIndex = 1; // default 30s
    this._scrubRafPending = false;
    this._pendingScrubIndex = -1;

    // Bound handlers
    this._onTrackMouseDown = this._onTrackMouseDown.bind(this);
    this._onTrackMouseMove = this._onTrackMouseMove.bind(this);
    this._onTrackMouseUp = this._onTrackMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  renderContent() {
    const depthOptions = DEPTH_PRESETS.map((p, i) =>
      `<option value="${i}"${i === this._depthIndex ? " selected" : ""}>${p.label}</option>`
    ).join("");

    return `
      <div class="time-travel-container">
        <button class="tt-record-btn" title="Enable/Disable Recording">
          <div class="tt-record-dot"></div>
        </button>
        <span class="tt-status">Off</span>
        <div class="tt-timeline">
          <div class="tt-track-row">
            <div class="tt-track disabled">
              <div class="tt-fill"></div>
              <div class="tt-thumb"></div>
            </div>
          </div>
        </div>
        <span class="tt-time"></span>
        <select class="tt-depth">${depthOptions}</select>
        <button class="tt-action-btn tt-play-btn" title="Resume from Here" disabled>
          <svg viewBox="0 0 12 12" fill="currentColor"><polygon points="2,1 11,6 2,11"/></svg>
        </button>
        <button class="tt-live-btn" title="Return to Live">LIVE</button>
      </div>
    `;
  }

  onContentRendered() {
    const el = this.contentElement;
    this._recordBtn = el.querySelector(".tt-record-btn");
    this._statusEl = el.querySelector(".tt-status");
    this._track = el.querySelector(".tt-track");
    this._fill = el.querySelector(".tt-fill");
    this._thumb = el.querySelector(".tt-thumb");
    this._timeEl = el.querySelector(".tt-time");
    this._depthSelect = el.querySelector(".tt-depth");
    this._playBtn = el.querySelector(".tt-play-btn");
    this._liveBtn = el.querySelector(".tt-live-btn");

    this._recordBtn.addEventListener("click", () => this._toggleRecord());
    this._track.addEventListener("mousedown", this._onTrackMouseDown);
    this._depthSelect.addEventListener("change", () => this._onDepthChange());
    this._playBtn.addEventListener("click", () => this._onPlay());
    this._liveBtn.addEventListener("click", () => this._returnToLive());

    document.addEventListener("keydown", this._onKeyDown);
  }

  destroy() {
    document.removeEventListener("keydown", this._onKeyDown);
    super.destroy();
  }

  _toggleRecord() {
    this._enabled = !this._enabled;
    this._recordBtn.classList.toggle("active", this._enabled);

    if (this._enabled) {
      const preset = DEPTH_PRESETS[this._depthIndex];
      this._proxy.timeTravelEnable(true, CAPTURE_INTERVAL, preset.maxEntries);
    } else {
      if (this._scrubbing) this._endScrub(false);
      this._proxy.timeTravelEnable(false);
      this._status = null;
      this._updateUI();
    }
  }

  _onDepthChange() {
    this._depthIndex = parseInt(this._depthSelect.value, 10);
    if (this._enabled) {
      const preset = DEPTH_PRESETS[this._depthIndex];
      this._proxy.timeTravelEnable(true, CAPTURE_INTERVAL, preset.maxEntries);
    }
    if (this.onStateChange) this.onStateChange();
  }

  // ── Keyboard scrubbing ─────────────────────────────────────────────────

  _onKeyDown(e) {
    if (!this._enabled || !this.isVisible) return;
    if (!this._status || this._status.count === 0) return;

    const count = this._status.count;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (!this._scrubbing) {
        // Enter scrub mode at the latest entry
        this._scrubbing = true;
        this._scrubIndex = count - 1;
        this._proxy.timeTravelScrubStart();
        this._track.classList.add("scrubbing");
      }
      // Step backward
      if (this._scrubIndex > 0) {
        this._scrubIndex--;
        this._proxy.timeTravelScrubTo(this._scrubIndex);
        this._updateScrubUI();
      }
    } else if (e.key === "ArrowRight" && this._scrubbing) {
      e.preventDefault();
      // Step forward
      if (this._scrubIndex < count - 1) {
        this._scrubIndex++;
        this._proxy.timeTravelScrubTo(this._scrubIndex);
        this._updateScrubUI();
      }
    }
  }

  // ── Mouse scrub interaction ────────────────────────────────────────────

  _onTrackMouseDown(e) {
    if (!this._enabled || !this._status || this._status.count === 0) return;
    e.preventDefault();

    this._dragging = true;

    if (!this._scrubbing) {
      this._scrubbing = true;
      this._proxy.timeTravelScrubStart();
      this._track.classList.add("scrubbing");
    }

    this._scrubToMousePosition(e);

    document.addEventListener("mousemove", this._onTrackMouseMove);
    document.addEventListener("mouseup", this._onTrackMouseUp);
  }

  _onTrackMouseMove(e) {
    e.preventDefault();
    this._scrubToMousePosition(e);
  }

  _onTrackMouseUp() {
    document.removeEventListener("mousemove", this._onTrackMouseMove);
    document.removeEventListener("mouseup", this._onTrackMouseUp);
    this._dragging = false;
    // Stay paused — user must press Play or LIVE to continue
  }

  _scrubToMousePosition(e) {
    const rect = this._track.getBoundingClientRect();
    const count = this._status ? this._status.count : 0;
    if (count === 0) return;

    // Clamp mouse to the filled region (can't scrub past recorded history)
    const fillRatio = count / this._status.maxEntries;
    const fillWidth = rect.width * fillRatio;
    const x = Math.max(0, Math.min(fillWidth, e.clientX - rect.left));
    const ratio = fillWidth > 0 ? x / fillWidth : 0;

    const index = Math.min(Math.round(ratio * (count - 1)), count - 1);
    this._scrubIndex = index;

    // Debounce scrub messages via requestAnimationFrame
    this._pendingScrubIndex = index;
    if (!this._scrubRafPending) {
      this._scrubRafPending = true;
      requestAnimationFrame(() => {
        this._scrubRafPending = false;
        if (this._pendingScrubIndex >= 0 && this._scrubbing) {
          this._proxy.timeTravelScrubTo(this._pendingScrubIndex);
        }
      });
    }

    this._updateScrubUI();
  }

  // ── Play / Live / End scrub ────────────────────────────────────────────

  _onPlay() {
    if (!this._scrubbing) return;
    this._endScrub(true);
  }

  _returnToLive() {
    if (this._scrubbing) {
      this._endScrub(false);
    }
  }

  _endScrub(resume) {
    if (!this._scrubbing) return;
    this._scrubbing = false;
    this._dragging = false;
    this._track.classList.remove("scrubbing");

    if (resume) {
      this._proxy.timeTravelScrubEnd(true, this._scrubIndex);
    } else {
      this._proxy.timeTravelScrubEnd(false);
    }

    this._updateUI();
  }

  // ── Status updates ─────────────────────────────────────────────────────

  updateStatus(status) {
    this._status = status;
    this._enabled = status.enabled;
    this._recordBtn.classList.toggle("active", this._enabled);

    if (!this._scrubbing) {
      this._updateUI();
    }
  }

  _updateUI() {
    const status = this._status;
    const hasHistory = status && status.count > 0;

    this._track.classList.toggle("disabled", !this._enabled || !hasHistory);
    this._playBtn.disabled = !this._scrubbing;
    this._liveBtn.classList.toggle("visible", this._scrubbing);

    if (!this._enabled) {
      this._statusEl.textContent = "Off";
      this._fill.style.width = "0";
      this._timeEl.textContent = "";
      return;
    }

    if (!status) return;

    const fillRatio = status.count / status.maxEntries;
    this._fill.style.width = `${fillRatio * 100}%`;

    const seconds = (status.count * CAPTURE_INTERVAL) / 50;
    this._statusEl.textContent = `${seconds.toFixed(1)}s`;
    this._timeEl.textContent = "LIVE";
    this._thumb.style.left = `${fillRatio * 100}%`;
  }

  _updateScrubUI() {
    const status = this._status;
    if (!status || status.count === 0) return;

    const count = status.count;
    const fillRatio = count / status.maxEntries;

    this._fill.style.width = `${fillRatio * 100}%`;

    const thumbRatio = count > 1 ? this._scrubIndex / (count - 1) : 0;
    this._thumb.style.left = `${thumbRatio * fillRatio * 100}%`;

    const framesFromEnd = count - 1 - this._scrubIndex;
    const secondsBack = (framesFromEnd * CAPTURE_INTERVAL) / 50;

    if (secondsBack > 0) {
      this._timeEl.textContent = `-${secondsBack.toFixed(1)}s`;
      this._statusEl.textContent = "Paused";
    } else {
      this._timeEl.textContent = "LIVE";
      this._statusEl.textContent = `${((count * CAPTURE_INTERVAL) / 50).toFixed(1)}s`;
    }

    this._playBtn.disabled = false;
    this._liveBtn.classList.toggle("visible", this._scrubbing);
  }

  // ── Window visibility ───────────────────────────────────────────────────

  hide() {
    if (this._enabled) {
      if (this._scrubbing) this._endScrub(false);
      this._proxy.timeTravelEnable(false);
    }
    super.hide();
  }

  show() {
    super.show();
    if (this._enabled) {
      const preset = DEPTH_PRESETS[this._depthIndex];
      this._proxy.timeTravelEnable(true, CAPTURE_INTERVAL, preset.maxEntries);
    }
  }

  // ── State persistence ──────────────────────────────────────────────────

  getState() {
    return {
      ...super.getState(),
      enabled: this._enabled,
      depthIndex: this._depthIndex,
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.depthIndex !== undefined) {
      this._depthIndex = state.depthIndex;
      if (this._depthSelect) this._depthSelect.value = String(this._depthIndex);
    }
    if (state.enabled) {
      this._enabled = true;
      if (this._recordBtn) this._recordBtn.classList.add("active");
      if (this.isVisible) {
        const preset = DEPTH_PRESETS[this._depthIndex];
        this._proxy.timeTravelEnable(true, CAPTURE_INTERVAL, preset.maxEntries);
      }
    }
  }
}
