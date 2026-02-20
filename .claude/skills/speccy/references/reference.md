# Reference: Load Reference Documentation

When the user asks to load docs or restore context, use this to determine which files to read.

## Available References

| Reference | Path | When to load |
|---|---|---|
| `bindings` | `.claude/skills/speccy/docs/bindings.md` | WASM work, adding exports, C++/JS bridge |
| `styles` | `.claude/skills/speccy/docs/styles.md` | Code style questions, PR reviews |
| `structure` | `.claude/skills/speccy/docs/project-structure.md` | Finding files, understanding layout |
| `claude` | `/CLAUDE.md` | Project rules, theme system, window guidelines |

## Auto-Reference Suggestions

Based on task type, suggest loading these references:

| Task | Suggested references |
|---|---|
| Adding a WASM export | `bindings`, `claude` |
| Creating a new window | `structure`, `claude` |
| CSS/theme work | `claude` (theme section) |
| Debugging CPU issues | `bindings` |
| BASIC editor changes | `bindings`, `structure` |
| Tape system changes | `bindings`, `structure` |
| Audio changes | `bindings`, `structure` |
| PR review | `styles`, `claude` |

## Session Restore

If the user says "restore context" or "load everything", read:
1. `CLAUDE.md` (always)
2. `.claude/skills/speccy/docs/project-structure.md`
3. Only load `bindings.md` and `styles.md` if the task requires them
