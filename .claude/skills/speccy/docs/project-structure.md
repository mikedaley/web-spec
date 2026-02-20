# Project Structure

## Repository Layout

```
web-spec/
├── src/
│   ├── core/                           # Shared C++ types and CPU
│   │   ├── z80/                        # Z80 CPU emulation (3.5MHz)
│   │   │   ├── z80.hpp                 # Z80 class definition
│   │   │   ├── z80.cpp                 # Z80 core (fetch/decode/execute)
│   │   │   ├── z80_opcodes_main.cpp    # Main opcode table
│   │   │   ├── z80_opcodes_cb.cpp      # CB-prefixed opcodes (bit ops)
│   │   │   ├── z80_opcodes_dd.cpp      # DD-prefixed opcodes (IX ops)
│   │   │   ├── z80_opcodes_ed.cpp      # ED-prefixed opcodes (extended)
│   │   │   ├── z80_opcodes_fd.cpp      # FD-prefixed opcodes (IY ops)
│   │   │   ├── z80_opcodes_ddcb.cpp    # DD+CB double-prefixed opcodes
│   │   │   ├── z80_opcodes_fdcb.cpp    # FD+CB double-prefixed opcodes
│   │   │   └── z80_opcode_tables.cpp   # Opcode lookup tables
│   │   ├── types.hpp                   # Key constants (clock speeds, frame timing)
│   │   └── palette.hpp                 # ZX Spectrum colour palette definitions
│   │
│   ├── machines/                       # Machine-level emulation
│   │   ├── machine.hpp                 # Abstract machine interface
│   │   ├── zx_spectrum.hpp             # ZXSpectrum base class
│   │   ├── zx_spectrum.cpp             # Core coordinator (CPU + peripherals)
│   │   ├── display.cpp                 # ULA display generation with contention
│   │   ├── audio.cpp                   # Beeper audio synthesis
│   │   ├── ay.hpp / ay.cpp             # AY-3-8912 sound chip (3 channels)
│   │   ├── contention.cpp              # ULA memory contention timing
│   │   ├── loaders/                    # Snapshot & tape format loaders
│   │   │   ├── sna_loader.cpp          # SNA snapshot format
│   │   │   ├── z80_loader.cpp          # Z80 snapshot format
│   │   │   ├── tap_loader.cpp          # TAP tape format
│   │   │   └── tzx_loader.cpp          # TZX tape format with metadata
│   │   ├── basic/                      # Sinclair BASIC support
│   │   │   ├── sinclair_basic_float.cpp      # ZX Spectrum floating-point
│   │   │   ├── sinclair_basic_tokenizer.cpp  # Text → token conversion
│   │   │   ├── sinclair_basic_parser.cpp     # Memory → AST/JSON parsing
│   │   │   ├── sinclair_basic_variables.cpp  # Variable storage & types
│   │   │   └── sinclair_basic_writer.cpp     # Token → memory serialization
│   │   └── zx48k/                      # ZX Spectrum 48K variant
│   │       ├── zx_spectrum_48k.hpp
│   │       └── zx_spectrum_48k.cpp     # 48K-specific config (48KB RAM + 16KB ROM)
│   │
│   ├── bindings/
│   │   └── wasm_interface.cpp          # WASM export glue (all EMSCRIPTEN_KEEPALIVE functions)
│   │
│   └── js/                             # ES6 modules — no framework
│       ├── main.js                     # Entry point, ZXSpectrumEmulator class
│       ├── emulator-proxy.js           # Main-thread proxy for Web Worker
│       ├── emulator-worker.js          # Web Worker hosting WASM module
│       ├── audio/
│       │   ├── audio-driver.js         # Web Audio API driver
│       │   ├── audio-worklet.js        # AudioWorklet processor
│       │   └── sound-window.js         # Sound debug window (beeper + AY waveforms)
│       ├── display/
│       │   ├── webgl-renderer.js       # WebGL renderer with shader effects
│       │   ├── screen-window.js        # Main display window (viewport lock)
│       │   └── display-settings-window.js  # Render settings (blur, scanlines, etc.)
│       ├── input/
│       │   └── input-handler.js        # Keyboard → Spectrum matrix mapping
│       ├── tape/
│       │   ├── tape-window.js          # Tape deck UI with transport controls
│       │   └── tape-persistence.js     # IndexedDB tape storage
│       ├── snapshot/
│       │   └── snapshot-loader.js      # SNA/Z80 file upload UI
│       ├── debug/
│       │   ├── cpu-debugger-window.js  # Z80 CPU state, disassembly, breakpoints
│       │   ├── stack-viewer-window.js  # Stack memory display
│       │   ├── basic-program-window.js # BASIC editor with syntax highlighting
│       │   ├── basic-variable-inspector.js  # BASIC variable watch display
│       │   ├── breakpoint-manager.js   # Breakpoint state management
│       │   └── z80-disassembler.js     # Z80 instruction disassembler
│       ├── windows/
│       │   ├── base-window.js          # Base class for all windows
│       │   └── window-manager.js       # Window lifecycle and state persistence
│       ├── config/
│       │   └── version.js              # Application version constant
│       ├── ui/
│       │   └── theme-manager.js        # Light/dark/system theme switching
│       ├── css/
│       │   ├── base.css                # Root theme variables, global styles
│       │   ├── cpu-debugger.css        # CPU debugger window styles
│       │   ├── basic-program.css       # BASIC editor styles
│       │   ├── stack-viewer.css        # Stack viewer styles
│       │   └── tape-window.css         # Tape window styles
│       └── utils/
│           ├── sinclair-basic-tokenizer.js   # JS-side BASIC tokenizer
│           ├── sinclair-basic-parser.js      # JS-side BASIC parser
│           ├── sinclair-basic-highlighting.js # Syntax highlighting
│           ├── sinclair-basic-tokens.js      # Complete token database
│           └── indexeddb-helper.js           # IndexedDB utilities
│
├── public/                             # Static assets
│   ├── index.html                      # Main HTML page
│   ├── zxspec.js                       # Built WASM loader (generated)
│   └── zxspec.wasm                     # Built WASM binary (generated)
│
├── tests/
│   └── z80/
│       └── z80_test.cpp                # Z80 CPU test suite
│
├── roms/                               # ROM files (embedded at compile time)
│   ├── 48.rom                          # ZX Spectrum 48K ROM (16KB)
│   ├── 128-0.rom                       # ZX Spectrum 128K ROM 0 (16KB)
│   └── 128-1.rom                       # ZX Spectrum 128K ROM 1 (16KB)
│
├── scripts/
│   └── generate_roms.sh                # ROM → C++ array generator
│
├── CMakeLists.txt                      # Build config (WASM + native tests)
├── package.json                        # npm scripts and Vite config
├── vite.config.js                      # Vite bundler configuration
└── CLAUDE.md                           # Project conventions and rules
```

## Key Data Flows

### Frame Execution
```
main.js (requestAnimationFrame)
  → emulator-proxy.js (postMessage)
    → emulator-worker.js (runFrame)
      → WASM: runFrame() → 69,888 T-states
      → WASM: getFramebuffer() → RGBA pixels
      → WASM: getAudioBuffer() → float32 samples
    ← postMessage (framebuffer + audio)
  → webgl-renderer.js (texture upload + draw)
  → audio-driver.js (queue samples to AudioWorklet)
```

### WASM Export Pipeline
```
C++ function (EMSCRIPTEN_KEEPALIVE)
  → wasm_interface.cpp (extern "C" wrapper)
  → CMakeLists.txt (EXPORTED_FUNCTIONS list)
  → emulator-worker.js (wasmModule._functionName)
  → emulator-proxy.js (message-based API)
  → UI windows (call proxy methods)
```

### Window Registration
```
main.js init():
  1. Create WindowManager
  2. Create each window (extends BaseWindow)
  3. Call window.create()
  4. Register with windowManager.register(window)
  5. After ALL registered: windowManager.loadState()
  6. Apply default layout for first-time users
```
