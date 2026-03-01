/*
 * virtual-keyboard.js - Faithful 40-key ZX Spectrum virtual keyboard
 *
 * Multi-touch support, sticky shift toggles, colored keyword legends.
 * Calls proxy.keyDown(row, bit) / proxy.keyUp(row, bit) directly.
 */

// ZX Spectrum keyboard layout: 4 rows of 10 keys
// Each key: { label, sub (keyword text), row, bit, color (keyword color class), shift }
const LAYOUT = [
  // Row 1: 1-0
  [
    { label: '1', sub: 'EDIT', row: 3, bit: 0, color: 'kw-green' },
    { label: '2', sub: 'CAPS', row: 3, bit: 1, color: 'kw-green' },
    { label: '3', sub: 'TRUE V', row: 3, bit: 2, color: 'kw-green' },
    { label: '4', sub: 'INV V', row: 3, bit: 3, color: 'kw-green' },
    { label: '5', sub: '\u2190', row: 3, bit: 4, color: 'kw-green' },
    { label: '6', sub: '\u2193', row: 4, bit: 4, color: 'kw-green' },
    { label: '7', sub: '\u2191', row: 4, bit: 3, color: 'kw-green' },
    { label: '8', sub: '\u2192', row: 4, bit: 2, color: 'kw-green' },
    { label: '9', sub: 'GRAPH', row: 4, bit: 1, color: 'kw-green' },
    { label: '0', sub: 'DEL', row: 4, bit: 0, color: 'kw-green' },
  ],
  // Row 2: Q-P
  [
    { label: 'Q', sub: 'PLOT', row: 2, bit: 0, color: 'kw-white' },
    { label: 'W', sub: 'DRAW', row: 2, bit: 1, color: 'kw-white' },
    { label: 'E', sub: 'REM', row: 2, bit: 2, color: 'kw-white' },
    { label: 'R', sub: 'RUN', row: 2, bit: 3, color: 'kw-white' },
    { label: 'T', sub: 'RAND', row: 2, bit: 4, color: 'kw-white' },
    { label: 'Y', sub: 'RET', row: 5, bit: 4, color: 'kw-white' },
    { label: 'U', sub: 'IF', row: 5, bit: 3, color: 'kw-white' },
    { label: 'I', sub: 'INPUT', row: 5, bit: 2, color: 'kw-white' },
    { label: 'O', sub: 'POKE', row: 5, bit: 1, color: 'kw-white' },
    { label: 'P', sub: 'PRINT', row: 5, bit: 0, color: 'kw-white' },
  ],
  // Row 3: A-ENTER
  [
    { label: 'A', sub: 'NEW', row: 1, bit: 0, color: 'kw-white' },
    { label: 'S', sub: 'SAVE', row: 1, bit: 1, color: 'kw-white' },
    { label: 'D', sub: 'DIM', row: 1, bit: 2, color: 'kw-white' },
    { label: 'F', sub: 'FOR', row: 1, bit: 3, color: 'kw-white' },
    { label: 'G', sub: 'GOTO', row: 1, bit: 4, color: 'kw-white' },
    { label: 'H', sub: 'GOSUB', row: 6, bit: 4, color: 'kw-white' },
    { label: 'J', sub: 'LOAD', row: 6, bit: 3, color: 'kw-white' },
    { label: 'K', sub: 'LIST', row: 6, bit: 2, color: 'kw-white' },
    { label: 'L', sub: 'LET', row: 6, bit: 1, color: 'kw-white' },
    { label: 'ENT', sub: '', row: 6, bit: 0, color: '' },
  ],
  // Row 4: CAPS SHIFT - Z-SPACE-SYMB SHIFT
  [
    { label: 'CS', sub: '', row: 0, bit: 0, color: '', shift: 'caps' },
    { label: 'Z', sub: 'COPY', row: 0, bit: 1, color: 'kw-white' },
    { label: 'X', sub: 'CLEAR', row: 0, bit: 2, color: 'kw-white' },
    { label: 'C', sub: 'CONT', row: 0, bit: 3, color: 'kw-white' },
    { label: 'V', sub: 'CLS', row: 0, bit: 4, color: 'kw-white' },
    { label: 'B', sub: 'BORDER', row: 7, bit: 4, color: 'kw-white' },
    { label: 'N', sub: 'NEXT', row: 7, bit: 3, color: 'kw-white' },
    { label: 'M', sub: 'PAUSE', row: 7, bit: 2, color: 'kw-white' },
    { label: 'SP', sub: 'BREAK', row: 7, bit: 0, color: 'kw-red' },
    { label: 'SS', sub: '', row: 7, bit: 1, color: '', shift: 'symbol' },
  ],
];

export class VirtualKeyboard {
  constructor(proxy) {
    this._proxy = proxy;
    this._container = null;
    this._element = null;
    this._activeTouches = new Map(); // touchId -> keyDef
    this._capsLocked = false;
    this._symbolLocked = false;
    this._keyElements = new Map(); // "row,bit" -> DOM element
  }

