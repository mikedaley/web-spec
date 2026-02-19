/*
 * audio-driver.js - Web Audio API driver for emulator audio and timing
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// Audio constants (ZX Spectrum 48K)
const SAMPLE_RATE = 48000;
const FRAMES_PER_SECOND = 50.08;
const DEFAULT_VOLUME = 0.5;

export class AudioDriver {
  constructor(proxy) {
    this.proxy = proxy;
    this.audioContext = null;
    this.workletNode = null;
    this.gainNode = null;

    this.sampleRate = SAMPLE_RATE;
    this.running = false;
    this.muted = false;

    const savedVol = localStorage.getItem("zxspec-volume");
    this.volume = savedVol !== null ? parseFloat(savedVol) : DEFAULT_VOLUME;

    // Fallback timing
    this.fallbackInterval = null;

    // Frame synchronization callback
    this.onFrameReady = null;

    // Latest framebuffer received from worker
    this._latestFramebuffer = null;

    // Latest audio samples for waveform visualization
    this.latestSamples = null;

    // Set up frame callback from proxy
    this.proxy.onFrame = (framebuffer, audio, sampleCount) => {
      this._latestFramebuffer = framebuffer;

      // Store a copy of the audio samples for visualization
      if (audio && sampleCount > 0) {
        this.latestSamples = new Float32Array(audio);
      }

      // Forward audio to worklet
      if (this.workletNode && audio && sampleCount > 0) {
        const samplesCopy = new Float32Array(audio);
        this.workletNode.port.postMessage(
          { type: "samples", data: samplesCopy },
          [samplesCopy.buffer],
        );
      } else if (this.workletNode) {
        const silence = new Float32Array(128);
        this.workletNode.port.postMessage(
          { type: "samples", data: silence },
          [silence.buffer],
        );
      }

      // Notify main thread to render
      if (this.onFrameReady) {
        this.onFrameReady(this._latestFramebuffer);
      }
    };
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
          this.requestFrames();
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

  requestFrames() {
    // Request 2 frames from the worker
    // 25 requests/sec × 2 frames = 50fps — correct emulation speed.
    this.proxy.runFrames(2);
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
   */
  startFallbackTiming() {
    if (this.fallbackInterval) return;

    this.fallbackInterval = setInterval(() => {
      this.proxy.runFrames(1);
    }, 1000 / FRAMES_PER_SECOND);

    this.running = true;
    console.log("Using fallback timing (50Hz)");
  }

  stop() {
    if (!this.running) return;

    this.running = false;
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
    localStorage.setItem("zxspec-volume", this.volume);
    if (this.gainNode) {
      this.gainNode.gain.value = this.muted ? 0 : this.volume;
    }
  }
}
