# Reference: Generate GitHub PR Description

When the user asks to create a PR, generate a description from the commit history.

## Process

1. **Get the base branch**: Usually `master`
2. **Get commit history**: `git log master..HEAD --oneline`
3. **Get full diff summary**: `git diff master...HEAD --stat`
4. **Categorize changes**:
   - C++ core changes (CPU, display, audio, loaders, BASIC)
   - WASM interface changes
   - JavaScript UI changes
   - CSS/theme changes
   - Build system changes
   - Test changes

## PR Format

```markdown
## Summary
[1-3 sentences describing what this PR does and why]

## Changes

### [Category]
- [Change description]

### [Category]
- [Change description]

## Testing
- [ ] WASM build succeeds (`npm run build:wasm`)
- [ ] Dev server runs (`npm run dev`)
- [ ] Z80 tests pass (if CPU changes)
- [ ] UI works in both light and dark themes (if CSS changes)
- [ ] All windows persist state correctly (if window changes)
- [ ] Audio plays correctly (if audio changes)
- [ ] Tape loading works (if tape/loader changes)
```

## Guidelines

- Keep the summary concise — focus on the "why" not the "what"
- Group related changes under meaningful categories
- Only include testing items relevant to the actual changes
- If multiple distinct features, list them as separate sections
