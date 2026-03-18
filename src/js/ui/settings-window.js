/*
 * settings-window.js - Emulator settings window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import "../css/settings-window.css";
import { BaseWindow } from "../windows/base-window.js";
import { keyCodeLabel } from "../input/input-handler.js";

export class SettingsWindow extends BaseWindow {
  constructor(inputHandler) {
    super({
      id: "settings",
      title: "Settings",
      minWidth: 420,
      minHeight: 100,
      defaultWidth: 480,
      defaultHeight: 200,
      defaultPosition: { x: 200, y: 100 },
      resizeDirections: [],
    });

    this._inputHandler = inputHandler;
    this._shiftCapture = null; // null when not capturing, otherwise { type, captured, onKeyDown, onKeyUp }
  }

  renderContent() {
    const ih = this._inputHandler;
    const capsCodes = ih ? ih.getCapsShiftCodes() : [];
    const symCodes = ih ? ih.getSymbolShiftCodes() : [];

    return `
      <div class="settings-content">
        <div class="settings-section">
          <div class="settings-section-title">Keyboard Mapping</div>
          <div class="settings-row">
            <span class="settings-label">Caps Shift</span>
            <div class="settings-chips" id="settings-caps-chips">${this._renderChips(capsCodes, false)}</div>
            <button class="settings-btn" id="settings-caps-set">Set</button>
          </div>
          <div class="settings-row">
            <span class="settings-label">Symbol Shift</span>
            <div class="settings-chips" id="settings-sym-chips">${this._renderChips(symCodes, false)}</div>
            <button class="settings-btn" id="settings-sym-set">Set</button>
          </div>
          <div class="settings-row settings-row-end">
            <button class="settings-btn" id="settings-keys-reset">Reset to Defaults</button>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">Layout</div>
          <div class="settings-row">
            <span class="settings-label settings-label-wide">Reset all window positions and preferences</span>
            <button class="settings-btn settings-btn-danger" id="settings-reset-layout">Reset</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderChips(codes, editable) {
    if (codes.length === 0) {
      return editable
        ? `<span class="settings-chip-hint">Press a key\u2026</span>`
        : `<span class="settings-chip-hint">None</span>`;
    }
    return codes.map(code => {
      const label = keyCodeLabel(code);
      if (editable) {
        return `<span class="settings-chip settings-chip-editable" data-code="${code}">${label}<button class="settings-chip-x" data-code="${code}">\u00d7</button></span>`;
      }
      return `<span class="settings-chip">${label}</span>`;
    }).join("");
  }

  create() {
    super.create();
    this._setupEventListeners();
    this._fitToContent();
  }

  restoreState(state) {
    super.restoreState(state);
    this._fitToContent();
  }

  _fitToContent() {
    if (!this.element || !this.contentElement) return;
    this.element.style.height = "auto";
    const h = this.element.offsetHeight;
    this.element.style.height = h + "px";
    this.currentHeight = h;
  }

  _setupEventListeners() {
    const capsSetBtn = this.contentElement.querySelector("#settings-caps-set");
    const symSetBtn = this.contentElement.querySelector("#settings-sym-set");
    const resetBtn = this.contentElement.querySelector("#settings-keys-reset");

    if (capsSetBtn) {
      capsSetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._handleSetClick("caps", capsSetBtn);
      });
    }
    if (symSetBtn) {
      symSetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._handleSetClick("symbol", symSetBtn);
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!this._inputHandler) return;
        this._cancelCapture(); // cancel any active capture first
        this._inputHandler.resetToDefaults();
        this._refreshChips("caps");
        this._refreshChips("symbol");
      });
    }

    const resetLayoutBtn = this.contentElement.querySelector("#settings-reset-layout");
    if (resetLayoutBtn) {
      resetLayoutBtn.addEventListener("click", () => {
        if (this.onResetLayout) this.onResetLayout();
      });
    }
  }

  _handleSetClick(type, btn) {
    if (this._shiftCapture && this._shiftCapture.type === type) {
      // Already capturing this type — save
      this._saveCapture();
    } else {
      // Start new capture (cancel any existing one first)
      this._cancelCapture();
      this._startCapture(type, btn);
    }
  }

  _getChipsEl(type) {
    const id = type === "caps" ? "settings-caps-chips" : "settings-sym-chips";
    return this.contentElement.querySelector(`#${id}`);
  }

  _getBtn(type) {
    const id = type === "caps" ? "settings-caps-set" : "settings-sym-set";
    return this.contentElement.querySelector(`#${id}`);
  }

  _refreshChips(type) {
    const chipsEl = this._getChipsEl(type);
    if (!chipsEl || !this._inputHandler) return;
    const codes = type === "caps"
      ? this._inputHandler.getCapsShiftCodes()
      : this._inputHandler.getSymbolShiftCodes();
    chipsEl.innerHTML = this._renderChips(codes, false);
    this._fitToContent();
  }

  _startCapture(type, btn) {
    if (!this._inputHandler) return;

    const chipsEl = this._getChipsEl(type);
    const captured = [];

    this._inputHandler.setEnabled(false);

    btn.textContent = "Save";
    btn.classList.add("settings-btn-save");

    // Show empty editable chips
    chipsEl.innerHTML = this._renderChips(captured, true);
    chipsEl.classList.add("editing");

    // Wire chip X buttons via delegation
    const onChipClick = (e) => {
      const xBtn = e.target.closest(".settings-chip-x");
      if (!xBtn) return;
      const code = xBtn.dataset.code;
      const idx = captured.indexOf(code);
      if (idx !== -1) {
        captured.splice(idx, 1);
        chipsEl.innerHTML = this._renderChips(captured, true);
        this._fitToContent();
      }
    };
    chipsEl.addEventListener("click", onChipClick);

    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        cancel();
        return;
      }
      if (e.repeat) return;
      if (!captured.includes(e.code)) {
        captured.push(e.code);
        chipsEl.innerHTML = this._renderChips(captured, true);
        this._fitToContent();
      }
    };

    // Don't finish on key up — user clicks Save when done
    const onKeyUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const cancel = () => {
      cleanup();
      this._refreshChips(type);
    };

    const cleanup = () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      chipsEl.removeEventListener("click", onChipClick);
      chipsEl.classList.remove("editing");
      btn.textContent = "Set";
      btn.classList.remove("settings-btn-save");
      this._inputHandler.setEnabled(true);
      this._shiftCapture = null;
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);

    this._shiftCapture = { type, captured, cleanup, cancel };
    this._fitToContent();
  }

  _saveCapture() {
    if (!this._shiftCapture || !this._inputHandler) return;

    const { type, captured, cleanup } = this._shiftCapture;
    cleanup();

    if (captured.length > 0) {
      if (type === "caps") {
        this._inputHandler.setCapsShiftCodes(captured);
      } else {
        this._inputHandler.setSymbolShiftCodes(captured);
      }
    }
    this._refreshChips(type);
  }

  _cancelCapture() {
    if (!this._shiftCapture) return;
    this._shiftCapture.cancel();
  }
}
