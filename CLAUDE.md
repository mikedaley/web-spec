# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZX Spectrum Browser Based Emulator - A ZX Spectrum emulator running in the browser using WebAssembly (C++ backend) and WebGL rendering. No JavaScript frameworks; vanilla ES6 modules with Vite for bundling. Architecture mirrors the web-a2e Apple //e emulator.

## Build Commands

```bash
npm install           # Install dependencies
npm run build:wasm    # Build WASM module (required first time and after C++ changes)
npm run dev           # Start dev server at localhost:3000 (hot-reload for JS only)
npm run build         # Full production build (WASM + Vite bundle)
npm run clean         # Clean build artifacts
npm run deploy        # Deploy to VPS via rsync
```

## Testing

### Z80 CPU Tests

```bash
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```

## Architecture

### Two-Layer Design

**C++ Core** - Pure emulation logic compiled to WebAssembly:

- `src/core/z80/` - Z80 CPU (3.5MHz, ported from SpectREMCPP) with 7 opcode tables
- `src/core/palette.hpp` - Colour palette definitions
- `src/machines/` - Machine-level emulation (audio, display, ULA contention, tape, loaders)
- `src/machines/zx_spectrum.cpp` - Core coordinator
- `src/machines/zx48k/` - ZX Spectrum 48K-specific configuration

**JavaScript Layer (src/js/)** - Browser integration:

- `main.js` - ZXSpectrumEmulator class orchestrating all subsystems
- `emulator-proxy.js` / `emulator-worker.js` - Web Worker proxy for off-thread emulation
- `audio/` - Web Audio API driver and AudioWorklet
- `display/` - WebGL renderer
- `input/` - Keyboard input
- `tape/` - Tape deck UI and IndexedDB persistence
- `snapshot/` - Snapshot load/save UI
- `debug/` - Debug windows (CPU state, sound waveform, etc.)
- `windows/` - Windowing system for debug panels
- `utils/` - Shared utilities

### Key Constants (src/core/types.hpp)

- CPU: 3.5MHz clock (3,500,000 Hz)
- Frame: 69,888 T-states per frame (50Hz)
- Audio: 48kHz sample rate
- Screen: 256x192 pixels (display area), 320x256 including border (32px border on each side)

### WASM Interface Pattern

Single global `Emulator` instance in C++ (`wasm_interface.cpp`). JS allocates WASM heap with `_malloc`/`_free`. New WASM exports must be added to `CMakeLists.txt` EXPORTED_FUNCTIONS list.

## Development Workflow

**C++ changes** require rebuilding WASM: `npm run build:wasm`

**JavaScript changes** auto-reload via Vite dev server

**Full build** for production: `npm run build` (outputs to `dist/`)

**ROM files** are embedded into WASM at compile time. Place in `roms/` directory before building:

- `48.rom` (16KB ZX Spectrum 48K ROM)
- `128-0.rom` (16KB ZX Spectrum 128K ROM 0)
- `128-1.rom` (16KB ZX Spectrum 128K ROM 1)

## Code Organization

```
src/
├── core/               # Shared C++ types and CPU (namespace zxspec::)
│   ├── z80/            # Z80 CPU
│   └── palette.hpp     # Colour palette
├── machines/           # Machine-level C++ emulation
│   ├── zx_spectrum.cpp # Core coordinator
│   ├── audio.cpp       # Beeper audio generation
│   ├── display.cpp     # ULA display / framebuffer generation
│   ├── contention.cpp  # ULA contention timing
│   ├── loaders/        # Snapshot loaders (SNA, Z80)
│   └── zx48k/          # 48K-specific config
├── bindings/           # wasm_interface.cpp - WASM export glue
└── js/                 # ES6 modules, no framework
    ├── main.js         # Entry point, ZXSpectrumEmulator class
    ├── emulator-proxy.js  # Web Worker proxy
    ├── emulator-worker.js # Emulation Web Worker
    ├── audio/          # Web Audio API driver and worklet
    ├── display/        # WebGL renderer
    ├── input/          # Keyboard input
    ├── tape/           # Tape deck UI and persistence
    ├── snapshot/       # Snapshot load/save UI
    ├── debug/          # Debug windows
    ├── windows/        # Windowing system for panels
    ├── utils/          # Shared utilities
    ├── ui/             # Theme manager and UI utilities
    └── css/            # Stylesheets
public/                 # Static assets, built WASM files
tests/
└── z80/                # Z80 CPU tests
```

