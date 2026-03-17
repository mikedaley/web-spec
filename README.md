# SpectrEM Web

A ZX Spectrum emulator running in the browser, built with C++/WebAssembly and vanilla JavaScript. Features full Z80 CPU emulation, ULA display with contention timing, AY-3-8912 sound chip, multiple machine models, disk and tape support, Sinclair BASIC editor, networking, and a comprehensive suite of debug tools — all rendered with WebGL.

## Features

### Machines
- **ZX Spectrum 48K** — Issue 2 and Issue 3 motherboard variants
- **ZX Spectrum 128K** — full paged memory with bank switching (port 0x7FFD)
- **ZX Spectrum +2** — 128K-compatible
- **ZX Spectrum +2A / +3** — extended paging (port 0x1FFD), µPD765A floppy disk controller
- **ZX81** — basic ZX81 emulation

### Emulation Core
- **Z80 CPU** at 3.5MHz with full instruction set (7 opcode tables: main, CB, DD, ED, FD, DD+CB, FD+CB)
- **ULA display** with accurate contention timing, 256x192 display area with configurable border (up to 48px)
- **Beeper audio** synthesis at 48kHz
- **AY-3-8912** sound chip with 3 tone channels, noise, and envelope generation (toggleable on 48K)
- **SpecDrum** DAC peripheral emulation
- **Keyboard** input mapped to the Spectrum matrix with configurable Caps Shift and Symbol Shift bindings
- **Joystick** support — Kempston, Sinclair 1/2, Cursor, and Gamepad API with configurable mappings
- **50Hz frame-accurate** timing (69,888 T-states for 48K, 70,908 for 128K)
- **Speed control** — 1x–5x emulation speed

### Storage
- **Snapshot loading** — SNA and Z80 formats with auto machine detection
- **Tape support** — TAP and TZX formats with instant load or real-time playback, transport controls, block browser, metadata display, and tape recording (SAVE to TAP)
- **Disk support** — µPD765A FDC for +2A/+3 (DSK format), Opus Discovery with WD1770 FDC (OPD format), QuickDOS ROM option
- **Save states** — Z80 v3 format, auto-save, and 10 manual slots with editable names
- **Drag-and-drop** file loading for snapshots, tapes, and disk images

### Networking
- **Spectranet** Ethernet interface — W5100 TCP/UDP sockets bridged to WebSockets via a configurable proxy, AM29F010 128KB flash with full programming/erase emulation, hardware trap mechanism, persistent flash storage, and TNFS file browser

### Debug Tools
- **CPU Debugger** — Z80 register display, flags, disassembly with syntax colouring, breakpoints (address, beam position, conditional), single-step, step-over, step-out
- **Retro Debugger** — dockable tab-based debugger with JetBrains Mono font
- **Stack Viewer** — real-time stack memory display with return address tracking
- **CPU Trace** — instruction trace window with virtual scrolling
- **Sound Monitor** — beeper and AY waveform visualisation, channel frequencies, envelope shapes, per-channel muting
- **BASIC Editor** — Sinclair BASIC editor with syntax highlighting, variable inspector with type grouping, line-level breakpoints, step/trace modes, program read/write, open/save .bas files, auto-formatting, auto-renumber
- **Memory Map** — visual memory layout for all machine types
- **Memory Heatmap** — read/write access tracking with configurable fade speed
- **UDG Editor** — interactive pixel grid with BASIC code generation
- **Font Editor** — custom 96-character font designer with live keyboard preview
- **Disk Drive** — spinning disk surface visualisation, FDC internals panel, Drive A/B switching
- **Assembler** — Z80 assembler window
- **Joystick Config** — gamepad mapping and configuration
- **Display Settings** — overscan, shader effects, CRT bezel controls
- **Release Notes** — in-app project history grouped by week

