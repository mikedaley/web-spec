# SpectrEM Web

A ZX Spectrum emulator running in the browser, built with C++/WebAssembly and vanilla JavaScript. Features a full Z80 CPU emulation, ULA display with contention timing, AY-3-8912 sound chip, tape loading, Sinclair BASIC editor, and a suite of debug tools — all rendered with WebGL.

## Features

### Emulation
- **Z80 CPU** at 3.5MHz with full instruction set (7 opcode tables: main, CB, DD, ED, FD, DD+CB, FD+CB)
- **ULA display** with accurate contention timing, 256x192 display area with 32px border (320x256 total)
- **Beeper audio** synthesis at 48kHz
- **AY-3-8912** sound chip with 3 tone channels, noise, and envelope generation
- **Keyboard** input mapped to the Spectrum 48K matrix
- **Snapshot loading** — SNA and Z80 formats
- **Tape support** — TAP and TZX formats with instant load or real-time playback, transport controls, block browser, metadata display, and tape recording
- **50Hz frame-accurate** timing (69,888 T-states per frame)

### Debug Tools
- **CPU Debugger** — Z80 register display, flags, disassembly, breakpoints, single-step execution, memory inspection
- **Stack Viewer** — real-time stack memory display with return address tracking
- **Sound Monitor** — beeper and AY waveform visualisation, channel frequencies, envelope shapes, per-channel muting
- **BASIC Editor** — Sinclair BASIC editor with syntax highlighting, variable inspector, line-level breakpoints, trace mode, program read/write, open/save .bas files

