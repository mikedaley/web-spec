/*
 * runtime.js - Runtime platform detection shared by the web and desktop builds.
 *
 * The same src/js code runs in two hosts:
 *   - a normal browser (the existing web build), and
 *   - a native OS webview under Tauri v2 (the desktop build).
 *
 * Feature code should branch on isTauri() rather than duplicating modules, so
 * there is a single source of truth for behaviour that differs between hosts
 * (e.g. raw sockets, native file dialogs).
 */

/** True when running inside the Tauri (desktop) webview. */
export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Lazily import a Tauri API module; throws if called in the browser build. */
export async function tauri(modulePath) {
  if (!isTauri()) {
    throw new Error(`Tauri API '${modulePath}' requested in a non-Tauri host`);
  }
  switch (modulePath) {
    case "core":
      return import("@tauri-apps/api/core");
    case "event":
      return import("@tauri-apps/api/event");
    case "dialog":
      return import("@tauri-apps/plugin-dialog");
    case "fs":
      return import("@tauri-apps/plugin-fs");
    default:
      throw new Error(`Unknown Tauri module '${modulePath}'`);
  }
}
