# Skill: Create Debug Window

Scaffold a new debug window with all required registration and wiring.

## Usage

`/debug-window WindowName`

Where `WindowName` is PascalCase (e.g., `MemoryViewer`, `IOPortMonitor`).

## What Gets Created

### 1. Window Class File

Create `src/js/debug/{kebab-case-name}-window.js`:

```javascript
import { BaseWindow } from "../windows/base-window.js";

export class WindowNameWindow extends BaseWindow {
    constructor() {
        super({
            id: "window-name",
            title: "Window Name",
            width: 400,
            height: 300,
            minWidth: 300,
            minHeight: 200
        });
    }

    createContent() {
        const container = document.createElement("div");
        container.className = "window-name-content";
        // Build window UI here
        return container;
    }

    update(state) {
        // Called each frame when window is visible
        // state contains CPU registers, memory, etc. from proxy
    }

    getState() {
        return {
            ...super.getState(),
            // Add any window-specific state to persist
        };
    }

    restoreState(state) {
        super.restoreState(state);
        // Restore window-specific state
    }
}
```

### 2. CSS File (optional)

Create `src/js/css/{kebab-case-name}.css` if the window needs custom styles:

- Use only CSS custom properties for colours
- Define in both `:root` (dark) and `html[data-theme="light"]` blocks
- Import in the window JS file

### 3. Registration in main.js

Add to `src/js/main.js`:

```javascript
// Import
import { WindowNameWindow } from "./debug/{kebab-case-name}-window.js";

// In init() method, after other window registrations:
this.windowNameWindow = new WindowNameWindow();
this.windowNameWindow.create();
this.windowManager.register(this.windowNameWindow);
```

### 4. Menu Entry

Add a toggle entry in the Debug or View menu in `public/index.html`:

```html
<li data-action="toggle-window-name">Window Name</li>
```

Wire up the click handler in `main.js` `setupMenuHandlers()`.

### 5. Default Layout

Add to the `applyDefaultLayout` array in `main.js` with sensible default position and visibility.

## Checklist

- [ ] Window class extends BaseWindow
- [ ] Window registered with WindowManager before `loadState()` is called
- [ ] Menu entry added for toggling visibility
- [ ] State persistence: `getState()` and `restoreState()` handle all user-facing settings
- [ ] CSS uses only custom properties (no hard-coded colours)
- [ ] Window tested in both dark and light themes
- [ ] Added to `applyDefaultLayout` with defaults
- [ ] Update `.claude/skills/speccy/docs/project-structure.md`