### UI
- **WebGL renderer** with shader effects (CRT curvature, scanlines, phosphor, composite video decode, bezel reflections)
- **PAL composite video** signal buffer with GPU decode
- **Windowing system** — draggable, resizable debug panels with full state persistence and z-index stacking
- **Theme system** — dark, light, and system modes using ZX Spectrum hardware palette accent colours
- **Auto-hide header** — header slides away to maximise screen space
- **Mobile support** — responsive layout with virtual keyboard and d-pad overlays
- **PWA** — installable progressive web app with service worker
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
- `plus3-0.rom` — +2A/+3 ROM 0 (16KB, optional)
- `plus3-1.rom` — +2A/+3 ROM 1 (16KB, optional)
- `plus3-2.rom` — +2A/+3 ROM 2 (16KB, optional)
- `plus3-3.rom` — +2A/+3 ROM 3 (16KB, optional)
- `opus.rom` — Opus Discovery ROM (8KB, optional)
- `quickdos.rom` — QuickDOS ROM for Opus (8KB, optional)
- `spectranet.rom` — Spectranet firmware (up to 128KB, optional)

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
│  Z80 CPU, ULA, audio, AY, FDC, tape, BASIC     │
└─────────────────────────────────────────────────┘
```

**C++ Core** — pure emulation logic compiled to WebAssembly via Emscripten:
- `src/core/z80/` — Z80 CPU with 7 opcode tables
- `src/core/debug/` — condition evaluator for breakpoint expressions
- `src/machines/` — machine-level emulation (display, audio, AY, contention, tape, loaders, BASIC)
- `src/machines/fdc/` — µPD765A floppy disk controller and disk image handling
- `src/machines/opus/` — Opus Discovery interface with WD1770 FDC and 6821 PIA
- `src/machines/spectranet/` — Spectranet Ethernet (W5100, flash, paging)
- `src/machines/basic/` — BASIC tokenizer, parser, variables, float codec, writer
- `src/machines/loaders/` — SNA, Z80, TAP, TZX loaders and Z80 saver
- `src/machines/zx48k/` — 48K configuration
- `src/machines/zx128k/` — 128K configuration
- `src/machines/zxplus2/` — +2 configuration
- `src/machines/zxplus2a/` — +2A configuration
- `src/machines/zxplus3/` — +3 configuration
- `src/machines/zx81/` — ZX81 configuration
- `src/bindings/wasm_interface.cpp` — WASM export glue

**JavaScript Layer** — browser integration with no frameworks:
- `src/js/main.js` — `ZXSpectrumEmulator` class orchestrating all subsystems
- `src/js/emulator-proxy.js` / `emulator-worker.js` — Web Worker proxy for off-thread emulation
- `src/js/audio/` — Web Audio API driver and AudioWorklet
- `src/js/display/` — WebGL renderer, screen window, display settings
- `src/js/input/` — keyboard handler, gamepad handler, virtual keyboard/gamepad
- `src/js/tape/` — tape deck UI and IndexedDB persistence
- `src/js/disk/` — disk drive window, surface renderer, disk persistence
- `src/js/snapshot/` — snapshot file loader UI
- `src/js/state/` — save states manager and persistence
- `src/js/assembler/` — Z80 assembler window
- `src/js/spectranet/` — Spectranet networking (WebSocket bridge, persistence)
- `src/js/debug/` — CPU debugger, retro debugger, stack viewer, trace, BASIC editor, memory map/heatmap, UDG/font editors, sound monitor, joystick config, release notes
- `src/js/retro-debugger/` — dockable tab-based retro debugger
- `src/js/windows/` — windowing system (`BaseWindow` + `WindowManager`)
- `src/js/ui/` — theme manager
- `src/js/css/` — stylesheets with CSS custom properties

### Frame Execution Pipeline

```
requestAnimationFrame
  → EmulatorProxy.postMessage()
    → Web Worker: runFrame() (69,888 / 70,908 T-states)
    → WASM: getFramebuffer() → RGBA pixels
    → WASM: getAudioBuffer() → float32 samples
  ← postMessage (framebuffer + audio)
  → WebGL texture upload + draw
  → AudioWorklet queue samples