  create(container) {
    this._container = container;
    this._element = document.createElement('div');
    this._element.className = 'vkbd';

    for (const row of LAYOUT) {
      const rowEl = document.createElement('div');
      rowEl.className = 'vkbd-row';

      for (const key of row) {
        const keyEl = document.createElement('div');
        keyEl.className = 'vkbd-key';
        if (key.shift) keyEl.classList.add('shift-key');

        keyEl.dataset.row = key.row;
        keyEl.dataset.bit = key.bit;
        if (key.shift) keyEl.dataset.shift = key.shift;

        const labelEl = document.createElement('span');
        labelEl.className = 'vkbd-label';
        labelEl.textContent = key.label;
        keyEl.appendChild(labelEl);

        if (key.sub) {
          const subEl = document.createElement('span');
          subEl.className = `vkbd-keyword ${key.color}`;
          subEl.textContent = key.sub;
          keyEl.appendChild(subEl);
        }

        rowEl.appendChild(keyEl);
        this._keyElements.set(`${key.row},${key.bit}`, keyEl);
      }

      this._element.appendChild(rowEl);
    }

    this._container.appendChild(this._element);

    // Touch event handling (delegated on container)
    this._element.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    this._element.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this._element.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
    this._element.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });
  }

  _getKeyDefFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const keyEl = el.closest('.vkbd-key');
    if (!keyEl || !this._element.contains(keyEl)) return null;
    return {
      row: parseInt(keyEl.dataset.row, 10),
      bit: parseInt(keyEl.dataset.bit, 10),
      shift: keyEl.dataset.shift || null,
      element: keyEl,
    };
  }

  _onTouchStart(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const keyDef = this._getKeyDefFromPoint(touch.clientX, touch.clientY);
      if (!keyDef) continue;

      this._activeTouches.set(touch.identifier, keyDef);
      this._pressKey(keyDef);
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const prev = this._activeTouches.get(touch.identifier);
      const keyDef = this._getKeyDefFromPoint(touch.clientX, touch.clientY);

      if (prev && keyDef && (prev.row !== keyDef.row || prev.bit !== keyDef.bit)) {
        // Finger slid from one key to another
        this._releaseKey(prev);
        this._activeTouches.set(touch.identifier, keyDef);
        this._pressKey(keyDef);
      } else if (prev && !keyDef) {
        // Finger slid off keyboard
        this._releaseKey(prev);
        this._activeTouches.delete(touch.identifier);
      }
    }
  }

  _onTouchEnd(e) {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const keyDef = this._activeTouches.get(touch.identifier);
      if (!keyDef) continue;

      this._releaseKey(keyDef);
      this._activeTouches.delete(touch.identifier);
    }
  }

  _pressKey(keyDef) {
    if (keyDef.shift === 'caps') {
      // Sticky toggle — don't send key down here, handle on release
      return;
    }
    if (keyDef.shift === 'symbol') {
      return;
    }

    keyDef.element.classList.add('pressed');
    this._proxy.keyDown(keyDef.row, keyDef.bit);
  }

  _releaseKey(keyDef) {
    if (keyDef.shift === 'caps') {
      this._capsLocked = !this._capsLocked;
      this._updateShiftVisuals();
      if (this._capsLocked) {
        this._proxy.keyDown(0, 0); // CAPS SHIFT down
      } else {
        this._proxy.keyUp(0, 0); // CAPS SHIFT up
      }
      return;
    }
    if (keyDef.shift === 'symbol') {
      this._symbolLocked = !this._symbolLocked;
      this._updateShiftVisuals();
      if (this._symbolLocked) {
        this._proxy.keyDown(7, 1); // SYMBOL SHIFT down
      } else {
        this._proxy.keyUp(7, 1); // SYMBOL SHIFT up
      }
      return;
    }

    keyDef.element.classList.remove('pressed');
    this._proxy.keyUp(keyDef.row, keyDef.bit);
  }

  _updateShiftVisuals() {
    const capsEl = this._keyElements.get('0,0');
    const symbolEl = this._keyElements.get('7,1');
    if (capsEl) capsEl.classList.toggle('shift-active', this._capsLocked);
    if (symbolEl) symbolEl.classList.toggle('shift-active', this._symbolLocked);
  }

  show() {
    if (this._element) this._element.style.display = '';
  }

  hide() {
    if (this._element) this._element.style.display = 'none';
    // Release any held keys
    this._releaseAll();
  }

  _releaseAll() {
    for (const [id, keyDef] of this._activeTouches) {
      if (!keyDef.shift) {
        keyDef.element.classList.remove('pressed');
        this._proxy.keyUp(keyDef.row, keyDef.bit);
      }
    }
    this._activeTouches.clear();

    if (this._capsLocked) {
      this._capsLocked = false;
      this._proxy.keyUp(0, 0);
    }
    if (this._symbolLocked) {
      this._symbolLocked = false;
      this._proxy.keyUp(7, 1);
    }
    this._updateShiftVisuals();
  }

  destroy() {
    this._releaseAll();
    if (this._element && this._element.parentElement) {
      this._element.parentElement.removeChild(this._element);
    }
    this._element = null;
    this._container = null;
  }
}
