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
import { BasicProgramWindow } from "./debug/basic-program-window.js";

import { EmulatorProxy } from "./emulator-proxy.js";
import { ThemeManager } from "./ui/theme-manager.js";
import { VERSION } from "./config/version.js";

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
    this.basicProgramWindow = null;

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
      const savedMachineId = parseInt(localStorage.getItem("zxspec-machine-id") || "0", 10);
      await this.proxy.init(savedMachineId);

      // Query display dimensions from C++ (machine_info.hpp constants)
      const displayDims = await this.proxy.getDisplayDimensions();

      // Set up renderer (async - loads external shaders)
      const canvas = document.getElementById("screen");
      this.renderer = new WebGLRenderer(canvas, displayDims.width, displayDims.height);
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
      this.soundWindow = new SoundWindow(this.audioDriver, this.proxy);
      this.soundWindow.create();
      this.windowManager.register(this.soundWindow);

      // Create BASIC program window
      this.basicProgramWindow = new BasicProgramWindow(this.proxy);
      this.basicProgramWindow.onRenderFrame = (fb) => this.renderFrame(fb);
      this.basicProgramWindow.create();
      this.windowManager.register(this.basicProgramWindow);

      // Attach canvas to screen window
      this.screenWindow.attachCanvas();

      // Apply default layout (screen left, tape right for first-time users)
      this.windowManager.applyDefaultLayout([
        { id: "screen-window", position: "viewport-left-of", leftOf: "tape-window", aspectRatio: 5 / 4, visible: true, viewportLocked: false },
        { id: "tape-window", position: "viewport-right", visible: true },
        { id: "display-settings", visible: false },
        { id: "cpu-debugger", visible: false },
        { id: "stack-viewer", visible: false },
        { id: "sound-debug", visible: false },
        { id: "basic-program", visible: false },
      ]);

      // Load saved window state (overrides defaults if present)
      this.windowManager.loadState();

      // Snap screen window to its exact aspect ratio and fit canvas.
      // Defer to next frame so the browser has applied the new dimensions.
      requestAnimationFrame(() => {
        const sw = this.screenWindow;
        const headerHeight = sw.headerElement ? sw.headerElement.offsetHeight : 0;
        const contentHeight = sw.currentHeight - headerHeight;
        const newWidth = Math.round(contentHeight * sw._aspect);
        sw.element.style.width = `${newWidth}px`;
        sw.currentWidth = newWidth;
        sw._fitCanvas();
      });

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

      // Set version chip from version.js
      const versionChip = document.querySelector(".version-chip");
      if (versionChip) versionChip.textContent = `v${VERSION}`;

      this.showLoading(false);

      console.log(`ZX Spectrum Emulator v${VERSION} initialized`);
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

    // File menu > Save State
    const saveStateBtn = document.getElementById("btn-save-state");
    if (saveStateBtn) {
      saveStateBtn.addEventListener("click", () => {
        this.closeAllMenus();
        console.log("Save State not yet implemented");
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

    // Dev menu > BASIC Editor
    const basicEditorBtn = document.getElementById("btn-basic-editor");
    if (basicEditorBtn) {
      basicEditorBtn.addEventListener("click", () => {
        this.windowManager.toggleWindow("basic-program");
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }

    // Machine menu
    this.setupMachineMenu();

    // Menus
    this.setupMenus();

    // Sound controls
    this.setupSoundControls();

    // Speed controls
    this.setupSpeedControls();

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
    if (powerBtn) {
      if (this.running) {
        powerBtn.classList.remove("off");
        powerBtn.title = "Power Off";
      } else {
        powerBtn.classList.add("off");
        powerBtn.title = "Power On";
      }
    }

    const resetBtn = document.getElementById("btn-reset");
    if (resetBtn) {
      resetBtn.classList.toggle("disabled", !this.running);
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
    // Close popups
    const speedPopup = document.getElementById("speed-popup");
    if (speedPopup) speedPopup.classList.remove("open");
    const soundPopup = document.getElementById("sound-popup");
    if (soundPopup) soundPopup.classList.remove("open");
  }

  /**
   * Update checkmark states on View/Dev menu items based on window visibility
   */
  updateMenuCheckmarks() {
    const windowMap = {
      "btn-display": "display-settings",
      "btn-tape-player": "tape-window",
      "btn-sound-debug": "sound-debug",
      "btn-z80-debug": "cpu-debugger",
      "btn-stack-viewer": "stack-viewer",
      "btn-basic-editor": "basic-program",
    };

    for (const [btnId, windowId] of Object.entries(windowMap)) {
      const btn = document.getElementById(btnId);
      if (!btn) continue;
      const win = this.windowManager.getWindow(windowId);
      const isVisible = win && win.isVisible;
      btn.classList.toggle("active", isVisible);
    }
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
          this.updateMenuCheckmarks();
          container.classList.add("open");
          this.clampMenuToViewport(container);
        }
      });

      // Hover-switching: hovering over a different trigger while one menu is open switches menus
      trigger.addEventListener("mouseenter", () => {
        const anyOpen = document.querySelector(".header-menu-container.open");
        if (anyOpen && anyOpen !== container) {
          this.closeAllMenus();
          this.updateMenuCheckmarks();
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
      // Close speed popup if open
      const speedPopup = document.getElementById("speed-popup");
      if (speedPopup) speedPopup.classList.remove("open");
      soundPopup.classList.toggle("open");
      if (soundPopup.classList.contains("open")) {
        this.clampPopupToViewport(soundPopup);
      }
    });

    // Close popup on outside click
    document.addEventListener("click", (e) => {
      if (!soundPopup.contains(e.target) && !e.target.closest("#btn-sound")) {
        soundPopup.classList.remove("open");
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
   * Set up speed button + popup (speed slider)
   */
  setupSpeedControls() {
    const speedBtn = document.getElementById("btn-speed");
    const speedPopup = document.getElementById("speed-popup");
    const speedSlider = document.getElementById("speed-slider");
    const speedValue = document.getElementById("speed-value");
    if (!speedBtn || !speedPopup) return;

    // Restore saved speed
    const initialSpeed = this.audioDriver.getSpeed();
    if (speedSlider) speedSlider.value = initialSpeed;
    if (speedValue) speedValue.textContent = `${initialSpeed}x`;
    this.updateSpeedButton(initialSpeed);

    // Toggle popup
    speedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeAllMenus();
      // Close sound popup if open
      const soundPopup = document.getElementById("sound-popup");
      if (soundPopup) soundPopup.classList.remove("open");
      speedPopup.classList.toggle("open");
      if (speedPopup.classList.contains("open")) {
        this.clampPopupToViewport(speedPopup);
      }
    });

    // Close popup on outside click
    document.addEventListener("click", (e) => {
      if (!speedPopup.contains(e.target) && !e.target.closest("#btn-speed")) {
        speedPopup.classList.remove("open");
      }
    });

    // Prevent popup clicks from closing it
    speedPopup.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Speed slider
    if (speedSlider && speedValue) {
      speedSlider.addEventListener("input", (e) => {
        const speed = parseInt(e.target.value, 10);
        speedValue.textContent = `${speed}x`;
        this.audioDriver.setSpeed(speed);
        this.updateSpeedButton(speed);
      });
    }
  }

  /**
   * Update speed button appearance based on current speed
   */
  updateSpeedButton(speed) {
    const speedBtn = document.getElementById("btn-speed");
    if (!speedBtn) return;
    speedBtn.classList.toggle("speed-active", speed > 1);
  }

  /**
   * Set up fullscreen button (browser fullscreen API)
   */
  setupFullscreen() {
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    if (!fullscreenBtn) return;

    const iconExpand = fullscreenBtn.querySelector(".icon-expand");
    const iconCompress = fullscreenBtn.querySelector(".icon-compress");
    const headerEl = document.querySelector("header");
    const triggerZone = 48; // pixels from top to trigger header reveal

    const updateFullscreenIcon = () => {
      const isFullscreen = !!document.fullscreenElement;
      if (iconExpand) iconExpand.classList.toggle("hidden", isFullscreen);
      if (iconCompress) iconCompress.classList.toggle("hidden", !isFullscreen);
      fullscreenBtn.classList.toggle("fullscreen-active", isFullscreen);

      // Remove visible class when exiting fullscreen
      if (!isFullscreen && headerEl) {
        headerEl.classList.remove("header-visible");
      }
    };

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

    document.addEventListener("fullscreenchange", updateFullscreenIcon);

    // Show/hide header based on mouse proximity to top edge in fullscreen
    document.addEventListener("mousemove", (e) => {
      if (!document.fullscreenElement || !headerEl) return;

      if (e.clientY <= triggerZone) {
        headerEl.classList.add("header-visible");
      } else {
        // Only hide if mouse isn't over the header itself
        if (!headerEl.contains(e.target)) {
          headerEl.classList.remove("header-visible");
        }
      }
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

  setupMachineMenu() {
    const issue2Btn = document.getElementById("btn-issue2");
    const issue3Btn = document.getElementById("btn-issue3");
    const ayToggleBtn = document.getElementById("btn-ay-toggle");
    const optionsLabel = document.getElementById("options-48k-label");
    const options48k = document.querySelectorAll(".option-48k");
    const machineItems = document.querySelectorAll("[data-machine]");

    const updateIssueChecks = (issue) => {
      if (issue2Btn) issue2Btn.classList.toggle("active", issue === 2);
      if (issue3Btn) issue3Btn.classList.toggle("active", issue === 3);
    };

    const updateMachineChecks = (machineId) => {
      machineItems.forEach((item) => {
        item.classList.toggle("active", parseInt(item.dataset.machine, 10) === machineId);
      });
    };

    const update48kOptionsVisibility = (machineId) => {
      const is48k = machineId === 0;
      if (optionsLabel) optionsLabel.style.display = is48k ? "" : "none";
      options48k.forEach((el) => {
        el.style.display = is48k ? "" : "none";
      });
      // Also hide the separator before 48K options when on 128K
      const separators = document.querySelectorAll("#machine-menu .header-menu-separator");
      if (separators.length > 0) {
        separators[0].style.display = is48k ? "" : "none";
      }
    };

    // Restore saved machine ID and update UI
    const currentMachineId = parseInt(localStorage.getItem("zxspec-machine-id") || "0", 10);
    updateMachineChecks(currentMachineId);
    update48kOptionsVisibility(currentMachineId);

    // Machine model selection
    machineItems.forEach((item) => {
      item.addEventListener("click", async () => {
        const machineId = parseInt(item.dataset.machine, 10);
        const currentId = parseInt(localStorage.getItem("zxspec-machine-id") || "0", 10);
        if (machineId === currentId) {
          this.closeAllMenus();
          return;
        }

        localStorage.setItem("zxspec-machine-id", String(machineId));
        updateMachineChecks(machineId);
        update48kOptionsVisibility(machineId);

        await this.proxy.switchMachine(machineId);

        // If running, reset and continue; otherwise just switch
        if (this.running) {
          this.audioDriver.latestSamples = null;
        } else {
          this.running = true;
          this.renderer.setNoSignal(false);
          this.audioDriver.start();
          this.updatePowerButton();
        }

        this.closeAllMenus();
        this.refocusCanvas();
      });
    });

    // Restore Issue number from localStorage
    const savedIssue = localStorage.getItem("zxspec-issue-number");
    const issueNumber = savedIssue === "2" ? 2 : 3;
    this.proxy.setIssueNumber(issueNumber);
    updateIssueChecks(issueNumber);

    // Restore AY enabled from localStorage (only applies to 48K)
    const savedAY = localStorage.getItem("zxspec-ay-enabled");
    const ayEnabled = savedAY === "true";
    if (currentMachineId === 0) {
      this.proxy.setAYEnabled(ayEnabled);
    }
    if (ayToggleBtn) {
      ayToggleBtn.classList.toggle("active", currentMachineId === 0 ? ayEnabled : true);
    }

    // Issue 2/3 radio selection
    const issueHandler = (issue) => {
      this.proxy.setIssueNumber(issue);
      updateIssueChecks(issue);
      localStorage.setItem("zxspec-issue-number", String(issue));
      this.closeAllMenus();
      this.refocusCanvas();
    };
    if (issue2Btn) issue2Btn.addEventListener("click", () => issueHandler(2));
    if (issue3Btn) issue3Btn.addEventListener("click", () => issueHandler(3));

    // AY toggle
    if (ayToggleBtn) {
      ayToggleBtn.addEventListener("click", () => {
        const isEnabled = ayToggleBtn.classList.contains("active");
        const newEnabled = !isEnabled;
        this.proxy.setAYEnabled(newEnabled);
        ayToggleBtn.classList.toggle("active", newEnabled);
        localStorage.setItem("zxspec-ay-enabled", String(newEnabled));
        this.closeAllMenus();
        this.refocusCanvas();
      });
    }
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

    if (this.basicProgramWindow) {
      this.basicProgramWindow.destroy();
      this.basicProgramWindow = null;
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
