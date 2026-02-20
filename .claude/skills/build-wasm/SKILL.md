# Skill: Build WASM

Build the WASM module from C++ sources and verify the output.

## Usage

- `/build-wasm` — standard build
- `/build-wasm clean` — clean previous artifacts first

## Steps

1. If `clean` argument provided:
   ```bash
   rm -rf build/
   ```

2. Run the WASM build:
   ```bash
   npm run build:wasm
   ```

3. Verify output files exist:
   ```bash
   ls -la public/zxspec.js public/zxspec.wasm
   ```

4. Count exported functions in the build:
   ```bash
   grep -c 'EMSCRIPTEN_KEEPALIVE' src/bindings/wasm_interface.cpp
   ```

5. Report build status:
   - Success/failure
   - Output file sizes
   - Number of exported functions
   - Any warnings from the build

## Troubleshooting

If the build fails:
- Check that Emscripten SDK is activated (`source emsdk_env.sh`)
- Verify ROM files exist in `roms/` directory (`48.rom` required)
- Check for C++ compilation errors in the output
- Ensure `build/` directory can be created
