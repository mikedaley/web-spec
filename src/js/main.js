/*
 * main.js - Main entry point and ZXSpectrumEmulator class
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import "../js/css/base.css";

import { WebGLRenderer } from "./display/webgl-renderer.js";
import { AudioDriver } from "./audio/audio-driver.js";
import { InputHandler } from "./input/input-handler.js";

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

      // Set up renderer
      const canvas = document.getElementById("screen");
      this.renderer = new WebGLRenderer(canvas);

      // Set up audio driver (stub - drives timing via fallback for now)
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

      this.showLoading(false);

      console.log("ZX Spectrum Emulator initialized");
    } catch (error) {
      console.error("Failed to initialize emulator:", error);
      this.showLoading(false);
    }
  }

  setupControls() {
    const powerBtn = document.getElementById("btn-power");
    if (powerBtn) {
      powerBtn.addEventListener("click", () => {
        if (this.running) {
          this.stop();
          powerBtn.classList.add("off");
          powerBtn.title = "Power On";
        } else {
          this.start();
          powerBtn.classList.remove("off");
          powerBtn.title = "Power Off";
        }
      });
    }

    const resetBtn = document.getElementById("btn-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (this.running) {
          this.wasmModule._reset();
          console.log("Emulator reset");
        }
      });
    }
  }

  isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;

    this.wasmModule._reset();
    this.running = true;
    this.audioDriver.start();
    console.log("Emulator powered on");
  }

  stop() {
    if (!this.running) return;

    this.running = false;
    this.audioDriver.stop();
    console.log("Emulator powered off");
  }

  renderFrame() {
    // TODO: Once framebuffer export is implemented in the emulator core,
    // copy the framebuffer data to the renderer texture here.
    // For now this is a placeholder for the render pipeline.
    this.renderer.draw();
  }

  startRenderLoop() {
    const render = () => {
      if (!this.running) {
        this.renderer.draw();
      }
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
