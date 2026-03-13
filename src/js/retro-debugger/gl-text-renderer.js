/*
 * gl-text-renderer.js - WebGL bitmap font and quad renderer
 *
 * Renders text via a canvas-generated font atlas and coloured rectangles
 * in a single batched draw call per category. Designed for the retro
 * debugger overlay.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// ── Font atlas layout ────────────────────────────────────────────
const ATLAS_COLS = 16;
const ATLAS_ROWS = 8;

// ── ZX Spectrum ROM font (8x8 bitmap, 96 chars: ASCII 32-127) ───
// Extracted from 48K ROM at offset 0x3D00.
// prettier-ignore
const ZX_FONT_DATA = new Uint8Array([
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, // 32 ' '
  0x00,0x10,0x10,0x10,0x10,0x00,0x10,0x00, // 33 '!'
  0x00,0x24,0x24,0x00,0x00,0x00,0x00,0x00, // 34 '"'
  0x00,0x24,0x7E,0x24,0x24,0x7E,0x24,0x00, // 35 '#'
  0x00,0x08,0x3E,0x28,0x3E,0x0A,0x3E,0x08, // 36 '$'
  0x00,0x62,0x64,0x08,0x10,0x26,0x46,0x00, // 37 '%'
  0x00,0x10,0x28,0x10,0x2A,0x44,0x3A,0x00, // 38 '&'
  0x00,0x08,0x10,0x00,0x00,0x00,0x00,0x00, // 39 "'"
  0x00,0x04,0x08,0x08,0x08,0x08,0x04,0x00, // 40 '('
  0x00,0x20,0x10,0x10,0x10,0x10,0x20,0x00, // 41 ')'
  0x00,0x00,0x14,0x08,0x3E,0x08,0x14,0x00, // 42 '*'
  0x00,0x00,0x08,0x08,0x3E,0x08,0x08,0x00, // 43 '+'
  0x00,0x00,0x00,0x00,0x00,0x08,0x08,0x10, // 44 ','
  0x00,0x00,0x00,0x00,0x3E,0x00,0x00,0x00, // 45 '-'
  0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00, // 46 '.'
  0x00,0x00,0x02,0x04,0x08,0x10,0x20,0x00, // 47 '/'
  0x00,0x3C,0x46,0x4A,0x52,0x62,0x3C,0x00, // 48 '0'
  0x00,0x18,0x28,0x08,0x08,0x08,0x3E,0x00, // 49 '1'
  0x00,0x3C,0x42,0x02,0x3C,0x40,0x7E,0x00, // 50 '2'
  0x00,0x3C,0x42,0x0C,0x02,0x42,0x3C,0x00, // 51 '3'
  0x00,0x08,0x18,0x28,0x48,0x7E,0x08,0x00, // 52 '4'
  0x00,0x7E,0x40,0x7C,0x02,0x42,0x3C,0x00, // 53 '5'
  0x00,0x3C,0x40,0x7C,0x42,0x42,0x3C,0x00, // 54 '6'
  0x00,0x7E,0x02,0x04,0x08,0x10,0x10,0x00, // 55 '7'
  0x00,0x3C,0x42,0x3C,0x42,0x42,0x3C,0x00, // 56 '8'
  0x00,0x3C,0x42,0x42,0x3E,0x02,0x3C,0x00, // 57 '9'
  0x00,0x00,0x00,0x10,0x00,0x00,0x10,0x00, // 58 ':'
  0x00,0x00,0x10,0x00,0x00,0x10,0x10,0x20, // 59 ';'
  0x00,0x00,0x04,0x08,0x10,0x08,0x04,0x00, // 60 '<'
  0x00,0x00,0x00,0x3E,0x00,0x3E,0x00,0x00, // 61 '='
  0x00,0x00,0x10,0x08,0x04,0x08,0x10,0x00, // 62 '>'
  0x00,0x3C,0x42,0x04,0x08,0x00,0x08,0x00, // 63 '?'
  0x00,0x3C,0x4A,0x56,0x5E,0x40,0x3C,0x00, // 64 '@'
  0x00,0x3C,0x42,0x42,0x7E,0x42,0x42,0x00, // 65 'A'
  0x00,0x7C,0x42,0x7C,0x42,0x42,0x7C,0x00, // 66 'B'
  0x00,0x3C,0x42,0x40,0x40,0x42,0x3C,0x00, // 67 'C'
  0x00,0x78,0x44,0x42,0x42,0x44,0x78,0x00, // 68 'D'
  0x00,0x7E,0x40,0x7C,0x40,0x40,0x7E,0x00, // 69 'E'
  0x00,0x7E,0x40,0x7C,0x40,0x40,0x40,0x00, // 70 'F'
  0x00,0x3C,0x42,0x40,0x4E,0x42,0x3C,0x00, // 71 'G'
  0x00,0x42,0x42,0x7E,0x42,0x42,0x42,0x00, // 72 'H'
  0x00,0x3E,0x08,0x08,0x08,0x08,0x3E,0x00, // 73 'I'
  0x00,0x02,0x02,0x02,0x42,0x42,0x3C,0x00, // 74 'J'
  0x00,0x44,0x48,0x70,0x48,0x44,0x42,0x00, // 75 'K'
  0x00,0x40,0x40,0x40,0x40,0x40,0x7E,0x00, // 76 'L'
  0x00,0x42,0x66,0x5A,0x42,0x42,0x42,0x00, // 77 'M'
  0x00,0x42,0x62,0x52,0x4A,0x46,0x42,0x00, // 78 'N'
  0x00,0x3C,0x42,0x42,0x42,0x42,0x3C,0x00, // 79 'O'
  0x00,0x7C,0x42,0x42,0x7C,0x40,0x40,0x00, // 80 'P'
  0x00,0x3C,0x42,0x42,0x52,0x4A,0x3C,0x00, // 81 'Q'
  0x00,0x7C,0x42,0x42,0x7C,0x44,0x42,0x00, // 82 'R'
  0x00,0x3C,0x40,0x3C,0x02,0x42,0x3C,0x00, // 83 'S'
  0x00,0xFE,0x10,0x10,0x10,0x10,0x10,0x00, // 84 'T'
  0x00,0x42,0x42,0x42,0x42,0x42,0x3C,0x00, // 85 'U'
  0x00,0x42,0x42,0x42,0x42,0x24,0x18,0x00, // 86 'V'
  0x00,0x42,0x42,0x42,0x42,0x5A,0x24,0x00, // 87 'W'
  0x00,0x42,0x24,0x18,0x18,0x24,0x42,0x00, // 88 'X'
  0x00,0x82,0x44,0x28,0x10,0x10,0x10,0x00, // 89 'Y'
  0x00,0x7E,0x04,0x08,0x10,0x20,0x7E,0x00, // 90 'Z'
  0x00,0x0E,0x08,0x08,0x08,0x08,0x0E,0x00, // 91 '['
  0x00,0x00,0x40,0x20,0x10,0x08,0x04,0x00, // 92 '\\'
  0x00,0x70,0x10,0x10,0x10,0x10,0x70,0x00, // 93 ']'
  0x00,0x10,0x38,0x54,0x10,0x10,0x10,0x00, // 94 '^'
  0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xFF, // 95 '_'
  0x00,0x1C,0x22,0x78,0x20,0x20,0x7E,0x00, // 96 '`'
  0x00,0x00,0x38,0x04,0x3C,0x44,0x3C,0x00, // 97 'a'
  0x00,0x20,0x20,0x3C,0x22,0x22,0x3C,0x00, // 98 'b'
  0x00,0x00,0x1C,0x20,0x20,0x20,0x1C,0x00, // 99 'c'
  0x00,0x04,0x04,0x3C,0x44,0x44,0x3C,0x00, // 100 'd'
  0x00,0x00,0x38,0x44,0x78,0x40,0x3C,0x00, // 101 'e'
  0x00,0x0C,0x10,0x18,0x10,0x10,0x10,0x00, // 102 'f'
  0x00,0x00,0x3C,0x44,0x44,0x3C,0x04,0x38, // 103 'g'
  0x00,0x40,0x40,0x78,0x44,0x44,0x44,0x00, // 104 'h'
  0x00,0x10,0x00,0x30,0x10,0x10,0x38,0x00, // 105 'i'
  0x00,0x04,0x00,0x04,0x04,0x04,0x24,0x18, // 106 'j'
  0x00,0x20,0x28,0x30,0x30,0x28,0x24,0x00, // 107 'k'
  0x00,0x10,0x10,0x10,0x10,0x10,0x0C,0x00, // 108 'l'
  0x00,0x00,0x68,0x54,0x54,0x54,0x54,0x00, // 109 'm'
  0x00,0x00,0x78,0x44,0x44,0x44,0x44,0x00, // 110 'n'
  0x00,0x00,0x38,0x44,0x44,0x44,0x38,0x00, // 111 'o'
  0x00,0x00,0x78,0x44,0x44,0x78,0x40,0x40, // 112 'p'
  0x00,0x00,0x3C,0x44,0x44,0x3C,0x04,0x06, // 113 'q'
  0x00,0x00,0x1C,0x20,0x20,0x20,0x20,0x00, // 114 'r'
  0x00,0x00,0x38,0x40,0x38,0x04,0x78,0x00, // 115 's'
  0x00,0x10,0x38,0x10,0x10,0x10,0x0C,0x00, // 116 't'
  0x00,0x00,0x44,0x44,0x44,0x44,0x38,0x00, // 117 'u'
  0x00,0x00,0x44,0x44,0x28,0x28,0x10,0x00, // 118 'v'
  0x00,0x00,0x44,0x54,0x54,0x54,0x28,0x00, // 119 'w'
  0x00,0x00,0x44,0x28,0x10,0x28,0x44,0x00, // 120 'x'
  0x00,0x00,0x44,0x44,0x44,0x3C,0x04,0x38, // 121 'y'
  0x00,0x00,0x7C,0x08,0x10,0x20,0x7C,0x00, // 122 'z'
  0x00,0x0E,0x08,0x30,0x08,0x08,0x0E,0x00, // 123 '{'
  0x00,0x08,0x08,0x08,0x08,0x08,0x08,0x00, // 124 '|'
  0x00,0x70,0x10,0x0C,0x10,0x10,0x70,0x00, // 125 '}'
  0x00,0x14,0x28,0x00,0x00,0x00,0x00,0x00, // 126 '~'
  0x3C,0x42,0x99,0xA1,0xA1,0x99,0x42,0x3C, // 127 (c)
]);

// Max quads per batch (rects + glyphs combined)
const MAX_QUADS = 20000;
const FLOATS_PER_VERT = 8; // x, y, u, v, r, g, b, a
const VERTS_PER_QUAD = 6;
const FLOATS_PER_QUAD = VERTS_PER_QUAD * FLOATS_PER_VERT;

// ── Shader sources (inline to avoid async fetch) ─────────────────

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const FRAG_TEXT_SRC = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  float a = max(s.r, max(s.g, s.b));
  if (a < 0.1) discard;
  gl_FragColor = vec4(v_color.rgb, v_color.a * a);
}
`;

const FRAG_SOLID_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  gl_FragColor = v_color;
}
`;

const FRAG_IMAGE_SRC = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_tex, v_uv);
}
`;

export class GLTextRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.charW = 0;
    this.charH = 0;
    this._atlasCellW = 0;
    this._atlasCellH = 0;

    // Programs
    this._textProg = null;
    this._solidProg = null;
    this._imageProg = null;

    // Font atlas texture
    this._fontTex = null;

    // Unified draw-command list — primitives are flushed in submission order
    // so that each window's rects and text interleave correctly.
    this._vertexData = new Float32Array(MAX_QUADS * FLOATS_PER_QUAD);
    this._quadCount = 0;
    // Each command: { type: "solid"|"text"|"image", start, count, texture? }
    this._drawCmds = [];
    this._currentType = null; // type of the current batch being built

    // GL buffers
    this._vbo = null;
    this._imageVBO = null;
  }

  async init() {
    const gl = this.canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL not available for retro debugger");
    this.gl = gl;

    // Compile programs
    this._solidProg = this._createProgram(VERT_SRC, FRAG_SOLID_SRC);
    this._textProg = this._createProgram(VERT_SRC, FRAG_TEXT_SRC);
    this._imageProg = this._createProgram(VERT_SRC, FRAG_IMAGE_SRC);

    // Cache uniform/attribute locations
    this._cacheLocations(this._solidProg, "solid");
    this._cacheLocations(this._textProg, "text");
    this._cacheLocations(this._imageProg, "image");

    // Create VBOs
    this._vbo = gl.createBuffer();
    this._imageVBO = gl.createBuffer();

    // Font atlas created lazily on first setCellSize()
    this._fontTex = null;

    // Blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Call at the start of each frame to set viewport size and clear.
   */
  beginFrame(width, height) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this._quadCount = 0;
    this._drawCmds = [];
    this._currentType = null;
  }

  /**
   * Set the character cell size for text rendering.
   * Regenerates the font atlas when the cell size changes so glyphs
   * are rendered at native resolution.
   */
  setCellSize(charW, charH) {
    this.charW = charW;
    this.charH = charH;

    if (charW !== this._atlasCellW || charH !== this._atlasCellH) {
      this._atlasCellW = charW;
      this._atlasCellH = charH;
      this._rebuildFontAtlas();
    }
  }

  /**
   * Push a quad into the unified vertex buffer under the given draw type.
   * Consecutive quads of the same type are batched into one draw command.
   */
  _pushQuad(type, verts) {
    if (this._quadCount >= MAX_QUADS) return;
    const o = this._quadCount * FLOATS_PER_QUAD;
    this._vertexData.set(verts, o);
    this._quadCount++;

    if (this._currentType === type) {
      // Extend current batch
      this._drawCmds[this._drawCmds.length - 1].count++;
    } else {
      // Start a new batch
      this._currentType = type;
      this._drawCmds.push({ type, start: this._quadCount - 1, count: 1 });
    }
  }

  /**
   * Add a filled rectangle to the draw list.
   */
  fillRect(x, y, w, h, r, g, b, a = 1) {
    const x2 = x + w, y2 = y + h;
    this._pushQuad("solid", [
      x, y, 0, 0, r, g, b, a,
      x2, y, 0, 0, r, g, b, a,
      x2, y2, 0, 0, r, g, b, a,
      x, y, 0, 0, r, g, b, a,
      x2, y2, 0, 0, r, g, b, a,
      x, y2, 0, 0, r, g, b, a,
    ]);
  }

  /**
   * Add a single character glyph to the draw list.
   */
  drawChar(x, y, charCode, r, g, b, a = 1) {
    if (charCode < 32 || charCode > 127) charCode = 46; // '.'

    const idx = charCode;
    const col = idx % ATLAS_COLS;
    const row = Math.floor(idx / ATLAS_COLS);
    const u0 = col / ATLAS_COLS;
    const v0 = row / ATLAS_ROWS;
    const u1 = (col + 1) / ATLAS_COLS;
    const v1 = (row + 1) / ATLAS_ROWS;

    const x2 = x + this.charW;
    const y2 = y + this.charH;

    this._pushQuad("text", [
      x, y, u0, v0, r, g, b, a,
      x2, y, u1, v0, r, g, b, a,
      x2, y2, u1, v1, r, g, b, a,
      x, y, u0, v0, r, g, b, a,
      x2, y2, u1, v1, r, g, b, a,
      x, y2, u0, v1, r, g, b, a,
    ]);
  }

  /**
   * Add a string of text at character-grid position (col, row).
   */
  drawText(col, row, text, r, g, b, a = 1) {
    const x0 = col * this.charW;
    const y0 = row * this.charH;
    for (let i = 0; i < text.length; i++) {
      this.drawChar(x0 + i * this.charW, y0, text.charCodeAt(i), r, g, b, a);
    }
  }

  /**
   * Add a string of text at pixel position.
   */
  drawTextPx(x, y, text, r, g, b, a = 1) {
    for (let i = 0; i < text.length; i++) {
      this.drawChar(x + i * this.charW, y, text.charCodeAt(i), r, g, b, a);
    }
  }

  /**
   * Add a filled rectangle at character-grid position.
   */
  fillRectGrid(col, row, cols, rows, r, g, b, a = 1) {
    this.fillRect(
      col * this.charW, row * this.charH,
      cols * this.charW, rows * this.charH,
      r, g, b, a
    );
  }

  /**
   * Add a textured image quad (for screen preview, heatmap, etc.)
   * Image quads break the current batch since they use their own texture.
   */
  drawImage(texture, x, y, w, h) {
    if (this._quadCount >= MAX_QUADS) return;
    const x2 = x + w, y2 = y + h;
    const o = this._quadCount * FLOATS_PER_QUAD;
    this._vertexData.set([
      x, y, 0, 0, 1, 1, 1, 1,
      x2, y, 1, 0, 1, 1, 1, 1,
      x2, y2, 1, 1, 1, 1, 1, 1,
      x, y, 0, 0, 1, 1, 1, 1,
      x2, y2, 1, 1, 1, 1, 1, 1,
      x, y2, 0, 1, 1, 1, 1, 1,
    ], o);
    this._quadCount++;

    // Always a new command (unique texture)
    this._currentType = null;
    this._drawCmds.push({ type: "image", start: this._quadCount - 1, count: 1, texture });
  }

  /**
   * Create a WebGL texture for image data.
   */
  createDataTexture(width, height) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /**
   * Update a data texture with new pixel data.
   */
  updateDataTexture(tex, data, width, height) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height,
      gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /**
   * Flush all draw commands to the screen in submission order.
   * This ensures each window's rects and text are interleaved correctly
   * so that text appears on the same layer as its parent window.
   */
  flush() {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this._drawCmds.length === 0) return;

    // Upload the entire vertex buffer once
    gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
    gl.bufferData(gl.ARRAY_BUFFER,
      this._vertexData.subarray(0, this._quadCount * FLOATS_PER_QUAD),
      gl.DYNAMIC_DRAW);

    let lastProg = null;

    for (const cmd of this._drawCmds) {
      let prog;

      if (cmd.type === "solid") {
        prog = this._solidProg;
      } else if (cmd.type === "text") {
        prog = this._textProg;
      } else {
        prog = this._imageProg;
      }

      if (prog !== lastProg) {
        gl.useProgram(prog.program);
        gl.uniform2f(prog.u_resolution, w, h);

        // Re-bind VBO and set up attribs when switching programs
        gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
        this._setupAttribs(prog);
        lastProg = prog;
      }

      // Bind textures as needed
      if (cmd.type === "text") {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._fontTex);
        gl.uniform1i(prog.u_tex, 0);
      } else if (cmd.type === "image") {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cmd.texture);
        gl.uniform1i(prog.u_tex, 0);
      }

      const firstVert = cmd.start * VERTS_PER_QUAD;
      const vertCount = cmd.count * VERTS_PER_QUAD;
      gl.drawArrays(gl.TRIANGLES, firstVert, vertCount);
    }
  }

  destroy() {
    const gl = this.gl;
    if (!gl) return;
    if (this._fontTex) gl.deleteTexture(this._fontTex);
    if (this._vbo) gl.deleteBuffer(this._vbo);
    if (this._imageVBO) gl.deleteBuffer(this._imageVBO);
    // Delete programs
    for (const prog of [this._solidProg, this._textProg, this._imageProg]) {
      if (prog) gl.deleteProgram(prog.program);
    }
  }

  // ── Private ────────────────────────────────────────────────────

  _rebuildFontAtlas() {
    const gl = this.gl;
    if (!gl || this._atlasCellW === 0 || this._atlasCellH === 0) return;

    if (this._fontTex) {
      gl.deleteTexture(this._fontTex);
    }

    const atlasCanvas = this._generateFontAtlas();
    this._fontTex = this._createTexture(atlasCanvas);
  }

  _generateFontAtlas() {
    const cellW = this._atlasCellW;
    const cellH = this._atlasCellH;
    const atlasW = ATLAS_COLS * cellW;
    const atlasH = ATLAS_ROWS * cellH;

    // Pixel scale: how many screen pixels per font pixel
    const pxW = Math.floor(cellW / 8);
    const pxH = Math.floor(cellH / 8);
    // Offset to centre the glyph in the cell
    const offX = Math.floor((cellW - pxW * 8) / 2);
    const offY = Math.floor((cellH - pxH * 8) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = atlasW;
    canvas.height = atlasH;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, atlasW, atlasH);
    ctx.fillStyle = "#fff";

    // Render each character by painting scaled pixels from the bitmap data
    for (let code = 0; code < 128; code++) {
      const fontIdx = code - 32; // ZX_FONT_DATA starts at ASCII 32
      if (fontIdx < 0 || fontIdx >= 96) continue;

      const col = code % ATLAS_COLS;
      const row = Math.floor(code / ATLAS_COLS);
      const cx = col * cellW + offX;
      const cy = row * cellH + offY;

      for (let py = 0; py < 8; py++) {
        const byte = ZX_FONT_DATA[fontIdx * 8 + py];
        if (byte === 0) continue;
        for (let px = 0; px < 8; px++) {
          if (byte & (0x80 >> px)) {
            ctx.fillRect(cx + px * pxW, cy + py * pxH, pxW, pxH);
          }
        }
      }
    }

    return canvas;
  }

  _createTexture(source) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  _createProgram(vertSrc, fragSrc) {
    const gl = this.gl;
    const vs = this._compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Program link failed: " + gl.getProgramInfoLog(program));
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    return { program };
  }

  _cacheLocations(prog, name) {
    const gl = this.gl;
    const p = prog.program;
    prog.a_pos = gl.getAttribLocation(p, "a_pos");
    prog.a_uv = gl.getAttribLocation(p, "a_uv");
    prog.a_color = gl.getAttribLocation(p, "a_color");
    prog.u_resolution = gl.getUniformLocation(p, "u_resolution");
    prog.u_tex = gl.getUniformLocation(p, "u_tex");
  }

  _setupAttribs(prog) {
    const gl = this.gl;
    const stride = FLOATS_PER_VERT * 4;

    if (prog.a_pos >= 0) {
      gl.enableVertexAttribArray(prog.a_pos);
      gl.vertexAttribPointer(prog.a_pos, 2, gl.FLOAT, false, stride, 0);
    }
    if (prog.a_uv >= 0) {
      gl.enableVertexAttribArray(prog.a_uv);
      gl.vertexAttribPointer(prog.a_uv, 2, gl.FLOAT, false, stride, 8);
    }
    if (prog.a_color >= 0) {
      gl.enableVertexAttribArray(prog.a_color);
      gl.vertexAttribPointer(prog.a_color, 4, gl.FLOAT, false, stride, 16);
    }
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile failed: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  }
}
