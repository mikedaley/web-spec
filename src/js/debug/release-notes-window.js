/*
 * release-notes-window.js - Release notes window showing project history
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import "../css/release-notes.css";
import { BaseWindow } from "../windows/base-window.js";
import { VERSION } from "../config/version.js";

const RELEASE_DATA = [
  {
    week: "Mar 23 – Mar 29, 2026",
    features: [
      { hash: "e107349", text: "TAP file editor window" },
      { hash: "a9aa0c5", text: "128K BASIC tokens (SPECTRUM, PLAY) and correct BASIC window title for +2/+2A/+3" },
    ],
    fixes: [
      { hash: "a9aa0c5", text: "Fix stray brace in main.js causing Vite build failure" },
      { hash: "------", text: "Fix instant load setting not reapplying after machine switch or snapshot load" },
    ],
    improvements: [
      { hash: "587b928", text: "Add RetroTech71.co.uk website link to header" },
      { hash: "8efb931", text: "Remove Lenslok solver window" },
    ],
  },
  {
    week: "Mar 16 – Mar 22, 2026",
    features: [
      { hash: "81e7504", text: "Joystick configuration window with Gamepad API support" },
      { hash: "b380abe", text: "Save button in tape player for saving TAP to disk without ejecting" },
      { hash: "24bcdea", text: "Disk Explorer and Disk Analysis windows" },
      { hash: "eef8fc4", text: "Disk compatibility test suite for protected disk images" },
      { hash: "a5e086d", text: "Recent snapshots in File menu with one-click reload and remove" },
    ],
    fixes: [
      { hash: "f1a2d59", text: "Fix +2A/+3 screen display in special paging mode (CP/M)" },
      { hash: "5a9d9e2", text: "Fix FDC ST0 for CRC+CM mismatch and pad data for N-mismatch sectors" },
      { hash: "------", text: "Fix retro debugger disassembly showing junk (record stride was 40 instead of 42 bytes)" },
      { hash: "------", text: "Settings window not containing its content due to incorrect element reference in auto-fit sizing" },
      { hash: "3f7ebcc", text: "Memory map window now works correctly for all machines (128K, +2, +2A, +3)" },
      { hash: "------", text: "Sinclair 1 joystick left/right directions swapped" },
      { hash: "------", text: "Gamepad D-pad not working on non-standard mapping controllers" },
      { hash: "------", text: "Fix Z80 snapshot T-state restore using standard v3 format encoding" },
      { hash: "------", text: "Fix WD1770 disk motor never stopping after commands complete" },
      { hash: "------", text: "Fix +3 all-RAM paging not restored from Z80 v3 snapshots (0x1FFD at byte 86)" },
      { hash: "------", text: "Fix disk window race where auto-restore could overwrite a manual disk insert" },
      { hash: "18a26d6", text: "Fix settings window sizing by fitting content on show instead of create" },
      { hash: "67771c1", text: "Fix Cabal: only apply CRC data variation on track 0" },
      { hash: "bdddd17", text: "Fix Chartbusters: detect Speedlock boot code signature for CM clearing" },
      { hash: "c2322f5", text: "Fix Chase HQ: preserve CM flags for CMOnly protected disks" },
      { hash: "3ad0d30", text: "Fix Read Track buffer consumption and remove debug output" },
      { hash: "------", text: "Fix display corruption on +2A/+3 reset by clearing framebuffer" },
      { hash: "------", text: "Fix +2A/+3 display corruption caused by getScreenMemory ignoring special paging mode" },
      { hash: "------", text: "Fix +2A/+3 missing display catch-up on port 0x1FFD paging writes" },
      { hash: "------", text: "Fix +2A/+3 screen write catch-up not triggering for shadow screen bank 7 via slot 3" },
      { hash: "------", text: "Fix UDG screen patching causing false-positive corruption on +2A/+3 machines" },
      { hash: "e31034e", text: "Fix FDC result status for CM mismatch single-sector reads (ST0 was incorrectly set to Abnormal)" },
      { hash: "fc9f0a0", text: "Fix disk explorer tooltip clipping by window overflow" },
    ],
    improvements: [
      { hash: "a20ea36", text: "Proper weak sector simulation replacing Speedlock XOR hack" },
      { hash: "673fec3", text: "Use 0x4E gap fill for N-mismatch padding in FDC reads" },
      { hash: "22b4d72", text: "Refactored disk copy protection from pre-patching to runtime FDC detection" },
      { hash: "e2ea895", text: "Speedlock weak sector simulation via repeated-read detection on CRC protection sector" },
      { hash: "77d4585", text: "Disk explorer zoom (scroll wheel) and pan (Cmd+drag) with reset button" },
      { hash: "6114efa", text: "Colour legend in disk explorer showing sector type meanings" },
      { hash: "807971a", text: "Simplified disk map with transparent background and colour-coded sectors" },
      { hash: "25f4e63", text: "Disk explorer light theme support with adjusted sector colours" },
      { hash: "70cfaaf", text: "Improved spacing between Surface and Details buttons in disk drive window" },
      { hash: "e187ca0", text: "FDC internals panel in disk drive debug window" },
      { hash: "69d2197", text: "FDC Deleted Data Address Mark (CM) and CRC error handling" },
      { hash: "ed480a0", text: "Preserve breakpoints across machine switches" },
      { hash: "------", text: "Memory heatmap fade toggle switch and inverted fade slider for intuitive control" },
      { hash: "f0c2314", text: "Drive B support in disk window with A/B tab switching" },
      { hash: "------", text: "Opus Discovery disk interface with WD1770 FDC, 6821 PIA, NMI-driven data transfer and OPD disk format support" },
      { hash: "------", text: "Numpad arrow keys mapped as cursor/joystick input (4/8/6/2 = L/U/R/D, 0 = fire)" },
      { hash: "------", text: "QuickDOS ROM option for Opus Discovery disk interface" },
      { hash: "------", text: "Viewport-locked screen expands to use full space when header is auto-hidden" },
      { hash: "------", text: "ZX81 emulation fixes: corrected NMI port polarity, edge-triggered INT via R register bit 6, and VSYNC tracking" },
      { hash: "------", text: "ZX81 keyboard mapping: Control keys remapped to SHIFT, correct period/comma/punctuation input" },
      { hash: "------", text: "ZX81 added to machine menu with correct state save/restore handling" },
      { hash: "------", text: "ZX81 .P file loader rewritten with direct memory load instead of ROM init loop" },
      { hash: "------", text: "Drag-and-drop now accepts .p files for ZX81 program loading" },
      { hash: "------", text: "Auto-switch to +3 when inserting a DSK disk image from any machine" },
      { hash: "223a218", text: "Track bar visualisation in disk window" },
      { hash: "8025da3", text: "Separate detail panels for uPD765A and WD1770 disk controllers" },
      { hash: "a363a7c", text: "Disk window details panel switched to fixed table layout" },
      { hash: "665c457", text: "Speedlock +3 disk protection support" },
      { hash: "0021c04", text: "Handle EDSK sectors with zero stored data on protection tracks" },
      { hash: "49190c1", text: "Auto-detect and patch Speedlock +3 deleted data marks" },
      { hash: "fa6074b", text: "Dedicated copy protection module with per-scheme handling" },
      { hash: "2df2c63", text: "Expanded disk compatibility tests to all 12 protected images" },
      { hash: "c0d4725", text: "FDC Read Track command, motor-off abort, and refined protection handling" },
      { hash: "fcb7432", text: "Aligned Disk Explorer protection detection with C++ copy protection module" },
    ],
  },
  {
    week: "Mar 10 – Mar 15, 2026",
    features: [
      { hash: "adaef8b", text: "Retro debugger with docking system and accurate backward disassembly" },
      { hash: "029ceaf", text: "Tab docking in retro debugger" },
      { hash: "8eb1966", text: "Settings window with configurable Caps Shift and Symbol Shift key mappings" },
      { hash: "a96bd33", text: "Beam position tracking, beam breakpoints and crosshair overlay in CPU debugger" },
      { hash: "7449c48", text: "ZX Spectrum 128K +2 machine support" },
      { hash: "ecd893a", text: "ZX Spectrum +2A/+3 machines with µPD765A FDC and disk drive UI" },
      { hash: "b8c74f1", text: "SpecDrum DAC peripheral and CPU trace window" },
      { hash: "b9ef1a9", text: "Virtual scrolling in CPU trace window for performance" },
      { hash: "d64a59a", text: "Tape/disk shortcut buttons on screen window header" },
      { hash: "f8bf573", text: "Read/write access tracking in memory heatmap activity mode" },
      { hash: "c71835f", text: "Fade speed control for memory heatmap" },
      { hash: "799e29d", text: "Resizable tape info panel with draggable handle" },
      { hash: "86f9d7f", text: "Flash snapshot rename with hover tooltip and full config preview" },
      { hash: "ec868be", text: "Release Notes window with full project history grouped by week" },
    ],
    fixes: [
      { hash: "------", text: "FDC result phase returns actual sector ID fields and correct R value for copy-protected disks" },
      { hash: "------", text: "FDC data mark mismatch and sector status flag propagation breaking non-Speedlock loaders" },
      { hash: "1ebdb06", text: "FDC end-of-cylinder result and +2A/+3 IO contention model" },
      { hash: "0e04e72", text: "State save/restore for +2, +2A and +3 machines" },
      { hash: "537b8cb", text: "Keyboard header toggles staying right-aligned when Custom Font hidden" },
      { hash: "bb73be5", text: "Flash config parsing to correctly display all mounts" },
      { hash: "------", text: "Border colour changes now rendered correctly when stepping in debugger" },
    ],
    improvements: [
      { hash: "2fab310", text: "Z80 debugger stepping: partial frame rendering, actual T-states, beam alignment" },
      { hash: "b486194", text: "Skip frame buffer transfer and texture uploads when emulator is paused" },
      { hash: "2a9ce21", text: "Redesigned disk drive window with spinning disk visualization" },
      { hash: "b415732", text: "Peripherals menu, improved disk window UI and state persistence" },
      { hash: "16a7dc8", text: "Switch retro debugger font to JetBrains Mono" },
      { hash: "58c8c90", text: "Remove thermal/ASCII/entropy heatmap modes, compact Z80 debugger registers" },
      { hash: "d3eaea9", text: "Reduced CPU usage when emulator is powered off" },
      { hash: "a37ace9", text: "File System Access API for disk image save dialog" },
      { hash: "f288f6d", text: "Save and restore AY-3-8912 state, T-states, and frame counter in snapshots" },
      { hash: "4fb6bee", text: "Increase save state slots from 5 to 10 with scrollable slot list" },
    ],
  },
  {
    week: "Mar 3 – Mar 9, 2026",
    features: [
      { hash: "586fffe", text: "Spectranet Ethernet interface with W5100 emulation and networking" },
      { hash: "1740018", text: "UDG Editor window with interactive pixel grid and BASIC code generation" },
      { hash: "5aa6622", text: "Font Editor window for designing custom 96-character fonts" },
      { hash: "7797fe9", text: "TNFS file browser window" },
      { hash: "4a2b25c", text: "UDG bitmaps on A-U keys in graphics mode" },
      { hash: "6abd600", text: "Custom font rendering on keyboard when CHARS sysvar is redirected" },
      { hash: "55333df", text: "Drag-and-drop file loading for snapshots and tapes" },
      { hash: "dd75258", text: "Auto-hide header option in View menu" },
      { hash: "3ca2ed3", text: "TX/RX LEDs, scrollable flash list, and active snapshot indicator" },
      { hash: "370c40a", text: "Flash snapshot save/load in Spectranet window" },
      { hash: "3517e13", text: "AM29F010 autoselect/chip ID command in flash emulation" },
    ],
    fixes: [
      { hash: "adb4921", text: "PWA update detection, UI tweaks, and dev server worker MIME types" },
      { hash: "e6c7fa5", text: "UDG live screen patching after clear" },
      { hash: "2b66ec0", text: "TNFS directory identification and STAT parsing" },
      { hash: "762b411", text: "DHCP assigning 255.255.255.255 and TNFS data port 32768 in proxy" },
      { hash: "df55187", text: "TCP connect: use SYNSENT state, set ESTABLISHED on WebSocket open" },
      { hash: "bd8ad3e", text: "WebSocket connection stalls and allow RECV in CLOSE_WAIT" },
      { hash: "11d2bcc", text: "W5100 RX overflow buffering to prevent TCP streaming data loss" },
      { hash: "b03d9ec", text: "AM29F010 flash programming bug" },
      { hash: "b540f04", text: "Keyboard window showing as thin container on first open" },
      { hash: "43051f9", text: "Keyboard resize handles disappearing after window focus change" },
    ],
    improvements: [
      { hash: "8faae56", text: "Toggle switch for dynamic keyboard mode highlighting" },
      { hash: "f0b663d", text: "Animated highlighted key elements in dynamic modes" },
      { hash: "a352775", text: "Removed movement animations from keyboard, opacity-only fades" },
      { hash: "f4d9bbe", text: "Lowercase letters on keyboard keys by default" },
      { hash: "0dc87b1", text: "K mode keyword display: centered keywords, hidden letters on key rows" },
      { hash: "2157fb0", text: "E-mode green/red labels inside keys with small letter in top-left" },
      { hash: "fbca8d2", text: "Non-dynamic keyboard: repositioned numbers, letters, symbols and graphics" },
      { hash: "ec597a1", text: "Dim keyboard and disable input until emulator is running" },
      { hash: "79e9127", text: "Secure Spectranet proxy: origin allowlist, private IP blocking, rate limiting" },
      { hash: "532ed3b", text: "Save button for flash snapshot items for in-place updates" },
      { hash: "4455c4f", text: "Fixed snapshot loading delays and added toast notifications" },
      { hash: "320d8dd", text: "Resizable keyboard window with scaled content and L-mode highlighting" },
      { hash: "ba9de8d", text: "Increased keyboard label text size and darkened on-key red text" },
      { hash: "7be03b3", text: "Replaced keyboard shift-mode guessing with emulator-driven state machine" },
    ],
  },
  {
    week: "Feb 24 – Mar 2, 2026",
    features: [
      { hash: "8e465b9", text: "Authentic ZX Spectrum 48K keyboard window" },
      { hash: "bdddf39", text: "Save states system with Z80 v3 format, auto-save, and 5 manual slots" },
      { hash: "6c84422", text: "Memory Map window" },
      { hash: "41a4dab", text: "AY-3-8912 internal state in Sound window and Reset Layout option" },
      { hash: "92f9d4d", text: "Custom MessagePanel, PWA support, and rebrand to SpectrEm" },
      { hash: "33d8807", text: "Mobile support and mute audio when paused/stepping" },
      { hash: "a27adf2", text: "Breakpoint panel, rule builder, condition evaluator with string support" },
    ],
    fixes: [
      { hash: "461e5ee", text: "Static noise degrading into uniform bars after long sessions" },
      { hash: "cf5db09", text: "BASIC breakpoints for 128K ROM 0 and step-past re-trigger bug" },
      { hash: "434963a", text: "State restore to power on machine without resetting" },
    ],
    improvements: [
      { hash: "5e595c4", text: "BASIC editor improvements: DEF FN tokenizer fix, variable inspector, error detection" },
      { hash: "591118e", text: "Variable change flash animation, formatter fixes" },
      { hash: "c699eb1", text: "Variable panel: group by type with section headers, resizable width" },
      { hash: "75615c1", text: "Statement-level highlighting during BASIC stepping" },
      { hash: "889e821", text: "Show machine name in screen window and BASIC variant in editor title" },
      { hash: "c4ebdec", text: "Editable slot names in save states" },
      { hash: "a37b1a8", text: "Per-machine keyboard layout support" },
      { hash: "d2746f2", text: "Bump version to 0.6.0 and PWA cache to v2" },
    ],
  },
  {
    week: "Feb 17 – Feb 23, 2026",
    features: [
      { hash: "7ece599", text: "ZX Spectrum 128K support with paged memory and bank switching" },
      { hash: "841f770", text: "TZX tape image loader with ROM trap and pulse playback" },
      { hash: "28dfa05", text: "TAP tape image loader with tape player window and transport controls" },
      { hash: "3052aa5", text: "Tape player: Load/Recent/Library, instant/normal speed, loading audio, block progress" },
      { hash: "235e973", text: "Light/dark theme system with viewport-clamped menus" },
      { hash: "39c8347", text: "Tape recording (SAVE to TAP) with real-time block detection and IndexedDB persistence" },
      { hash: "a190ef5", text: "AY-3-8912 PSG emulation with togglable 48K support and debug window" },
      { hash: "cb7dbaf", text: "Sound debug window with beeper waveform visualization" },
      { hash: "46c70e9", text: "Sinclair BASIC editor window with tokenizer, parser, and variable inspector" },
      { hash: "8296be3", text: "BASIC line breakpoint and step debugging" },
      { hash: "4ba8269", text: "BASIC program trace mode to highlight current line while running" },
      { hash: "916159c", text: "Machine menu with Issue 2/3 motherboard and AY chip toggles" },
      { hash: "df72701", text: "Speed control (1x-5x) for emulation fast-forward" },
      { hash: "70ea50e", text: "ZX Spectrum 128K support with SpectREMCPP-accurate IO behaviour" },
      { hash: "69530b7", text: "Stack viewer window with return address detection" },
      { hash: "6490fe1", text: "Move BASIC tokenizer, parser, and variable inspector from JS to C++/WASM" },
      { hash: "1567da3", text: "Move disassembler and renumber to C++, replace header logo, update README" },
      { hash: "8f0f3ef", text: "Wiki source files for ZX Spectrum Timing" },
      { hash: "b39fcd5", text: "ZX Spectrum pixel font logo with CRT glow and diagonal shimmer" },
      { hash: "00e54f6", text: "Z80 CPU debugger with breakpoints, single run/pause toggle" },
      { hash: "a38b07c", text: "PAL composite video signal buffer with GPU decode" },
      { hash: "921e2c8", text: "CRT bezel with physically-motivated screen reflection" },
    ],
    fixes: [
      { hash: "e05a1e2", text: "Breakpoint handling: stop mid-frame, rewind PC, robust skip on resume" },
      { hash: "2576309", text: "Tape player robustness and keyboard stuck-key issues" },
      { hash: "e4d4d92", text: "CRT shader overscan dimensions and strengthened window shadows" },
      { hash: "d08f628", text: "AudioWorklet path for production builds" },
      { hash: "f4c5e63", text: "Logo flash on page load by adding explicit SVG dimensions" },
      { hash: "e30a03b", text: "Variable type parsing, atomic memory writes, and table variable display" },
      { hash: "9fb7c40", text: "Editor overlay, negative int decoding, and array content display" },
      { hash: "fed136f", text: "Intermittent line number corruption when writing BASIC to memory" },
      { hash: "3bae876", text: "BASIC line breakpoints not firing for single-statement lines" },
      { hash: "b736219", text: "BASIC tokenizer handling for DEF FN parameters and BIN literals" },
      { hash: "f477a18", text: "BASIC debugger crashes and toolbar button state overhaul" },
      { hash: "e328f3a", text: "Suppress L BREAK display, clear errors on Run, restore breakpoint gutter" },
      { hash: "000a1bf", text: "Step/Stop buttons remaining active after program ends normally" },
      { hash: "4f15a49", text: "Program-running detection using FLAGS bit 7 with grace period" },
      { hash: "712ff5d", text: "Program-running detection: track CH_ADD changes instead of FLAGS bit 7" },
      { hash: "03c42f9", text: "Floating bus timing regression from ulaTsToDisplay refactor" },
      { hash: "eebd059", text: "Window visibility not restoring correctly from saved state" },
      { hash: "f130865", text: "Contention and floating bus timing to match SpectREMCPP" },
      { hash: "ec886ec", text: "Pause tape at header blocks during instant load" },
      { hash: "2acf2a7", text: "Display drawing offsets for 48-pixel border width" },
    ],
    improvements: [
      { hash: "8f2596a", text: "Moved snapshot loaders to shared src/machines/loaders/ level" },
      { hash: "f7bcb9a", text: "Refactored to multi-machine architecture" },
      { hash: "e576404", text: "Persist window z-index stacking order, CPU debugger active tab, and tape speed mode" },
      { hash: "03d254e", text: "Collapsible tape info panel, file validation, and inline logo" },
      { hash: "f3288c9", text: "Cassette visualization, tape state resilience, version chip, production worker fix" },
      { hash: "853ced5", text: "Empty deck visualization, layered cassette spindles, tape player UX" },
      { hash: "b4f2a82", text: "Inline tape rename, save prompt on eject, full tape state restore on reload" },
      { hash: "e25d56a", text: "Replaced accent colours with Sinclair ZX Spectrum hardware palette" },
      { hash: "e470747", text: "Sound window state persistence, waveform refresh rate, reset clearing" },
      { hash: "ffff7fb", text: "Master volume control and always show AY section in Sound window" },
      { hash: "5556956", text: "Sound window: fix beeper waveform, persist volume, clean up UI" },
      { hash: "82b68a5", text: "Reworked BASIC editor to use web-a2e scroll pattern, fixed float encoding" },
      { hash: "ff43ac2", text: "Auto-formatting, auto-renumber, save dialog, improved light theme contrast" },
      { hash: "c7b297c", text: "Context-sensitive toolbar buttons and BASIC editor UX" },
      { hash: "bfb2356", text: "Replaced tsToOrigin/floatBusAdjust with single ulaTsToDisplay origin" },
      { hash: "02dc96b", text: "Comprehensive comments to timing and display code" },
      { hash: "a08daeb", text: "Disassembly syntax colouring and keyboard input in debug fields" },
      { hash: "ed6c5bb", text: "Throttle debugger updates to 5Hz while running, instant when paused" },
      { hash: "adaf60f", text: "Register change animation re-trigger on consecutive updates" },
      { hash: "d135484", text: "Split screen curvature into independent horizontal and vertical controls" },
      { hash: "390990e", text: "Widened border to full ULA size and corrected drawing offsets" },
      { hash: "a4593bd", text: "Auto-switch machine type to match snapshot on load" },
      { hash: "62b6a7c", text: "Renamed to SpectrEM, uniform 48px borders, logo and UI refresh" },
      { hash: "d2d8011", text: "Fill RAM with random data on reset to mimic real hardware power-on state" },
      { hash: "f828347", text: "version.js as single source of truth for app version" },
      { hash: "9398f9a", text: "Centre the current PC line in the disassembly scroll view" },
      { hash: "ca63a2b", text: "Bezel color picker and updated spill defaults" },
      { hash: "4f640ea", text: "Overhauled menu bar UX for clear, predictable interaction patterns" },
      { hash: "b7aa5b9", text: "Show screen and tape windows side-by-side on first run" },
      { hash: "3d41952", text: "Default to dark theme for first-time users" },
      { hash: "15098f3", text: "Timing test target for CPU and ULA timing validation" },
    ],
  },
  {
    week: "Feb 10 – Feb 16, 2026",
    features: [
      { hash: "88cd7fa", text: "Initial commit: ZX Spectrum emulator (web-spec)" },
      { hash: "97c4ab5", text: "ULA display rendering, frame loop, and keyboard input" },
      { hash: "e624ad6", text: "Windowing system with monitor screen window" },
      { hash: "f6cbf02", text: "ZX Spectrum beeper audio via AudioWorklet" },
      { hash: "5acd0e3", text: "TV static effect on monitor when emulator is off" },
      { hash: "9a3231a", text: "Incremental screen rendering, ULA contention, and SNA snapshot loading" },
      { hash: "6dc85d0", text: "AY-3-8912 debug window, display system, Z80 loader, and code reorganization" },
    ],
    fixes: [
      { hash: "3563688", text: "Emscripten WASM build" },
      { hash: "e463c20", text: "Beeper audio timing and punctuation key mappings" },
    ],
    improvements: [],
  },
];

export class ReleaseNotesWindow extends BaseWindow {
  constructor() {
    super({
      id: "release-notes",
      title: "Release Notes",
      defaultWidth: 520,
      defaultHeight: 560,
      minWidth: 360,
      minHeight: 300,
    });
  }

  renderContent() {
    const weeks = RELEASE_DATA.map((week) => {
      const totalCount =
        week.features.length +
        week.fixes.length +
        (week.improvements?.length || 0);

      const sections = [];

      if (week.features.length > 0) {
        sections.push(this.renderCategory("Features", "features", week.features, "feature"));
      }
      if (week.improvements && week.improvements.length > 0) {
        sections.push(this.renderCategory("Improvements", "improvements", week.improvements, "improvement"));
      }
      if (week.fixes.length > 0) {
        sections.push(this.renderCategory("Bug Fixes", "fixes", week.fixes, "fix"));
      }

      return `
        <div class="rn-week">
          <div class="rn-week-header">
            <span class="rn-week-date">${week.week}</span>
            <span class="rn-week-line"></span>
            <span class="rn-week-count">${totalCount} changes</span>
          </div>
          ${sections.join("")}
        </div>
      `;
    }).join("");

    return `
      <div class="release-notes-content">
        <div class="rn-version-banner">
          <div class="rn-version-title">
            <span class="rn-logo-r">S</span><span>pect</span><span class="rn-logo-y">r</span><span class="rn-logo-g">E</span><span class="rn-logo-c">m</span>
          </div>
          <div class="rn-version-sub">v${VERSION} — Release Notes</div>
        </div>
        <div class="release-notes-inner">
          ${weeks}
        </div>
      </div>
    `;
  }

  renderCategory(label, cssClass, entries, entryClass) {
    const items = entries
      .map(
        (e) => `
      <li class="rn-entry ${entryClass}">
        <span class="rn-entry-dot"></span>
        <span class="rn-entry-text">${e.text}</span>
        <span class="rn-entry-hash">${e.hash}</span>
      </li>`
      )
      .join("");

    return `
      <div class="rn-category">
        <div class="rn-category-label ${cssClass}">${label}</div>
        <ul class="rn-entries">${items}</ul>
      </div>
    `;
  }
}
