# Reference: Search Documentation

When the user asks a question about the project, follow this progressive search strategy:

## Step 1 — Topic Detection

Identify what the question is about:

| Topic | First files to check |
|---|---|
| WASM bindings / exports | `docs/bindings.md`, `src/bindings/wasm_interface.cpp` |
| Z80 CPU | `src/core/z80/z80.cpp`, `src/core/z80/z80.hpp` |
| Display / ULA | `src/machines/display.cpp`, `src/js/display/webgl-renderer.js` |
| Audio / Beeper / AY | `src/machines/audio.cpp`, `src/machines/ay.cpp`, `src/js/audio/` |
| Tape loading | `src/machines/loaders/tap_loader.cpp`, `src/machines/loaders/tzx_loader.cpp` |
| BASIC support | `src/machines/basic/`, `src/js/debug/basic-program-window.js` |
| Window system | `src/js/windows/base-window.js`, `src/js/windows/window-manager.js` |
| Theme / CSS | `src/js/css/base.css`, `src/js/ui/theme-manager.js` |
| Keyboard input | `src/js/input/input-handler.js` |
| Web Worker | `src/js/emulator-proxy.js`, `src/js/emulator-worker.js` |
| Build system | `CMakeLists.txt`, `package.json`, `vite.config.js` |
| Snapshots | `src/machines/loaders/sna_loader.cpp`, `src/machines/loaders/z80_loader.cpp` |
| Project structure | `docs/project-structure.md` |
| Coding style | `docs/styles.md` |

## Step 2 — Progressive Search

1. Check the relevant docs first (they're pre-summarized)
2. Only read source files if docs don't answer the question
3. Use Grep/Glob to find specific symbols or patterns
4. Read CLAUDE.md if the question involves project conventions

## Step 3 — Answer

- Be concise and specific
- Include file paths and line numbers when referencing code
- If the answer requires understanding multiple files, explain the data flow
