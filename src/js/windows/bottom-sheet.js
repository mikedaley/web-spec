/*
 * bottom-sheet.js - Full-screen slide-up sheet wrapper for debug windows on mobile
 *
 * Reparents existing window's contentElement into the sheet body (preserving
 * event listeners), and returns it to the original parent on dismiss.
 */

export class BottomSheet {
  constructor() {
    this._overlay = null;
    this._sheet = null;
    this._body = null;
    this._titleEl = null;

    this._activeWindowId = null;
    this._activeWindow = null;
    this._originalParent = null;
    this._originalNextSibling = null;

    this._windowManager = null;
    this._touchStartY = 0;
    this._touchCurrentY = 0;
    this._isDragging = false;

    this._create();
  }

  setWindowManager(wm) {
    this._windowManager = wm;
  }

  _create() {
    // Overlay
    this._overlay = document.createElement('div');
    this._overlay.className = 'bottom-sheet-overlay';
    this._overlay.addEventListener('click', () => this.dismiss());

    // Sheet
    this._sheet = document.createElement('div');
    this._sheet.className = 'bottom-sheet';

    // Handle
    const handle = document.createElement('div');
    handle.className = 'bottom-sheet-handle';
    this._sheet.appendChild(handle);

    // Header
    const header = document.createElement('div');
    header.className = 'bottom-sheet-header';

    this._titleEl = document.createElement('span');
    this._titleEl.className = 'bottom-sheet-title';
    header.appendChild(this._titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'bottom-sheet-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => this.dismiss());
    header.appendChild(closeBtn);

    this._sheet.appendChild(header);

    // Body
    this._body = document.createElement('div');
    this._body.className = 'bottom-sheet-body';
    this._sheet.appendChild(this._body);

    // Swipe-down to dismiss
    this._sheet.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: true });
    this._sheet.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this._sheet.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: true });

    document.body.appendChild(this._overlay);
    document.body.appendChild(this._sheet);
  }

  _onTouchStart(e) {
    if (e.target.closest('.bottom-sheet-body')) return; // don't interfere with scrollable content
    const touch = e.touches[0];
    if (!touch) return;
    this._touchStartY = touch.clientY;
    this._touchCurrentY = touch.clientY;
    this._isDragging = true;
  }

  _onTouchMove(e) {
    if (!this._isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    this._touchCurrentY = touch.clientY;

    const dy = this._touchCurrentY - this._touchStartY;
    if (dy > 0) {
      // Only allow dragging down
      this._sheet.style.transform = `translateY(${dy}px)`;
      e.preventDefault();
    }
  }

  _onTouchEnd() {
    if (!this._isDragging) return;
    this._isDragging = false;

    const dy = this._touchCurrentY - this._touchStartY;
    if (dy > 100) {
      this.dismiss();
    } else {
      // Snap back
      this._sheet.style.transform = '';
    }
  }

  /**
   * Show a window inside the bottom sheet.
   */
  showWindow(windowId) {
    if (this._activeWindowId) {
      this.dismiss();
    }

    if (!this._windowManager) return;
    const win = this._windowManager.getWindow(windowId);
    if (!win || !win.contentElement) return;

    this._activeWindowId = windowId;
    this._activeWindow = win;

    // Store original position of the content element
    this._originalParent = win.contentElement.parentElement;
    this._originalNextSibling = win.contentElement.nextSibling;

    // Set title
    this._titleEl.textContent = win.title || windowId;

    // Reparent content into sheet body
    this._body.appendChild(win.contentElement);

    // Mark window as visible so update() runs
    win.isVisible = true;

    // Show overlay and sheet
    this._overlay.classList.add('visible');
    requestAnimationFrame(() => {
      this._sheet.classList.add('open');
      this._sheet.style.transform = '';
    });
  }

  /**
   * Dismiss the sheet, returning content to its original window.
   */
  dismiss() {
    if (!this._activeWindow) return;

    const win = this._activeWindow;
    const content = win.contentElement;

    // Return content to original parent
    if (this._originalParent) {
      if (this._originalNextSibling) {
        this._originalParent.insertBefore(content, this._originalNextSibling);
      } else {
        this._originalParent.appendChild(content);
      }
    }

    // Restore window hidden state (it's not visible as a floating window on mobile)
    win.isVisible = false;

    this._activeWindowId = null;
    this._activeWindow = null;
    this._originalParent = null;
    this._originalNextSibling = null;

    // Hide
    this._sheet.classList.remove('open');
    this._sheet.style.transform = '';
    this._overlay.classList.remove('visible');
  }

  get isOpen() {
    return this._activeWindowId !== null;
  }

  destroy() {
    this.dismiss();
    if (this._overlay && this._overlay.parentElement) {
      this._overlay.parentElement.removeChild(this._overlay);
    }
    if (this._sheet && this._sheet.parentElement) {
      this._sheet.parentElement.removeChild(this._sheet);
    }
  }
}
