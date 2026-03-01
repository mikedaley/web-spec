/*
 * mobile-menu.js - Slide-down hamburger menu for mobile
 *
 * Reuses the same handler logic from main.js setupControls() by calling
 * methods on the emulator instance.
 */

export class MobileMenu {
  constructor({ emulator, windowManager, onControlsToggle }) {
    this._emulator = emulator;
    this._windowManager = windowManager;
    this._onControlsToggle = onControlsToggle;
    this._element = null;
    this._backdrop = null;
    this._isOpen = false;
  }

  create(container) {
    // Backdrop
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'mobile-menu-backdrop';
    this._backdrop.addEventListener('click', () => this.close());
    document.body.appendChild(this._backdrop);

    // Menu element
    this._element = document.createElement('div');
    this._element.className = 'mobile-menu';

    this._element.innerHTML = this._buildMenuHTML();
    container.appendChild(this._element);

    this._wireEvents();
  }

  _buildMenuHTML() {
    const em = this._emulator;
    const machineId = parseInt(localStorage.getItem('zxspec-machine-id') || '0', 10);
    const is48k = machineId === 0;
    const ayEnabled = localStorage.getItem('zxspec-ay-enabled') === 'true';
    const autosaveEnabled = em.stateManager ? em.stateManager.isAutoSaveEnabled() : false;

    return `
      <!-- Controls section -->
      <div class="mobile-menu-section">
        <div class="mobile-menu-section-label">Controls</div>
        <div class="mobile-controls-toggle">
          <button id="mobile-ctrl-keyboard" class="active">Keyboard</button>
          <button id="mobile-ctrl-gamepad">Gamepad</button>
        </div>
      </div>

      <!-- Machine section -->
      <div class="mobile-menu-section">
        <div class="mobile-menu-section-label">Machine</div>
        <button class="mobile-menu-item${machineId === 0 ? ' active' : ''}" data-mobile-machine="0">
          <span class="menu-check">&#10003;</span>
          <span class="menu-item-label">ZX Spectrum 48K</span>
        </button>
        <button class="mobile-menu-item${machineId === 1 ? ' active' : ''}" data-mobile-machine="1">
          <span class="menu-check">&#10003;</span>
          <span class="menu-item-label">ZX Spectrum 128K</span>
        </button>
        ${is48k ? `
        <button class="mobile-menu-item option-48k-mobile" id="mobile-ay-toggle">
          <span class="menu-check">&#10003;</span>
          <span class="menu-item-label">AY Sound Chip</span>
        </button>
        ` : ''}
      </div>

      <!-- File section -->
      <div class="mobile-menu-section">
        <div class="mobile-menu-section-label">File</div>
        <button class="mobile-menu-item" id="mobile-load-snapshot">
          <span class="menu-item-label">Load Snapshot...</span>
        </button>
        <button class="mobile-menu-item" id="mobile-save-states">
          <span class="menu-item-label">Save States...</span>
        </button>
        <button class="mobile-menu-item${autosaveEnabled ? ' active' : ''}" id="mobile-autosave-toggle">
          <span class="menu-check">&#10003;</span>
          <span class="menu-item-label">Auto Save</span>
        </button>
      </div>

      <!-- View section -->
      <div class="mobile-menu-section">
        <div class="mobile-menu-section-label">View</div>
        <div class="mobile-menu-toggle-row">
          <label>Theme</label>
          <div class="theme-btn-group">
            <button class="theme-btn" data-theme="light" title="Light">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            </button>
            <button class="theme-btn" data-theme="dark" title="Dark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </button>
            <button class="theme-btn" data-theme="system" title="System">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Windows section -->
      <div class="mobile-menu-section">
        <div class="mobile-menu-section-label">Windows</div>
        <button class="mobile-menu-item" data-mobile-window="display-settings">
          <span class="menu-item-label">Display Settings</span>
        </button>
        <button class="mobile-menu-item" data-mobile-window="tape-window">
          <span class="menu-item-label">Tape Player</span>
        </button>
        <button class="mobile-menu-item" data-mobile-window="sound-debug">
          <span class="menu-item-label">Audio</span>
        </button>
        <button class="mobile-menu-item" data-mobile-window="memory-map">
          <span class="menu-item-label">Memory Map</span>
        </button>
        <button class="mobile-menu-item" data-mobile-window="keyboard">
          <span class="menu-item-label">Keyboard</span>
        </button>
        <button class="mobile-menu-item" data-mobile-window="cpu-debugger">
          <span class="menu-item-label">Z80 Debugger</span>
        </button>
        <button class="mobile-menu-item" data-mobile-window="stack-viewer">
          <span class="menu-item-label">Stack Viewer</span>
        </button>
        <button class="mobile-menu-item" data-mobile-window="basic-program">
          <span class="menu-item-label">BASIC Editor</span>
        </button>
      </div>

      <!-- Help section -->
      <div class="mobile-menu-section">
        <div class="mobile-menu-section-label">Help</div>
        <button class="mobile-menu-item" id="mobile-reset-layout">
          <span class="menu-item-label">Reset Layout</span>
        </button>
      </div>
    `;
  }

