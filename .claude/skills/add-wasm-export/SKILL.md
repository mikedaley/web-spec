# Skill: Add WASM Export

Wire up a new C++ function for export to JavaScript via the WASM interface. This requires coordination between three layers.

## Usage

- `/add-wasm-export` — audit mode: check consistency across all three layers
- `/add-wasm-export functionName` — add a new export

## The Three Layers

1. **C++ Implementation** (`src/bindings/wasm_interface.cpp`)
   - Function must be `EMSCRIPTEN_KEEPALIVE` inside `extern "C" {}`
   - Use `REQUIRE_MACHINE()` / `REQUIRE_MACHINE_OR(default)` for null checks
   - For data returned to JS, use static buffers (not heap allocation per call)

2. **CMake Export List** (`CMakeLists.txt`)
   - Add `"_functionName"` to the `EXPORTED_FUNCTIONS` list
   - Must match the C function name with underscore prefix

3. **JavaScript Call Site** (`src/js/emulator-worker.js`)
   - Call via `wasmModule._functionName()`
   - Add message handler if called from main thread via proxy

## Adding a New Export

### Step 1 — C++ Implementation

Add to `src/bindings/wasm_interface.cpp` in the appropriate section:

```cpp
EMSCRIPTEN_KEEPALIVE
ReturnType functionName(ParamType param) {
    REQUIRE_MACHINE_OR(default_value);
    return g_machine->functionName(param);
}
```

### Step 2 — CMake Export

Add `"_functionName"` to `EXPORTED_FUNCTIONS` in `CMakeLists.txt`.

### Step 3 — Worker Integration

Add to `emulator-worker.js` message handler:

```javascript
case "functionName": {
    const result = wasmModule._functionName(msg.param);
    postMessage({ type: "functionNameResult", result });
    break;
}
```

### Step 4 — Proxy Method (if needed)

Add to `emulator-proxy.js`:

```javascript
functionName(param) {
    this.worker.postMessage({ type: "functionName", param });
}
```

### Step 5 — Update Documentation

Update `.claude/skills/speccy/docs/bindings.md` with the new function signature.

## Audit Mode

When invoked without arguments, check consistency:

1. Find all `EMSCRIPTEN_KEEPALIVE` functions in `wasm_interface.cpp`
2. Find all entries in `EXPORTED_FUNCTIONS` in `CMakeLists.txt`
3. Find all `wasmModule._` calls in JavaScript files
4. Report:
   - Functions in C++ but missing from CMake (will be stripped — **ERROR**)
   - Functions in CMake but not in C++ (phantom exports — **WARNING**)
   - JS calls to non-exported functions (**ERROR**)
   - Exported functions never called from JS (unused — **INFO**)
