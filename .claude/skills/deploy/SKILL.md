# Skill: Deploy

Full release and deployment pipeline: bump version, update release notes, commit, push, build and deploy.

## Usage

`/deploy`

## Steps

### 1. Safety Checks

```bash
git status
```

- Abort if not on `master` branch (warn and stop)
- Note any uncommitted changes — these will be included in the commit

### 2. Bump Version

Read the current version from `src/js/config/version.js`.

Increment the **patch** version by 0.1 (e.g., `0.9.2` → `0.9.3`).

Edit `src/js/config/version.js`:
```javascript
export const VERSION = "X.Y.Z";
```

### 3. Gather Changes Since Last Deploy

Get commits since the last version bump:
```bash
git log --oneline $(git log --all --oneline --grep="Bump version" -1 --format="%H")..HEAD
```

If no previous "Bump version" commit exists, use the last 20 commits:
```bash
git log --oneline -20
```

### 4. Update Release Notes

Read `src/js/debug/release-notes-window.js`.

Analyze the commits gathered in step 3 and add any **new entries** to the current week's section in `RELEASE_DATA`. Categorize into:
- **features** — new functionality ("Add ...", "Create ...")
- **fixes** — bug fixes ("Fix ...")
- **improvements** — improvements and refactors ("Update ...", "Improve ...", "Refactor ...")

Rules:
- Only add entries for commits not already present in the release notes (check commit hashes and descriptions)
- Skip internal commits (build tweaks, version bumps, merge commits)
- Use the commit hash (first 7 chars) in the `hash` field
- Keep descriptions concise and user-facing
- If the current week doesn't have a section yet, create one at the top of `RELEASE_DATA`

### 5. Commit and Push

Stage all changed files and commit:
```bash
git add src/js/config/version.js src/js/debug/release-notes-window.js
git add <any other modified files from step 1>
git commit -m "Bump version to X.Y.Z"
git push
```

### 6. Production Build

```bash
npm run build
```

- Verify build succeeds
- Report output file sizes

### 7. Deploy

```bash
npm run deploy
```

- This runs rsync to the VPS
- Report success/failure

### 8. Summary

Report:
- Old version → New version
- Number of new release note entries added
- Build status and file sizes
- Deploy status

## Abort Conditions

Stop and warn the user if:
- Not on `master` branch
- WASM or Vite build fails
- `git push` fails
- `npm run deploy` fails
