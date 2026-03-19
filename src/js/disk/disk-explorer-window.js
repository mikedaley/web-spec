/*
 * disk-explorer-window.js - Disk image structure explorer
 *
 * Provides a radial disk map visualization, sector inspection,
 * hex dump viewer and copy-protection detection for DSK/OPD disk images.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { parseDSK } from "./dsk-parser.js";
import "../css/disk-explorer.css";

export class DiskAnalysisWindow extends BaseWindow {
  constructor() {
    super({
      id: "disk-analysis",
      title: "Disk Analysis",
      minWidth: 380,
      minHeight: 300,
      defaultWidth: 480,
      defaultHeight: 560,
      defaultPosition: { x: 340, y: 80 },
    });
  }

  renderContent() {
    return `<div class="dex-info-scroll" id="dex-info-content">
      <div class="dex-info-section"><p>Click the info button in the Disk Explorer to analyse a disk image.</p></div>
    </div>`;
  }
}

// Radial map geometry (proportional to canvas size)
const MAP_OUTER_R = 0.46;
const MAP_INNER_R = 0.14;
const MAP_HUB_R = 0.08;
const SECTOR_GAP = 0.02; // radians gap between sectors

export class DiskExplorerWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "disk-explorer",
      title: "Disk Explorer (EXPERIMENTAL)",
      minWidth: 700,
      minHeight: 380,
      defaultWidth: 860,
      defaultHeight: 500,
      defaultPosition: { x: 120, y: 50 },
    });
    this._proxy = proxy;
    this._diskInfo = null;
    this._rawData = null;
    this._selectedTrack = 0;
    this._selectedSector = 0;
    this._selectedSide = 0;
    this._activeDrive = 0;
    this._hoveredTrack = -1;
    this._hoveredSector = -1;
    this._lastInsertedState = null;
    this._colors = {};
    this._mapCanvas = null;
    this._mapCtx = null;
  }

  getState() {
    const state = super.getState();
    state.activeDrive = this._activeDrive;
    state.selectedSide = this._selectedSide;
    return state;
  }

  restoreState(state) {
    if (state.activeDrive !== undefined) this._activeDrive = state.activeDrive;
    if (state.selectedSide !== undefined)
      this._selectedSide = state.selectedSide;
    super.restoreState(state);
  }

  hide() {
    if (this._tooltip) this._tooltip.classList.remove("visible");
    super.hide();
  }

  destroy() {
    if (this._tooltip) {
      this._tooltip.remove();
      this._tooltip = null;
    }
    super.destroy();
  }

  renderContent() {
    return `
      <div class="dex-content">
        <div class="dex-toolbar">
          <div class="dex-tab-group" id="dex-drive-tabs">
            <button class="dex-tab active" data-drive="0">A:</button>
            <button class="dex-tab" data-drive="1">B:</button>
          </div>
          <div class="dex-tab-group" id="dex-side-tabs">
            <button class="dex-tab active" data-side="0">S0</button>
            <button class="dex-tab" data-side="1">S1</button>
          </div>
          <div class="dex-toolbar-spacer"></div>
          <span class="dex-disk-label" id="dex-disk-label">No disk inserted</span>
          <div class="dex-badges" id="dex-badges"></div>
          <span class="dex-disk-geometry" id="dex-geometry"></span>
          <div class="dex-toolbar-spacer"></div>
          <button class="dex-refresh-btn" id="dex-refresh" title="Refresh">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M8 1.5A6.5 6.5 0 0 0 1.5 8H0l2.5 3L5 8H3a5 5 0 1 1 1.46 3.54l-1.06 1.06A6.5 6.5 0 1 0 8 1.5z"/>
            </svg>
          </button>
          <button class="dex-refresh-btn" id="dex-info-btn" title="Disk Analysis">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM6.5 7h1.75v4.5H10v1H6v-1h1.25V8H6.5V7z"/>
            </svg>
          </button>
        </div>
        <div class="dex-body">
          <div class="dex-left">
            <div class="dex-map-container" id="dex-map-container">
              <canvas class="dex-radial-map" id="dex-radial-canvas"></canvas>
            </div>
          </div>
          <div class="dex-right">
            <div class="dex-sector-strip-container" id="dex-sector-strip"></div>
            <div class="dex-sector-info visible" id="dex-sector-info">
              <table class="dex-sector-info-table">
                <tr>
                  <td class="dex-si-label">C</td><td class="dex-si-val" id="dex-si-c">--</td>
                  <td class="dex-si-label">H</td><td class="dex-si-val" id="dex-si-h">--</td>
                  <td class="dex-si-label">R</td><td class="dex-si-val" id="dex-si-r">--</td>
                </tr>
                <tr>
                  <td class="dex-si-label">N</td><td class="dex-si-val" id="dex-si-n">--</td>
                  <td class="dex-si-label">ST1</td><td class="dex-si-val" id="dex-si-st1">--</td>
                  <td class="dex-si-label">ST2</td><td class="dex-si-val" id="dex-si-st2">--</td>
                </tr>
                <tr>
                  <td class="dex-si-label">Size</td><td class="dex-si-val" id="dex-si-size">--</td>
                  <td class="dex-si-label" colspan="2"></td>
                  <td colspan="2"><div class="dex-sector-flags" id="dex-si-flags"></div></td>
                </tr>
              </table>
            </div>
            <div class="dex-hex-container" id="dex-hex-container">
              <div class="dex-hex-header">
                <span class="dex-hex-header-label">Sector Data</span>
              </div>
              <div class="dex-hex-dump" id="dex-hex-dump"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    // Canvas setup
    this._mapCanvas = this.contentElement.querySelector("#dex-radial-canvas");
    this._mapCtx = this._mapCanvas.getContext("2d");
    // Tooltip lives on document.body to avoid clipping by overflow:hidden containers
    this._tooltip = document.createElement("div");
    this._tooltip.className = "dex-map-tooltip";
    document.body.appendChild(this._tooltip);

    // Drive tabs
    this.contentElement
      .querySelectorAll("#dex-drive-tabs .dex-tab")
      .forEach((tab) => {
        tab.addEventListener("click", () => {
          this._activeDrive = parseInt(tab.dataset.drive, 10);
          this._updateTabState("#dex-drive-tabs", tab);
          this._refresh();
        });
      });

    // Side tabs
    this.contentElement
      .querySelectorAll("#dex-side-tabs .dex-tab")
      .forEach((tab) => {
        tab.addEventListener("click", () => {
          this._selectedSide = parseInt(tab.dataset.side, 10);
          this._updateTabState("#dex-side-tabs", tab);
          this._selectedTrack = 0;
          this._selectedSector = 0;
          this._drawRadialMap();
          this._updateSectorStrip();
          this._updateSectorInfo();
          this._updateHexDump();
        });
      });

    // Refresh button
    this.contentElement
      .querySelector("#dex-refresh")
      .addEventListener("click", () => {
        this._refresh();
      });

    // Info button - opens the analysis window
    this._infoBtn = this.contentElement.querySelector("#dex-info-btn");
    this._infoBtn.addEventListener("click", () => {
      if (this._analysisWindow) {
        this._analysisWindow.toggle();
        if (this._analysisWindow.isVisible) this._buildInfoPanel();
      }
    });

    // Map interaction
    this._mapCanvas.addEventListener("mousemove", (e) =>
      this._handleMapMove(e),
    );
    this._mapCanvas.addEventListener("mouseleave", () =>
      this._handleMapLeave(),
    );
    this._mapCanvas.addEventListener("click", (e) => this._handleMapClick(e));

    // Theme observer
    this._themeObserver = new MutationObserver(() => {
      this._readThemeColors();
      this._drawRadialMap();
    });
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    this._readThemeColors();
    this._sizeCanvas();

    // Resize observer for canvas and hex dump
    this._hexDump = this.contentElement.querySelector("#dex-hex-dump");
    this._resizeObserver = new ResizeObserver(() => {
      this._charWidth = 0; // invalidate cached char width
      this._sizeCanvas();
      this._drawRadialMap();
      this._updateHexDump();
    });
    const mapContainer =
      this.contentElement.querySelector("#dex-map-container");
    this._resizeObserver.observe(mapContainer);
    this._resizeObserver.observe(this._hexDump);
  }

  show() {
    super.show();
    this._sizeCanvas();
    this._refresh();
  }

  update(proxy) {
    if (!this.isVisible || !this.contentElement) return;
    const state = proxy.state;
    if (!state) return;

    // Auto-detect disk insertion/ejection
    const isOpus = this._isOpus(state);
    const drive = this._activeDrive;
    let inserted;
    if (isOpus) {
      inserted = drive === 0 ? state.opusDiskInserted : state.opusDiskBInserted;
    } else {
      inserted = drive === 0 ? state.diskInserted : state.diskBInserted;
    }

    if (inserted !== this._lastInsertedState) {
      this._lastInsertedState = inserted;
      this._refresh();
    }
  }

  _isOpus(state) {
    const mid = state.machineId;
    if (mid === 3 || mid === 4) return false;
    return !!state.opusEnabled;
  }

  _updateTabState(groupSelector, activeTab) {
    this.contentElement
      .querySelectorAll(`${groupSelector} .dex-tab`)
      .forEach((t) => {
        t.classList.toggle("active", t === activeTab);
      });
    if (this.onStateChange) this.onStateChange();
  }

  _sizeCanvas() {
    if (!this._mapCanvas) return;
    const container = this._mapCanvas.parentElement;
    const s = Math.min(container.clientWidth, container.clientHeight);
    if (s === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this._mapCanvas.width = s * dpr;
    this._mapCanvas.height = s * dpr;
    this._mapCanvas.style.width = `${s}px`;
    this._mapCanvas.style.height = `${s}px`;
    this._mapDpr = dpr;
    this._mapSize = s;
  }

  _readThemeColors() {
    const s = getComputedStyle(document.documentElement);
    const v = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
    this._colors = {
      bg: v("--canvas-bg", "#05050a"),
      diskBase: v("--disk-medium", "#1a1308"),
      diskEdge: v("--disk-edge", "rgba(255,255,255,0.06)"),
      hubRing: v("--disk-hub-ring", "rgba(210,208,200,0.85)"),
      hubHole: v("--canvas-bg", "#05050a"),
      normal: v("--accent-blue", "#00FFFF"),
      weak: v("--accent-purple", "#FF00FF"),
      crc: v("--accent-red", "#FF0000"),
      deleted: v("--accent-orange", "#FFFF00"),
      sizeVar: v("--accent-green", "#00FF00"),
      textMuted: v("--text-muted", "#666"),
      ghost: v("--disk-ghost-outline", "rgba(255,255,255,0.06)"),
    };
  }

  async _refresh() {
    if (!this._proxy || !this._proxy.state) return;
    const state = this._proxy.state;
    const isOpus = this._isOpus(state);
    const drive = this._activeDrive;

    let inserted;
    if (isOpus) {
      inserted = drive === 0 ? state.opusDiskInserted : state.opusDiskBInserted;
    } else {
      inserted = drive === 0 ? state.diskInserted : state.diskBInserted;
    }

    if (!inserted) {
      this._diskInfo = null;
      this._rawData = null;
      this._updateInfoBar();
      this._drawRadialMap();
      this._updateSectorStrip();
      this._updateSectorInfo();
      this._updateHexDump();
      return;
    }

    try {
      const data = isOpus
        ? await this._proxy.opusDiskExport(drive)
        : await this._proxy.diskExport(drive);
      if (!data) {
        this._diskInfo = null;
        this._rawData = null;
      } else {
        this._rawData =
          data instanceof Uint8Array ? data : new Uint8Array(data);
        this._diskInfo = parseDSK(this._rawData);
      }
    } catch {
      this._diskInfo = null;
      this._rawData = null;
    }

    this._selectedTrack = 0;
    this._selectedSector = 0;
    this._updateInfoBar();
    this._sizeCanvas();
    this._drawRadialMap();
    this._updateSectorStrip();
    this._updateSectorInfo();
    this._updateHexDump();
  }

  // ─── Info bar ───────────────────────────────────

  _updateInfoBar() {
    const label = this.contentElement.querySelector("#dex-disk-label");
    const badges = this.contentElement.querySelector("#dex-badges");
    const geom = this.contentElement.querySelector("#dex-geometry");

    if (!this._diskInfo) {
      label.textContent = "No disk inserted";
      badges.innerHTML = "";
      geom.textContent = "";
      return;
    }

    const di = this._diskInfo;
    label.textContent = di.format;
    geom.textContent = `${di.trackCount}T ${di.sideCount}S`;

    const ps = di.protectionSummary;
    const scheme = this._detectProtectionScheme();
    let html = "";
    if (scheme) {
      html += `<span class="dex-badge dex-badge-scheme">${scheme.name}</span>`;
    }
    if (ps.weakSectors > 0)
      html += `<span class="dex-badge dex-badge-weak">${ps.weakSectors} Weak</span>`;
    if (ps.crcErrors > 0)
      html += `<span class="dex-badge dex-badge-crc">${ps.crcErrors} CRC</span>`;
    if (ps.deletedData > 0)
      html += `<span class="dex-badge dex-badge-deleted">${ps.deletedData} Del</span>`;
    if (ps.sizeVariants > 0)
      html += `<span class="dex-badge dex-badge-size">${ps.sizeVariants} Size</span>`;
    if (ps.totalProtected === 0)
      html += `<span class="dex-badge dex-badge-clean">Clean</span>`;
    badges.innerHTML = html;
  }

  // ─── Protection detection ───────────────────────

  _detectProtectionScheme() {
    if (!this._diskInfo) return null;
    const ps = this._diskInfo.protectionSummary;
    if (ps.totalProtected === 0) return null;

    // Detection aligned with C++ copy_protection.cpp schemes
    const hasCRCOnTrack0 = this._diskInfo.tracks.some(
      (t) => t.trackNumber === 0 && t.sectors.some((s) => s.flags.crcError),
    );
    const hasWeakOnTrack0 = this._diskInfo.tracks.some(
      (t) => t.trackNumber === 0 && t.sectors.some((s) => s.flags.weak),
    );
    const hasLargeSector = this._diskInfo.tracks.some((t) =>
      t.sectors.some((s) => s.n >= 6),
    );
    const hasCM = ps.deletedData > 5;

    // Weak sectors in EDSK (explicit copies)
    if (ps.weakSectors > 0) {
      return { name: "Speedlock +3 (weak)", type: "weak" };
    }

    // Speedlock +3: CRC on track 0 + CM on data tracks
    if (hasCRCOnTrack0 && hasCM) {
      return { name: "Speedlock +3", type: "weak" };
    }

    // Paul Owens: protection track with non-standard sector sizes
    if (hasLargeSector) {
      return { name: "Paul Owens", type: "size" };
    }

    // CM-only: deleted data marks without CRC errors on track 0
    // Custom loaders using Read Deleted Data directly
    if (hasCM) {
      return { name: "CM Protection", type: "deleted" };
    }

    // Unknown
    return { name: "Protected", type: "mixed" };
  }

  // ─── Info panel ─────────────────────────────────

  setAnalysisWindow(win) {
    this._analysisWindow = win;
  }

  _buildInfoPanel() {
    if (!this._analysisWindow) return;
    const target =
      this._analysisWindow.contentElement?.querySelector("#dex-info-content");
    if (!target) return;

    if (!this._diskInfo) {
      target.innerHTML = `<div class="dex-info-section"><p>No disk inserted. Insert a disk image to view its analysis.</p></div>`;
      return;
    }

    const di = this._diskInfo;
    const ps = di.protectionSummary;
    let html = "";

    // Disk image details
    html += `<div class="dex-info-section">`;
    html += `<div class="dex-info-heading">Disk Image</div>`;
    html += `<table class="dex-info-table">`;
    html += `<tr><td class="dex-info-key">Format</td><td>${di.format}</td></tr>`;
    html += `<tr><td class="dex-info-key">Tracks</td><td>${di.trackCount}</td></tr>`;
    html += `<tr><td class="dex-info-key">Sides</td><td>${di.sideCount}</td></tr>`;
    const totalSectors = di.tracks.reduce((n, t) => n + t.sectorCount, 0);
    html += `<tr><td class="dex-info-key">Sectors</td><td>${totalSectors}</td></tr>`;
    html += `</table></div>`;

    // Protection analysis
    const scheme = this._detectProtectionScheme();
    html += `<div class="dex-info-section">`;
    html += `<div class="dex-info-heading">Protection Analysis</div>`;

    if (ps.totalProtected === 0) {
      html += `<p>This disk image contains no detected copy protection. All sectors have standard formatting, normal data address marks, and consistent CRC checksums.</p>`;
    } else {
      html += `<p>Detected scheme: <strong>${scheme ? scheme.name : "Unknown"}</strong></p>`;
      html += `<p>This disk image contains <strong>${ps.totalProtected}</strong> protected sector${ps.totalProtected !== 1 ? "s" : ""}. `;
      html += `Protected sectors appear as coloured highlights on the radial map; normal sectors are shown in dim cyan.</p>`;
    }
    html += `</div>`;

    // Weak/fuzzy sectors
    if (ps.weakSectors > 0) {
      html += this._infoWeakSectors(ps.weakSectors);
    }

    // CRC errors
    if (ps.crcErrors > 0) {
      html += this._infoCRCErrors(ps.crcErrors);
    }

    // Deleted data marks
    if (ps.deletedData > 0) {
      html += this._infoDeletedData(ps.deletedData);
    }

    // Non-standard sizes
    if (ps.sizeVariants > 0) {
      html += this._infoSizeVariants(ps.sizeVariants);
    }

    // Visualization guide
    html += `<div class="dex-info-section">`;
    html += `<div class="dex-info-heading">Reading the Map</div>`;
    html += `<p>The radial map shows the disk surface viewed from above. Track 0 is the outermost ring, with higher tracks toward the centre. Each ring is divided into sector arcs.</p>`;
    html += `<div class="dex-info-legend">`;
    html += `<div class="dex-info-legend-row"><span class="dex-info-swatch" style="background:var(--accent-blue);opacity:0.35"></span> Normal sector</div>`;
    html += `<div class="dex-info-legend-row"><span class="dex-info-swatch" style="background:var(--accent-purple);opacity:0.7"></span> Weak / fuzzy sector</div>`;
    html += `<div class="dex-info-legend-row"><span class="dex-info-swatch" style="background:var(--accent-red);opacity:0.7"></span> CRC error sector</div>`;
    html += `<div class="dex-info-legend-row"><span class="dex-info-swatch" style="background:var(--accent-orange);opacity:0.6"></span> Deleted data mark</div>`;
    html += `<div class="dex-info-legend-row"><span class="dex-info-swatch" style="background:var(--accent-green);opacity:0.5"></span> Non-standard sector size</div>`;
    html += `</div>`;
    html += `<p>Click any sector on the map or in the sector strip to inspect its ID fields, FDC status registers, and raw data in the hex dump.</p>`;
    html += `</div>`;

    target.innerHTML = html;
  }

  _infoWeakSectors(count) {
    // Locate which tracks contain weak sectors for specifics
    const weakTracks = [];
    if (this._diskInfo) {
      for (const t of this._diskInfo.tracks) {
        for (const s of t.sectors) {
          if (s.flags.weak) {
            weakTracks.push({
              track: t.trackNumber,
              side: t.side,
              r: s.r,
              copies: s.flags.weakCopyCount,
            });
          }
        }
      }
    }

    let html = `<div class="dex-info-section">`;
    html += `<div class="dex-info-heading"><span class="dex-info-swatch" style="background:var(--accent-purple);opacity:0.7"></span> Weak / Fuzzy Sectors (${count})</div>`;
    html += `<p>This disk uses <strong>weak sector protection</strong>, most commonly associated with <strong>Speedlock</strong> (David Aubrey-Jones &amp; David Looker, 1983). `;
    html += `This was the dominant copy protection on ZX Spectrum +3 disk releases, used by titles including After Burner, Robocop, Chase HQ, and Buggy Boy.</p>`;
    html += `<p><strong>How it works:</strong> A sector on the protection track is deliberately written with a corrupted data field. `;
    html += `Part of the sector contains stable, constant data, but a region is written in an "uncertain" zone between two magnetic flux transitions. `;
    html += `The disk controller's phase-locked loop (PLL) cannot reliably decode these bits, so each time the sector is read, `;
    html += `the weak area returns <em>different random data</em>. The FDC also reports a <strong>CRC error</strong> (ST1 bit 5) `;
    html += `because the checksum never matches.</p>`;
    html += `<p><strong>Verification:</strong> The loader reads the sector multiple times (typically 2-3 copies) and checks that: `;
    html += `(a) a data CRC error is returned, and (b) the data <em>differs</em> between reads. A normal copy would return identical data each time, `;
    html += `failing the check. Some Speedlock variants also verify that the first portion of the sector contains specific constant bytes, `;
    html += `and that filler bytes appear beyond the weak region.</p>`;
    html += `<p><strong>In the EDSK format:</strong> Weak sectors are stored as multiple concatenated copies of the sector data. `;
    html += `The actual data size in the sector info is a multiple of the declared size (e.g. 3 x 512 = 1536 bytes for 3 copies). `;
    html += `The emulator cycles through these copies on successive reads to simulate the random variation.</p>`;

    if (weakTracks.length > 0) {
      html += `<div class="dex-info-detail-label">Detected weak sectors:</div>`;
      html += `<table class="dex-info-table">`;
      html += `<tr><td class="dex-info-key">Track</td><td class="dex-info-key">Side</td><td class="dex-info-key">Sector</td><td class="dex-info-key">Copies</td></tr>`;
      for (const w of weakTracks) {
        html += `<tr><td>${w.track}</td><td>${w.side}</td><td>${w.r}</td><td>${w.copies}</td></tr>`;
      }
      html += `</table>`;
    }

    html += `</div>`;
    return html;
  }

  _infoCRCErrors(count) {
    const crcTracks = [];
    if (this._diskInfo) {
      for (const t of this._diskInfo.tracks) {
        for (const s of t.sectors) {
          if (s.flags.crcError && !s.flags.weak) {
            crcTracks.push({
              track: t.trackNumber,
              side: t.side,
              r: s.r,
              st1: s.st1,
              st2: s.st2,
            });
          }
        }
      }
    }

    let html = `<div class="dex-info-section">`;
    html += `<div class="dex-info-heading"><span class="dex-info-swatch" style="background:var(--accent-red);opacity:0.7"></span> CRC Error Sectors (${count})</div>`;
    html += `<p>This disk contains sectors with deliberate <strong>CRC (Cyclic Redundancy Check) errors</strong>, `;
    html += `a technique associated with protection schemes such as <strong>Alkatraz</strong>.</p>`;
    html += `<p><strong>How it works:</strong> Every sector on a floppy disk ends with a 2-byte CRC checksum calculated over the data field. `;
    html += `The FDC verifies this checksum on every read. Protection schemes write sector data that does not match its CRC, `;
    html += `causing the FDC to set error flags in its status registers: <strong>ST1 bit 5</strong> (Data Error) `;
    html += `and <strong>ST2 bit 5</strong> (Data Error in Data Field).</p>`;
    html += `<p><strong>Verification:</strong> The Alkatraz loader reads the protected sector (typically on cylinder 0) `;
    html += `and checks that the FDC reports a data CRC error. A bit-perfect copy made by a standard disk copier would have correct CRCs, `;
    html += `causing the protection check to fail. Some variants read multiple copies and verify that the data content differs between reads, `;
    html += `combining CRC errors with weak-sector behaviour.</p>`;
    html += `<p><strong>In the EDSK format:</strong> CRC errors are preserved via the ST1 and ST2 fields in each sector's info block. `;
    html += `Bit 5 of ST1 (0x20) signals the error. The emulator propagates these flags to the virtual FDC's result phase, `;
    html += `accurately reproducing the protection check.</p>`;

    if (crcTracks.length > 0) {
      const hex = (v) => v.toString(16).toUpperCase().padStart(2, "0");
      html += `<div class="dex-info-detail-label">CRC error sectors (excluding weak):</div>`;
      html += `<table class="dex-info-table">`;
      html += `<tr><td class="dex-info-key">Track</td><td class="dex-info-key">Side</td><td class="dex-info-key">Sector</td><td class="dex-info-key">ST1</td><td class="dex-info-key">ST2</td></tr>`;
      for (const c of crcTracks) {
        html += `<tr><td>${c.track}</td><td>${c.side}</td><td>${c.r}</td><td>${hex(c.st1)}</td><td>${hex(c.st2)}</td></tr>`;
      }
      html += `</table>`;
    }

    html += `</div>`;
    return html;
  }

  _infoDeletedData(count) {
    let html = `<div class="dex-info-section">`;
    html += `<div class="dex-info-heading"><span class="dex-info-swatch" style="background:var(--accent-orange);opacity:0.6"></span> Deleted Data Address Marks (${count})</div>`;
    html += `<p>This disk contains sectors written with a <strong>Deleted Data Address Mark (DDAM)</strong> `;
    html += `instead of the normal Data Address Mark.</p>`;
    html += `<p><strong>How it works:</strong> The MFM encoding scheme defines two types of data address mark: `;
    html += `a normal mark (0xFB) and a deleted mark (0xF8). The FDC distinguishes between them and reports a deleted mark `;
    html += `via <strong>ST2 bit 6</strong> (Control Mark). Normally, deleted sectors are used to flag bad blocks on a disk, `;
    html += `but protection schemes repurpose this mechanism.</p>`;
    html += `<p><strong>Verification:</strong> The protection loader issues a Read Data command (not Read Deleted Data). `;
    html += `If the sector has a deleted mark, the FDC sets the CM flag in ST2 and (depending on the SK bit) either `;
    html += `terminates the transfer or skips the sector. The loader checks for this specific behaviour. `;
    html += `A copy made with standard tools may not preserve the deleted mark, causing the check to fail.</p>`;
    html += `<p><strong>In the EDSK format:</strong> The deleted data mark is stored as bit 6 (0x40) in the ST2 field `;
    html += `of the sector info block. The emulator sets the CM flag when the virtual FDC reads this sector.</p>`;
    html += `</div>`;
    return html;
  }

  _infoSizeVariants(count) {
    const sizeSectors = [];
    if (this._diskInfo) {
      for (const t of this._diskInfo.tracks) {
        for (const s of t.sectors) {
          if (s.flags.sizeVariant) {
            sizeSectors.push({
              track: t.trackNumber,
              side: t.side,
              r: s.r,
              n: s.n,
              size: s.declaredSize,
            });
          }
        }
      }
    }

    let html = `<div class="dex-info-section">`;
    html += `<div class="dex-info-heading"><span class="dex-info-swatch" style="background:var(--accent-green);opacity:0.5"></span> Non-Standard Sector Sizes (${count})</div>`;
    html += `<p>This disk contains sectors with a <strong>size code (N)</strong> that differs from the track's default. `;
    html += `Standard +3DOS uses N=2 (512 bytes); Opus Discovery uses N=1 (256 bytes).</p>`;
    html += `<p><strong>How it works:</strong> The sector size code N in the ID field determines how many bytes the FDC `;
    html += `transfers: 128 &times; 2^N bytes. Protection schemes such as <strong>OperaSoft</strong> use oversized sectors `;
    html += `(N=6 for 8192 bytes, or even N=8 for 32768 bytes) that overlap adjacent sectors on the track. `;
    html += `The loader reads the large sector and verifies data at specific offsets that can only exist if the `;
    html += `physical sector genuinely occupies that much track space.</p>`;
    html += `<p><strong>Verification:</strong> A standard copy that writes uniform 512-byte sectors cannot reproduce `;
    html += `the overlapping data layout. The loader reads the oversized sector and compares data at offsets `;
    html += `beyond the normal sector boundary, failing if the data doesn't match.</p>`;
    html += `<p><strong>In the EDSK format:</strong> Extended DSK stores the actual data size per sector in bytes 6-7 `;
    html += `of the sector info block, allowing non-standard sizes to be preserved exactly.</p>`;

    if (sizeSectors.length > 0) {
      html += `<div class="dex-info-detail-label">Non-standard sectors:</div>`;
      html += `<table class="dex-info-table">`;
      html += `<tr><td class="dex-info-key">Track</td><td class="dex-info-key">Side</td><td class="dex-info-key">Sector</td><td class="dex-info-key">N</td><td class="dex-info-key">Size</td></tr>`;
      for (const s of sizeSectors) {
        html += `<tr><td>${s.track}</td><td>${s.side}</td><td>${s.r}</td><td>${s.n}</td><td>${s.size}</td></tr>`;
      }
      html += `</table>`;
    }

    html += `</div>`;
    return html;
  }

  // ─── Radial map ─────────────────────────────────

  _getTracksForSide(side) {
    if (!this._diskInfo) return [];
    return this._diskInfo.tracks.filter((t) => t.side === side);
  }

  _drawRadialMap() {
    const ctx = this._mapCtx;
    if (!ctx) return;
    const dpr = this._mapDpr || 1;
    const size = this._mapSize || 300;
    const w = size * dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, w);
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const outerR = size * MAP_OUTER_R;
    const innerR = size * MAP_INNER_R;
    const hubR = size * MAP_HUB_R;

    // Background
    ctx.fillStyle = this._colors.bg;
    ctx.fillRect(0, 0, size, size);

    // Disk shadow
    ctx.beginPath();
    ctx.arc(cx, cy, outerR + 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fill();

    // Disk base
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = this._colors.diskBase;
    ctx.fill();

    // Edge ring
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = this._colors.diskEdge;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (!this._diskInfo) {
      // Ghost disk — concentric rings
      for (let i = 0; i < 8; i++) {
        const r = innerR + ((outerR - innerR) * (i + 0.5)) / 8;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = this._colors.ghost;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      this._drawHub(ctx, cx, cy, hubR);

      // "No disk" text
      ctx.fillStyle = this._colors.textMuted;
      ctx.font = `500 ${size * 0.035}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No disk", cx, cy + outerR * 0.6);
      return;
    }

    const tracks = this._getTracksForSide(this._selectedSide);
    const numTracks = this._diskInfo.trackCount;
    const trackRange = outerR - innerR;

    ctx.save();
    for (let ti = 0; ti < numTracks; ti++) {
      const track = tracks[ti];
      const tOuterR = outerR - (ti * trackRange) / numTracks;
      const tInnerR = outerR - ((ti + 1) * trackRange) / numTracks;

      if (!track || track.unformatted || track.sectorCount === 0) {
        // Unformatted ring
        ctx.beginPath();
        ctx.arc(cx, cy, tOuterR - 0.3, 0, Math.PI * 2);
        ctx.arc(cx, cy, tInnerR + 0.3, Math.PI * 2, 0, true);
        ctx.fillStyle = "rgba(20,18,15,0.6)";
        ctx.fill();
        continue;
      }

      const sectors = track.sectors;
      const sectorAngle = (Math.PI * 2) / sectors.length;

      for (let si = 0; si < sectors.length; si++) {
        const sector = sectors[si];
        const startAngle = si * sectorAngle + SECTOR_GAP;
        const endAngle = (si + 1) * sectorAngle - SECTOR_GAP;

        const isSelected =
          ti === this._selectedTrack && si === this._selectedSector;
        const isTrackSelected = ti === this._selectedTrack;
        const isHovered =
          ti === this._hoveredTrack && si === this._hoveredSector;

        // Sector color
        const sectorColor = this._getSectorColor(sector, false);
        const glowColor = this._getSectorColor(sector, true);

        // Draw sector arc
        ctx.beginPath();
        ctx.arc(cx, cy, tOuterR - 0.5, startAngle, endAngle);
        ctx.arc(cx, cy, tInnerR + 0.5, endAngle, startAngle, true);
        ctx.closePath();

        ctx.fillStyle = sectorColor;
        ctx.fill();

        // Brighten sectors that contain data (any non-zero byte)
        if (sector.data && sector.data.some(b => b !== 0)) {
          ctx.fillStyle = "rgba(255,255,255,0.12)";
          ctx.fill();
        }

        // Glow for protected sectors
        if (sector.flags.protected && !sector.flags.sizeVariant) {
          ctx.save();
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 6;
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.restore();
        }

        // Hover highlight
        if (isHovered) {
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fill();
        }

        // Selected sector outline
        if (isSelected) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (isTrackSelected) {
          ctx.strokeStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Hub
    this._drawHub(ctx, cx, cy, hubR);

    // Track number label
    if (this._diskInfo && this._selectedTrack >= 0) {
      ctx.fillStyle = this._colors.textMuted;
      ctx.font = `600 ${size * 0.025}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`T${this._selectedTrack}`, cx, cy);
    }
  }

  _drawHub(ctx, cx, cy, hubR) {
    // Outer hub ring
    ctx.beginPath();
    ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
    ctx.fillStyle = this._colors.hubRing;
    ctx.fill();

    // Hub hole
    ctx.beginPath();
    ctx.arc(cx, cy, hubR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = this._colors.hubHole;
    ctx.fill();
  }

  _getSectorColor(sector, glow) {
    const f = sector.flags;
    // Priority: CRC > weak > deleted > sizeVariant > normal
    if (f.crcError) {
      return glow ? this._colors.crc : this._hexToRGBA(this._colors.crc, 0.55);
    }
    if (f.weak) {
      return glow ? this._colors.weak : this._hexToRGBA(this._colors.weak, 0.5);
    }
    if (f.deletedData) {
      return glow
        ? this._colors.deleted
        : this._hexToRGBA(this._colors.deleted, 0.45);
    }
    if (f.sizeVariant) {
      return glow
        ? this._colors.sizeVar
        : this._hexToRGBA(this._colors.sizeVar, 0.35);
    }
    return glow
      ? this._colors.normal
      : this._hexToRGBA(this._colors.normal, 0.2);
  }

  _hexToRGBA(hex, alpha) {
    // Handle rgb/rgba strings
    if (hex.startsWith("rgb")) return hex;
    hex = hex.replace("#", "");
    if (hex.length === 3)
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ─── Map interaction ────────────────────────────

  _hitTest(mouseX, mouseY) {
    if (!this._diskInfo) return null;
    const rect = this._mapCanvas.getBoundingClientRect();
    const x = mouseX - rect.left;
    const y = mouseY - rect.top;
    const size = rect.width;
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const outerR = size * MAP_OUTER_R;
    const innerR = size * MAP_INNER_R;
    if (dist < innerR || dist > outerR) return null;

    const trackRange = outerR - innerR;
    const numTracks = this._diskInfo.trackCount;
    const trackIdx = Math.floor(((outerR - dist) / trackRange) * numTracks);
    if (trackIdx < 0 || trackIdx >= numTracks) return null;

    const tracks = this._getTracksForSide(this._selectedSide);
    const track = tracks[trackIdx];
    if (!track || track.unformatted || track.sectorCount === 0) return null;

    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;
    const sectorIdx = Math.floor(
      (angle / (Math.PI * 2)) * track.sectors.length,
    );

    return {
      track: trackIdx,
      sector: Math.min(sectorIdx, track.sectors.length - 1),
    };
  }

  _handleMapMove(e) {
    const hit = this._hitTest(e.clientX, e.clientY);
    const oldHT = this._hoveredTrack;
    const oldHS = this._hoveredSector;

    if (hit) {
      this._hoveredTrack = hit.track;
      this._hoveredSector = hit.sector;

      // Tooltip
      const tracks = this._getTracksForSide(this._selectedSide);
      const track = tracks[hit.track];
      const sector = track?.sectors[hit.sector];
      if (sector) {
        const flags = [];
        if (sector.flags.weak) flags.push("WEAK");
        if (sector.flags.crcError) flags.push("CRC");
        if (sector.flags.deletedData) flags.push("DEL");
        if (sector.flags.sizeVariant) flags.push("SIZE");
        const flagStr = flags.length > 0 ? ` [${flags.join(",")}]` : "";
        this._tooltip.textContent = `T:${hit.track} R:${sector.r} ${sector.declaredSize}B${flagStr}`;
        this._tooltip.style.left = `${e.clientX + 12}px`;
        this._tooltip.style.top = `${e.clientY - 24}px`;
        this._tooltip.classList.add("visible");
      }
    } else {
      this._hoveredTrack = -1;
      this._hoveredSector = -1;
      this._tooltip.classList.remove("visible");
    }

    if (oldHT !== this._hoveredTrack || oldHS !== this._hoveredSector) {
      this._drawRadialMap();
    }
  }

  _handleMapLeave() {
    this._hoveredTrack = -1;
    this._hoveredSector = -1;
    this._tooltip.classList.remove("visible");
    this._drawRadialMap();
  }

  _handleMapClick(e) {
    const hit = this._hitTest(e.clientX, e.clientY);
    if (!hit) return;

    this._selectedTrack = hit.track;
    this._selectedSector = hit.sector;
    this._drawRadialMap();
    this._updateSectorStrip();
    this._updateSectorInfo();
    this._updateHexDump();
  }

  // ─── Sector strip ──────────────────────────────

  _updateSectorStrip() {
    const container = this.contentElement.querySelector("#dex-sector-strip");
    if (!this._diskInfo) {
      container.innerHTML = "";
      return;
    }

    const tracks = this._getTracksForSide(this._selectedSide);
    const track = tracks[this._selectedTrack];
    if (!track || track.sectorCount === 0) {
      container.innerHTML = `<span class="dex-sector-strip-label">Track ${this._selectedTrack} — Unformatted</span>`;
      return;
    }

    let html = `<span class="dex-sector-strip-label">T${this._selectedTrack}</span>`;
    track.sectors.forEach((sector, i) => {
      const cls = this._getSectorBoxClass(sector);
      const sel = i === this._selectedSector ? " selected" : "";
      html += `<div class="dex-sector-box ${cls}${sel}" data-idx="${i}">${sector.r}</div>`;
    });
    container.innerHTML = html;

    // Wire click handlers
    container.querySelectorAll(".dex-sector-box").forEach((box) => {
      box.addEventListener("click", () => {
        this._selectedSector = parseInt(box.dataset.idx, 10);
        this._drawRadialMap();
        this._updateSectorStrip();
        this._updateSectorInfo();
        this._updateHexDump();
      });
    });
  }

  _getSectorBoxClass(sector) {
    const f = sector.flags;
    if (f.crcError) return "dex-sector-crc";
    if (f.weak) return "dex-sector-weak";
    if (f.deletedData) return "dex-sector-deleted";
    if (f.sizeVariant) return "dex-sector-sizevar";
    return "dex-sector-normal";
  }

  // ─── Sector info ───────────────────────────────

  _updateSectorInfo() {
    const panel = this.contentElement.querySelector("#dex-sector-info");
    const sector = this._getSelectedSector();

    if (!sector) {
      panel.classList.remove("visible");
      return;
    }

    panel.classList.add("visible");
    const hex = (v) => v.toString(16).toUpperCase().padStart(2, "0");

    this.contentElement.querySelector("#dex-si-c").textContent = hex(sector.c);
    this.contentElement.querySelector("#dex-si-h").textContent = hex(sector.h);
    this.contentElement.querySelector("#dex-si-r").textContent = hex(sector.r);
    this.contentElement.querySelector("#dex-si-n").textContent = hex(sector.n);
    this.contentElement.querySelector("#dex-si-st1").textContent = hex(
      sector.st1,
    );
    this.contentElement.querySelector("#dex-si-st2").textContent = hex(
      sector.st2,
    );
    this.contentElement.querySelector("#dex-si-size").textContent =
      sector.declaredSize !== sector.actualSize
        ? `${sector.declaredSize} / ${sector.actualSize}`
        : `${sector.declaredSize}`;

    // Flags
    const flagsEl = this.contentElement.querySelector("#dex-si-flags");
    let flagsHtml = "";
    if (sector.flags.weak)
      flagsHtml += `<span class="dex-badge dex-badge-weak">${sector.flags.weakCopyCount} copies</span>`;
    if (sector.flags.crcError)
      flagsHtml += `<span class="dex-badge dex-badge-crc">CRC Error</span>`;
    if (sector.flags.deletedData)
      flagsHtml += `<span class="dex-badge dex-badge-deleted">Deleted</span>`;
    if (sector.flags.sizeVariant)
      flagsHtml += `<span class="dex-badge dex-badge-size">Non-std</span>`;
    flagsEl.innerHTML = flagsHtml;
  }

  _getSelectedSector() {
    if (!this._diskInfo) return null;
    const tracks = this._getTracksForSide(this._selectedSide);
    const track = tracks[this._selectedTrack];
    if (!track || !track.sectors[this._selectedSector]) return null;
    return track.sectors[this._selectedSector];
  }

  // ─── Hex dump ──────────────────────────────────

  _measureCharWidth() {
    if (this._charWidth) return this._charWidth;
    const dump =
      this._hexDump || this.contentElement.querySelector("#dex-hex-dump");
    if (!dump) return 6.1;
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;font:inherit;";
    probe.textContent = "0123456789ABCDEF";
    dump.appendChild(probe);
    const cw = probe.offsetWidth / 16;
    dump.removeChild(probe);
    this._charWidth = cw || 6.1;
    return this._charWidth;
  }

  _calcBytesPerRow() {
    const dump =
      this._hexDump || this.contentElement.querySelector("#dex-hex-dump");
    if (!dump) return 16;
    const availW = dump.clientWidth - 16; // account for padding
    const cw = this._measureCharWidth();
    // Row format: "XXXX  " (6) + N*3 hex + floor((N-1)/8) group gaps + " " (1) + N ascii
    // chars = 7 + 4*N + floor((N-1)/8)
    // Solve for largest N where chars*cw <= availW, N must be multiple of 8
    let best = 8;
    for (let n = 8; n <= 64; n += 8) {
      const groups = Math.floor((n - 1) / 8);
      const chars = 7 + 4 * n + groups;
      if (chars * cw <= availW) best = n;
      else break;
    }
    return best;
  }

  _updateHexDump() {
    const container =
      this._hexDump || this.contentElement.querySelector("#dex-hex-dump");
    const sector = this._getSelectedSector();

    if (!sector || !sector.data || sector.data.length === 0) {
      container.innerHTML = `<div class="dex-empty">No sector data</div>`;
      return;
    }

    const data = sector.data;
    const isWeak = sector.flags.weak;
    const isCRC = sector.flags.crcError && !isWeak;
    const copySize = sector.declaredSize;
    const copyCount = isWeak ? sector.flags.weakCopyCount : 0;
    const bytesPerRow = this._calcBytesPerRow();
    const rows = Math.ceil(data.length / bytesPerRow);
    const lines = [];

    // For weak sectors, add a copy header
    if (isWeak && copyCount > 1) {
      let hdr = `<div class="dex-hex-row"><span class="dex-hex-offset">`;
      hdr += `${copyCount} copies, ${copySize} bytes each`;
      hdr += `</span></div>`;
      lines.push(hdr);
    }

    for (let row = 0; row < rows; row++) {
      const offset = row * bytesPerRow;
      let line = `<span class="dex-hex-offset">${offset.toString(16).toUpperCase().padStart(4, "0")}</span>  `;

      // Hex bytes
      let ascii = "";
      for (let col = 0; col < bytesPerRow; col++) {
        const idx = offset + col;
        if (col > 0 && col % 8 === 0) line += " ";

        if (idx < data.length) {
          const byte = data[idx];
          const cls = this._getByteClass(byte, isWeak, isCRC, idx, copySize);
          line += `<span class="${cls}">${byte.toString(16).toUpperCase().padStart(2, "0")}</span> `;

          // ASCII
          const asciiCls = isWeak
            ? ` dex-hex-ascii-copy${Math.floor(idx / copySize) % 5}`
            : "";
          if (byte >= 0x20 && byte <= 0x7e) {
            ascii += `<span class="dex-hex-ascii-print${asciiCls}">${this._escapeHTML(String.fromCharCode(byte))}</span>`;
          } else {
            ascii += `<span class="dex-hex-ascii${asciiCls}">.</span>`;
          }
        } else {
          line += "   ";
          ascii += " ";
        }
      }

      line += ` ${ascii}`;

      // Add copy separator
      if (isWeak && copyCount > 1) {
        const rowEnd = offset + bytesPerRow;
        if (rowEnd > 0 && rowEnd % copySize === 0 && rowEnd < data.length) {
          line += `  <span class="dex-hex-copy-label">Copy ${Math.floor(offset / copySize) + 1}</span>`;
        }
      }

      lines.push(`<div class="dex-hex-row">${line}</div>`);
    }

    container.innerHTML = lines.join("");
  }

  _getByteClass(byte, isWeak, isCRC, idx, copySize) {
    if (isWeak) {
      const copyIdx = Math.floor(idx / copySize) % 5;
      return `dex-hex-byte dex-hex-byte-copy${copyIdx}`;
    }
    if (isCRC) return "dex-hex-byte dex-hex-byte-crc";
    if (byte === 0x00) return "dex-hex-byte dex-hex-byte-zero";
    if (byte === 0xe5) return "dex-hex-byte dex-hex-byte-filler";
    if (byte === 0xff) return "dex-hex-byte dex-hex-byte-ff";
    return "dex-hex-byte";
  }

  _escapeHTML(s) {
    if (s === "<") return "&lt;";
    if (s === ">") return "&gt;";
    if (s === "&") return "&amp;";
    if (s === '"') return "&quot;";
    return s;
  }
}