### UI
- **WebGL renderer** with shader effects (blur, scanlines, phosphor, scaling filters)
- **Windowing system** — draggable, resizable debug panels with full state persistence across sessions
- **Theme system** — dark, light, and system modes using ZX Spectrum hardware palette accent colours
- **No frameworks** — vanilla ES6 modules, direct DOM manipulation, Vite for bundling

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (for WASM builds)
- [CMake](https://cmake.org/) (3.20+)

### ROM Files

Place ROM files in the `roms/` directory before building WASM:
- `48.rom` — ZX Spectrum 48K ROM (16KB, required)
- `128-0.rom` — ZX Spectrum 128K ROM 0 (16KB, optional)
- `128-1.rom` — ZX Spectrum 128K ROM 1 (16KB, optional)

ROM files are embedded into the WASM binary at compile time.

### Build & Run

```bash
npm install           # Install dependencies
npm run build:wasm    # Build WASM module (required first time and after C++ changes)
npm run dev           # Start dev server at localhost:3000 (hot-reload for JS only)
```

### Production Build

```bash
npm run build         # Full production build (WASM + Vite bundle)
npm run deploy        # Deploy to VPS via rsync
```

### Clean

```bash
npm run clean         # Remove build artifacts
```

## Architecture

### Two-Layer Design

```
┌─────────────────────────────────────────────────┐
│  JavaScript (src/js/)                           │
│  WebGL renderer, Web Audio, UI, windows, input  │
├─────────────────────────────────────────────────┤
│  Web Worker + WASM Interface                    │
│  emulator-proxy.js ↔ emulator-worker.js         │
├─────────────────────────────────────────────────┤
│  C++ Core (src/core/, src/machines/)            │
│  Z80 CPU, ULA, audio, AY, tape, BASIC, loaders │
└─────────────────────────────────────────────────┘
```

**C++ Core** — pure emulation logic compiled to WebAssembly via Emscripten:
- `src/core/z80/` — Z80 CPU with 7 opcode tables
- `src/machines/` — machine-level emulation (display, audio, AY, contention, tape, loaders, BASIC)
- `src/bindings/wasm_interface.cpp` — WASM export glue

**JavaScript Layer** — browser integration with no frameworks:
- `src/js/main.js` — `ZXSpectrumEmulator` class orchestrating all subsystems
- `src/js/emulator-proxy.js` / `emulator-worker.js` — Web Worker proxy for off-thread emulation
- `src/js/audio/` — Web Audio API driver and AudioWorklet
- `src/js/display/` — WebGL renderer with shader effects
- `src/js/input/` — keyboard input handler
- `src/js/tape/` — tape deck UI and IndexedDB persistence
- `src/js/debug/` — CPU debugger, stack viewer, BASIC editor
- `src/js/windows/` — windowing system (`BaseWindow` + `WindowManager`)

### Frame Execution Pipeline

```
requestAnimationFrame
  → EmulatorProxy.postMessage()
    → Web Worker: runFrame() (69,888 T-states)
    → WASM: getFramebuffer() → RGBA pixels
    → WASM: getAudioBuffer() → float32 samples
  ← postMessage (framebuffer + audio)
  → WebGL texture upload + draw
  → AudioWorklet queue samples
```

### WASM Interface Pattern

A single global `Emulator` instance lives in C++ (`wasm_interface.cpp`). JavaScript allocates WASM heap memory with `_malloc()`/`_free()`. All exports use `EMSCRIPTEN_KEEPALIVE` in an `extern "C"` block. New WASM exports must be added to the `EXPORTED_FUNCTIONS` list in `CMakeLists.txt`.

## Project Structure

```
src/
├── core/                           # Z80 CPU and shared types
│   ├── z80/                        # Z80 CPU (9 source files)
│   ├── types.hpp                   # Clock speeds, frame timing constants
│   └── palette.hpp                 # ZX Spectrum colour palette
├── machines/                       # Machine-level emulation
│   ├── zx_spectrum.cpp             # Core coordinator
│   ├── display.cpp                 # ULA display with contention
│   ├── audio.cpp                   # Beeper synthesis
│   ├── ay.cpp                      # AY-3-8912 sound chip
│   ├── contention.cpp              # ULA memory contention timing
│   ├── loaders/                    # SNA, Z80, TAP, TZX loaders
│   ├── basic/                      # BASIC tokenizer, parser, variables, writer
│   └── zx48k/                      # 48K-specific configuration
├── bindings/
│   └── wasm_interface.cpp          # WASM export glue
└── js/                             # ES6 modules (no framework)
    ├── main.js                     # Entry point
    ├── emulator-proxy.js           # Main-thread proxy
    ├── emulator-worker.js          # Web Worker with WASM
    ├── config/version.js           # App version constant
    ├── audio/                      # Web Audio driver, worklet, sound window
    ├── display/                    # WebGL renderer, screen window, settings
    ├── input/                      # Keyboard handler
    ├── tape/                       # Tape deck UI, IndexedDB persistence
    ├── snapshot/                   # Snapshot file loader UI
    ├── debug/                      # CPU debugger, stack viewer, BASIC editor
    ├── windows/                    # BaseWindow, WindowManager
    ├── ui/                         # Theme manager
    ├── css/                        # Stylesheets with CSS custom properties
    └── utils/                      # BASIC tokenizer/parser (JS side), IndexedDB
```

## Testing

### Z80 CPU Tests

Native C++ test suite using CMake:

```bash
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```

## Development

**C++ changes** require rebuilding WASM: `npm run build:wasm`

**JavaScript changes** auto-reload via Vite dev server

### Key Constants

| Constant | Value |
|---|---|
| CPU clock | 3,500,000 Hz (3.5MHz) |
| Frame length | 69,888 T-states |
| Frame rate | 50Hz |
| Audio sample rate | 48,000 Hz |
| Display area | 256 x 192 pixels |
| With border | 320 x 256 pixels |
| Border width | 32 pixels each side |

### File Naming

- JavaScript: **kebab-case** (`audio-driver.js`)
- C++: **snake_case** (`z80_opcodes_main.cpp`)
- Classes: **PascalCase** (`ZXSpectrumEmulator`)

### Theme System

Dark (default), light, and system modes. All accent colours come from the ZX Spectrum hardware palette. CSS custom properties are defined in `src/js/css/base.css` for both themes. Canvas drawing reads colours from `getComputedStyle()` to stay theme-aware.

## License

[MIT](LICENSE)
