/*
 * screen-window.js - Main emulator screen window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

const MACHINE_NAMES = {
  0: "ZX Spectrum 48K",
  1: "ZX Spectrum 128K",
  2: "ZX Spectrum 128K +2",
  3: "ZX Spectrum 128K +2A",
};

export class ScreenWindow extends BaseWindow {
  constructor(renderer) {
    super({
      id: "screen-window",
      title: "Screen",
      minWidth: 284,
      minHeight: 274,
      defaultWidth: 480,
      defaultHeight: 440,
      defaultPosition: { x: 100, y: 50 },
      closable: false,
    });

    this.renderer = renderer;
    // Aspect ratio derived from C++ display dimensions via the renderer
    // 352x288 = 48px border on all four sides around 256x192 paper
    this._aspect = renderer.width / renderer.height;
    this._viewportLocked = false;
  }

  /**
   * Update the window title to reflect the current machine.
   */
  setMachine(machineId) {
    this.setTitle(MACHINE_NAMES[machineId] || "Screen");
  }

  renderContent() {
    return '<div class="screen-window-content"></div>';
  }

  /**
   * After create(), inject the viewport lock button into the header and
   * set up a ResizeObserver so the canvas tracks container size.
   */
  onContentRendered() {
    // Viewport lock button (expand/compress arrows)
    this._lockBtn = document.createElement("button");
    this._lockBtn.className = "screen-window-lock";
    this._lockBtn.title = "Fit to viewport";
    this._lockBtn.innerHTML = `
      <svg class="lock-icon-expand" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
      </svg>
      <svg class="lock-icon-compress" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
      </svg>
    `;

    // Insert lock button into the window element itself (not the header)
    // so it remains accessible in chromeless mode
    this.element.appendChild(this._lockBtn);

    // Prevent clicks from starting a window drag
    this._lockBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    this._lockBtn.addEventListener("click", () => {
      this.setViewportLocked(!this._viewportLocked);
    });

    // Observe the content container so _fitCanvas runs whenever
    // the window is resized, restored, arranged, etc.
    const container = this.contentElement.querySelector(
      ".screen-window-content",
    );
    if (container) {
      this._resizeObserver = new ResizeObserver(() => this._fitCanvas());
      this._resizeObserver.observe(container);
    }
  }

  /**
   * Set viewport-lock state and immediately resize if locking on.
   */
  setViewportLocked(locked) {
    this._viewportLocked = locked;
    if (this._lockBtn) {
      this._lockBtn.classList.toggle("active", locked);
      this._lockBtn.title = locked ? "Unlock from viewport" : "Fit to viewport";
    }

    // Hide/show window furniture (header, border, radius, resize handles)
    if (this.element) {
      this.element.classList.toggle("chromeless", locked);
    }

    if (locked) {
      this.constrainToViewport();
    } else {
      // Exiting chromeless: the header is now visible again and takes up space.
      // Adjust window height so the content area + header fits the aspect ratio.
      requestAnimationFrame(() => {
        const headerH = this.headerElement ? this.headerElement.offsetHeight : 0;
        const contentW = this.currentWidth;
        const contentH = Math.round(contentW / this._aspect);
        const newHeight = contentH + headerH;

        this.element.style.height = `${newHeight}px`;
        this.currentHeight = newHeight;

        // Re-centre vertically
        const headerEl = document.querySelector("header");
        const minTop = headerEl ? headerEl.offsetHeight : 0;
        const vpH = window.innerHeight;
        const y = Math.round(minTop + (vpH - minTop - newHeight) / 2);
        this.element.style.top = `${y}px`;
        this.currentY = y;

        this._fitCanvas();
      });
    }

    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Move #screen canvas from #monitor-frame into this window's content area.
   */
  attachCanvas() {
    const canvas = document.getElementById("screen");
    if (!canvas) return;

    const container = this.contentElement.querySelector(
      ".screen-window-content",
    );
    if (!container) return;

    // Clear any inline sizing
    canvas.style.width = "";
    canvas.style.height = "";

    container.appendChild(canvas);
    this._fitCanvas();
  }

  /**
   * Move #screen canvas back into #monitor-frame.
   */
  detachCanvas() {
    const canvas = document.getElementById("screen");
    if (!canvas) return;

    const frame = document.getElementById("monitor-frame");
    if (!frame) return;

    frame.appendChild(canvas);

    // Clear inline styles
    canvas.style.width = "";
    canvas.style.height = "";
  }

  /**
   * After showing, fit the canvas to the content area.
   */
  show() {
    super.show();
    requestAnimationFrame(() => this._fitCanvas());
  }

  /**
   * Get window state for persistence (adds viewportLocked).
   */
  getState() {
    const base = super.getState();
    base.viewportLocked = this._viewportLocked;
    return base;
  }

  /**
   * Restore persisted state.
   */
  restoreState(state) {
    if (state.viewportLocked) {
      this.setViewportLocked(true);
    }
    super.restoreState(state);
  }

  /**
   * Constrain to viewport. When viewport-locked, fill the available area.
   */
  constrainToViewport() {
    if (!this.element) return;

    if (this._viewportLocked) {
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const headerEl = document.querySelector("header");
      const minTop = headerEl ? headerEl.offsetHeight : 0;
      const margin = 24;

      // Available space below the header bar
      const availW = vpW - margin * 2;
      const availH = vpH - minTop - margin * 2;

      // Window header height for aspect ratio calculation (0 when chromeless)
      const windowHeaderH = this._viewportLocked ? 0 : (this.headerElement ? this.headerElement.offsetHeight : 0);
      const availContentH = availH - windowHeaderH;

      // Fit the largest content rectangle that maintains aspect ratio
      let contentW, contentH;
      if (availW / this._aspect <= availContentH) {
        contentW = availW;
        contentH = Math.round(availW / this._aspect);
      } else {
        contentH = availContentH;
        contentW = Math.round(availContentH * this._aspect);
      }

      const w = contentW;
      const h = contentH + windowHeaderH;

      // Centre in the available space
      const x = Math.round((vpW - w) / 2);
      const y = Math.round(minTop + (vpH - minTop - h) / 2);

      this.element.style.width = `${w}px`;
      this.element.style.height = `${h}px`;
      this.element.style.left = `${x}px`;
      this.element.style.top = `${y}px`;
      this.currentWidth = w;
      this.currentHeight = h;
      this.currentX = x;
      this.currentY = y;

      this.lastViewportWidth = vpW;
      this.lastViewportHeight = vpH;
    } else {
      super.constrainToViewport();
    }
  }

  /**
   * Override resize to enforce aspect ratio on the content area.
   */
  resize(e) {
    const dir = this.resizeDirection;

    // Let the base class compute unconstrained new dimensions
    super.resize(e);

    // Enforce aspect ratio on the content area (window height = content + header)
    const headerHeight = this.headerElement
      ? this.headerElement.offsetHeight
      : 0;

    // Anchor edges: resizing from n keeps bottom fixed, from w keeps right fixed
    const bottom = this.currentY + this.currentHeight;
    const right = this.currentX + this.currentWidth;

    let newWidth = this.currentWidth;
    let newHeight;

    if (dir === "n" || dir === "s") {
      // Pure vertical drag: width follows height
      const contentHeight = this.currentHeight - headerHeight;
      newWidth = Math.round(contentHeight * this._aspect);
      newHeight = this.currentHeight;
    } else {
      // Has horizontal component: height follows width
      const targetContentHeight = Math.round(this.currentWidth / this._aspect);
      newHeight = targetContentHeight + headerHeight;
    }

    // Enforce minimums while maintaining ratio
    if (newWidth < this.minWidth) {
      newWidth = this.minWidth;
      newHeight = Math.round(newWidth / this._aspect) + headerHeight;
    }
    if (newHeight < this.minHeight) {
      newHeight = this.minHeight;
      newWidth = Math.round((newHeight - headerHeight) * this._aspect);
    }

    // Adjust position so the anchored edge stays fixed
    let newLeft = this.currentX;
    let newTop = this.currentY;

    if (dir.includes("n")) {
      newTop = bottom - newHeight;
    }
    if (dir.includes("w")) {
      newLeft = right - newWidth;
    }

    // Apply the aspect-corrected dimensions and position
    this.element.style.width = `${newWidth}px`;
    this.element.style.height = `${newHeight}px`;
    this.element.style.left = `${newLeft}px`;
    this.element.style.top = `${newTop}px`;
    this.currentWidth = newWidth;
    this.currentHeight = newHeight;
    this.currentX = newLeft;
    this.currentY = newTop;

    this._fitCanvas();
  }

  /**
   * After resize completes, do a final canvas fit.
   */
  handleMouseUp(e) {
    const wasResizing = this.isResizing;
    super.handleMouseUp(e);
    if (wasResizing) {
      this._fitCanvas();
    }
  }

  /**
   * Compute the largest rectangle with the correct aspect ratio that
   * fits within the content container and apply it to the canvas.
   */
  _fitCanvas() {
    const container = this.contentElement?.querySelector(
      ".screen-window-content",
    );
    const canvas = document.getElementById("screen");
    if (!container || !canvas) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    let w, h;
    if (cw / this._aspect <= ch) {
      w = cw;
      h = cw / this._aspect;
    } else {
      h = ch;
      w = ch * this._aspect;
    }
    w = Math.floor(w);
    h = Math.floor(h);

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    if (this.renderer) {
      this.renderer.resize(w, h);
    }
  }

  /**
   * Update aspect ratio when overscan changes.
   * @param {number} overscan - 0.0 (paper only) to 1.0 (full border)
   */
  setOverscan(overscan) {
    // Visible area: 48px border scaled by overscan on each side
    const visW = 256 + 96 * overscan;  // 256 (paper) + 2*48*overscan
    const visH = 192 + 96 * overscan;  // 192 (paper) + 2*48*overscan
    this._aspect = visW / visH;

    // Re-fit the window to the new aspect ratio
    const headerHeight = this.headerElement ? this.headerElement.offsetHeight : 0;
    const contentHeight = this.currentHeight - headerHeight;
    const newWidth = Math.round(contentHeight * this._aspect);
    this.element.style.width = `${newWidth}px`;
    this.currentWidth = newWidth;
    this._fitCanvas();
  }

  /**
   * Clean up ResizeObserver.
   */
  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    super.destroy();
  }
}
