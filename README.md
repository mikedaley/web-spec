# CLAUDE.md — SpectrEM Web Agent Instructions

This file contains instructions for AI agents working in this codebase. See `README.md` for project documentation.

---

## Build Rules

### After any C++ change
Always rebuild the WASM module before testing or assuming the change works:
```bash
npm run build:wasm
```
Forgetting this leaves JS and WASM silently out of sync. There is no runtime warning.

### After adding a new C++ export
When adding a new `EMSCRIPTEN_KEEPALIVE` function in `src/bindings/wasm_interface.cpp`, you **must** also add it to the `EXPORTED_FUNCTIONS` list in `CMakeLists.txt`. Omitting this causes a silent link-time drop — the function will not be callable from JavaScript and will fail without an obvious error.

### Dev server
JS-only changes hot-reload via Vite. WASM does not hot-reload — a full `npm run build:wasm` is required.

### Full production build
```bash
npm run build   # WASM + Vite bundle
```

---

## Architecture Constraints

### Worker/proxy boundary
The emulation core runs in a **Web Worker** (`emulator-worker.js`). The main thread communicates exclusively through `emulator-proxy.js`. Never call WASM functions directly from the main thread. Never add DOM access, WebGL calls, or Web Audio calls inside the worker.

### WASM interface pattern
- A single global `Machine` instance lives in C++ (`wasm_interface.cpp`)
- JS allocates WASM heap memory via `_malloc()` / `_free()`
- All exports use `EMSCRIPTEN_KEEPALIVE` inside `extern "C"`

### No frameworks
This project uses vanilla ES6 modules. Do not introduce React, Vue, or any other framework. Do not add non-dev npm dependencies without explicit instruction.

### Frame pipeline
```
requestAnimationFrame
  → EmulatorProxy.postMessage()
    → Web Worker: runFrame()
    → WASM: getFramebuffer() + getAudioBuffer()
  ← postMessage (framebuffer + audio)
  → WebGL texture upload
  → AudioWorklet queue
```
Do not break this pipeline sequence. Audio and display are tightly coupled to frame timing.

---

## High-Risk Areas — Do Not Modify Without Explicit Instruction

These areas are hardware-accuracy-critical. Incorrect changes will break emulation correctness silently or cause test failures that are hard to diagnose.

| Area | Location | Risk |
|---|---|---|
| Z80 timing constants | `src/machines/machine_info.hpp` | Frame timing, audio sync, tape loading |
| ULA contention tables | `src/machines/contention.cpp` | Display accuracy, CPU stall timing |
| LPC / SP0256 coefficients | `src/machines/currah/` | Speech synthesis filter accuracy |
| Audio buffer sizing | `src/js/audio/` | Underrun/overrun, audio glitches |

If a task appears to require changes in these areas, **stop and ask** rather than proceeding.

---

## Testing

### After any Z80 CPU change
Run the native C++ test suite:
```bash
mkdir -p build-native && cd build-native
cmake ..
make -j$(sysctl -n hw.ncpu)
ctest --verbose
```
Do not mark a CPU change complete without a passing test run.

---

## Code Conventions

### File naming
- JavaScript: `kebab-case` (`audio-driver.js`)
- C++: `snake_case` (`z80_opcodes_main.cpp`)
- Classes: `PascalCase` (`ZXSpectrumEmulator`)

### CSS / theming
All colours must use CSS custom properties — never hardcode colour values. Canvas drawing must read colours from `getComputedStyle()` to stay theme-aware. Theme definitions live in `src/js/css/base.css`.

### Debug windows
All debug panels extend `BaseWindow` from `src/js/windows/`. Do not build standalone floating UI outside this system.

---

## Common Failure Modes

- **C++ change with no WASM rebuild** — JS calls old WASM; change has no effect
- **New export missing from `EXPORTED_FUNCTIONS`** — function silently absent at runtime
- **WASM heap memory leak** — always pair `_malloc()` with `_free()` in JS
- **Direct WASM call from main thread** — will throw; all WASM access goes through the worker
- **Hardcoded colour in canvas draw** — breaks light/system theme
