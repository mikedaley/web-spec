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
import { AYWindow } from "./debug/ay-window.js";
import { CPUDebuggerWindow } from "./debug/cpu-debugger-window.js";
import { StackViewerWindow } from "./debug/stack-viewer-window.js";

// ZX Spectrum timing constants (from types.hpp)
const CPU_CLOCK_HZ = 3500000;
const TSTATES_PER_FRAME = 69888;
const FRAMES_PER_SECOND = 50.08;

class ZXSpectrumEmulator {
  constructor() {
    this.wasmModule = null;
    this.renderer = null;
    this.audioDriver = null;
    this.inputHandler = null;
    this.windowManager = null;
    this.screenWindow = null;
    this.displaySettingsWindow = null;
    this.ayWindow = null;
    this.cpuDebuggerWindow = null;

    this.snapshotLoader = null;

    this.running = false;
    this.animFrameId = null;
  }

  async init() {
    this.showLoading(true);

    try {
      // Load WASM module - use global function loaded via script tag
      this.wasmModule = await window.createZXSpecModule();

      // Initialize emulator core
      this.wasmModule._init();

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

      // Create AY debug window
      this.ayWindow = new AYWindow();
      this.ayWindow.create();
      this.windowManager.register(this.ayWindow);

      // Create CPU debugger window
      this.cpuDebuggerWindow = new CPUDebuggerWindow();
      this.cpuDebuggerWindow.create();
      this.windowManager.register(this.cpuDebuggerWindow);

      // Create stack viewer window
      this.stackViewerWindow = new StackViewerWindow();
      this.stackViewerWindow.create();
      this.windowManager.register(this.stackViewerWindow);

      // Attach canvas to screen window
      this.screenWindow.attachCanvas();

      // Apply default layout (viewport-fill for first-time users)
      this.windowManager.applyDefaultLayout([
        { id: "screen-window", position: "viewport-fill", visible: true, viewportLocked: true },
        { id: "display-settings", visible: false },
        { id: "ay-debug", visible: false },
        { id: "cpu-debugger", visible: false },
        { id: "stack-viewer", visible: false },
      ]);

      // Load saved window state (overrides defaults if present)
      this.windowManager.loadState();

      // Apply saved display settings to renderer
      this.displaySettingsWindow.applyAllSettings();

      // Set up audio driver
      this.audioDriver = new AudioDriver(this.wasmModule);

      // Connect audio-driven frame sync to rendering
      this.audioDriver.onFrameReady = () => {
        this.renderFrame();
      };

      // Set up input handler
      this.inputHandler = new InputHandler(this.wasmModule);
      this.inputHandler.init();

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
          this.wasmModule._reset();
          console.log("Emulator reset");
        }
        this.refocusCanvas();
      });
    }

    // SNA snapshot loader
    this.snapshotLoader = new SnapshotLoader(this.wasmModule);
    this.snapshotLoader.init();
    this.snapshotLoader.onLoaded = () => {
      if (!this.running) {
        this.running = true;
        this.renderer.setNoSignal(false);
        this.audioDriver.start();
        this.updatePowerButton();
      }
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

    // View menu > AY Sound (opens AY debug window)
    const aySoundBtn = document.getElementById("btn-ay-sound");
    if (aySoundBtn) {
      aySoundBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("ay-debug");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // View menu > Z80 Debugger (opens CPU debugger window)
    const z80DebugBtn = document.getElementById("btn-z80-debug");
    if (z80DebugBtn) {
      z80DebugBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("cpu-debugger");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // View menu > Stack Viewer
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
        }
      });

      // Hover-switching: hovering over a different trigger while one menu is open switches menus
      trigger.addEventListener("mouseenter", () => {
        const anyOpen = document.querySelector(".header-menu-container.open");
        if (anyOpen && anyOpen !== container) {
          this.closeAllMenus();
          container.classList.add("open");
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

  isRunning() {
    return this.running;
  }

  setSpeed(multiplier) {
    multiplier = Math.max(1, Math.floor(multiplier));
    if (this.wasmModule) {
      this.wasmModule._setTurbo(multiplier > 1);
    }
    if (this.audioDriver) {
      this.audioDriver.speedMultiplier = multiplier;
      if (multiplier > 1) {
        this.audioDriver.startTurboLoop();
      } else {
        this.audioDriver.stopTurboLoop();
      }
    }
    console.log(`Speed: ${multiplier}x`);
  }

  start() {
    if (this.running) return;

    this.wasmModule._reset();
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

  renderFrame() {
    const ptr = this.wasmModule._getFramebuffer();
    const size = this.wasmModule._getFramebufferSize();
    const framebuffer = new Uint8Array(this.wasmModule.HEAPU8.buffer, ptr, size);
    this.renderer.updateTexture(framebuffer);
    this.renderer.draw();
    this.windowManager.updateAll(this.wasmModule);
  }

  startRenderLoop() {
    const render = () => {
      if (!this.running) {
        this.renderer.draw();
      }
      // Always update debug windows (needed for stepping when paused)
      this.windowManager.updateAll(this.wasmModule);
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

    if (this.ayWindow) {
      this.ayWindow.destroy();
      this.ayWindow = null;
    }

    if (this.cpuDebuggerWindow) {
      this.cpuDebuggerWindow.destroy();
      this.cpuDebuggerWindow = null;
    }

    if (this.snapshotLoader) {
      this.snapshotLoader.destroy();
      this.snapshotLoader = null;
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