  _wireEvents() {
    const em = this._emulator;

    // Controls toggle: keyboard vs gamepad
    const kbdBtn = this._element.querySelector('#mobile-ctrl-keyboard');
    const padBtn = this._element.querySelector('#mobile-ctrl-gamepad');
    if (kbdBtn && padBtn) {
      kbdBtn.addEventListener('click', () => {
        kbdBtn.classList.add('active');
        padBtn.classList.remove('active');
        if (this._onControlsToggle) this._onControlsToggle('keyboard');
        this.close();
      });
      padBtn.addEventListener('click', () => {
        padBtn.classList.add('active');
        kbdBtn.classList.remove('active');
        if (this._onControlsToggle) this._onControlsToggle('gamepad');
        this.close();
      });
    }

    // Machine selection
    this._element.querySelectorAll('[data-mobile-machine]').forEach((item) => {
      item.addEventListener('click', async () => {
        const machineId = parseInt(item.dataset.mobileMachine, 10);
        const currentId = parseInt(localStorage.getItem('zxspec-machine-id') || '0', 10);
        if (machineId === currentId) {
          this.close();
          return;
        }

        localStorage.setItem('zxspec-machine-id', String(machineId));
        await em.proxy.switchMachine(machineId);
        em.screenWindow.setMachine(machineId);
        em.basicProgramWindow.setMachine(machineId);

        if (em.running) {
          em.audioDriver.latestSamples = null;
        } else {
          em.running = true;
          em.renderer.setNoSignal(false);
          em.audioDriver.start();
          em.updatePowerButton();
        }

        // Trigger machine switch callback to update desktop menu too
        if (em.proxy.onMachineSwitched) {
          em.proxy.onMachineSwitched(machineId);
        }

        this.close();
        this._refreshMenu();
      });
    });

    // AY toggle
    const ayToggle = this._element.querySelector('#mobile-ay-toggle');
    if (ayToggle) {
      const ayEnabled = localStorage.getItem('zxspec-ay-enabled') === 'true';
      ayToggle.classList.toggle('active', ayEnabled);
      ayToggle.addEventListener('click', () => {
        const isEnabled = ayToggle.classList.contains('active');
        const newEnabled = !isEnabled;
        em.proxy.setAYEnabled(newEnabled);
        ayToggle.classList.toggle('active', newEnabled);
        localStorage.setItem('zxspec-ay-enabled', String(newEnabled));
        this.close();
      });
    }

    // Load snapshot
    const loadBtn = this._element.querySelector('#mobile-load-snapshot');
    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        this.close();
        em.snapshotLoader.open();
      });
    }

    // Save states
    const saveBtn = this._element.querySelector('#mobile-save-states');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.close();
        this._windowManager.showWindowMobile('save-states');
      });
    }

    // Autosave toggle
    const autosaveBtn = this._element.querySelector('#mobile-autosave-toggle');
    if (autosaveBtn) {
      autosaveBtn.addEventListener('click', () => {
        const newEnabled = !em.stateManager.isAutoSaveEnabled();
        em.stateManager.setAutoSaveEnabled(newEnabled);
        autosaveBtn.classList.toggle('active', newEnabled);
        this.close();
      });
    }

    // Theme selector
    this._element.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        em.themeManager.setPreference(btn.dataset.theme);
        this._updateThemeButtons();
      });
    });
    this._updateThemeButtons();

    // Window items → open as bottom sheets
    this._element.querySelectorAll('[data-mobile-window]').forEach((item) => {
      item.addEventListener('click', () => {
        const windowId = item.dataset.mobileWindow;
        this.close();
        this._windowManager.showWindowMobile(windowId);
      });
    });

    // Reset layout
    const resetBtn = this._element.querySelector('#mobile-reset-layout');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.close();
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('zxspec-')) {
            keysToRemove.push(key);
          }
        }
        for (const key of keysToRemove) {
          localStorage.removeItem(key);
        }
        window.location.reload();
      });
    }
  }

  _updateThemeButtons() {
    if (!this._emulator.themeManager) return;
    const pref = this._emulator.themeManager.getPreference();
    this._element.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === pref);
    });
  }

  _refreshMenu() {
    if (!this._element) return;
    const container = this._element.parentElement;
    this._element.innerHTML = this._buildMenuHTML();
    this._wireEvents();
  }

  open() {
    if (this._isOpen) return;
    this._isOpen = true;
    this._element.classList.add('open');
    this._backdrop.classList.add('visible');
  }

  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._element.classList.remove('open');
    this._backdrop.classList.remove('visible');
  }

  toggle() {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Set the active control mode button state.
   */
  setControlMode(mode) {
    const kbdBtn = this._element?.querySelector('#mobile-ctrl-keyboard');
    const padBtn = this._element?.querySelector('#mobile-ctrl-gamepad');
    if (kbdBtn) kbdBtn.classList.toggle('active', mode === 'keyboard');
    if (padBtn) padBtn.classList.toggle('active', mode === 'gamepad');
  }

  destroy() {
    if (this._backdrop && this._backdrop.parentElement) {
      this._backdrop.parentElement.removeChild(this._backdrop);
    }
    if (this._element && this._element.parentElement) {
      this._element.parentElement.removeChild(this._element);
    }
    this._element = null;
    this._backdrop = null;
  }
}
