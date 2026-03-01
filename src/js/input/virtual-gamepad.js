/*
 * virtual-gamepad.js - D-pad + fire button overlay for mobile games
 *
 * Default mapping: cursor keys (CAPS SHIFT + 5/6/7/8) + SPACE for fire.
 * Semi-transparent overlay, toggle-able with virtual keyboard.
 */

// Direction mappings: each is an array of [row, bit] pairs (compound keys)
const DIRECTIONS = {
  left:  [[0, 0], [3, 4]],  // CAPS SHIFT + 5
  down:  [[0, 0], [4, 4]],  // CAPS SHIFT + 6
  up:    [[0, 0], [4, 3]],  // CAPS SHIFT + 7
  right: [[0, 0], [4, 2]],  // CAPS SHIFT + 8
};

const FIRE_KEYS = [[7, 0]]; // SPACE

export class VirtualGamepad {
  constructor(proxy) {
    this._proxy = proxy;
    this._container = null;
    this._element = null;
    this._dpadEl = null;
    this._fireEl = null;
    this._activeDirections = new Set();
    this._fireActive = false;
    this._dpadTouchId = null;
    this._fireTouchId = null;

    // Reference counting for CAPS SHIFT (shared by all directions)
    this._capsShiftCount = 0;
  }

  create(container) {
    this._container = container;

    this._element = document.createElement('div');
    this._element.className = 'gamepad-overlay';

    // D-pad
    this._dpadEl = document.createElement('div');
    this._dpadEl.className = 'gamepad-dpad';
    this._dpadEl.innerHTML = `
      <svg viewBox="0 0 120 120">
        <rect class="dpad-direction" data-dir="up" x="40" y="5" width="40" height="45" rx="6"/>
        <rect class="dpad-direction" data-dir="down" x="40" y="70" width="40" height="45" rx="6"/>
        <rect class="dpad-direction" data-dir="left" x="5" y="40" width="45" height="40" rx="6"/>
        <rect class="dpad-direction" data-dir="right" x="70" y="40" width="45" height="40" rx="6"/>
        <rect class="dpad-center" x="40" y="40" width="40" height="40" rx="4"/>
      </svg>
    `;
    this._element.appendChild(this._dpadEl);

    // Fire button
    this._fireEl = document.createElement('div');
    this._fireEl.className = 'gamepad-fire';
    this._fireEl.textContent = 'FIRE';
    this._element.appendChild(this._fireEl);

    this._container.appendChild(this._element);

    // Touch handlers
    this._dpadEl.addEventListener('touchstart', (e) => this._onDpadTouch(e), { passive: false });
    this._dpadEl.addEventListener('touchmove', (e) => this._onDpadTouch(e), { passive: false });
    this._dpadEl.addEventListener('touchend', (e) => this._onDpadRelease(e), { passive: false });
    this._dpadEl.addEventListener('touchcancel', (e) => this._onDpadRelease(e), { passive: false });

    this._fireEl.addEventListener('touchstart', (e) => this._onFireTouch(e), { passive: false });
    this._fireEl.addEventListener('touchend', (e) => this._onFireRelease(e), { passive: false });
    this._fireEl.addEventListener('touchcancel', (e) => this._onFireRelease(e), { passive: false });
  }

  _onDpadTouch(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    if (!touch) return;

    this._dpadTouchId = touch.identifier;

    const rect = this._dpadEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;

    // Determine direction from angle
    const dist = Math.sqrt(dx * dx + dy * dy);
    const deadzone = rect.width * 0.12;

    const newDirs = new Set();
    if (dist > deadzone) {
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      // 8-directional: allow diagonals
      if (angle >= -67.5 && angle < 67.5) newDirs.add('right');
      if (angle >= 22.5 && angle < 157.5) newDirs.add('down');
      if (angle >= 112.5 || angle < -112.5) newDirs.add('left');
      if (angle >= -157.5 && angle < -22.5) newDirs.add('up');
    }

    // Release directions no longer active
    for (const dir of this._activeDirections) {
      if (!newDirs.has(dir)) {
        this._releaseDirection(dir);
      }
    }

    // Press new directions
    for (const dir of newDirs) {
      if (!this._activeDirections.has(dir)) {
        this._pressDirection(dir);
      }
    }

    this._activeDirections = newDirs;
    this._updateDpadVisuals();
  }

  _onDpadRelease(e) {
    e.preventDefault();
    for (const dir of this._activeDirections) {
      this._releaseDirection(dir);
    }
    this._activeDirections.clear();
    this._dpadTouchId = null;
    this._updateDpadVisuals();
  }

  _pressDirection(dir) {
    const keys = DIRECTIONS[dir];
    if (!keys) return;

    for (const [row, bit] of keys) {
      if (row === 0 && bit === 0) {
        // CAPS SHIFT — reference counted
        this._capsShiftCount++;
        if (this._capsShiftCount === 1) {
          this._proxy.keyDown(0, 0);
        }
      } else {
        this._proxy.keyDown(row, bit);
      }
    }
  }

  _releaseDirection(dir) {
    const keys = DIRECTIONS[dir];
    if (!keys) return;

    for (const [row, bit] of keys) {
      if (row === 0 && bit === 0) {
        this._capsShiftCount--;
        if (this._capsShiftCount <= 0) {
          this._capsShiftCount = 0;
          this._proxy.keyUp(0, 0);
        }
      } else {
        this._proxy.keyUp(row, bit);
      }
    }
  }

  _updateDpadVisuals() {
    const rects = this._dpadEl.querySelectorAll('.dpad-direction');
    for (const rect of rects) {
      const dir = rect.dataset.dir;
      rect.classList.toggle('active', this._activeDirections.has(dir));
    }
  }

  _onFireTouch(e) {
    e.preventDefault();
    if (this._fireActive) return;
    this._fireActive = true;
    this._fireTouchId = e.changedTouches[0]?.identifier;
    this._fireEl.classList.add('active');

    for (const [row, bit] of FIRE_KEYS) {
      this._proxy.keyDown(row, bit);
    }
  }

  _onFireRelease(e) {
    e.preventDefault();
    if (!this._fireActive) return;
    this._fireActive = false;
    this._fireTouchId = null;
    this._fireEl.classList.remove('active');

    for (const [row, bit] of FIRE_KEYS) {
      this._proxy.keyUp(row, bit);
    }
  }

  show() {
    if (this._element) this._element.style.display = '';
  }

  hide() {
    if (this._element) this._element.style.display = 'none';
    this._releaseAll();
  }

  toggle() {
    if (!this._element) return;
    const hidden = this._element.style.display === 'none';
    if (hidden) {
      this.show();
    } else {
      this.hide();
    }
    return hidden; // returns true if now showing
  }

  _releaseAll() {
    for (const dir of this._activeDirections) {
      this._releaseDirection(dir);
    }
    this._activeDirections.clear();

    if (this._fireActive) {
      this._fireActive = false;
      for (const [row, bit] of FIRE_KEYS) {
        this._proxy.keyUp(row, bit);
      }
    }

    this._updateDpadVisuals();
    if (this._fireEl) this._fireEl.classList.remove('active');
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
