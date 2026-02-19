/*
 * main.js - Main entry point and ZXSpectrumEmulator class
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import "../js/css/base.css";

import { WebGLRenderer } from "./display/webgl-renderer.js";
import { ScreenWindow } from "./display/screen-window.js";
import { DisplaySettingsWindow } from "./display/display-settings-window.js";
import { WindowManager } from "./windows/window-manager.js";
import { AudioDriver } from "./audio/audio-driver.js";
import { InputHandler } from "./input/input-handler.js";
import { SnapshotLoader } from "./snapshot/snapshot-loader.js";
import { CPUDebuggerWindow } from "./debug/cpu-debugger-window.js";
import { StackViewerWindow } from "./debug/stack-viewer-window.js";
import { TapeWindow } from "./tape/tape-window.js";
import { SoundWindow } from "./audio/sound-window.js";
import { EmulatorProxy } from "./emulator-proxy.js";
import { ThemeManager } from "./ui/theme-manager.js";

class ZXSpectrumEmulator {
  constructor() {
    this.proxy = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.windowManager = null;
    this.screenWindow = null;
    this.displaySettingsWindow = null;
    this.cpuDebuggerWindow = null;
    this.tapeWindow = null;
    this.soundWindow = null;

    this.snapshotLoader = null;
    this.themeManager = null;

    this.running = false;
    this.animFrameId = null;
  }

  async init() {
    this.showLoading(true);

    try {
      // Create proxy and initialize WASM in worker
      this.proxy = new EmulatorProxy();
      await this.proxy.init(0); // 0 = ZX Spectrum 48K

      // Set up renderer (async - loads external shaders)
      const canvas = document.getElementById("screen");
      this.renderer = new WebGLRenderer(canvas);
      await this.renderer.init();

      // Set up window manager
      this.windowManager = new WindowManager();

      // Create screen window
      this.screenWindow = new ScreenWindow(this.renderer);
      this.screenWindow.create();
      this.windowManager.register(this.screenWindow);

      // Create display settings window
      this.displaySettingsWindow = new DisplaySettingsWindow(this.renderer);
      this.displaySettingsWindow.create();
      this.windowManager.register(this.displaySettingsWindow);

      // Create CPU debugger window
      this.cpuDebuggerWindow = new CPUDebuggerWindow();
      this.cpuDebuggerWindow.create();
      this.windowManager.register(this.cpuDebuggerWindow);

      // Create stack viewer window
      this.stackViewerWindow = new StackViewerWindow();
      this.stackViewerWindow.create();
      this.windowManager.register(this.stackViewerWindow);

      // Create tape player window
      this.tapeWindow = new TapeWindow(this.proxy);
      this.tapeWindow.create();
      this.windowManager.register(this.tapeWindow);

      // Set up audio driver (before window registration so sound window can be created)
      this.audioDriver = new AudioDriver(this.proxy);

      // Create sound debug window (needs audioDriver)
      this.soundWindow = new SoundWindow(this.audioDriver);
      this.soundWindow.create();
      this.windowManager.register(this.soundWindow);

      // Attach canvas to screen window
      this.screenWindow.attachCanvas();

      // Apply default layout (viewport-fill for first-time users)
      this.windowManager.applyDefaultLayout([
        { id: "screen-window", position: "viewport-fill", visible: true, viewportLocked: false },
        { id: "display-settings", visible: false },
        { id: "cpu-debugger", visible: false },
        { id: "stack-viewer", visible: false },
        { id: "tape-window", visible: false },
        { id: "sound-debug", visible: false },
      ]);

      // Load saved window state (overrides defaults if present)
      this.windowManager.loadState();

      // Apply saved display settings to renderer
      this.displaySettingsWindow.applyAllSettings();

      // Connect audio-driven frame sync to rendering
      this.audioDriver.onFrameReady = (framebuffer) => {
        this.renderFrame(framebuffer);
      };

      // Set up input handler
      this.inputHandler = new InputHandler(this.proxy);
      this.inputHandler.init();

      // Set up theme manager
      this.themeManager = new ThemeManager();

      // Set up UI controls
      this.setupControls();

      // Start render loop
      this.startRenderLoop();

      // Save window state on page unload
      window.addEventListener("beforeunload", () => {
        this.windowManager.saveState();
      });

      this.showLoading(false);

      console.log("ZX Spectrum Emulator initialized");
    } catch (error) {
      console.error("Failed to initialize emulator:", error);
      this.showLoading(false);
    }
  }

  setupControls() {
    // Power button
    const powerBtn = document.getElementById("btn-power");
    if (powerBtn) {
      powerBtn.addEventListener("click", () => {
        if (this.running) {
          this.stop();
        } else {
          this.start();
        }
        this.updatePowerButton();
        this.refocusCanvas();
      });
    }

    // Reset button
    const resetBtn = document.getElementById("btn-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (this.running) {
          this.proxy.reset();
          this.audioDriver.latestSamples = null;
          console.log("Emulator reset");
        }
        this.refocusCanvas();
      });
    }

    // SNA snapshot loader
    this.snapshotLoader = new SnapshotLoader(this.proxy);
    this.snapshotLoader.init();
    this.snapshotLoader.onLoaded = () => {
      if (!this.running) {
        this.running = true;
        this.renderer.setNoSignal(false);
        this.audioDriver.start();
        this.updatePowerButton();
      }
    };

    // TAP loaded callback - show tape window with block list
    this.proxy.onTapLoaded = (blocks, metadata) => {
      this.tapeWindow.setBlocks(blocks);
      this.tapeWindow.setMetadata(metadata);
      this.windowManager.showWindow("tape-window");
    };

    // TAP load error callback
    this.proxy.onTapLoadError = (error) => {
      this.tapeWindow.showError(error);
      this.windowManager.showWindow("tape-window");
    };

    // File menu > Load Snapshot
    const loadSnapshotBtn = document.getElementById("btn-load-snapshot");
    if (loadSnapshotBtn) {
      loadSnapshotBtn.addEventListener("click", () => {
        this.closeAllMenus();
        this.snapshotLoader.open();
      });
    }

    // View menu > Display (opens display settings window)
    const displayBtn = document.getElementById("btn-display");
    if (displayBtn) {
      displayBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("display-settings");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // Dev menu > Z80 Debugger (opens CPU debugger window)
    const z80DebugBtn = document.getElementById("btn-z80-debug");
    if (z80DebugBtn) {
      z80DebugBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("cpu-debugger");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // View menu > Tape Player
    const tapePlayerBtn = document.getElementById("btn-tape-player");
    if (tapePlayerBtn) {
      tapePlayerBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("tape-window");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // View menu > Sound
    const soundDebugBtn = document.getElementById("btn-sound-debug");
    if (soundDebugBtn) {
      soundDebugBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("sound-debug");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // Dev menu > Stack Viewer
    const stackViewerBtn = document.getElementById("btn-stack-viewer");
    if (stackViewerBtn) {
      stackViewerBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("stack-viewer");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // Menus
    this.setupMenus();

    // Sound controls
    this.setupSoundControls();

    // Fullscreen button
    this.setupFullscreen();

    // Theme selector
    this.setupThemeSelector();
  }

  /**
   * Update power button appearance based on running state
   */
  updatePowerButton() {
    const powerBtn = document.getElementById("btn-power");
    if (!powerBtn) return;
    if (this.running) {
      powerBtn.classList.remove("off");
      powerBtn.title = "Power Off";
    } else {
      powerBtn.classList.add("off");
      powerBtn.title = "Power On";
    }
  }

  /**
   * Refocus canvas after UI interactions
   */
  refocusCanvas() {
    const canvas = document.getElementById("screen");
    if (canvas) setTimeout(() => canvas.focus(), 0);
  }

  /**
   * Close all open header menus
   */
  closeAllMenus() {
    document.querySelectorAll(".header-menu-container.open").forEach((c) => {
      c.classList.remove("open");
      const menu = c.querySelector(".header-menu");
      if (menu) {
        // Reset inline styles after the close transition finishes
        menu.addEventListener("transitionend", () => {
          if (!c.classList.contains("open")) {
            menu.style.left = "";
            menu.style.right = "";
            menu.style.maxHeight = "";
            menu.style.overflowY = "";
          }
        }, { once: true });
      }
    });
  }

  /**
   * Set up generic menu open/close behavior for all header-menu-container elements
   */
  setupMenus() {
    const containers = document.querySelectorAll(".header-menu-container");

    containers.forEach((container) => {
      const trigger = container.querySelector(".header-menu-trigger");
      if (!trigger) return;

      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasOpen = container.classList.contains("open");
        this.closeAllMenus();
        if (!wasOpen) {
          container.classList.add("open");
          this.clampMenuToViewport(container);
        }
      });

      // Hover-switching: hovering over a different trigger while one menu is open switches menus
      trigger.addEventListener("mouseenter", () => {
        const anyOpen = document.querySelector(".header-menu-container.open");
        if (anyOpen && anyOpen !== container) {
          this.closeAllMenus();
          container.classList.add("open");
          this.clampMenuToViewport(container);
        }
      });
    });

    // Close menus on outside click
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".header-menu-container")) {
        this.closeAllMenus();
      }
    });

    // Close menus on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAllMenus();
      }
    });

    // Close menus on window resize
    window.addEventListener("resize", () => {
      this.closeAllMenus();
    });
  }

  /**
   * Clamp a dropdown menu so it stays within the visible viewport
   */
  clampMenuToViewport(container) {
    const menu = container.querySelector(".header-menu");
    if (!menu) return;

    // Reset any previous inline positioning
    menu.style.left = "";
    menu.style.right = "";

    // Wait one frame for the menu to render with its natural position
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;

      // Clamp horizontal: if right edge overflows, shift left
      if (rect.right > vw - margin) {
        menu.style.left = "auto";
        menu.style.right = "0";
      }

      // If left edge overflows (e.g. after right-aligning), clamp to left
      const updated = menu.getBoundingClientRect();
      if (updated.left < margin) {
        menu.style.left = `${margin - updated.left}px`;
        menu.style.right = "auto";
      }

      // Clamp vertical: if bottom edge overflows, cap max-height
      if (rect.bottom > vh - margin) {
        menu.style.maxHeight = `${vh - rect.top - margin}px`;
        menu.style.overflowY = "auto";
      }
    });
  }

  /**
   * Clamp an absolutely-positioned popup so it stays within the viewport
   */
  clampPopupToViewport(popup) {
    popup.style.left = "";
    popup.style.right = "";

    requestAnimationFrame(() => {
      const rect = popup.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;

      if (rect.right > vw - margin) {
        const shift = rect.right - (vw - margin);
        popup.style.right = `${shift}px`;
      }
      if (rect.left < margin) {
        popup.style.left = `${margin}px`;
        popup.style.right = "auto";
      }
      if (rect.bottom > vh - margin) {
        popup.style.maxHeight = `${vh - rect.top - margin}px`;
        popup.style.overflowY = "auto";
      }
    });
  }

  /**
   * Set up sound button + popup (volume slider, mute toggle)
   */
  setupSoundControls() {
    const soundBtn = document.getElementById("btn-sound");
    const soundPopup = document.getElementById("sound-popup");
    const volumeSlider = document.getElementById("volume-slider");
    const volumeValue = document.getElementById("volume-value");
    const muteToggle = document.getElementById("mute-toggle");
    if (!soundBtn || !soundPopup) return;

    // Toggle popup
    soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeAllMenus();
      soundPopup.classList.toggle("hidden");
      if (!soundPopup.classList.contains("hidden")) {
        this.clampPopupToViewport(soundPopup);
      }
    });

    // Close popup on outside click
    document.addEventListener("click", (e) => {
      if (!soundPopup.contains(e.target) && e.target !== soundBtn) {
        soundPopup.classList.add("hidden");
      }
    });

    // Prevent popup clicks from closing it
    soundPopup.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Volume slider
    if (volumeSlider && volumeValue) {
      const initialVolume = Math.round(this.audioDriver.getVolume() * 100);
      volumeSlider.value = initialVolume;
      volumeValue.textContent = `${initialVolume}%`;

      volumeSlider.addEventListener("input", (e) => {
        const volume = parseInt(e.target.value, 10);
        volumeValue.textContent = `${volume}%`;
        this.audioDriver.setVolume(volume / 100);
      });
    }

    // Mute toggle
    if (muteToggle) {
      muteToggle.checked = this.audioDriver.isMuted();
      muteToggle.addEventListener("change", () => {
        this.audioDriver.toggleMute();
        this.updateSoundButton();
      });
    }

    this.updateSoundButton();
  }

  /**
   * Update sound button icon based on mute state
   */
  updateSoundButton() {
    const soundBtn = document.getElementById("btn-sound");
    if (!soundBtn) return;

    const iconUnmuted = soundBtn.querySelector(".icon-unmuted");
    const iconMuted = soundBtn.querySelector(".icon-muted");

    if (this.audioDriver.isMuted()) {
      iconUnmuted?.classList.add("hidden");
      iconMuted?.classList.remove("hidden");
    } else {
      iconUnmuted?.classList.remove("hidden");
      iconMuted?.classList.add("hidden");
    }
  }

  /**
   * Set up fullscreen button (browser fullscreen API)
   */
  setupFullscreen() {
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    if (!fullscreenBtn) return;

    fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn("Fullscreen request failed:", err);
        });
      } else {
        document.exitFullscreen();
      }
      this.refocusCanvas();
    });
  }

  setupThemeSelector() {
    const buttons = document.querySelectorAll(".theme-btn");
    if (!buttons.length || !this.themeManager) return;

    const updateActive = () => {
      const pref = this.themeManager.getPreference();
      buttons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.theme === pref);
      });
    };

    buttons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.themeManager.setPreference(btn.dataset.theme);
        updateActive();
      });
    });

    updateActive();
  }

  isRunning() {
    return this.running;
  }


  start() {
    if (this.running) return;

    this.proxy.reset();
    this.running = true;
    this.renderer.setNoSignal(false);
    this.audioDriver.start();
    console.log("Emulator powered on");
  }

  stop() {
    if (!this.running) return;

    this.running = false;
    this.audioDriver.stop();
    this.renderer.setNoSignal(true);
    console.log("Emulator powered off");
  }

  renderFrame(framebuffer) {
    if (framebuffer) {
      this.renderer.updateTexture(framebuffer);
      this.renderer.draw();
    }
    this.windowManager.updateAll(this.proxy);
  }

  startRenderLoop() {
    const render = () => {
      if (!this.running) {
        this.renderer.draw();
      }
      // Always update debug windows (needed for stepping when paused)
      this.windowManager.updateAll(this.proxy);
      this.animFrameId = requestAnimationFrame(render);
    };

    this.animFrameId = requestAnimationFrame(render);
  }

  showLoading(show) {
    const loading = document.getElementById("loading");
    if (!loading) return;
    if (show) {
      loading.classList.remove("hidden");
    } else {
      loading.classList.add("hidden");
    }
  }

  destroy() {
    if (this.running) {
      this.stop();
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.audioDriver) {
      this.audioDriver.stop();
      this.audioDriver = null;
    }

    if (this.screenWindow) {
      this.screenWindow.destroy();
      this.screenWindow = null;
    }

    if (this.displaySettingsWindow) {
      this.displaySettingsWindow.destroy();
      this.displaySettingsWindow = null;
    }

    if (this.tapeWindow) {
      this.tapeWindow.destroy();
      this.tapeWindow = null;
    }

    if (this.soundWindow) {
      this.soundWindow.destroy();
      this.soundWindow = null;
    }

    if (this.cpuDebuggerWindow) {
      this.cpuDebuggerWindow.destroy();
      this.cpuDebuggerWindow = null;
    }

    if (this.snapshotLoader) {
      this.snapshotLoader.destroy();
      this.snapshotLoader = null;
    }

    if (this.themeManager) {
      this.themeManager.destroy();
      this.themeManager = null;
    }

    if (this.proxy) {
      this.proxy.destroy();
      this.proxy = null;
    }

    this.renderer = null;
    this.inputHandler = null;

    console.log("ZX Spectrum Emulator destroyed");
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const emulator = new ZXSpectrumEmulator();
  emulator.init();

  // Make emulator accessible globally for debugging
  window.zxspec = emulator;

});
