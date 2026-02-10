/*
 * webgl-renderer.js - WebGL renderer for ZX Spectrum display
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// ZX Spectrum display dimensions (from types.hpp)
const TOTAL_WIDTH = 352; // 48 + 256 + 48
const TOTAL_HEIGHT = 296; // 48 + 192 + 56

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.program = null;
    this.texture = null;
    this.uniforms = {};

    // Texture dimensions match the full ZX Spectrum display including borders
    this.width = TOTAL_WIDTH;
    this.height = TOTAL_HEIGHT;

    // No-signal static state
    this.noSignal = 1.0;
    this.startTime = performance.now() / 1000.0;

    // Set canvas size
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.initGL();
  }

  initGL() {
    this.gl =
      this.canvas.getContext("webgl2") ||
      this.canvas.getContext("webgl") ||
      this.canvas.getContext("experimental-webgl");

    if (!this.gl) {
      console.error("WebGL not available, falling back to 2D context");
      this.ctx2d = this.canvas.getContext("2d");
      return;
    }

    const gl = this.gl;

    // Vertex shader - simple fullscreen quad
    const vsSource = `
      attribute vec2 aPosition;
      attribute vec2 aTexCoord;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
      }
    `;

    // Fragment shader - texture sampling with TV static when off
    const fsSource = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uTexture;
      uniform float u_noSignal;
      uniform float u_time;
      uniform vec2 u_textureSize;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 noSignalStatic(vec2 uv, float time) {
        vec2 blockSize = vec2(1.0, 1.0);
        vec2 pixelCoord = floor(uv * u_textureSize / blockSize);
        float frameTime = floor(time * 50.0);
        vec2 noiseCoord = pixelCoord + vec2(frameTime * 17.0, frameTime * 31.0);
        float noise = hash12(noiseCoord);
        float bandNoise = hash12(vec2(pixelCoord.y * 0.1, frameTime * 0.5));
        float band = smoothstep(0.4, 0.7, bandNoise);
        noise = mix(noise * 0.7, noise * 1.2, band);
        float lineNoise = hash12(vec2(frameTime, 0.0));
        if (lineNoise > 0.95) {
          float lineY = hash12(vec2(frameTime, 1.0));
          float lineDist = abs(uv.y - lineY);
          if (lineDist < 0.02) {
            noise = mix(noise, 1.0, (0.02 - lineDist) / 0.02 * 0.5);
          }
        }
        float brightnessFlicker = 0.85 + hash12(vec2(frameTime * 0.1, 0.0)) * 0.3;
        noise *= brightnessFlicker;
        noise = clamp(noise, 0.0, 1.0) * 0.25;
        return vec3(noise);
      }

      void main() {
        if (u_noSignal > 0.5) {
          gl_FragColor = vec4(noSignalStatic(vTexCoord, u_time), 1.0);
          return;
        }
        gl_FragColor = texture2D(uTexture, vTexCoord);
      }
    `;

    // Compile shaders
    const vs = this.compileShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fsSource);

    // Link program
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error("Shader link error:", gl.getProgramInfoLog(this.program));
      return;
    }

    // Set up fullscreen quad geometry
    const positions = new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1,
    ]);

    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0]);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.program, "aPosition");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(this.program, "aTexCoord");
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Create texture for framebuffer
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Initialize with empty texture
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    gl.useProgram(this.program);

    // Get uniform locations
    this.uniforms.noSignal = gl.getUniformLocation(this.program, "u_noSignal");
    this.uniforms.time = gl.getUniformLocation(this.program, "u_time");
    this.uniforms.textureSize = gl.getUniformLocation(
      this.program,
      "u_textureSize",
    );

    // Set static texture size
    gl.uniform2f(this.uniforms.textureSize, this.width, this.height);
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Update the display texture with new framebuffer data.
   * @param {Uint8Array} framebuffer - RGBA pixel data (TOTAL_WIDTH x TOTAL_HEIGHT x 4)
   */
  updateTexture(framebuffer) {
    if (this.gl && this.texture) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        this.width,
        this.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        framebuffer,
      );
    }
  }

  /**
   * Resize the canvas display size (CSS pixels) without changing
   * the internal texture resolution.
   */
  resize(width, height) {
    if (this.gl) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Draw the current texture to the canvas.
   */
  draw() {
    if (this.gl) {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uniforms.noSignal, this.noSignal);
      gl.uniform1f(
        this.uniforms.time,
        performance.now() / 1000.0 - this.startTime,
      );
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  setNoSignal(enabled) {
    this.noSignal = enabled ? 1.0 : 0.0;
  }
}
