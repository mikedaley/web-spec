/*
 * audio-driver.js - Web Audio API driver for emulator audio and timing
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Audio constants (ZX Spectrum 48K)
const SAMPLE_RATE = 48000;
const CPU_CLOCK_HZ = 3500000;
const TSTATES_PER_FRAME = 69888;
const FRAMES_PER_SECOND = 50.08;
const DEFAULT_VOLUME = 0.5;

export class AudioDriver {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.audioContext = null;
    this.workletNode = null;
    this.gainNode = null;

    this.sampleRate = SAMPLE_RATE;
    this.running = false;
    this.muted = false;
    this.volume = DEFAULT_VOLUME;

    // Fallback timing
    this.fallbackInterval = null;

    // Frame synchronization callback
    this.onFrameReady = null;

    // Speed multiplier: 1 = normal (50fps), 2 = 2x, 4 = 4x, etc.
    this.speedMultiplier = 1;

    // Turbo mode: runs frames from rAF instead of audio callback
    this.turboAnimId = null;
  }

  async start() {
    if (this.running) return;

    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)({
        sampleRate: this.sampleRate,
      });

      if (this.audioContext.state === "suspended") {
        console.log(
          "Audio context suspended, using fallback timing until user interaction",
        );
        this.startFallbackTiming();
        this.setupAutoResumeAudio();
        return;
      }

      await this.initAudioNodes();
    } catch (error) {
      console.error("Failed to start audio driver:", error);
      this.startFallbackTiming();
    }
  }

  async initAudioNodes() {
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = this.muted ? 0 : this.volume;

    try {
      await this.audioContext.audioWorklet.addModule(
        "/src/js/audio/audio-worklet.js",
      );

      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        "zxspec-audio-processor",
      );

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === "requestSamples") {
          this.generateAndSendSamples();
        }
      };

      this.workletNode.connect(this.gainNode);

      // Stop fallback if it was running
      if (this.fallbackInterval) {
        clearInterval(this.fallbackInterval);
        this.fallbackInterval = null;
      }

      this.workletNode.port.postMessage({ type: "start" });
      this.running = true;
      console.log("Audio driver started with AudioWorklet");
    } catch (error) {
      console.error("AudioWorklet failed, using fallback:", error);
      this.startFallbackTiming();
    }
  }

  generateAndSendSamples() {
    // In turbo mode, frames are driven by rAF loop instead
    if (this.speedMultiplier > 1) {
      // Send silence to keep the worklet alive
      this.wasmModule._resetAudioBuffer();
      const silence = new Float32Array(960);
      this.workletNode.port.postMessage(
        { type: "samples", data: silence },
        [silence.buffer],
      );
      return;
    }

    // Run 2 frames per request to keep the worklet buffer well-stocked.
    // 25 requests/sec × 2 frames = 50fps — correct emulation speed.
    for (let i = 0; i < 2; i++) {
      this.wasmModule._runFrame();
      if (this.onFrameReady) {
        this.onFrameReady();
      }
    }

    const sampleCount = this.wasmModule._getAudioSampleCount();
    if (sampleCount > 0) {
      const bufferPtr = this.wasmModule._getAudioBuffer();
      const samples = new Float32Array(
        this.wasmModule.HEAPF32.buffer,
        bufferPtr,
        sampleCount,
      );
      const samplesCopy = new Float32Array(samples);
      this.wasmModule._resetAudioBuffer();

      this.workletNode.port.postMessage(
        { type: "samples", data: samplesCopy },
        [samplesCopy.buffer],
      );
    } else {
      this.wasmModule._resetAudioBuffer();
      // Send empty samples so the worklet clears pendingRequest
      // and will request more samples on the next process() call
      const silence = new Float32Array(128);
      this.workletNode.port.postMessage(
        { type: "samples", data: silence },
        [silence.buffer],
      );
    }
  }

  startTurboLoop() {
    if (this.turboAnimId) return;

    const turboTick = () => {
      if (this.speedMultiplier <= 1) {
        this.turboAnimId = null;
        return;
      }

      // Run multiple frames per rAF tick with a time budget of 12ms
      // to keep the UI responsive (leaves ~4ms for rendering)
      const deadline = performance.now() + 12;
      while (performance.now() < deadline) {
        this.wasmModule._runFrame();
        this.wasmModule._resetAudioBuffer();
      }

      if (this.onFrameReady) {
        this.onFrameReady();
      }

      this.turboAnimId = requestAnimationFrame(turboTick);
    };

    this.turboAnimId = requestAnimationFrame(turboTick);
  }

  stopTurboLoop() {
    if (this.turboAnimId) {
      cancelAnimationFrame(this.turboAnimId);
      this.turboAnimId = null;
    }
  }

  setupAutoResumeAudio() {
    const resumeAudio = async () => {
      if (this.audioContext && this.audioContext.state === "suspended") {
        try {
          await this.audioContext.resume();
          console.log("Audio context resumed");

          if (this.fallbackInterval) {
            clearInterval(this.fallbackInterval);
            this.fallbackInterval = null;
          }

          await this.initAudioNodes();
        } catch (e) {
          console.error("Failed to resume audio context:", e);
        }
      }

      document.removeEventListener("click", resumeAudio);
      document.removeEventListener("keydown", resumeAudio);
    };

    document.addEventListener("click", resumeAudio, { once: true });
    document.addEventListener("keydown", resumeAudio, { once: true });
  }

  /**
   * Fallback timing using setInterval when Web Audio API is unavailable.
   *
   * The ZX Spectrum 48K runs at 3.5 MHz with 69888 T-states per frame at ~50Hz.
   * Each tick at 50Hz should execute ~69888 T-states.
   */
  startFallbackTiming() {
    if (this.fallbackInterval) return;

    this.fallbackInterval = setInterval(() => {
      this.wasmModule._runFrame();
      this.wasmModule._resetAudioBuffer();

      if (this.onFrameReady) {
        this.onFrameReady();
      }
    }, 1000 / FRAMES_PER_SECOND);

    this.running = true;
    console.log("Using fallback timing (50Hz)");
  }

  stop() {
    if (!this.running) return;

    this.running = false;
    this.stopTurboLoop();

    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: "stop" });
        this.workletNode.disconnect();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.workletNode = null;
    }

    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.audioContext = null;
    }

    console.log("Audio driver stopped");
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }
  }

  isMuted() {
    return this.muted;
  }

  getVolume() {
    return this.volume;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }
  }
}
