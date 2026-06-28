# UI/UX Redesign Brief — SpectrEm (ZX Spectrum Browser Emulator)

**Prepared for:** UI/UX Designer
**Product:** SpectrEm — a browser-based ZX Spectrum emulator
**Site:** RetroTech71.co.uk

---

## 1. What is this product?

SpectrEm is a **ZX Spectrum emulator that runs entirely in a web browser** — no install, no plugins. It faithfully recreates the 1980s Sinclair ZX Spectrum (and the earlier ZX81) home computers, including their distinctive screen, sound, keyboard, and the cassette tapes and floppy disks people used to load software.

It is built with WebAssembly (a C++ emulation core) and WebGL (for the CRT-style display). The interface is plain HTML/CSS/JavaScript with **no UI framework** — this matters for the designer because the redesign will be implemented as hand-written components, not via a component library.

The product serves **two very different audiences in one app**:

1. **Casual users / retro enthusiasts** — people who want to play classic games and run old software, enjoy the nostalgia, and tweak the look of the screen. They care about: loading a game quickly, an authentic CRT look, on-screen keyboard/joystick, saving their progress.

2. **Developers / hobbyist programmers / reverse-engineers** — people writing or dissecting Z80 assembly and Sinclair BASIC. They care about: a CPU debugger, memory inspection, disassembly, breakpoints, tracing, and editing graphics/fonts at the pixel level.

The current UI exposes **both audiences' tools side by side**. A central design challenge is making the casual experience feel clean and welcoming while keeping the deep developer toolset one click away — without the app feeling like an intimidating IDE to a newcomer.

---

## 2. The core experience

At the centre of the app is the **emulated screen**: a 256×192 pixel display surrounded by a coloured border (the full canvas is 320×256). This is rendered with optional CRT effects (curvature, scanlines, phosphor glow, etc.) to evoke a real period monitor.

Around this screen sit:

- A **top header / toolbar** with branding, power/reset/NMI/fullscreen controls, a menu bar, and quick speed + volume controls.
- A **floating windowing system** — every tool (tape deck, debugger, audio scope, etc.) is a draggable, resizable window that the user opens from menus. Windows remember their position, size, and visibility between sessions.
- On **mobile**, the menu bar collapses to a hamburger, windows become slide-up bottom sheets, and on-screen keyboard + D-pad overlays appear.

### Key design tension
There are **~25 distinct windows/panels**. The current model is "lots of floating windows the user manually arranges." The designer should consider: Is the floating-window paradigm right? Should there be docking, tabs, workspaces, or separate "Play" vs "Develop" modes? How do we avoid overwhelming a first-time visitor who just wants to play a game?

---

## 3. The screens & features (full inventory)

### A. Global chrome (always visible)

**Header / toolbar**
- Branding ("SpectrEm") + version chip + link to RetroTech71.co.uk
- **Power** (on/off), **Reset**, **NMI** (hardware interrupt), **Fullscreen** — icon buttons; Reset/NMI disabled when powered off
- **Menu bar**: File, Machine, Peripherals, View, Dev, Help
- **Speed control** (1×–5× slider) and **Volume control** (0–100% slider + mute toggle)
- Option to **auto-hide the header** (reveals on mouse-to-top-edge), especially in fullscreen

