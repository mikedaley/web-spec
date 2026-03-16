/*
 * gamepad-handler.js - Gamepad API integration for joystick emulation
 *
 * Polls connected gamepads and translates input into ZX Spectrum
 * joystick actions (Kempston, Sinclair 1/2, Cursor).
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Joystick type key mappings: [row, bit] pairs for keyboard-mapped types
// Sinclair 1 (Interface 2, left socket): keys 6,7,8,9,0
// Sinclair 2 (Interface 2, right socket): keys 1,2,3,4,5
// Cursor (Protek/AGF): keys 5,6,7,8,0
const JOYSTICK_KEY_MAPS = {
  sinclair1: {
    right: [4, 4],  // 6
    left:  [4, 3],  // 7
    down:  [4, 2],  // 8
    up:    [4, 1],  // 9
    fire:  [4, 0],  // 0
  },
  sinclair2: {
    left:  [3, 0],  // 1
    right: [3, 1],  // 2
    down:  [3, 2],  // 3
    up:    [3, 3],  // 4
    fire:  [3, 4],  // 5
  },
  cursor: {
    right: [4, 2],  // 8
    left:  [3, 4],  // 5
    down:  [4, 4],  // 6
    up:    [4, 3],  // 7
    fire:  [4, 0],  // 0
  },
};

// Kempston bit masks
const KEMPSTON_RIGHT = 0x01;
const KEMPSTON_LEFT  = 0x02;
const KEMPSTON_DOWN  = 0x04;
const KEMPSTON_UP    = 0x08;
const KEMPSTON_FIRE  = 0x10;

const STORAGE_KEY = "zxspec-gamepad-config";

export class GamepadHandler {
  constructor(proxy) {
    this._proxy = proxy;
    this._joystickType = "kempston";
    this._selectedGamepadIndex = null;
    this._deadzone = 0.3;
    this._polling = false;
    this._rafId = null;

    // Current state
    this._state = { up: false, down: false, left: false, right: false, fire: false, fire2: false, fire3: false, axisX: 0, axisY: 0 };
    this._prevState = { up: false, down: false, left: false, right: false, fire: false, fire2: false, fire3: false };

    // Callbacks
    this.onStateChange = null;
    this.onGamepadChange = null;

    // Gamepad events
    this._onConnected = (e) => this._gamepadConnected(e);
    this._onDisconnected = (e) => this._gamepadDisconnected(e);
    window.addEventListener("gamepadconnected", this._onConnected);
    window.addEventListener("gamepaddisconnected", this._onDisconnected);

    // Restore saved config
    this._loadConfig();

    // Start polling if gamepads already connected
    if (this.getConnectedGamepads().length > 0) {
      this._startPolling();
    }
  }

  // ── Public API ───────────────────────────────────────────────

  getConnectedGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const result = [];
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        result.push({
          index: gamepads[i].index,
          id: gamepads[i].id,
          mapping: gamepads[i].mapping,
          buttons: gamepads[i].buttons.length,
          axes: gamepads[i].axes.length,
        });
      }
    }
    return result;
  }

  selectGamepad(index) {
    this._selectedGamepadIndex = index;
    this._saveConfig();
  }

  getSelectedGamepadIndex() {
    return this._selectedGamepadIndex;
  }

  setJoystickType(type) {
    // Release any held keys from previous type before switching
    this._releaseAll();
    this._joystickType = type;
    this._saveConfig();
  }

  getJoystickType() {
    return this._joystickType;
  }

  setDeadzone(value) {
    this._deadzone = Math.max(0.05, Math.min(0.5, value));
    this._saveConfig();
  }

  getDeadzone() {
    return this._deadzone;
  }

  getState() {
    return { ...this._state };
  }

  destroy() {
    this._stopPolling();
    this._releaseAll();
    window.removeEventListener("gamepadconnected", this._onConnected);
    window.removeEventListener("gamepaddisconnected", this._onDisconnected);
  }

  // ── Gamepad events ───────────────────────────────────────────

  _gamepadConnected(e) {
    // Auto-select first gamepad if none selected
    if (this._selectedGamepadIndex === null) {
      this._selectedGamepadIndex = e.gamepad.index;
    }
    this._startPolling();
    if (this.onGamepadChange) this.onGamepadChange();
  }

  _gamepadDisconnected(e) {
    if (this._selectedGamepadIndex === e.gamepad.index) {
      this._releaseAll();
      // Try to select another gamepad
      const gamepads = this.getConnectedGamepads();
      this._selectedGamepadIndex = gamepads.length > 0 ? gamepads[0].index : null;
    }
    if (this.getConnectedGamepads().length === 0) {
      this._stopPolling();
    }
    if (this.onGamepadChange) this.onGamepadChange();
  }

  // ── Polling ──────────────────────────────────────────────────

  _startPolling() {
    if (this._polling) return;
    this._polling = true;
    this._poll();
  }

  _stopPolling() {
    this._polling = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _poll() {
    if (!this._polling) return;
    this._rafId = requestAnimationFrame(() => this._poll());

    if (this._joystickType === "none" || this._selectedGamepadIndex === null) return;

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[this._selectedGamepadIndex];
    if (!gp) return;

    // Read axes (left stick)
    const axisX = gp.axes.length > 0 ? gp.axes[0] : 0;
    const axisY = gp.axes.length > 1 ? gp.axes[1] : 0;

    // Directions from axes (with deadzone)
    let left = axisX < -this._deadzone;
    let right = axisX > this._deadzone;
    let up = axisY < -this._deadzone;
    let down = axisY > this._deadzone;

    // D-pad buttons (standard mapping: 12=up, 13=down, 14=left, 15=right)
    if (gp.mapping === "standard" && gp.buttons.length > 15) {
      if (gp.buttons[12].pressed) up = true;
      if (gp.buttons[13].pressed) down = true;
      if (gp.buttons[14].pressed) left = true;
      if (gp.buttons[15].pressed) right = true;
    }

    // Fire buttons (A=0, B=1, X=2, Y=3, shoulders=4,5, triggers=6,7)
    const fire = gp.buttons.length > 0 && (gp.buttons[0].pressed || (gp.buttons.length > 5 && gp.buttons[5].pressed));
    const fire2 = gp.buttons.length > 1 && gp.buttons[1].pressed;
    const fire3 = gp.buttons.length > 2 && gp.buttons[2].pressed;

    // Update state
    this._state.up = up;
    this._state.down = down;
    this._state.left = left;
    this._state.right = right;
    this._state.fire = fire;
    this._state.fire2 = fire2;
    this._state.fire3 = fire3;
    this._state.axisX = axisX;
    this._state.axisY = axisY;

    // Dispatch changes
    const changed = (
      up !== this._prevState.up ||
      down !== this._prevState.down ||
      left !== this._prevState.left ||
      right !== this._prevState.right ||
      fire !== this._prevState.fire ||
      fire2 !== this._prevState.fire2 ||
      fire3 !== this._prevState.fire3
    );

    if (changed) {
      this._dispatch(up, down, left, right, fire);
      this._prevState = { up, down, left, right, fire, fire2, fire3 };
    }

    if (this.onStateChange) this.onStateChange(this._state);
  }

  // ── Dispatch to emulator ─────────────────────────────────────

  _dispatch(up, down, left, right, fire) {
    if (this._joystickType === "kempston") {
      let value = 0;
      if (right) value |= KEMPSTON_RIGHT;
      if (left)  value |= KEMPSTON_LEFT;
      if (down)  value |= KEMPSTON_DOWN;
      if (up)    value |= KEMPSTON_UP;
      if (fire)  value |= KEMPSTON_FIRE;
      this._proxy.setKempstonJoystick(value);
    } else {
      const map = JOYSTICK_KEY_MAPS[this._joystickType];
      if (!map) return;
      this._setKey(map.up, up, this._prevState.up);
      this._setKey(map.down, down, this._prevState.down);
      this._setKey(map.left, left, this._prevState.left);
      this._setKey(map.right, right, this._prevState.right);
      this._setKey(map.fire, fire, this._prevState.fire);
    }
  }

  _setKey([row, bit], pressed, wasPressedBefore) {
    if (pressed && !wasPressedBefore) {
      this._proxy.keyDown(row, bit);
    } else if (!pressed && wasPressedBefore) {
      this._proxy.keyUp(row, bit);
    }
  }

  _releaseAll() {
    const prev = this._prevState;
    if (this._joystickType === "kempston") {
      this._proxy.setKempstonJoystick(0x00);
    } else {
      const map = JOYSTICK_KEY_MAPS[this._joystickType];
      if (map) {
        if (prev.up)    this._proxy.keyUp(...map.up);
        if (prev.down)  this._proxy.keyUp(...map.down);
        if (prev.left)  this._proxy.keyUp(...map.left);
        if (prev.right) this._proxy.keyUp(...map.right);
        if (prev.fire)  this._proxy.keyUp(...map.fire);
      }
    }
    this._prevState = { up: false, down: false, left: false, right: false, fire: false, fire2: false, fire3: false };
    this._state = { up: false, down: false, left: false, right: false, fire: false, fire2: false, fire3: false, axisX: 0, axisY: 0 };
  }

  // ── Persistence ──────────────────────────────────────────────

  _saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        joystickType: this._joystickType,
        selectedGamepadIndex: this._selectedGamepadIndex,
        deadzone: this._deadzone,
      }));
    } catch { /* ignore */ }
  }

  _loadConfig() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data) {
        if (data.joystickType) this._joystickType = data.joystickType;
        if (data.selectedGamepadIndex !== undefined) this._selectedGamepadIndex = data.selectedGamepadIndex;
        if (data.deadzone !== undefined) this._deadzone = data.deadzone;
      }
    } catch { /* ignore */ }
  }
}
