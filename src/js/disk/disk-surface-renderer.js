/*
 * disk-surface-renderer.js - Disk surface visualization renderer
 *
 * Renders a spinning 3" disk visualization on a canvas, showing track access
 * heat map, sector lines, head position, and motor state. Adapted from the
 * web-a2e Apple //e emulator's disk surface renderer.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const CANVAS_W = 280;
const CANVAS_H = 240;
const CENTER_X = 140;
const CENTER_Y = 115;
const OUTER_RADIUS = 105;
const HUB_HOLE_RADIUS = 28;
const HUB_RING_INNER = 28;
const HUB_RING_OUTER = 34;
const TRACK_OUTER = OUTER_RADIUS - 3;
const TRACK_INNER = HUB_RING_OUTER + 4;
const NUM_TRACKS = 40;
const NUM_SECTORS = 9;
const TRACK_RANGE = TRACK_OUTER - TRACK_INNER;
const RPM_RAD_PER_MS = Math.PI / 100; // 300 RPM
const PX_RATIO = 2;

export class DiskSurfaceRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    canvas.width = CANVAS_W * PX_RATIO;
    canvas.height = CANVAS_H * PX_RATIO;
    this.ctx = canvas.getContext("2d");
    this.ctx.scale(PX_RATIO, PX_RATIO);

    this.angle = 0;
    this.lastTimestamp = 0;
    this.motorOn = false;
    this.angularVelocity = 0;
    this.spinning = false;
    this._prev = {};
    this._lastTheme = null;
    this._updateThemeColors();
    this._drawEmpty();
  }

  _updateThemeColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    this._colors = {
      bg: v("--disk-bg", "#161b22"),
      medium: v("--disk-medium", "#1a1308"),
      sectorLine: v("--disk-sector-line", "rgba(255,255,255,0.08)"),
      ghostOutline: v("--disk-ghost-outline", "rgba(255,255,255,0.06)"),
      ghostSector: v("--disk-ghost-sector", "rgba(255,255,255,0.03)"),
      ghostHub: v("--disk-ghost-hub", "rgba(210,208,200,0.08)"),
      hubRing: v("--disk-hub-ring", "rgba(210,208,200,0.85)"),
      hubEdge: v("--disk-hub-edge", "rgba(255,255,255,0.12)"),
      hubEdgeInner: v("--disk-hub-edge-inner", "rgba(255,255,255,0.08)"),
      holeEdge: v("--disk-hole-edge", "rgba(0,0,0,0.3)"),
      diskEdge: v("--disk-edge", "rgba(255,255,255,0.06)"),
    };
  }

  update(state) {
    const {
      hasDisk,
      isActive,
      isWriteMode,
      track,
      trackAccessCounts,
      maxAccessCount,
      timestamp,
    } = state;

    const currentTheme = document.documentElement.dataset.theme;
    if (this._lastTheme !== currentTheme) {
      this._lastTheme = currentTheme;
      this._updateThemeColors();
      this._prev = {};
    }

    const dt = this.lastTimestamp > 0 ? timestamp - this.lastTimestamp : 0;
    this.lastTimestamp = timestamp;

    if (isActive && hasDisk) {
      this.motorOn = true;
      this.spinning = true;
      this.angularVelocity = RPM_RAD_PER_MS;
    } else if (this.motorOn) {
      this.motorOn = false;
      this._prev = {};
    }

    if (this.spinning && dt > 0) {
      if (!this.motorOn) {
        this.angularVelocity *= Math.pow(0.5, dt / 600);
        if (this.angularVelocity < RPM_RAD_PER_MS * 0.005) {
          this.angularVelocity = 0;
          this.spinning = false;
        }
      }
      this.angle += this.angularVelocity * dt;
    }

    if (!hasDisk) {
      if (this._prev.hasDisk !== false) {
        this._drawEmpty();
        this._prev = { hasDisk: false };
      }
      return;
    }

    if (!this.spinning) {
      if (
        this._prev.hasDisk === true &&
        this._prev.track === track &&
        this._prev.isActive === isActive &&
        this._prev.isWriteMode === isWriteMode &&
        this._prev.maxAccessCount === maxAccessCount
      ) {
        return;
      }
    }

    this._prev = { hasDisk: true, track, isActive, isWriteMode, maxAccessCount };
    this._drawDisk(state);
  }

  reset() {
    this.angle = 0;
    this.lastTimestamp = 0;
    this.motorOn = false;
    this.angularVelocity = 0;
    this.spinning = false;
    this._prev = {};
    this._drawEmpty();
  }

  _drawEmpty() {
    const ctx = this.ctx;
    const c = this._colors;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, OUTER_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = c.ghostOutline;
    ctx.lineWidth = 1;
    ctx.stroke();

    const TWO_PI = Math.PI * 2;
    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    for (let s = 0; s < NUM_SECTORS; s++) {
      const a = (s / NUM_SECTORS) * TWO_PI;
      ctx.strokeStyle = c.ghostSector;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * TRACK_INNER, Math.sin(a) * TRACK_INNER);
      ctx.lineTo(Math.cos(a) * TRACK_OUTER, Math.sin(a) * TRACK_OUTER);
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_OUTER, 0, Math.PI * 2);
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_INNER, TWO_PI, 0, true);
    ctx.fillStyle = c.ghostHub;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_HOLE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = c.ghostOutline;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  _drawDisk(state) {
    const { isActive, isWriteMode, track, trackAccessCounts, maxAccessCount } =
      state;
    const ctx = this.ctx;
    const c = this._colors;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Magnetic medium
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, OUTER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = c.medium;
    ctx.fill();
    ctx.strokeStyle = c.diskEdge;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Accessed tracks + sector lines (rotate with disk)
    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    ctx.rotate(this.angle);
    this._drawAccessedTracks(ctx, trackAccessCounts, maxAccessCount);
    this._drawSectorLines(ctx);
    ctx.restore();

    // Head arm and glow
    this._drawHeadArm(ctx, track, isActive, isWriteMode);
    if (isActive) {
      this._drawHeadGlow(ctx, track, isWriteMode);
    }

    // Hub ring + center hole
    this._drawHub(ctx);

    // Index hole
    this._drawIndexHole(ctx);
  }

  _drawAccessedTracks(ctx, trackAccessCounts, maxAccessCount) {
    if (!trackAccessCounts || maxAccessCount === 0) return;
    const logMax = Math.log(maxAccessCount + 1);

    for (let t = 0; t < NUM_TRACKS; t++) {
      const count = trackAccessCounts[t];
      if (count === 0) continue;

      const outerR = TRACK_OUTER - (t * TRACK_RANGE) / NUM_TRACKS;
      const innerR = TRACK_OUTER - ((t + 1) * TRACK_RANGE) / NUM_TRACKS;
      const intensity = Math.log(count + 1) / logMax;
      const r = Math.round(40 + 215 * intensity);
      const g = Math.round(
        60 + 80 * intensity - 40 * intensity * intensity,
      );
      const b = Math.round(100 - 80 * intensity);
      const a = 0.3 + 0.55 * intensity;

      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      ctx.arc(0, 0, outerR - 0.5, 0, Math.PI * 2);
      ctx.arc(0, 0, innerR + 0.5, Math.PI * 2, 0, true);
      ctx.fill();
    }
  }

  _drawSectorLines(ctx) {
    const TWO_PI = Math.PI * 2;
    ctx.strokeStyle = this._colors.sectorLine;
    ctx.lineWidth = 0.5;
    for (let s = 0; s < NUM_SECTORS; s++) {
      const a = (s / NUM_SECTORS) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * TRACK_INNER, Math.sin(a) * TRACK_INNER);
      ctx.lineTo(Math.cos(a) * TRACK_OUTER, Math.sin(a) * TRACK_OUTER);
      ctx.stroke();
    }
  }

  _drawIndexHole(ctx) {
    const outerR = HUB_RING_OUTER;
    const innerR = HUB_RING_INNER;
    ctx.save();
    ctx.translate(CENTER_X, CENTER_Y);
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.moveTo(outerR, -1.5);
    ctx.lineTo(outerR, 1.5);
    ctx.lineTo(innerR, 2.5);
    ctx.lineTo(innerR, -2.5);
    ctx.closePath();
    ctx.fillStyle = "rgba(200,30,30,0.9)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,10,10,0.6)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();
  }

  _drawHeadArm(ctx, track, isActive, isWriteMode) {
    const headR =
      TRACK_OUTER - ((track + 0.5) * TRACK_RANGE) / NUM_TRACKS;
    if (isActive) {
      ctx.fillStyle = isWriteMode
        ? "rgba(220,40,40,0.85)"
        : "rgba(40,200,60,0.85)";
    } else {
      ctx.fillStyle = "rgba(160,155,150,0.7)";
    }
    ctx.fillRect(CENTER_X - 3, CENTER_Y - headR - 2, 6, 4);
  }

  _drawHeadGlow(ctx, track, isWriteMode) {
    const headR =
      TRACK_OUTER - ((track + 0.5) * TRACK_RANGE) / NUM_TRACKS;
    ctx.fillStyle = isWriteMode
      ? "rgba(220,40,40,0.4)"
      : "rgba(40,200,60,0.4)";
    ctx.fillRect(CENTER_X - 4, CENTER_Y - headR - 3, 8, 6);
  }

  _drawHub(ctx) {
    const c = this._colors;
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_OUTER, 0, Math.PI * 2);
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_INNER, Math.PI * 2, 0, true);
    ctx.fillStyle = c.hubRing;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_OUTER, 0, Math.PI * 2);
    ctx.strokeStyle = c.hubEdge;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_RING_INNER, 0, Math.PI * 2);
    ctx.strokeStyle = c.hubEdgeInner;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HUB_HOLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.strokeStyle = c.holeEdge;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}
