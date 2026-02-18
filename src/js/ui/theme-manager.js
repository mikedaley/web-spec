/*
 * theme-manager.js - Light/Dark theme management
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const STORAGE_KEY = "zxspec-theme";

const THEME_META_COLORS = {
  dark: "#0a0a0b",
  light: "#ffffff",
};

export class ThemeManager {
  constructor() {
    this._preference = localStorage.getItem(STORAGE_KEY) || "system";
    this._mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    this._onSystemChange = () => {
      if (this._preference === "system") {
        this.applyTheme();
      }
    };
    this._mediaQuery.addEventListener("change", this._onSystemChange);
    this.applyTheme();
  }

  /** @returns {"dark"|"light"|"system"} */
  getPreference() {
    return this._preference;
  }

  /** @param {"dark"|"light"|"system"} value */
  setPreference(value) {
    this._preference = value;
    localStorage.setItem(STORAGE_KEY, value);
    this.applyTheme();
  }

  /** @returns {"dark"|"light"} */
  getEffectiveTheme() {
    if (this._preference === "system") {
      return this._mediaQuery.matches ? "dark" : "light";
    }
    return this._preference;
  }

  applyTheme() {
    const effective = this.getEffectiveTheme();
    document.documentElement.dataset.theme = effective;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.content = THEME_META_COLORS[effective];
    }
  }

  destroy() {
    this._mediaQuery.removeEventListener("change", this._onSystemChange);
  }
}
