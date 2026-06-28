/*
 * native-menu.js - Native macOS/desktop menu bar for the Tauri build.
 *
 * Rather than maintain a second menu definition, this builds the native app
 * menu bar by *walking the existing in-window header menus* (#file-menu,
 * #machine-menu, …) and creating a matching native submenu for each. Every
 * native item simply clicks its DOM counterpart, so all existing handlers,
 * toggles and dynamic items (recents) are reused with zero duplication.
 *
 * Standard app/Edit/Window submenus are added so the app looks and behaves like
 * a normal native application. A MutationObserver on the header keeps the native
 * menu in sync (checkmarks, recents, enabled state) as the DOM menus change.
 *
 * No-op in the browser build.
 */

import { isTauri } from "./runtime.js";

// DOM menu list id -> native submenu label, in the order they appear in-window.
const MENU_SECTIONS = [
  { id: "file-menu", label: "File" },
  { id: "machine-menu", label: "Machine" },
  { id: "peripherals-menu", label: "Peripherals" },
  { id: "view-menu", label: "View" },
  { id: "dev-menu", label: "Dev" },
  { id: "help-menu", label: "Help" },
];

// Final top-level order. "Edit" and "Window" are the standard native submenus
// inserted around the app-specific ones.
const TOP_ORDER = ["File", "Edit", "Machine", "Peripherals", "View", "Dev", "Window", "Help"];

const APP_NAME = "SpectrEm";
const SITE_URL = "https://retrotech71.co.uk";
const SITE_LABEL = "RetroTech71.co.uk";

async function openSite() {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(SITE_URL);
  } catch (err) {
    console.error("[native-menu] failed to open site:", err);
  }
}

let _menuApi = null;
let _building = false;
let _pendingRebuild = false;
let _rebuildTimer = null;

/** Build the native menu and start keeping it in sync. No-op off Tauri. */
export async function initNativeMenu() {
  if (!isTauri()) return;
  // Marker the CSS uses to hide the now-redundant in-window dropdown menus.
  document.documentElement.classList.add("tauri-host");
  try {
    await buildMenu();
    observeMenuChanges();
  } catch (err) {
    console.error("[native-menu] init failed:", err);
  }
}

async function menuApi() {
  if (!_menuApi) _menuApi = await import("@tauri-apps/api/menu");
  return _menuApi;
}

function itemText(el) {
  const span = el.querySelector("span:not(.menu-check)");
  return (span ? span.textContent : el.textContent).trim();
}

function isEnabled(el) {
  return !el.disabled && !el.classList.contains("disabled");
}

async function nativeItemFor(el, M) {
  const text = itemText(el);
  if (!text) return null;
  const action = () => {
    el.click();
    scheduleRebuild();
  };
  if (el.classList.contains("menu-check-item")) {
    return M.CheckMenuItem.new({
      text,
      enabled: isEnabled(el),
      checked: el.classList.contains("active"),
      action,
    });
  }
  return M.MenuItem.new({ text, enabled: isEnabled(el), action });
}

async function buildSectionItems(listEl, M) {
  const items = [];
  for (const child of listEl.children) {
    // Inline the dynamically-populated recents list.
    if (child.id === "recents-list") {
      for (const r of child.children) {
        if (r.classList && r.classList.contains("header-menu-item")) {
          const it = await nativeItemFor(r, M);
          if (it) items.push(it);
        }
      }
      continue;
    }
    if (child.classList.contains("header-menu-separator")) {
      if (child.style.display === "none") continue;
      // Avoid leading/duplicate separators.
      if (!items.length) continue;
      items.push(await M.PredefinedMenuItem.new({ item: "Separator" }));
    } else if (child.classList.contains("header-menu-section-label")) {
      items.push(await M.MenuItem.new({ text: child.textContent.trim(), enabled: false }));
    } else if (child.classList.contains("header-menu-item")) {
      const it = await nativeItemFor(child, M);
      if (it) items.push(it);
    }
  }
  // Strip a trailing separator if present.
  return items;
}

async function buildStandardSubmenus(M) {
  const appMenu = await M.Submenu.new({
    text: APP_NAME,
    items: [
      // website/websiteLabel show on Windows/Linux; macOS ignores them, so the
      // clickable link below covers macOS.
      await M.PredefinedMenuItem.new({
        item: { About: { name: APP_NAME, website: SITE_URL, websiteLabel: SITE_LABEL } },
      }),
      await M.MenuItem.new({ text: SITE_LABEL, action: openSite }),
      await M.PredefinedMenuItem.new({ item: "Separator" }),
      await M.PredefinedMenuItem.new({ item: "Services" }),
      await M.PredefinedMenuItem.new({ item: "Separator" }),
      await M.PredefinedMenuItem.new({ item: "Hide" }),
      await M.PredefinedMenuItem.new({ item: "HideOthers" }),
      await M.PredefinedMenuItem.new({ item: "ShowAll" }),
      await M.PredefinedMenuItem.new({ item: "Separator" }),
      await M.PredefinedMenuItem.new({ item: "Quit" }),
    ],
  });

  const editMenu = await M.Submenu.new({
    text: "Edit",
    items: [
      await M.PredefinedMenuItem.new({ item: "Undo" }),
      await M.PredefinedMenuItem.new({ item: "Redo" }),
      await M.PredefinedMenuItem.new({ item: "Separator" }),
      await M.PredefinedMenuItem.new({ item: "Cut" }),
      await M.PredefinedMenuItem.new({ item: "Copy" }),
      await M.PredefinedMenuItem.new({ item: "Paste" }),
      await M.PredefinedMenuItem.new({ item: "SelectAll" }),
    ],
  });

  const windowMenu = await M.Submenu.new({
    text: "Window",
    items: [
      await M.PredefinedMenuItem.new({ item: "Minimize" }),
      await M.PredefinedMenuItem.new({ item: "Maximize" }),
      await M.PredefinedMenuItem.new({ item: "Separator" }),
      await M.PredefinedMenuItem.new({ item: "Fullscreen" }),
      await M.PredefinedMenuItem.new({ item: "Separator" }),
      await M.PredefinedMenuItem.new({ item: "CloseWindow" }),
    ],
  });

  return { appMenu, editMenu, windowMenu };
}

async function buildMenu() {
  if (_building) {
    _pendingRebuild = true;
    return;
  }
  _building = true;
  try {
    const M = await menuApi();
    const { appMenu, editMenu, windowMenu } = await buildStandardSubmenus(M);

    const byLabel = { Edit: editMenu, Window: windowMenu };
    for (const section of MENU_SECTIONS) {
      const listEl = document.getElementById(section.id);
      if (!listEl) continue;
      const items = await buildSectionItems(listEl, M);
      if (!items.length) continue;
      byLabel[section.label] = await M.Submenu.new({ text: section.label, items });
    }

    const topItems = [appMenu];
    for (const label of TOP_ORDER) {
      if (byLabel[label]) topItems.push(byLabel[label]);
    }

    const menu = await M.Menu.new({ items: topItems });
    await menu.setAsAppMenu();
  } finally {
    _building = false;
    if (_pendingRebuild) {
      _pendingRebuild = false;
      scheduleRebuild();
    }
  }
}

function scheduleRebuild() {
  clearTimeout(_rebuildTimer);
  _rebuildTimer = setTimeout(() => {
    buildMenu().catch((err) => console.error("[native-menu] rebuild failed:", err));
  }, 250);
}

function observeMenuChanges() {
  const nav = document.querySelector(".header-controls");
  if (!nav) return;
  const observer = new MutationObserver(() => scheduleRebuild());
  observer.observe(nav, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "disabled"],
  });
}
