/*
 * audio-worklet.js - AudioWorklet processor for ZX Spectrum audio
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

class ZXSpecAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.running = false;
    this.sampleBuffer = new Float32Array(0);
    this.bufferReadPos = 0;
    this.pendingRequest = false;

    this.port.onmessage = (event) => {
      if (event.data.type === "start") {
        this.running = true;
        this.pendingRequest = false;
      } else if (event.data.type === "stop") {
        this.running = false;
        this.pendingRequest = false;
      } else if (event.data.type === "samples") {
        const newSamples = event.data.data;
        const remaining = this.sampleBuffer.length - this.bufferReadPos;

        if (remaining > 0) {
          const combined = new Float32Array(remaining + newSamples.length);
          combined.set(this.sampleBuffer.subarray(this.bufferReadPos), 0);
          combined.set(newSamples, remaining);
          this.sampleBuffer = combined;
        } else {
          this.sampleBuffer = newSamples;
        }
        this.bufferReadPos = 0;
        this.pendingRequest = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    if (!this.running || !channel) {
      if (channel) channel.fill(0);
      return true;
    }

    const remaining = this.sampleBuffer.length - this.bufferReadPos;

    // Request more samples if buffer is getting low
    if (remaining < 2400 && !this.pendingRequest) {
      this.pendingRequest = true;
      this.port.postMessage({
        type: "requestSamples",
        count: 1600,
      });
    }

    // Copy samples to output
    for (let i = 0; i < channel.length; i++) {
      if (this.bufferReadPos < this.sampleBuffer.length) {
        channel[i] = this.sampleBuffer[this.bufferReadPos++];
      } else {
        channel[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor("zxspec-audio-processor", ZXSpecAudioProcessor);
