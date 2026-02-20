# Coding Style Guide

## JavaScript Conventions

### Naming
- **Classes**: `PascalCase` — `ScreenWindow`, `AudioDriver`, `EmulatorProxy`
- **Functions/methods**: `camelCase` — `runFrame()`, `getAudioBuffer()`, `loadSnapshot()`
- **Constants**: `SCREAMING_SNAKE_CASE` — `FRAME_TSTATES`, `AUDIO_SAMPLE_RATE`
- **File names**: `kebab-case` — `audio-driver.js`, `cpu-debugger-window.js`
- **CSS classes**: `kebab-case` — `.cpu-register`, `.tape-controls`
- **CSS custom properties**: `--category-name` — `--bg-primary`, `--accent-blue`

### Module Pattern
- ES6 modules with named exports
- One class per file (matching filename to class name in kebab-case)
- Import order: CSS first, then modules grouped by subsystem

### DOM Manipulation
- Direct DOM manipulation — no frameworks
- Use `document.createElement()` and `element.appendChild()`
- Use `element.classList.add/remove/toggle()` for state changes
- Prefer `element.textContent` over `innerHTML` when not inserting HTML

### Event Handling
- Use `addEventListener` with named handler methods
- Clean up listeners in destroy/cleanup methods
- Use event delegation where practical

## C++ Conventions

### Naming
- **Namespaces**: `snake_case` — `zxspec::`, `zxspec::zx48k::`
- **Classes**: `PascalCase` — `ZXSpectrum`, `Z80`
- **Functions/methods**: `camelCase` — `runFrame()`, `readMemory()`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **File names**: `snake_case` — `zx_spectrum.cpp`, `z80_opcodes_main.cpp`
- **Header guards**: Not used — use `#pragma once`

### WASM Interface Pattern
- All exports use `EMSCRIPTEN_KEEPALIVE` and are in `extern "C"` block
- Null-check macros: `REQUIRE_MACHINE()` / `REQUIRE_MACHINE_OR(default)`
- Static buffers for data returned to JavaScript (avoid heap allocation per call)
- String returns use static `std::string` variables

### Memory Safety
- WASM heap allocated with `_malloc()`, freed with `_free()`
- JavaScript must manage WASM heap lifetime
- Static buffers in `wasm_interface.cpp` for serialized data (block info, JSON)

## CSS Conventions

### Theme System
- All colours via CSS custom properties — never hard-code hex/rgba
- Define variables in both `:root` (dark) and `html[data-theme="light"]` blocks
- Accent colours from Spectrum hardware palette only
- Canvas drawing reads colours from `getComputedStyle()` at runtime

### Variable Categories
- `--bg-*` — backgrounds
- `--text-*` — text colours
- `--accent-*` — Spectrum palette accents
- `--glass-*` — glassmorphism effects
- `--overlay-*` — overlays and modals
- `--input-*` — form inputs
- `--control-*` — control elements
- `--shadow-*` — shadows
- `--channel-*` — sound channel colours
- `--canvas-*` — canvas backgrounds

### Accessibility
- WCAG AA minimum: 4.5:1 contrast for normal text, 3:1 for large text
- Test in both dark and light themes
