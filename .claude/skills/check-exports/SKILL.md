# Skill: Check WASM Exports

Audit WASM export consistency across the three integration layers.

## Usage

`/check-exports`

## Process

### 1. Collect C++ Exports

Find all `EMSCRIPTEN_KEEPALIVE` functions in `src/bindings/wasm_interface.cpp`:
```bash
grep -B0 -A1 'EMSCRIPTEN_KEEPALIVE' src/bindings/wasm_interface.cpp
```

### 2. Collect CMake Exports

Extract all entries from `EXPORTED_FUNCTIONS` in `CMakeLists.txt`:
```bash
grep '"_' CMakeLists.txt
```

### 3. Collect JavaScript Usage

Find all `wasmModule._` calls across all JS files:
```bash
grep -rn 'wasmModule\._' src/js/
```

### 4. Cross-Reference and Report

| Category | Severity | Meaning |
|---|---|---|
| C++ defined, missing from CMake | **ERROR** | Function will be stripped by linker |
| CMake listed, no C++ implementation | **WARNING** | Phantom export, link may fail |
| JS calls function not in CMake | **ERROR** | Runtime crash — function not available |
| CMake listed, never called from JS | **INFO** | Unused export (may be intentional) |

### 5. Output Format

```
## WASM Export Audit

### Errors (must fix)
- _functionName: defined in C++ but missing from EXPORTED_FUNCTIONS

### Warnings
- _functionName: in EXPORTED_FUNCTIONS but no C++ implementation

### Info
- _functionName: exported but not called from JavaScript

### Summary
- C++ exports: N
- CMake exports: N
- JS call sites: N
- Status: PASS / FAIL
```
