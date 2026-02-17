/*
 * screen-window.js - Main emulator screen window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";

// ZX Spectrum aspect ratio: 320x256 (5:4)
const ASPECT = 320 / 256;

export class ScreenWindow extends BaseWindow {
  constructor(renderer) {
    super({
      id: "screen-window",
      title: "Monitor",
      minWidth: 284,
      minHeight: 274,
      defaultWidth: 480,
      defaultHeight: 440,
      defaultPosition: { x: 100, y: 50 },
      closable: false,
    });

    this.renderer = renderer;
    this._viewportLocked = false;
  }

  renderContent() {
    return '<div class="screen-window-content"></div>';
  }

  /**
   * After create(), inject the viewport lock button into the header and
   * set up a ResizeObserver so the canvas tracks container size.
   */
  onContentRendered() {
    // Viewport lock button
    this._lockBtn = document.createElement("button");
    this._lockBtn.className = "screen-window-lock";
    this._lockBtn.title = "Fit to viewport";
    this._lockBtn.innerHTML = `
      <svg class="lock-icon-unlocked" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M4 7V5a4 4 0 0 1 8 0v1h-2V5a2 2 0 0 0-4 0v2H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H4z"/>
      </svg>
      <svg class="lock-icon-locked" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M4 7V5a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1zm2-2v2h4V5a2 2 0 0 0-4 0z"/>
      </svg>
    `;

    // Insert lock button into header
    this.headerElement.appendChild(this._lockBtn);

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
    if (locked) {
      this.constrainToViewport();
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
      const header = document.querySelector("header");
      const minTop = header ? header.offsetHeight : 0;
      const margin = 8;

      const w = vpW - margin * 2;
      const h = vpH - minTop - margin * 2;
      const x = margin;
      const y = minTop + margin;

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
      newWidth = Math.round(contentHeight * ASPECT);
      newHeight = this.currentHeight;
    } else {
      // Has horizontal component: height follows width
      const targetContentHeight = Math.round(this.currentWidth / ASPECT);
      newHeight = targetContentHeight + headerHeight;
    }

    // Enforce minimums while maintaining ratio
    if (newWidth < this.minWidth) {
      newWidth = this.minWidth;
      newHeight = Math.round(newWidth / ASPECT) + headerHeight;
    }
    if (newHeight < this.minHeight) {
      newHeight = this.minHeight;
      newWidth = Math.round((newHeight - headerHeight) * ASPECT);
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
    if (cw / ASPECT <= ch) {
      w = cw;
      h = cw / ASPECT;
    } else {
      h = ch;
      w = ch * ASPECT;
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
