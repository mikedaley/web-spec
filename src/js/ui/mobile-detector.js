/*
 * mobile-detector.js - Mobile/touch/orientation detection
 *
 * Uses CSS media queries (pointer: coarse, hover: none, max-width: 768px)
 * and data attributes on <html>, not user-agent sniffing.
 */

export class MobileDetector {
  constructor() {
    this._isMobile = false;
    this._orientation = 'landscape';
    this._softKeyboardOpen = false;
    this._callbacks = [];

    // Media queries
    this._touchQuery = window.matchMedia('(pointer: coarse) and (hover: none)');
    this._widthQuery = window.matchMedia('(max-width: 768px)');
    this._orientationQuery = window.matchMedia('(orientation: portrait)');

    this._onMediaChange = () => this._evaluate();
    this._onViewportResize = () => this._checkSoftKeyboard();
  }

  get isMobile() {
    return this._isMobile;
  }

  get orientation() {
    return this._orientation;
  }

  get softKeyboardOpen() {
    return this._softKeyboardOpen;
  }

  onChange(callback) {
    this._callbacks.push(callback);
  }

  init() {
    this._touchQuery.addEventListener('change', this._onMediaChange);
    this._widthQuery.addEventListener('change', this._onMediaChange);
    this._orientationQuery.addEventListener('change', this._onMediaChange);

    // Monitor visualViewport for software keyboard detection
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this._onViewportResize);
    }

    this._evaluate();
  }

  _evaluate() {
    const wasMobile = this._isMobile;
    const wasOrientation = this._orientation;

    this._isMobile = this._touchQuery.matches && this._widthQuery.matches;
    this._orientation = this._orientationQuery.matches ? 'portrait' : 'landscape';

    this._applyToDocument();

    if (wasMobile !== this._isMobile || wasOrientation !== this._orientation) {
      this._notify();
    }
  }

  _applyToDocument() {
    const root = document.documentElement;

    if (this._isMobile) {
      root.setAttribute('data-mobile', 'true');
      root.setAttribute('data-orientation', this._orientation);
    } else {
      root.removeAttribute('data-mobile');
      root.removeAttribute('data-orientation');
    }
  }

  _checkSoftKeyboard() {
    if (!this._isMobile || !window.visualViewport) return;

    const windowHeight = window.innerHeight;
    const viewportHeight = window.visualViewport.height;
    const diff = windowHeight - viewportHeight;

    const wasOpen = this._softKeyboardOpen;
    this._softKeyboardOpen = diff > 150;

    const root = document.documentElement;
    root.setAttribute('data-soft-keyboard', this._softKeyboardOpen ? 'open' : 'closed');
    root.style.setProperty('--viewport-offset', `${diff}px`);

    if (wasOpen !== this._softKeyboardOpen) {
      this._notify();
    }
  }

  _notify() {
    for (const cb of this._callbacks) {
      cb({
        isMobile: this._isMobile,
        orientation: this._orientation,
        softKeyboardOpen: this._softKeyboardOpen,
      });
    }
  }

  destroy() {
    this._touchQuery.removeEventListener('change', this._onMediaChange);
    this._widthQuery.removeEventListener('change', this._onMediaChange);
    this._orientationQuery.removeEventListener('change', this._onMediaChange);

    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this._onViewportResize);
    }

    const root = document.documentElement;
    root.removeAttribute('data-mobile');
    root.removeAttribute('data-orientation');
    root.removeAttribute('data-soft-keyboard');
    root.style.removeProperty('--viewport-offset');
  }
}