```

### WASM Interface Pattern

A single global `Machine` instance lives in C++ (`wasm_interface.cpp`). JavaScript allocates WASM heap memory with `_malloc()`/`_free()`. All exports use `EMSCRIPTEN_KEEPALIVE` in an `extern "C"` block. New WASM exports must be added to the `EXPORTED_FUNCTIONS` list in `CMakeLists.txt`.

## Project Structure

```
src/
├── core/                           # Z80 CPU, debug, and shared types
│   ├── z80/                        # Z80 CPU (9 source files)
│   ├── debug/                      # Condition evaluator for breakpoints
│   └── palette.hpp                 # ZX Spectrum colour palette
├── machines/                       # Machine-level emulation
│   ├── zx_spectrum.cpp/.hpp        # Core coordinator (all Spectrum variants)
│   ├── machine.hpp                 # Abstract machine interface
│   ├── machine_info.hpp            # Machine timing constants
│   ├── display.cpp                 # ULA display with contention
│   ├── audio.cpp                   # Beeper synthesis
│   ├── ay.cpp                      # AY-3-8912 sound chip
│   ├── contention.cpp              # ULA memory contention timing
│   ├── loaders/                    # SNA, Z80, TAP, TZX loaders, Z80 saver
│   ├── basic/                      # BASIC tokenizer, parser, variables, writer
│   ├── fdc/                        # µPD765A FDC and disk image handling
│   ├── opus/                       # Opus Discovery (WD1770 FDC, 6821 PIA)
│   ├── spectranet/                 # Spectranet Ethernet (W5100, flash, paging)
│   ├── zx48k/                      # 48K-specific configuration
│   ├── zx128k/                     # 128K-specific configuration
│   ├── zxplus2/                    # +2-specific configuration
│   ├── zxplus2a/                   # +2A-specific configuration
│   ├── zxplus3/                    # +3-specific configuration
│   └── zx81/                       # ZX81-specific configuration
├── bindings/
│   └── wasm_interface.cpp          # WASM export glue
└── js/                             # ES6 modules (no framework)
    ├── main.js                     # Entry point
    ├── emulator-proxy.js           # Main-thread proxy
    ├── emulator-worker.js          # Web Worker with WASM
    ├── config/version.js           # App version constant
    ├── audio/                      # Web Audio driver, worklet, sound window
    ├── display/                    # WebGL renderer, screen window, settings
    ├── input/                      # Keyboard, gamepad, virtual input
    ├── tape/                       # Tape deck UI, IndexedDB persistence
    ├── disk/                       # Disk drive UI, surface renderer, persistence
    ├── snapshot/                   # Snapshot file loader UI
    ├── state/                      # Save states manager, persistence
    ├── assembler/                  # Z80 assembler window
    ├── spectranet/                 # Spectranet networking, persistence
    ├── debug/                      # Debug windows (CPU, BASIC, memory, etc.)
    ├── retro-debugger/             # Dockable tab-based retro debugger
    ├── windows/                    # BaseWindow, WindowManager
    ├── ui/                         # Theme manager
    ├── css/                        # Stylesheets with CSS custom properties
    └── utils/                      # Shared utilities
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

| Constant | 48K | 128K / +2 / +2A / +3 |
|---|---|---|
| CPU clock | 3,500,000 Hz | 3,546,900 Hz |
| Frame length | 69,888 T-states | 70,908 T-states |
| T-states per line | 224 | 228 |
| Frame rate | 50Hz | 50Hz |
| Audio sample rate | 48,000 Hz | 48,000 Hz |
| Display area | 256 x 192 pixels | 256 x 192 pixels |

### File Naming

- JavaScript: **kebab-case** (`audio-driver.js`)
- C++: **snake_case** (`z80_opcodes_main.cpp`)
- Classes: **PascalCase** (`ZXSpectrumEmulator`)

### Theme System

Dark (default), light, and system modes. All accent colours come from the ZX Spectrum hardware palette. CSS custom properties are defined in `src/js/css/base.css` for both themes. Canvas drawing reads colours from `getComputedStyle()` to stay theme-aware.

### Spectranet Emulation

The Spectranet is an Ethernet interface for the ZX Spectrum, emulated here as a toggleable peripheral. It overlays 0x0000-0x3FFF with its own flash ROM, SRAM, and W5100 Ethernet controller when paged in. See the [Spectranet Emulation](https://github.com/mikedaley/web-spec/wiki/Spectranet-Emulation) wiki page for full technical details.

**Key features:**
- **W5100 Ethernet controller** — 4 independent TCP/UDP sockets bridged to browser WebSockets via a configurable proxy server
- **AM29F010 flash** — 128KB flash with full programming and erase state machine; modules can be installed via the standard Spectranet `installer.tap`
- **Hardware traps** — page-in (RST 0, RST 8), page-out (0x007C), CALL traps (0x3FF8-0x3FFF), and programmable NMI trap
- **Persistent storage** — flash memory saved to IndexedDB across sessions; clear via the trash icon button in the Machine menu
- **Debug window** — live paging state, socket status, and network configuration
- **TNFS file browser** — browse and load files from TNFS servers

### Opus Discovery Emulation

The Opus Discovery is a disk interface for the ZX Spectrum, supporting up to two floppy drives.

**Key features:**
- **WD1770 FDC** — full command set emulation with NMI-driven byte transfer
- **6821 PIA** — drive and side selection
- **Memory overlay** — 8KB ROM, 2KB RAM, memory-mapped FDC and PIA registers at 0x0000-0x3FFF
- **ROM paging** — post-fetch page-in/out at hardware-detected addresses (matching Fuse emulator)
- **OPD disk format** — Opus Discovery native disk image format
- **QuickDOS** — alternative ROM option for enhanced disk operations

## License

[MIT](LICENSE)
