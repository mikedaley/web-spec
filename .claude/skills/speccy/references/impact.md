# Reference: Impact Analysis

When the user asks "what breaks if I change X?" or wants to understand the impact of a change:

## Analysis Method

### 1. Identify the Change Layer

| Layer | Files affected | Downstream impact |
|---|---|---|
| **Z80 CPU** | `src/core/z80/` | All execution, breakpoints, debugger |
| **Machine (C++)** | `src/machines/` | WASM interface, all JS consumers |
| **WASM Interface** | `src/bindings/wasm_interface.cpp` | CMakeLists.txt exports, emulator-worker.js |
| **Web Worker** | `src/js/emulator-worker.js` | emulator-proxy.js callbacks |
| **Proxy** | `src/js/emulator-proxy.js` | All window/UI code that calls proxy |
| **Window System** | `src/js/windows/` | All windows extending BaseWindow |
| **Display** | `src/js/display/` | Screen window, WebGL rendering |
| **Audio** | `src/js/audio/` | Sound window, AudioWorklet |
| **Tape** | `src/machines/loaders/`, `src/js/tape/` | Tape window, persistence |
| **BASIC** | `src/machines/basic/`, `src/js/debug/basic-program-window.js` | BASIC editor, variable inspector |
| **CSS/Theme** | `src/js/css/base.css` | All UI components in both themes |

### 2. Trace the Data Flow

For any C++ change, trace: **C++ → WASM export → Worker → Proxy → UI/Window**

For any JS change, check: **Which windows or subsystems consume this data?**

### 3. Check Integration Points

- **WASM exports**: Does `CMakeLists.txt` EXPORTED_FUNCTIONS list need updating?
- **Worker messages**: Does `emulator-worker.js` handle the new/changed message type?
- **Proxy callbacks**: Does `emulator-proxy.js` expose the new functionality?
- **Window state**: Does any window's `getState()`/`restoreState()` need updating?
- **Theme compliance**: Do any new UI elements use CSS custom properties correctly?

### 4. Report Format

```
## Impact Analysis: [Change Description]

### Direct Changes
- [files that need modification]

### Downstream Effects
- [files/subsystems affected by the change]

### Required Updates
- [ ] WASM export list (CMakeLists.txt)
- [ ] Worker message handler (emulator-worker.js)
- [ ] Proxy method (emulator-proxy.js)
- [ ] Window state persistence
- [ ] CSS theme variables (both dark and light)
- [ ] Documentation (bindings.md, project-structure.md)
```
