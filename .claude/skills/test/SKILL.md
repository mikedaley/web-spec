# Skill: Run Tests

Build and run the Z80 CPU test suite (native C++ with CMake).

## Usage

- `/test` — build and run all tests
- `/test filter` — run tests matching filter

## Steps

### 1. Build Native Test Executables

```bash
mkdir -p build-native && cd build-native && cmake .. && make -j$(sysctl -n hw.ncpu)
```

### 2. Run Tests

Without filter:
```bash
cd build-native && ctest --verbose
```

With filter:
```bash
cd build-native && ctest --verbose -R "filter"
```

### 3. Report Results

- Total tests run
- Tests passed / failed
- Execution time
- For failures: show the specific assertion that failed

## Test Structure

Tests are in `tests/z80/z80_test.cpp` and cover:
- Z80 instruction execution
- Flag calculations
- Register operations
- Memory access patterns
- Interrupt handling

## Troubleshooting

If tests fail to build:
- Ensure CMake is installed
- Check that native (non-Emscripten) compiler is available
- Verify `build-native/` directory has correct CMake cache

If tests fail:
- Check if recent Z80 opcode changes broke instruction behaviour
- Verify T-state counts match expected values
- Compare flag results against Z80 reference documentation
