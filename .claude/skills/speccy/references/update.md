# Reference: Update Documentation

When the user asks to update documentation, determine which docs need updating:

## Documentation Locations

| Document | Path | When to update |
|---|---|---|
| WASM Bindings | `.claude/skills/speccy/docs/bindings.md` | After adding/removing WASM exports |
| Project Structure | `.claude/skills/speccy/docs/project-structure.md` | After adding/removing/renaming files |
| Coding Styles | `.claude/skills/speccy/docs/styles.md` | After establishing new conventions |
| CLAUDE.md | `/CLAUDE.md` | After architectural changes or new project rules |

## Update Process

### Bindings Doc
1. Read `src/bindings/wasm_interface.cpp` for all `EMSCRIPTEN_KEEPALIVE` functions
2. Read `CMakeLists.txt` for the EXPORTED_FUNCTIONS list
3. Regenerate `docs/bindings.md` with categorized function signatures

### Project Structure Doc
1. Run `find src -type f | sort` to get current file listing
2. Compare against existing `docs/project-structure.md`
3. Add new files, remove deleted files, update descriptions

### CLAUDE.md
- Only update when explicitly asked or when architectural changes require new rules
- Preserve existing sections — add new content, don't remove established conventions
