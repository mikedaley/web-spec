/*
 * base-window.js - Base window class for all windows
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

export class BaseWindow {
  constructor(config) {
    this.id = config.id;
    this.title = config.title;
    this.minWidth = config.minWidth || 280;
    this.minHeight = config.minHeight || 200;
    this.maxWidth = config.maxWidth || Infinity;
    this.maxHeight = config.maxHeight || Infinity;
    this.defaultWidth = config.defaultWidth || 400;
    this.defaultHeight = config.defaultHeight || 300;
    this.defaultPosition = config.defaultPosition || { x: 100, y: 100 };
    this.closable = config.closable !== false;

    // Customizable CSS class names (defaults to debug-window style)
    this.cssClasses = {
      window: config.cssClasses?.window || "debug-window",
      header: config.cssClasses?.header || "debug-window-header",
      title: config.cssClasses?.title || "debug-window-title",
      close: config.cssClasses?.close || "debug-window-close",
      content: config.cssClasses?.content || "debug-window-content",
      resizeHandle: config.cssClasses?.resizeHandle || "debug-resize-handle",
    };

    // Resize directions to create handles for
    this.resizeDirections = config.resizeDirections || [
      "n",
      "e",
      "s",
      "w",
      "ne",
      "nw",
      "se",
      "sw",
    ];

    // Optional localStorage key for persisting window state
    this.storageKey = config.storageKey || null;

    this.element = null;
    this.headerElement = null;
    this.contentElement = null;
    this.zIndex = 1000;
    this.isVisible = false;
    this.isDragging = false;
    this.isResizing = false;
    this.dragOffset = { x: 0, y: 0 };
    this.resizeStart = { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 };
    this.resizeDirection = null;

    // Track current position/size (needed because getBoundingClientRect returns zeros for hidden elements)
    this.currentX = config.defaultPosition?.x || 100;
    this.currentY = config.defaultPosition?.y || 100;
    this.currentWidth = config.defaultWidth || 400;
    this.currentHeight = config.defaultHeight || 300;

    // Track distance from right/bottom edges for maintaining position on resize
    this.distanceFromRight = null;
    this.distanceFromBottom = null;
    this.lastViewportWidth = window.innerWidth;
    this.lastViewportHeight = window.innerHeight;

    // Bind event handlers
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  /**
   * Create the window DOM structure
   */
  create() {
    // Create main window element
    this.element = document.createElement("div");
    this.element.id = this.id;
    this.element.className = `${this.cssClasses.window} hidden`;
    this.element.style.width = `${this.defaultWidth}px`;
    this.element.style.height = `${this.defaultHeight}px`;
    this.element.style.left = `${this.defaultPosition.x}px`;
    this.element.style.top = `${this.defaultPosition.y}px`;

    // Header (draggable area)
    this.headerElement = document.createElement("div");
    this.headerElement.className = this.cssClasses.header;
    this.headerElement.innerHTML = `
      <span class="${this.cssClasses.title}">${this.title}</span>
      ${this.closable ? `<button class="${this.cssClasses.close}" title="Close">&times;</button>` : ""}
    `;

    // Content area
    this.contentElement = document.createElement("div");
    this.contentElement.className = this.cssClasses.content;
    this.contentElement.innerHTML = this.renderContent();

    // Resize handles
    this.resizeDirections.forEach((dir) => {
      const handle = document.createElement("div");
      handle.className = `${this.cssClasses.resizeHandle} ${dir}`;
      handle.dataset.direction = dir;
      this.element.appendChild(handle);
    });

    // Assemble
    this.element.appendChild(this.headerElement);
    this.element.appendChild(this.contentElement);
    document.body.appendChild(this.element);

    // Set up event listeners
    this.setupEventListeners();

    // Call hook for subclasses to set up after content is rendered
    if (typeof this.onContentRendered === "function") {
      this.onContentRendered();
    }
  }

  /**
   * Set up drag, resize, and close event listeners
   */
  setupEventListeners() {
    // Close button
    const closeBtn = this.headerElement.querySelector(
      `.${this.cssClasses.close}`,
    );
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.hide());
    }

    // Drag start on header
    this.headerElement.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains(this.cssClasses.close)) return;
      this.startDrag(e);
    });

    // Resize start on handles
    this.element
      .querySelectorAll(`.${this.cssClasses.resizeHandle}`)
      .forEach((handle) => {
        handle.addEventListener("mousedown", (e) => {
          this.startResize(e, handle.dataset.direction);
        });
      });

    // Bring to front on click
    this.element.addEventListener("mousedown", () => {
      if (this.onFocus) this.onFocus(this.id);
    });

    // Global mouse events for drag/resize
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mouseup", this.handleMouseUp);
  }

  /**
   * Handle mouse down for drag/resize detection
   */
  handleMouseDown(e) {
    // Handled by specific listeners
  }

  /**
   * Handle mouse move for dragging and resizing
   */
  handleMouseMove(e) {
    if (this.isDragging) {
      this.drag(e);
    } else if (this.isResizing) {
      this.resize(e);
    }
  }

  /**
   * Handle mouse up to end drag/resize
   */
  handleMouseUp(e) {
    if (this.isDragging || this.isResizing) {
      this.isDragging = false;
      this.isResizing = false;
      this.element.classList.remove("dragging", "resizing");
      if (this.onStateChange) this.onStateChange();
      this.saveSettings();
    }
  }

  /**
   * Start dragging the window
   */
  startDrag(e) {
    this.isDragging = true;
    this.element.classList.add("dragging");
    const rect = this.element.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
  }

  /**
   * Handle drag movement
   */
  drag(e) {
    let x = e.clientX - this.dragOffset.x;
    let y = e.clientY - this.dragOffset.y;

    // Get header height to prevent dragging under it
    const header = document.querySelector("header");
    const minY = header ? header.offsetHeight : 0;

    // Keep window on screen, below header
    const maxX = window.innerWidth - this.element.offsetWidth;
    const maxY = window.innerHeight - this.element.offsetHeight;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(minY, Math.min(y, maxY));

    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.currentX = x;
    this.currentY = y;

    // Update edge distances after drag
    this.updateEdgeDistances();
  }

  /**
   * Update tracked distances from right and bottom edges
   */
  updateEdgeDistances() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = this.currentX + this.currentWidth / 2;
    const centerY = this.currentY + this.currentHeight / 2;

    // Track distance from right edge if window is on the right half
    if (centerX > viewportWidth / 2) {
      this.distanceFromRight =
        viewportWidth - (this.currentX + this.currentWidth);
    } else {
      this.distanceFromRight = null;
    }

    // Track distance from bottom edge if window is on the bottom half
    if (centerY > viewportHeight / 2) {
      this.distanceFromBottom =
        viewportHeight - (this.currentY + this.currentHeight);
    } else {
      this.distanceFromBottom = null;
    }

    this.lastViewportWidth = viewportWidth;
    this.lastViewportHeight = viewportHeight;
  }

  /**
   * Start resizing the window
   */
  startResize(e, direction) {
    if (this.onFocus) this.onFocus(this.id);
    this.isResizing = true;
    this.resizeDirection = direction;
    this.element.classList.add("resizing");
    const rect = this.element.getBoundingClientRect();
    this.resizeStart = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
    };
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * Handle resize movement
   */
  resize(e) {
    const dx = e.clientX - this.resizeStart.x;
    const dy = e.clientY - this.resizeStart.y;
    const dir = this.resizeDirection;

    // Get header height for bounds checking
    const header = document.querySelector("header");
    const minTop = header ? header.offsetHeight : 0;
    const maxBottom = window.innerHeight;

    let newWidth = this.resizeStart.width;
    let newHeight = this.resizeStart.height;
    let newLeft = this.resizeStart.left;
    let newTop = this.resizeStart.top;

    // Calculate new dimensions based on direction
    if (dir.includes("e")) {
      newWidth = Math.min(this.maxWidth, Math.max(this.minWidth, this.resizeStart.width + dx));
    }
    if (dir.includes("w")) {
      const proposedWidth = Math.min(this.maxWidth, this.resizeStart.width - dx);
      if (proposedWidth >= this.minWidth) {
        newWidth = proposedWidth;
        newLeft = this.resizeStart.left + (this.resizeStart.width - proposedWidth);
      }
    }
    if (dir.includes("s")) {
      newHeight = Math.min(this.maxHeight, Math.max(this.minHeight, this.resizeStart.height + dy));
    }
    if (dir.includes("n")) {
      const proposedHeight = Math.min(this.maxHeight, this.resizeStart.height - dy);
      if (proposedHeight >= this.minHeight) {
        newHeight = proposedHeight;
        newTop = this.resizeStart.top + (this.resizeStart.height - proposedHeight);
      }
    }

    // Keep on screen (respect header)
    newLeft = Math.max(0, newLeft);
    newTop = Math.max(minTop, newTop);
    if (newLeft + newWidth > window.innerWidth) {
      newWidth = window.innerWidth - newLeft;
    }
    if (newTop + newHeight > maxBottom) {
      newHeight = maxBottom - newTop;
    }

    // Re-apply minimum constraints after viewport clamping
    if (newWidth < this.minWidth) {
      newWidth = this.minWidth;
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - newWidth));
    }
    if (newHeight < this.minHeight) {
      newHeight = this.minHeight;
      newTop = Math.max(minTop, Math.min(newTop, maxBottom - newHeight));
    }

    this.element.style.width = `${newWidth}px`;
    this.element.style.height = `${newHeight}px`;
    this.element.style.left = `${newLeft}px`;
    this.element.style.top = `${newTop}px`;
    this.currentWidth = newWidth;
    this.currentHeight = newHeight;
    this.currentX = newLeft;
    this.currentY = newTop;
  }

  /**
   * Show the window
   */
  show() {
    this.element.classList.remove("hidden");
    this.isVisible = true;
    // Ensure window is within viewport when shown
    this.constrainToViewport();
    if (this.onFocus) this.onFocus(this.id);
  }

  /**
   * Hide the window
   */
  hide() {
    // Set visibility flag first so getState() returns correct value
    this.isVisible = false;
    // Save state BEFORE adding hidden class
    if (this.onStateChange) this.onStateChange();
    this.saveSettings();
    this.element.classList.add("hidden");
    // Refocus canvas for keyboard input
    const canvas = document.getElementById("screen");
    if (canvas) {
      setTimeout(() => canvas.focus(), 0);
    }
  }

  /**
   * Toggle window visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set window z-index
   */
  setZIndex(z) {
    this.zIndex = z;
    this.element.style.zIndex = z;
  }

  /**
   * Get window state for persistence
   */
  getState() {
    return {
      x: this.currentX,
      y: this.currentY,
      width: this.currentWidth,
      height: this.currentHeight,
      visible: this.isVisible,
      zIndex: this.zIndex,
    };
  }

  /**
   * Restore window state from persistence
   */
  restoreState(state) {
    if (state.x !== undefined) {
      this.element.style.left = `${state.x}px`;
      this.currentX = state.x;
    }
    if (state.y !== undefined) {
      this.element.style.top = `${state.y}px`;
      this.currentY = state.y;
    }
    // Enforce min/max dimensions when restoring
    if (state.width !== undefined) {
      const width = Math.min(this.maxWidth, Math.max(state.width, this.minWidth));
      this.element.style.width = `${width}px`;
      this.currentWidth = width;
    }
    if (state.height !== undefined) {
      const height = Math.min(this.maxHeight, Math.max(state.height, this.minHeight));
      this.element.style.height = `${height}px`;
      this.currentHeight = height;
    }

    // Restore z-index if present
    if (state.zIndex !== undefined) {
      this.setZIndex(state.zIndex);
    }

    // Ensure window is within current viewport bounds
    this.constrainToViewport();

    // Calculate edge distances based on restored position
    this.updateEdgeDistances();

    if (state.visible) {
      this.show();
    } else {
      this.element.classList.add("hidden");
      this.isVisible = false;
    }
  }

  /**
   * Constrain window position to keep it within the visible viewport
   */
  constrainToViewport() {
    if (!this.element) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = this.currentWidth;
    const height = this.currentHeight;

    // Get header height to prevent windows going under it
    const header = document.querySelector("header");
    const minTop = header ? header.offsetHeight : 0;
    const maxBottom = viewportHeight;

    let newLeft = this.currentX;
    let newTop = this.currentY;
    let changed = false;

    // If window was on the right side, maintain distance from right edge
    if (this.distanceFromRight !== null) {
      const targetLeft = viewportWidth - width - this.distanceFromRight;
      if (targetLeft !== newLeft) {
        newLeft = targetLeft;
        changed = true;
      }
    }

    // If window was on the bottom side, maintain distance from bottom edge
    if (this.distanceFromBottom !== null) {
      const targetTop = maxBottom - height - this.distanceFromBottom;
      if (targetTop !== newTop) {
        newTop = targetTop;
        changed = true;
      }
    }

    // Ensure window stays within viewport bounds
    if (width >= viewportWidth) {
      newLeft = 0;
      changed = true;
    } else if (newLeft + width > viewportWidth) {
      newLeft = viewportWidth - width;
      changed = true;
    } else if (newLeft < 0) {
      newLeft = 0;
      changed = true;
    }

    if (height >= maxBottom - minTop) {
      newTop = minTop;
      changed = true;
    } else if (newTop + height > maxBottom) {
      newTop = maxBottom - height;
      changed = true;
    } else if (newTop < minTop) {
      newTop = minTop;
      changed = true;
    }

    if (changed) {
      this.element.style.left = `${newLeft}px`;
      this.element.style.top = `${newTop}px`;
      this.currentX = newLeft;
      this.currentY = newTop;
    }

    // Update viewport tracking
    this.lastViewportWidth = viewportWidth;
    this.lastViewportHeight = viewportHeight;
  }

  /**
   * Override in subclasses to provide window content HTML
   */
  renderContent() {
    return "<p>Override renderContent() in subclass</p>";
  }

  /**
   * Override in subclasses to update window content.
   * Only called when the window is visible.
   */
  update(wasmModule) {
    // Override in subclasses
  }

  /**
   * Helper to format a hex byte
   */
  formatHex(value, digits = 2) {
    return value.toString(16).toUpperCase().padStart(digits, "0");
  }

  /**
   * Helper to format a hex address
   */
  formatAddr(value) {
    return "$" + this.formatHex(value, 4);
  }

  /**
   * Save window state to localStorage (if storageKey is configured)
   */
  saveSettings() {
    if (!this.storageKey) return;
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          x: this.currentX,
          y: this.currentY,
          width: this.currentWidth,
          height: this.currentHeight,
          visible: this.isVisible,
        }),
      );
    } catch (e) {
      console.warn(`Failed to save ${this.storageKey} settings:`, e.message);
    }
  }

  /**
   * Load window state from localStorage (if storageKey is configured)
   */
  loadSettings() {
    if (!this.storageKey) return;
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.x !== undefined) this.currentX = state.x;
        if (state.y !== undefined) this.currentY = state.y;
        if (state.width !== undefined)
          this.currentWidth = Math.min(this.maxWidth, Math.max(state.width, this.minWidth));
        if (state.height !== undefined)
          this.currentHeight = Math.min(this.maxHeight, Math.max(state.height, this.minHeight));

        this.element.style.left = `${this.currentX}px`;
        this.element.style.top = `${this.currentY}px`;
        this.element.style.width = `${this.currentWidth}px`;
        this.element.style.height = `${this.currentHeight}px`;
      }
    } catch (e) {
      console.warn(`Failed to load ${this.storageKey} settings:`, e.message);
    }
  }

  /**
   * Clean up event listeners and remove element from DOM
   */
  destroy() {
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleMouseUp);
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
