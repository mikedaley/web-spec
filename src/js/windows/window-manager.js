/*
 * window-manager.js - Window manager for all windows
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class WindowManager {
  constructor() {
    this.windows = new Map();
    this.highestZIndex = 1000;
    this.storageKey = 'zxspec-debug-windows';
    this._restoring = false;

    // Bind and set up window resize listener to keep windows in viewport
    this.handleWindowResize = this.handleWindowResize.bind(this);
    window.addEventListener('resize', this.handleWindowResize);
  }

  /**
   * Handle browser window resize - constrain all windows to viewport
   */
  handleWindowResize() {
    this.constrainAllToViewport();
  }

  /**
   * Register a window with the manager
   */
  register(window) {
    this.windows.set(window.id, window);

    // Set up callbacks
    window.onFocus = (id) => this.bringToFront(id);
    window.onStateChange = () => this.saveState();
  }

  /**
   * Get a window by ID
   */
  getWindow(id) {
    return this.windows.get(id);
  }

  /**
   * Show a specific window
   */
  showWindow(id) {
    // During state restoration, don't auto-show windows — let saved
    // visibility take precedence (e.g. tape reload triggers onTapLoaded
    // which calls showWindow, but the window may have been closed)
    if (this._restoring) return;
    const window = this.windows.get(id);
    if (window) {
      window.show();
      this.bringToFront(id);
      this.saveState();
    }
  }

  /**
   * Hide a specific window
   */
  hideWindow(id) {
    const window = this.windows.get(id);
    if (window) {
      window.hide();
      window.element.classList.remove('focused');
      this.focusTopWindow();
      this.saveState();
    }
  }

  /**
   * Toggle a window's visibility
   */
  toggleWindow(id) {
    const window = this.windows.get(id);
    if (window) {
      window.toggle();
      if (window.isVisible) {
        this.bringToFront(id);
      } else {
        window.element.classList.remove('focused');
        this.focusTopWindow();
      }
      this.saveState();
    }
  }

  /**
   * Check if a window is visible
   */
  isWindowVisible(id) {
    const window = this.windows.get(id);
    return window ? window.isVisible : false;
  }

  /**
   * Hide all windows
   */
  hideAll() {
    for (const window of this.windows.values()) {
      window.hide();
      window.element.classList.remove('focused');
    }
    this.saveState();
  }

  /**
   * Bring a window to the front.
   * Caps z-index below 2000 so header dropdown menus always render on top.
   */
  bringToFront(id) {
    if (this._restoring) return;
    this.highestZIndex++;
    if (this.highestZIndex >= 1900) {
      this.normalizeZIndices(id);
    } else {
      const window = this.windows.get(id);
      if (window) {
        window.setZIndex(this.highestZIndex);
      }
    }
    this.setFocused(id);
    this.saveState();
  }

  /**
   * Mark a window as focused, removing focus from all others
   */
  setFocused(id) {
    for (const [winId, win] of this.windows) {
      if (winId === id) {
        win.element.classList.add('focused');
      } else {
        win.element.classList.remove('focused');
      }
    }
  }

  /**
   * Focus the topmost visible window by z-index
   */
  focusTopWindow() {
    let topWin = null;
    let topZ = -1;
    for (const win of this.windows.values()) {
      if (win.isVisible && (win.zIndex || 0) > topZ) {
        topZ = win.zIndex || 0;
        topWin = win;
      }
    }
    if (topWin) {
      topWin.element.classList.add('focused');
    }
  }

  /**
   * Reassign z-indices starting from 1000, preserving the current stacking order.
   * The window identified by frontId is placed on top.
   */
  normalizeZIndices(frontId) {
    const ordered = [...this.windows.entries()]
      .filter(([id]) => id !== frontId)
      .sort((a, b) => (a[1].zIndex || 0) - (b[1].zIndex || 0));

    let z = 1000;
    for (const [, win] of ordered) {
      win.setZIndex(z++);
    }
    const front = this.windows.get(frontId);
    if (front) {
      front.setZIndex(z);
    }
    this.highestZIndex = z;
  }

  /**
   * Save all window states to localStorage
   */
  saveState() {
    if (this._restoring) return;
    try {
      const state = {};
      for (const [id, window] of this.windows) {
        state[id] = window.getState();
      }
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save window state:', e);
    }
  }

  /**
   * Load window states from localStorage
   */
  loadState() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const state = JSON.parse(saved);

        // Suppress bringToFront/saveState during restoration so
        // show() doesn't overwrite saved z-indices
        this._restoring = true;
        for (const [id, windowState] of Object.entries(state)) {
          const window = this.windows.get(id);
          if (window) {
            window.restoreState(windowState);
          }
        }
        this._restoring = false;

        // Update highestZIndex to the max z-index across all restored windows
        let maxZ = 1000;
        for (const win of this.windows.values()) {
          if (win.zIndex > maxZ) {
            maxZ = win.zIndex;
          }
        }
        this.highestZIndex = maxZ;

        // Focus the topmost visible window
        this.focusTopWindow();
      }
    } catch (e) {
      this._restoring = false;
      console.warn('Could not load window state:', e);
    }
  }

  /**
   * Clear all saved window state
   */
  clearState() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('Window state cleared');
    } catch (e) {
      console.warn('Could not clear window state:', e);
    }
  }

  /**
   * Update all visible windows
   */
  updateAll(wasmModule) {
    for (const window of this.windows.values()) {
      // Apply pending restored state regardless of visibility
      if (window.applyPendingState) {
        window.applyPendingState();
      }
      if (window.isVisible) {
        window.update(wasmModule);
      }
    }
  }

  /**
   * Get IDs of all visible windows
   */
  getVisibleWindowIds() {
    const ids = [];
    for (const [id, window] of this.windows) {
      if (window.isVisible) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Cycle focus to the next visible window in z-index order.
   */
  cycleWindow(reverse = false) {
    const visible = [...this.windows.values()]
      .filter(w => w.isVisible)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    if (visible.length === 0) return;

    const focusedIndex = visible.length - 1;

    let nextIndex;
    if (reverse) {
      nextIndex = focusedIndex - 1;
      if (nextIndex < 0) nextIndex = visible.length - 1;
    } else {
      nextIndex = 0;
    }

    this.bringToFront(visible[nextIndex].id);
  }

  /**
   * Constrain all windows to the visible viewport
   */
  constrainAllToViewport() {
    for (const window of this.windows.values()) {
      window.constrainToViewport();
    }
  }

  /**
   * Apply default layout for first-time users (no saved state).
   */
  applyDefaultLayout(layout) {
    const savedState = localStorage.getItem(this.storageKey);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (parsed && Object.keys(parsed).length > 0) return;
      } catch (e) { /* proceed with defaults */ }
    }

    for (const entry of layout) {
      const win = this.windows.get(entry.id);
      if (!win) continue;

      if (entry.position === 'viewport-fill') {
        const header = document.querySelector('header');
        const headerH = header ? header.offsetHeight : 0;
        const margin = 8;

        const w = window.innerWidth - margin * 2;
        const h = window.innerHeight - headerH - margin * 2;
        const x = margin;
        const y = headerH + margin;

        win.element.style.left = `${x}px`;
        win.element.style.top = `${y}px`;
        win.element.style.width = `${w}px`;
        win.element.style.height = `${h}px`;
        win.currentX = x;
        win.currentY = y;
        win.currentWidth = w;
        win.currentHeight = h;
      } else {
        if (entry.x !== undefined) {
          win.element.style.left = `${entry.x}px`;
          win.currentX = entry.x;
        }
        if (entry.y !== undefined) {
          win.element.style.top = `${entry.y}px`;
          win.currentY = entry.y;
        }
        if (entry.width !== undefined) {
          win.element.style.width = `${entry.width}px`;
          win.currentWidth = entry.width;
        }
        if (entry.height !== undefined) {
          win.element.style.height = `${entry.height}px`;
          win.currentHeight = entry.height;
        }
      }

      if (entry.viewportLocked && typeof win.setViewportLocked === 'function') {
        win.setViewportLocked(true);
      }

      if (entry.visible) {
        win.show();
        this.bringToFront(entry.id);
      }
    }
  }
}
