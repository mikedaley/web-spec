# web-spec

ZX Spectrum emulator for the browser, built with C++/WebAssembly and vanilla JavaScript.

## Quick Start

```bash
npm install
npm run build:wasm
npm run dev
```

## Architecture

- **C++ Core**: Z80 CPU, ULA, memory, I/O — compiled to WebAssembly via Emscripten
- **JavaScript Layer**: WebGL rendering, Web Audio API, keyboard input, UI
- **No frameworks**: Vanilla ES6 modules with Vite for bundling
