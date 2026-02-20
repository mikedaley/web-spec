---
name: release
description: Bump version and generate summary of changes
disable-model-invocation: true
argument-hint: "<major|minor|patch>"
allowed-tools: Read, Edit, Grep, Glob, Bash(git log *)
---

# Version Bump and Release

Bump the application version and generate a summary of changes since the last version bump.

## Arguments

- First argument: version bump type — `major`, `minor`, or `patch` (default: `patch`)

## Files Modified

| File | What Changes |
|---|---|
| `src/js/config/version.js` | `VERSION` constant bumped |

## Steps

### 1. Determine New Version

Read the current version from `src/js/config/version.js` (e.g., `"0.3.0"`).

Apply the bump:
- `patch`: 0.3.0 → 0.3.1
- `minor`: 0.3.0 → 0.4.0
- `major`: 0.3.0 → 1.0.0

### 2. Update Version File

Edit `src/js/config/version.js`:
```javascript
export const VERSION = "X.Y.Z";
```

### 3. Generate Change Summary

Gather commits since the last version bump:
```bash
git log --oneline $(git log --all --oneline --grep="Bump version" -1 --format="%H")..HEAD
```

If no previous "Bump version" commit exists, use the last 20 commits:
```bash
git log --oneline -20
```

Analyze the commits and categorize:
- **Features** — new functionality ("Add ...", "Create ...")
- **Fixes** — bug fixes ("Fix ...")
- **Changes** — improvements and refactors ("Update ...", "Improve ...", "Refactor ...")

### 4. Report Summary

Display:
- Old version → New version
- Categorized list of changes
- Remind the user to review before committing

## Important

- Do NOT commit the changes — just make the edits and let the user review
- The version chip in the header (`index.html .version-chip`) is populated at runtime from `version.js` — no need to edit HTML
- Skip commits that are purely internal (build tweaks, gitignore changes, merge commits)
- Keep change descriptions user-facing where possible
