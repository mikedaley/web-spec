# Skill: Review Pull Request

Review a pull request with ZX Spectrum emulator-specific checks.

## Usage

- `/review-pr` — review current branch against master
- `/review-pr 123` — review PR #123
- `/review-pr branch-name` — review specific branch

## Review Process

### 1. Gather Changes

```bash
git diff master...HEAD --stat
git diff master...HEAD
git log master..HEAD --oneline
```

Or if a PR number is given:
```bash
gh pr diff 123
gh pr view 123
```

### 2. Categorize Changes

Group files into categories:
- **Z80 CPU** — `src/core/z80/`
- **Machine emulation** — `src/machines/`
- **WASM interface** — `src/bindings/wasm_interface.cpp`
- **JavaScript UI** — `src/js/`
- **CSS/Theme** — `src/js/css/`
- **Build system** — `CMakeLists.txt`, `package.json`
- **Tests** — `tests/`

### 3. Emulator-Specific Checks

#### WASM Export Consistency
If `wasm_interface.cpp` or `CMakeLists.txt` changed:
- Verify every `EMSCRIPTEN_KEEPALIVE` function is in `EXPORTED_FUNCTIONS`
- Verify JS call sites match exported names

#### Z80 Timing Accuracy
If Z80 opcode files changed:
- Check T-state counts match Z80 documentation
- Verify contention timing is preserved
- Ensure flag calculations are correct

#### Memory Safety
If WASM interface changed:
- Check for proper null guards (`REQUIRE_MACHINE` macros)
- Verify static buffer sizes are adequate
- Check for buffer overflow risks in serialization

#### State Persistence
If any window code changed:
- Verify `getState()` includes all user-facing settings
- Verify `restoreState()` handles missing keys gracefully
- Check that new settings have sensible defaults

#### Theme Compliance
If CSS or canvas-drawing code changed:
- No hard-coded colours — must use CSS custom properties
- Variables defined in both dark and light theme blocks
- Canvas colours read from `getComputedStyle()`, not JS constants
- Accent colours from Spectrum palette only
- WCAG AA contrast ratios met

#### Worker/Proxy Consistency
If worker or proxy changed:
- Message types match between worker and proxy
- Callbacks properly registered and cleaned up
- No main-thread blocking operations

### 4. Code Quality Checks

- Naming conventions (kebab-case JS files, snake_case C++, PascalCase classes)
- No framework dependencies introduced
- No unnecessary abstractions or over-engineering
- Clean separation between C++ core and JS presentation
- Proper error handling at system boundaries

### 5. Report Format

```
## PR Review: [Title]

### Summary
[1-2 sentences on what the PR does]

### Emulator-Specific Issues
- [Critical issues that could break emulation]

### Code Quality
- [Style, naming, architecture concerns]

### Suggestions
- [Optional improvements, not blocking]

### Verdict
APPROVE / REQUEST CHANGES / NEEDS DISCUSSION
```
