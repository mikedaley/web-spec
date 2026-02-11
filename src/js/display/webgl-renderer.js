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

    // Burn-in resources
    this.burnInProgram = null;
    this.burnInFramebuffers = [null, null];
    this.burnInTextures = [null, null];
    this.currentBurnInIndex = 0;

    // Edge overlay program (second pass)
    this.edgeProgram = null;

    // Texture dimensions match the full ZX Spectrum display including borders
    this.width = TOTAL_WIDTH;
    this.height = TOTAL_HEIGHT;

    // CRT effect parameters (0.0 to 1.0 unless noted)
    this.crtParams = {
      curvature: 0.0,
      scanlineIntensity: 0.0,
      scanlineWidth: 0.25,
      shadowMask: 0.0,
      glowIntensity: 0.0,
      glowSpread: 0.5,
      brightness: 1.0,
      contrast: 1.0,
      saturation: 1.0,
      vignette: 0.0,
      rgbOffset: 0.0,
      staticNoise: 0.0,
      flicker: 0.0,
      jitter: 0.0,
      horizontalSync: 0.0,
      glowingLine: 0.0,
      ambientLight: 0.0,
      burnIn: 0.0,
      overscan: 0.0,
      noSignal: 1.0,
      cornerRadius: 0.0,
      screenMargin: 0.0,
      edgeHighlight: 0.0,
    };

    // Time for animated effects
    this.time = 0;

    // Uniform locations
    this.uniforms = {};
    this.burnInUniforms = {};
  }

  async init() {
    const ctxAttrs = {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    };
    this.gl =
      this.canvas.getContext("webgl2", ctxAttrs) ||
      this.canvas.getContext("webgl", ctxAttrs);
    if (!this.gl) {
      throw new Error("WebGL not supported");
    }

    const gl = this.gl;

    // Load shader sources from files
    const [vertexSource, fragmentSource, burnInSource, edgeSource] =
      await Promise.all([
        this.loadShader("shaders/vertex.glsl"),
        this.loadShader("shaders/crt.glsl"),
        this.loadShader("shaders/burnin.glsl"),
        this.loadShader("shaders/edge.glsl"),
      ]);

    // Create main program
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error("Shader program failed to link: " + gl.getProgramInfoLog(this.program));
    }

    // Create burn-in program
    const burnInVertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const burnInFragmentShader = this.compileShader(gl.FRAGMENT_SHADER, burnInSource);

    this.burnInProgram = gl.createProgram();
    gl.attachShader(this.burnInProgram, burnInVertexShader);
    gl.attachShader(this.burnInProgram, burnInFragmentShader);
    gl.linkProgram(this.burnInProgram);

    if (!gl.getProgramParameter(this.burnInProgram, gl.LINK_STATUS)) {
      throw new Error("Burn-in shader failed to link: " + gl.getProgramInfoLog(this.burnInProgram));
    }

    // Create edge overlay program
    const edgeVertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const edgeFragmentShader = this.compileShader(gl.FRAGMENT_SHADER, edgeSource);

    this.edgeProgram = gl.createProgram();
    gl.attachShader(this.edgeProgram, edgeVertexShader);
    gl.attachShader(this.edgeProgram, edgeFragmentShader);
    gl.linkProgram(this.edgeProgram);

    if (!gl.getProgramParameter(this.edgeProgram, gl.LINK_STATUS)) {
      throw new Error("Edge shader failed to link: " + gl.getProgramInfoLog(this.edgeProgram));
    }

    // Get attribute locations
    this.positionLoc = gl.getAttribLocation(this.program, "a_position");
    this.texCoordLoc = gl.getAttribLocation(this.program, "a_texCoord");

    this.burnInPositionLoc = gl.getAttribLocation(this.burnInProgram, "a_position");
    this.burnInTexCoordLoc = gl.getAttribLocation(this.burnInProgram, "a_texCoord");

    this.edgePositionLoc = gl.getAttribLocation(this.edgeProgram, "a_position");
    this.edgeTexCoordLoc = gl.getAttribLocation(this.edgeProgram, "a_texCoord");

    // Get all uniform locations for main program
    this.uniforms = {
      texture: gl.getUniformLocation(this.program, "u_texture"),
      burnInTexture: gl.getUniformLocation(this.program, "u_burnInTexture"),
      resolution: gl.getUniformLocation(this.program, "u_resolution"),
      textureSize: gl.getUniformLocation(this.program, "u_textureSize"),
      time: gl.getUniformLocation(this.program, "u_time"),
      curvature: gl.getUniformLocation(this.program, "u_curvature"),
      scanlineIntensity: gl.getUniformLocation(this.program, "u_scanlineIntensity"),
      scanlineWidth: gl.getUniformLocation(this.program, "u_scanlineWidth"),
      shadowMask: gl.getUniformLocation(this.program, "u_shadowMask"),
      glowIntensity: gl.getUniformLocation(this.program, "u_glowIntensity"),
      glowSpread: gl.getUniformLocation(this.program, "u_glowSpread"),
      brightness: gl.getUniformLocation(this.program, "u_brightness"),
      contrast: gl.getUniformLocation(this.program, "u_contrast"),
      saturation: gl.getUniformLocation(this.program, "u_saturation"),
      vignette: gl.getUniformLocation(this.program, "u_vignette"),
      flicker: gl.getUniformLocation(this.program, "u_flicker"),
      rgbOffset: gl.getUniformLocation(this.program, "u_rgbOffset"),
      staticNoise: gl.getUniformLocation(this.program, "u_staticNoise"),
      jitter: gl.getUniformLocation(this.program, "u_jitter"),
      horizontalSync: gl.getUniformLocation(this.program, "u_horizontalSync"),
      glowingLine: gl.getUniformLocation(this.program, "u_glowingLine"),
      ambientLight: gl.getUniformLocation(this.program, "u_ambientLight"),
      burnIn: gl.getUniformLocation(this.program, "u_burnIn"),
      overscan: gl.getUniformLocation(this.program, "u_overscan"),
      noSignal: gl.getUniformLocation(this.program, "u_noSignal"),
      cornerRadius: gl.getUniformLocation(this.program, "u_cornerRadius"),
      screenMargin: gl.getUniformLocation(this.program, "u_screenMargin"),
    };

    // Get burn-in program uniform locations
    this.burnInUniforms = {
      currentTexture: gl.getUniformLocation(this.burnInProgram, "u_currentTexture"),
      previousTexture: gl.getUniformLocation(this.burnInProgram, "u_previousTexture"),
      burnInDecay: gl.getUniformLocation(this.burnInProgram, "u_burnInDecay"),
    };

    // Get edge overlay program uniform locations
    this.edgeUniforms = {
      curvature: gl.getUniformLocation(this.edgeProgram, "u_curvature"),
      cornerRadius: gl.getUniformLocation(this.edgeProgram, "u_cornerRadius"),
      edgeHighlight: gl.getUniformLocation(this.edgeProgram, "u_edgeHighlight"),
      textureSize: gl.getUniformLocation(this.edgeProgram, "u_textureSize"),
      resolution: gl.getUniformLocation(this.edgeProgram, "u_resolution"),
    };

    // Create vertex buffer (full-screen quad) - texture coords flipped for screen rendering
    const positions = new Float32Array([
      -1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0,
    ]);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Vertex buffer for framebuffer rendering (non-flipped texture coords)
    const fbPositions = new Float32Array([
      -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
    ]);

    this.fbVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fbVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, fbPositions, gl.STATIC_DRAW);

    // Create main texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.useNearestFilter = true;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // Initialize with empty texture
    const emptyData = new Uint8Array(this.width * this.height * 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyData);

    // Create burn-in framebuffers and textures (ping-pong)
    for (let i = 0; i < 2; i++) {
      this.burnInTextures[i] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.burnInTextures[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, emptyData);

      this.burnInFramebuffers[i] = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.burnInFramebuffers[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.burnInTextures[i], 0);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Set initial canvas size
    if (!this.canvas.width || !this.canvas.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Enable blending for rounded corners transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compilation failed: " + gl.getShaderInfoLog(shader));
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
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, framebuffer);
    }
  }

  updateBurnIn() {
    const gl = this.gl;

    if (this.crtParams.burnIn < 0.001) return;

    const prevIndex = this.currentBurnInIndex;
    this.currentBurnInIndex = 1 - this.currentBurnInIndex;
    const currIndex = this.currentBurnInIndex;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.burnInFramebuffers[currIndex]);
    gl.viewport(0, 0, this.width, this.height);

    gl.useProgram(this.burnInProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fbVertexBuffer);
    gl.enableVertexAttribArray(this.burnInPositionLoc);
    gl.vertexAttribPointer(this.burnInPositionLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.burnInTexCoordLoc);
    gl.vertexAttribPointer(this.burnInTexCoordLoc, 2, gl.FLOAT, false, 16, 8);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.burnInUniforms.currentTexture, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.burnInTextures[prevIndex]);
    gl.uniform1i(this.burnInUniforms.previousTexture, 1);

    const decayRate = 0.02 + (1.0 - this.crtParams.burnIn) * 0.08;
    gl.uniform1f(this.burnInUniforms.burnInDecay, decayRate);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw the current texture to the canvas.
   */
  draw() {
    const gl = this.gl;
    if (!gl) return;

    // Apply any pending canvas resize
    if (this._pendingWidth !== undefined) {
      const pw = this._pendingWidth;
      const ph = this._pendingHeight;
      this._pendingWidth = undefined;
      this._pendingHeight = undefined;
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
        gl.viewport(0, 0, pw, ph);
      }
    }

    // Update time for animated effects
    this.time += 0.016;

    // Update burn-in accumulation
    this.updateBurnIn();

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);

    // Bind vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.enableVertexAttribArray(this.positionLoc);
    gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.texCoordLoc);
    gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 16, 8);

    // Bind main texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.texture, 0);

    // Bind burn-in texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.burnInTextures[this.currentBurnInIndex]);
    gl.uniform1i(this.uniforms.burnInTexture, 1);

    // Set all uniforms
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.uniforms.textureSize, this.width, this.height);
    gl.uniform1f(this.uniforms.time, this.time);
    gl.uniform1f(this.uniforms.curvature, this.crtParams.curvature);
    gl.uniform1f(this.uniforms.scanlineIntensity, this.crtParams.scanlineIntensity);
    gl.uniform1f(this.uniforms.scanlineWidth, this.crtParams.scanlineWidth);
    gl.uniform1f(this.uniforms.shadowMask, this.crtParams.shadowMask);
    gl.uniform1f(this.uniforms.glowIntensity, this.crtParams.glowIntensity);
    gl.uniform1f(this.uniforms.glowSpread, this.crtParams.glowSpread);
    gl.uniform1f(this.uniforms.brightness, this.crtParams.brightness);
    gl.uniform1f(this.uniforms.contrast, this.crtParams.contrast);
    gl.uniform1f(this.uniforms.saturation, this.crtParams.saturation);
    gl.uniform1f(this.uniforms.vignette, this.crtParams.vignette);
    gl.uniform1f(this.uniforms.flicker, this.crtParams.flicker);
    gl.uniform1f(this.uniforms.rgbOffset, this.crtParams.rgbOffset);
    gl.uniform1f(this.uniforms.staticNoise, this.crtParams.staticNoise);
    gl.uniform1f(this.uniforms.jitter, this.crtParams.jitter);
    gl.uniform1f(this.uniforms.horizontalSync, this.crtParams.horizontalSync);
    gl.uniform1f(this.uniforms.glowingLine, this.crtParams.glowingLine);
    gl.uniform1f(this.uniforms.ambientLight, this.crtParams.ambientLight);
    gl.uniform1f(this.uniforms.burnIn, this.crtParams.burnIn);
    gl.uniform1f(this.uniforms.overscan, this.crtParams.overscan);
    gl.uniform1f(this.uniforms.noSignal, this.crtParams.noSignal);
    gl.uniform1f(this.uniforms.cornerRadius, this.crtParams.cornerRadius);
    gl.uniform1f(this.uniforms.screenMargin, this.crtParams.screenMargin);

    // Draw main CRT pass
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Second pass: edge overlay
    if (this.crtParams.edgeHighlight > 0.001) {
      gl.useProgram(this.edgeProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.edgePositionLoc);
      gl.vertexAttribPointer(this.edgePositionLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(this.edgeTexCoordLoc);
      gl.vertexAttribPointer(this.edgeTexCoordLoc, 2, gl.FLOAT, false, 16, 8);

      gl.uniform1f(this.edgeUniforms.curvature, this.crtParams.curvature);
      gl.uniform1f(this.edgeUniforms.cornerRadius, this.crtParams.cornerRadius);
      gl.uniform1f(this.edgeUniforms.edgeHighlight, this.crtParams.edgeHighlight);
      gl.uniform2f(this.edgeUniforms.textureSize, this.width, this.height);
      gl.uniform2f(this.edgeUniforms.resolution, this.canvas.width, this.canvas.height);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  // Set individual CRT parameter
  setParam(name, value) {
    if (name in this.crtParams) {
      this.crtParams[name] = value;
    }
  }

  // Set multiple CRT parameters at once
  setParams(params) {
    for (const [name, value] of Object.entries(params)) {
      if (name in this.crtParams) {
        this.crtParams[name] = value;
      }
    }
  }

  // Set texture filtering mode
  setNearestFilter(enabled) {
    const gl = this.gl;
    if (!gl) return;
    this.useNearestFilter = enabled;

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (enabled) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
  }

  setNoSignal(enabled) {
    this.crtParams.noSignal = enabled ? 1.0 : 0.0;
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this._pendingWidth = Math.floor(width * dpr);
    this._pendingHeight = Math.floor(height * dpr);
  }

  async loadShader(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${path}`);
    }
    return response.text();
  }
}