**Menus**
- **File**: Auto-Save toggle, Load Snapshot, Recent snapshots list, Save States, Settings
- **Machine**: model selection (ZX81, 48K, 128K, +2, +2A, +3) + 48K options (Issue 2/3 motherboard, AY sound chip)
- **Peripherals**: SpecDrum, Spectranet, Opus Discovery, Currah µSpeech (each on/off)
- **View**: Theme (Light/Dark/System), Auto-Hide Header, and toggles for every user-facing window
- **Dev**: toggles for every developer window
- **Help**: Release Notes, Check for Updates, Unregister App (it's an installable PWA)

---

### B. Casual / player-facing windows

1. **Screen window** — the main display. Always present, can't be closed. Has a quick "media" button to jump to the tape or disk UI.

2. **Display settings** — CRT/visual effects: curvature, scanlines, shadow mask, phosphor glow, vignette, flicker, static noise, jitter, sync wobble, burn-in, composite blend; bezel light-spill colour/intensity; brightness/contrast/saturation; RGB offset; "sharp pixels" toggle; overscan. Lots of sliders — a candidate for **presets** ("Authentic CRT", "Clean", "Custom").

3. **Tape Player** — a virtual cassette deck. Load TAP/TZX files; transport controls (play, pause, stop, rewind, fast-forward); scrollable block list with progress; expandable info panel (metadata + hex); animated cassette-spool visual; "instant load vs authentic speed" switch; auto-records when a BASIC program does SAVE; recent-tapes list.

4. **Disk Drive** — for +3 (3" floppy) and Opus Discovery machines. Drive A/B tabs; insert/eject; **spinning disk-surface visualization** with a track-access heatmap; technical readout (motor, track, side, FDC state/command); recent-disks list.

5. **Keyboard** — an authentic 40-key ZX Spectrum keyboard with the colour-coded BASIC keyword legends printed on the keys. Keys light up on press (physical or click). Essential on mobile and for newcomers who don't know the Spectrum's unusual single-keystroke-keyword input.

6. **Joystick** — configure a connected gamepad: emulation type (Kempston, Sinclair 1/2, Cursor, None), deadzone slider, live D-pad/fire visualization, connection status.

7. **Save States** — 10 named slots + an autosave slot. Each slot shows a screenshot thumbnail, name (editable), and timestamp, with Load/Save/Clear/Download. Whole-set export/import as ZIP.

8. **Audio / Sound** — real-time **oscilloscope** of the beeper waveform plus the AY-3-8912 sound chip: per-channel (A/B/C) frequency (with musical-note detection), volume meters, envelope-shape graphics, tone/noise indicators. Colour-coded channels. (Half visual instrument, half debug tool.)

9. **Time Travel** — rewind/replay. Record toggle, a **scrubber timeline** to seek backwards, depth presets (15s/30s/1m/2.5m), play-from-position and "return to live" buttons. Frame-by-frame with arrow keys.

10. **Release Notes** — in-app changelog grouped by week, with features/fixes/improvements.

11. **Settings dialog** — keyboard mapping (which physical keys map to Caps Shift / Symbol Shift), and other preferences.

---

### C. Developer / power-user windows

12. **Z80 Debugger** — the big one. Run/pause, step into/over/out; full register display (AF, BC, DE, HL + alternates, IX, IY, SP, PC, I, R, IM, interrupt flags); individual CPU flag indicators; T-state counter; raster-beam position (scanline + horizontal position); a 48-line scrolling **disassembly** with current-PC highlight and go-to-address; and a breakpoint manager with tabs for normal, conditional, memory, and BASIC-line breakpoints.

13. **Stack Viewer** — live view of the Z80 stack: addresses, byte values, ASCII, top-of-stack highlighted.

14. **CPU Trace** — rolling log of the last ~10,000 executed instructions with registers, flags, disassembly, T-states; searchable.

15. **BASIC Program Editor** — view/edit the live Sinclair BASIC program in memory, with syntax highlighting, rendered block-graphics characters, error underlines, run/step/stop, find bar, per-line breakpoints, and a **variables panel** (numbers, strings, arrays as tables, FOR loops, DEF FN) with change highlighting.

16. **UDG Editor** — pixel editor for the 21 User-Defined Graphics (A–U). 8×8 grid, byte readout in hex/binary, tools (clear, invert, mirror, shift, copy/paste), and pull/push to live emulator memory + save/load as BASIC.

17. **Font Editor** — same idea as the UDG editor but for a full 96-character custom font.

18. **Memory Map** — the 64KB address space as four 16KB slots, colour-coded by region (ROM/RAM/screen/system vars/paged banks), with paging state for 128K/+2A/+3 and an SP marker.

19. **Memory Heatmap** — a zoomable/pannable pixel-grid view of all 64KB, either showing byte bit-patterns or a decaying **access heatmap** (what code is touching what memory). Minimap, hex overlay at high zoom, region colouring.

20. **Assembler** — a Z80 assembly editor with syntax highlighting, ORG address, assemble / assemble-and-push-to-RAM, auto-format, load/save .asm, and a tabbed output pane (listing / errors / hex).

21. **Rule Builder** — a visual condition builder for breakpoints: nestable AND/OR groups of rules comparing registers, flags, memory bytes/words, or BASIC variables, with a live expression preview.

22. **Disk Explorer** (experimental) — a **radial disk map** (tracks as rings, sectors as wedges) for analysing disk structure and copy protection, with zoom/pan, sector hex viewer, and a region legend.

23. **Retro Debugger** — a full-screen WebGL debugging overlay (opened with the backtick key).

---

### D. Network / peripheral windows

24. **Spectranet Monitor** — config and status for the Spectranet Ethernet card: IP/gateway/subnet/MAC/DNS, hostname, four TNFS mount points, flash-config snapshot management, status indicators.

25. **TNFS Browser** — browse remote TNFS file servers and load games/snapshots directly over the network; breadcrumb navigation, file list, download progress.

---

## 4. Supported machines & peripherals

**Machines:** ZX81, ZX Spectrum 48K (Issue 2 or 3, optional AY sound), 128K, +2, +2A, +3.
**Peripherals:** SpecDrum (drum sample player), Spectranet (Ethernet/networking), Opus Discovery (disk interface), Currah µSpeech (speech synthesis), +3 floppy disk controller, Kempston/Sinclair/Cursor joysticks.

The active machine changes which features are relevant (e.g. tape vs disk; AY sound availability; +3-specific keyboard layout). The UI needs to **adapt gracefully** to the selected machine rather than showing irrelevant controls.

---

## 5. Existing visual language (constraints to respect)

These are firm product constraints — the redesign should work **within** them, not replace them:

- **Theme system**: three modes — Dark (default), Light, and System. Every colour is a CSS custom property defined for both themes. The redesign must support all three and define any new tokens in both.
- **Accent palette must come from the real ZX Spectrum hardware palette** (8 colours: cyan/blue, green, red, magenta, yellow, etc.). Dark theme uses the "bright" variants; light theme uses the "normal" variants. **No arbitrary brand hues** — accents map to Spectrum colours. This is a deliberate authenticity decision and a strong opportunity for the design identity.
- **Sound-channel colours** are similarly tied to the palette (Channel A = cyan, B = green, C = red, beeper = green).
- **Accessibility**: text must meet WCAG AA contrast (4.5:1 normal, 3:1 large) in **both** themes.
- **State persistence**: every user setting, toggle, slider, and window position must persist across sessions (localStorage). The redesign shouldn't introduce settings that reset on refresh.
- **Responsive / mobile**: must work on phones (hamburger menu, bottom-sheet windows, touch keyboard + D-pad) and desktop.
- It is an installable **PWA** with offline support.

---

## 6. What we'd like from the designer

A redesign of the **UI/UX** (visual design + interaction model + information architecture) covering:

1. **Information architecture** — how to organise ~25 windows and 6 menus so casual users aren't overwhelmed but developers keep full power. Consider modes/workspaces, grouping, progressive disclosure.
2. **Layout & window paradigm** — keep floating windows, or move to docking/tabs/panels? How is the main screen framed?
3. **Visual identity** — a cohesive look rooted in the Spectrum palette and retro heritage, but modern, clean, and legible. Branding/logo treatment welcome.
4. **The "first five minutes"** — how a brand-new visitor gets from landing → loading a game → playing, with minimal friction.
5. **Component system** — buttons, toggles, sliders, tabs, tables, hex/data displays, canvases, menus, dialogs, bottom sheets — consistent across all windows and both themes.
6. **Mobile experience** — a genuinely good touch experience, not just a squeezed desktop.
7. **Dark + Light themes** — both fully designed.

### Deliverables (suggested)
- Mood board / visual direction
- Key screen mockups (light + dark): main play view, a media window (tape or disk), the debugger, mobile view
- A component/style guide with the Spectrum-palette token system
- Interaction notes for the windowing/IA model

---

## 7. Quick reference — feature checklist

- Load software: snapshots (SNA, Z80, .P), tapes (TAP, TZX), disks (DSK)
- Save/restore: 10 save-state slots + autosave, ZIP export/import
- Tape deck with editor (TAP Editor) and disk drive with explorer
- 6 machine models + ZX81; multiple peripherals
- CRT display effects with many parameters
- On-screen keyboard, joystick/gamepad config, mobile touch controls
- Audio: beeper + AY chip with live oscilloscope/meters
- Full developer suite: Z80 debugger, stack, trace, assembler, memory map/heatmap, breakpoint rule builder
- Content creation: BASIC editor, UDG editor, font editor
- Networking: Spectranet + TNFS remote file browsing
- Time-travel rewind/replay
- Light/Dark/System themes, PWA install, full state persistence
