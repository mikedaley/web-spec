# Skill: Deploy

Full production build pipeline with safety checks before deploying.

## Usage

`/deploy`

## Steps

### 1. Safety Checks

```bash
git status
```

- Warn if there are uncommitted changes
- Show current branch (should normally be `master`)

### 2. Build WASM

```bash
npm run build:wasm
```

- Verify build succeeds
- Check output file sizes

### 3. Production Build

```bash
npm run build
```

- Verify `dist/` directory is created
- Show built file sizes

### 4. Deployment Summary

Report:
- Branch and latest commit
- WASM file size
- Total dist size
- Any warnings from build steps

### 5. Confirm with User

Ask the user to confirm before deploying. Show the deploy command that will run.

### 6. Deploy

```bash
npm run deploy
```

- This runs rsync to the VPS
- Report success/failure

## Abort Conditions

Stop and warn the user if:
- There are uncommitted changes (ask if they want to proceed anyway)
- WASM build fails
- Vite production build fails
- Not on the expected branch
