/*
 * joystick-window.js - Joystick configuration window
 *
 * Allows selecting a host gamepad controller, choosing a ZX Spectrum
 * joystick emulation type, and shows visual feedback of inputs.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/joystick-window.css";

const JOYSTICK_TYPES = [
  { value: "kempston", label: "Kempston", desc: "Port 0x1F, most common" },
  { value: "sinclair1", label: "Sinclair 1", desc: "Interface 2 left, keys 6-0" },
  { value: "sinclair2", label: "Sinclair 2", desc: "Interface 2 right, keys 1-5" },
  { value: "cursor", label: "Cursor", desc: "Protek/AGF, keys 5-8 + 0" },
  { value: "none", label: "None", desc: "Disable joystick input" },
];

// SVG arrows for D-pad
const ARROW_UP    = '<svg viewBox="0 0 10 10"><path d="M5 2L2 7h6z"/></svg>';
const ARROW_DOWN  = '<svg viewBox="0 0 10 10"><path d="M5 8L2 3h6z"/></svg>';
const ARROW_LEFT  = '<svg viewBox="0 0 10 10"><path d="M2 5L7 2v6z"/></svg>';
const ARROW_RIGHT = '<svg viewBox="0 0 10 10"><path d="M8 5L3 2v6z"/></svg>';

export class JoystickWindow extends BaseWindow {
  constructor(gamepadHandler) {
    super({
      id: "joystick",
      title: "Joystick",
      defaultWidth: 360,
      defaultHeight: 100,
      minWidth: 340,
      minHeight: 100,
      maxWidth: 400,
      defaultPosition: { x: 200, y: 100 },
      resizeDirections: [],
    });
    this._gamepadHandler = gamepadHandler;
    this._rafId = null;
  }

  getState() {
    const state = super.getState();
    state.joystickType = this._gamepadHandler.getJoystickType();
    state.selectedGamepadIndex = this._gamepadHandler.getSelectedGamepadIndex();
    state.deadzone = this._gamepadHandler.getDeadzone();
    return state;
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.joystickType) this._gamepadHandler.setJoystickType(state.joystickType);
    if (state.selectedGamepadIndex !== undefined) this._gamepadHandler.selectGamepad(state.selectedGamepadIndex);
    if (state.deadzone !== undefined) this._gamepadHandler.setDeadzone(state.deadzone);
  }

  renderContent() {
    const types = JOYSTICK_TYPES.map(t => `
      <label class="joystick-radio-item">
        <input type="radio" name="joystick-type" value="${t.value}">
        <span class="joystick-radio-label">${t.label}</span>
        <span class="joystick-radio-desc">${t.desc}</span>
      </label>
    `).join("");

    return `
      <div class="joystick-content">
        <div class="joystick-section">
          <div class="joystick-section-title">Controller</div>
          <select class="joystick-select" id="joystick-gamepad-select">
            <option value="">No controllers detected</option>
          </select>
          <div class="joystick-no-gamepad" id="joystick-no-gamepad">
            Press a button on your gamepad to connect
          </div>
        </div>

        <div class="joystick-section">
          <div class="joystick-section-title">Joystick Type</div>
          <div class="joystick-radio-group" id="joystick-type-group">
            ${types}
          </div>
        </div>

        <div class="joystick-section">
          <div class="joystick-section-title">Input</div>
          <div class="joystick-visual">
            <div class="joystick-dpad" id="joystick-dpad">
              <div></div>
              <div class="joystick-dpad-btn" data-dir="up">${ARROW_UP}</div>
              <div></div>
              <div class="joystick-dpad-btn" data-dir="left">${ARROW_LEFT}</div>
              <div class="joystick-dpad-center"></div>
              <div class="joystick-dpad-btn" data-dir="right">${ARROW_RIGHT}</div>
              <div></div>
              <div class="joystick-dpad-btn" data-dir="down">${ARROW_DOWN}</div>
              <div></div>
            </div>
            <div class="joystick-fire-group">
              <div class="joystick-fire-btn" id="joystick-fire"></div>
              <span class="joystick-fire-label">Fire</span>
            </div>
          </div>
          <div class="joystick-mapped-value" id="joystick-mapped-value"></div>
          <div class="joystick-axes" id="joystick-axes">
            <div class="joystick-axis">
              <span class="joystick-axis-label">X</span>
              <div class="joystick-axis-track">
                <div class="joystick-axis-fill" id="joystick-axis-x"></div>
              </div>
            </div>
            <div class="joystick-axis">
              <span class="joystick-axis-label">Y</span>
              <div class="joystick-axis-track">
                <div class="joystick-axis-fill" id="joystick-axis-y"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="joystick-section">
          <div class="joystick-slider-row">
            <span class="joystick-slider-label">Deadzone</span>
            <input type="range" class="joystick-slider" id="joystick-deadzone"
                   min="0.05" max="0.5" step="0.05" value="${this._gamepadHandler.getDeadzone()}">
            <span class="joystick-slider-value" id="joystick-deadzone-value">${this._gamepadHandler.getDeadzone().toFixed(2)}</span>
          </div>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    this._selectEl = this.contentElement.querySelector("#joystick-gamepad-select");
    this._noGamepadEl = this.contentElement.querySelector("#joystick-no-gamepad");
    this._typeGroup = this.contentElement.querySelector("#joystick-type-group");
    this._dpadEl = this.contentElement.querySelector("#joystick-dpad");
    this._fireEl = this.contentElement.querySelector("#joystick-fire");
    this._mappedValueEl = this.contentElement.querySelector("#joystick-mapped-value");
    this._axisXEl = this.contentElement.querySelector("#joystick-axis-x");
    this._axisYEl = this.contentElement.querySelector("#joystick-axis-y");
    this._deadzoneEl = this.contentElement.querySelector("#joystick-deadzone");
    this._deadzoneValueEl = this.contentElement.querySelector("#joystick-deadzone-value");

    // Set initial radio selection
    const currentType = this._gamepadHandler.getJoystickType();
    const radio = this._typeGroup.querySelector(`input[value="${currentType}"]`);
    if (radio) radio.checked = true;

    // Gamepad select change
    this._selectEl.addEventListener("change", () => {
      const val = this._selectEl.value;
      this._gamepadHandler.selectGamepad(val === "" ? null : parseInt(val, 10));
    });

    // Joystick type change
    this._typeGroup.addEventListener("change", (e) => {
      if (e.target.name === "joystick-type") {
        this._gamepadHandler.setJoystickType(e.target.value);
      }
    });

    // Deadzone change
    this._deadzoneEl.addEventListener("input", () => {
      const val = parseFloat(this._deadzoneEl.value);
      this._gamepadHandler.setDeadzone(val);
      this._deadzoneValueEl.textContent = val.toFixed(2);
    });

    // Listen for gamepad connect/disconnect
    this._gamepadHandler.onGamepadChange = () => this._updateGamepadList();
    this._gamepadHandler.onStateChange = (state) => this._updateVisuals(state);

    // Initial gamepad list
    this._updateGamepadList();

    // Start visual polling loop
    this._startVisualPoll();

    this._autoFit();
  }

  _updateGamepadList() {
    const gamepads = this._gamepadHandler.getConnectedGamepads();
    const selected = this._gamepadHandler.getSelectedGamepadIndex();

    if (gamepads.length === 0) {
      this._selectEl.innerHTML = '<option value="">No controllers detected</option>';
      this._noGamepadEl.style.display = "";
    } else {
      let html = "";
      for (const gp of gamepads) {
        const sel = gp.index === selected ? " selected" : "";
        // Truncate long gamepad names
        const name = gp.id.length > 45 ? gp.id.substring(0, 42) + "..." : gp.id;
        html += `<option value="${gp.index}"${sel}>${name}</option>`;
      }
      this._selectEl.innerHTML = html;
      this._noGamepadEl.style.display = "none";
    }
  }

  _startVisualPoll() {
    if (this._rafId !== null) return;
    const poll = () => {
      this._rafId = requestAnimationFrame(poll);
      if (!this.isVisible) return;
      const state = this._gamepadHandler.getState();
      this._updateVisuals(state);
    };
    poll();
  }

  _stopVisualPoll() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _updateVisuals(state) {
    if (!this._dpadEl || !state) return;

    // D-pad directions
    const dirs = this._dpadEl.querySelectorAll(".joystick-dpad-btn");
    for (const el of dirs) {
      const dir = el.dataset.dir;
      el.classList.toggle("active", !!state[dir]);
    }

    // Fire button
    this._fireEl.classList.toggle("active", !!state.fire);

    // Mapped value
    const type = this._gamepadHandler.getJoystickType();
    this._mappedValueEl.textContent = this._getMappedText(type, state);

    // Axis bars
    this._updateAxisBar(this._axisXEl, state.axisX);
    this._updateAxisBar(this._axisYEl, state.axisY);
  }

  _updateAxisBar(el, value) {
    if (!el) return;
    // value is -1..1, center is 50%
    const pct = ((value + 1) / 2) * 100;
    if (value >= 0) {
      el.style.left = "50%";
      el.style.width = `${pct - 50}%`;
    } else {
      el.style.left = `${pct}%`;
      el.style.width = `${50 - pct}%`;
    }
  }

  _getMappedText(type, state) {
    if (type === "none") return "";

    if (type === "kempston") {
      let val = 0;
      if (state.right) val |= 0x01;
      if (state.left)  val |= 0x02;
      if (state.down)  val |= 0x04;
      if (state.up)    val |= 0x08;
      if (state.fire)  val |= 0x10;
      return val ? `Kempston: 0x${val.toString(16).toUpperCase().padStart(2, "0")}` : "";
    }

    // Keyboard-mapped types
    const keyNames = {
      sinclair1: { up: "9", down: "8", left: "7", right: "6", fire: "0" },
      sinclair2: { up: "4", down: "3", left: "2", right: "1", fire: "5" },
      cursor:    { up: "7", down: "6", left: "5", right: "8", fire: "0" },
    };
    const names = keyNames[type];
    if (!names) return "";

    const active = [];
    if (state.up) active.push(names.up);
    if (state.down) active.push(names.down);
    if (state.left) active.push(names.left);
    if (state.right) active.push(names.right);
    if (state.fire) active.push(names.fire);
    return active.length ? `Keys: ${active.join(", ")}` : "";
  }

  _autoFit() {
    requestAnimationFrame(() => {
      if (!this.element || !this.contentElement) return;
      const headerH = this.headerElement ? this.headerElement.offsetHeight : 0;
      let contentH = 0;
      for (const child of this.contentElement.children) {
        contentH += child.offsetHeight;
      }
      const totalH = headerH + contentH;
      this.element.style.height = `${totalH}px`;
      this.currentHeight = totalH;
    });
  }

  onShow() {
    super.onShow();
    this._updateGamepadList();
    this._startVisualPoll();
  }

  onHide() {
    super.onHide();
    this._stopVisualPoll();
  }

  destroy() {
    this._stopVisualPoll();
    super.destroy();
  }
}