### File Naming Convention

All JavaScript files use **kebab-case** (e.g., `audio-driver.js`). C++ files use **snake_case** (e.g., `z80_opcodes_main.cpp`). Class names remain PascalCase in the code.

## Theme System (Light/Dark Mode)

The project uses a CSS custom property theme system with three modes: **dark** (default), **light**, and **system** (follows OS preference). This mirrors the web-a2e implementation.

### Key files

- `src/js/ui/theme-manager.js` - `ThemeManager` class: persists preference to localStorage (`zxspec-theme`), sets `data-theme` attribute on `<html>`, listens for OS `prefers-color-scheme` changes
- `src/js/css/base.css` - `:root` defines dark theme variables; `html[data-theme="light"]` overrides all variables for light mode
- `public/index.html` - Theme selector buttons (sun/moon/monitor icons) in the View menu

### Sinclair Spectrum Accent Palette

All accent and highlight colours **must** come from the ZX Spectrum hardware palette defined in `src/core/palette.hpp`. Never use arbitrary or generic accent colours.

| Token | Dark theme (bright) | Light theme (normal) | Spectrum colour |
|---|---|---|---|
| `--accent-blue` | `#00FFFF` | `#0000CD` | Cyan / Blue |
| `--accent-green` | `#00FF00` | `#00CD00` | Green |
| `--accent-red` | `#FF0000` | `#CD0000` | Red |
| `--accent-purple` | `#FF00FF` | `#CD00CD` | Magenta |
| `--accent-orange` | `#FFFF00` | `#8B8B00` | Yellow (darkened for light-bg legibility) |

Dark theme uses the **bright** Spectrum colours (high contrast on dark backgrounds). Light theme uses the **normal** Spectrum colours (legible on white). If a new accent is needed, it must map to one of the 8 Spectrum hardware colours.

### Rules for all new CSS

- **Never use hard-coded colors.** Always reference CSS custom properties from `:root` (e.g., `var(--bg-primary)`, `var(--text-secondary)`, `var(--accent-blue)`).
- **Accent colours must be Sinclair Spectrum palette colours** — never use arbitrary hues. See the table above.
- When adding new CSS variables, define them in **both** the `:root` (dark) and `html[data-theme="light"]` blocks in `base.css`.
- Use the existing token categories: `--bg-*`, `--text-*`, `--accent-*-bg`, `--accent-*-border`, `--glass-*`, `--overlay-*`, `--input-*`, `--control-*`, `--shadow-*`.
- Test UI in both themes before considering CSS work complete.

## Window System

All windows extend `BaseWindow` (`src/js/windows/base-window.js`) and are managed by `WindowManager` (`src/js/windows/window-manager.js`), which persists state to localStorage.

### Rules for all windows

- **Every window must save and restore its full state.** `BaseWindow.getState()` persists position, size, visibility, and zIndex automatically. If a window has additional state (e.g., viewport lock, mute toggles, selected tabs), override `getState()` and `restoreState()` to include it.
- **All windows must be registered with the window manager before `loadState()` is called** in `main.js`. If a window is registered after `loadState()`, its saved state will not be restored on page load.
- Include new windows in the `applyDefaultLayout` array in `main.js` so they have sensible defaults for first-time users.

## Git Commits

Do not add `Co-Authored-By` or any other attribution lines for Claude in commit messages.
