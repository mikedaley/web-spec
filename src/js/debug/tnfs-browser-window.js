/*
 * tnfs-browser-window.js - TNFS file browser window
 *
 * Allows browsing TNFS servers to navigate directories and load
 * snapshot/tape files directly into the emulator.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import { TNFSClient } from "../spectranet/tnfs-client.js";
import { showToast } from "../ui/toast.js";
import "../css/tnfs-browser.css";

const DEFAULT_TNFS_SERVER = "tnfs.fantasylands.net";
const LOADABLE_EXTENSIONS = new Set(["sna", "z80", "tap", "tzx"]);

export class TNFSBrowserWindow extends BaseWindow {
  constructor(snapshotLoader) {
    super({
      id: "tnfs-browser",
      title: "TNFS Browser",
      defaultWidth: 460,
      defaultHeight: 520,
      minWidth: 360,
      minHeight: 320,
      defaultPosition: { x: 120, y: 80 },
      resizeDirections: ["n", "e", "s", "w", "ne", "nw", "se", "sw"],
    });

    this.snapshotLoader = snapshotLoader;
    this.client = new TNFSClient();
    this.currentPath = "/";
    this.entries = [];
    this.serverUrl = localStorage.getItem("zxspec-tnfs-server") || DEFAULT_TNFS_SERVER;
    this.loading = false;
    this.error = null;
    this.downloading = null; // Name of file currently being downloaded
  }

  renderContent() {
    return `
      <div class="tnfs-container">
        <div class="tnfs-connect-bar">
          <input type="text" class="tnfs-server-input" id="tnfs-server"
                 placeholder="tnfs.example.com" value="${this._escapeAttr(this.serverUrl)}" />
          <button class="tnfs-connect-btn" id="tnfs-connect">Connect</button>
        </div>
        <div class="tnfs-path-bar" id="tnfs-path-bar">
          <button class="tnfs-up-btn" id="tnfs-up" title="Go up" disabled>
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M8 3L2 9h4v4h4V9h4z" fill="currentColor"/>
            </svg>
          </button>
          <span class="tnfs-path" id="tnfs-path">/</span>
        </div>
        <div class="tnfs-file-list" id="tnfs-file-list">
          <div class="tnfs-empty">Enter a TNFS server address and click Connect</div>
        </div>
        <div class="tnfs-status-bar" id="tnfs-status">
          <span id="tnfs-status-text">Disconnected</span>
        </div>
      </div>`;
  }

  onContentRendered() {
    const serverInput = this.element.querySelector("#tnfs-server");
    const connectBtn = this.element.querySelector("#tnfs-connect");
    const upBtn = this.element.querySelector("#tnfs-up");
    const fileList = this.element.querySelector("#tnfs-file-list");

    connectBtn.addEventListener("click", () => {
      const server = serverInput.value.trim();
      if (!server) return;
      this.serverUrl = server;
      localStorage.setItem("zxspec-tnfs-server", server);
      this._connect();
    });

    serverInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        connectBtn.click();
      }
    });

    upBtn.addEventListener("click", () => {
      this._navigateUp();
    });

    fileList.addEventListener("click", (e) => {
      const item = e.target.closest(".tnfs-item");
      if (!item || this.loading) return;

      const name = item.dataset.name;
      const isDir = item.dataset.dir === "true";

      if (isDir) {
        this._navigateTo(name);
      } else {
        this._loadFile(name);
      }
    });

    fileList.addEventListener("dblclick", (e) => {
      // Double-click is already handled by single click for dirs
      // and load for files — prevent text selection
      e.preventDefault();
    });
  }

  async _connect() {
    if (this.loading) return;

    const proxyUrl = localStorage.getItem("zxspec-spectranet-cors-proxy") || "wss://spectrem-proxy.retrotech71.co.uk";

    this.loading = true;
    this.error = null;
    this.currentPath = "/";
    this._updateUI();

    try {
      await this.client.mount(this.serverUrl, proxyUrl);
      this._setStatus(`Connected to ${this.serverUrl}`);
      await this._listCurrentDir();
    } catch (err) {
      this.error = err.message;
      this.loading = false;
      this._updateUI();
      this._setStatus(`Error: ${err.message}`);
    }
  }

  async _listCurrentDir() {
    this.loading = true;
    this.error = null;
    this._updateUI();

    try {
      this.entries = await this.client.listDirectory(this.currentPath);
      this.loading = false;
      this._updateUI();
      this._setStatus(`${this.entries.length} item${this.entries.length !== 1 ? "s" : ""}`);
    } catch (err) {
      this.error = err.message;
      this.entries = [];
      this.loading = false;
      this._updateUI();
      this._setStatus(`Error: ${err.message}`);
    }
  }

  _navigateTo(dirName) {
    if (this.currentPath.endsWith("/")) {
      this.currentPath += dirName;
    } else {
      this.currentPath += "/" + dirName;
    }
    this._listCurrentDir();
  }

  _navigateUp() {
    if (this.currentPath === "/") return;

    const parts = this.currentPath.split("/").filter(Boolean);
    parts.pop();
    this.currentPath = "/" + parts.join("/");
    if (this.currentPath !== "/") this.currentPath += "/";
    this._listCurrentDir();
  }

  async _loadFile(name) {
    if (this.downloading) return;

    const ext = name.split(".").pop().toLowerCase();
    if (!LOADABLE_EXTENSIONS.has(ext)) {
      showToast(`Cannot load .${ext} files`);
      return;
    }

    const fullPath = this.currentPath.endsWith("/")
      ? this.currentPath + name
      : this.currentPath + "/" + name;

    this.downloading = name;
    this._setStatus(`Downloading ${name}...`);
    this._updateDownloadState();

    try {
      const data = await this.client.readFile(fullPath);
      const file = new File([data], name, { type: "application/octet-stream" });
      this.snapshotLoader.loadFile(file);
      this._setStatus(`Loaded ${name}`);
    } catch (err) {
      showToast(`Failed to load ${name}: ${err.message}`);
      this._setStatus(`Error: ${err.message}`);
    } finally {
      this.downloading = null;
      this._updateDownloadState();
    }
  }

  _updateUI() {
    const fileList = this.element.querySelector("#tnfs-file-list");
    const pathEl = this.element.querySelector("#tnfs-path");
    const upBtn = this.element.querySelector("#tnfs-up");

    pathEl.textContent = this.currentPath;
    upBtn.disabled = this.currentPath === "/" || this.loading;

    if (this.loading) {
      fileList.innerHTML = '<div class="tnfs-loading"><span class="tnfs-spinner"></span>Loading...</div>';
      return;
    }

    if (this.error) {
      fileList.innerHTML = `<div class="tnfs-error">${this._escapeHtml(this.error)}</div>`;
      return;
    }

    if (this.entries.length === 0 && this.client.connected) {
      fileList.innerHTML = '<div class="tnfs-empty">Directory is empty</div>';
      return;
    }

    if (!this.client.connected) {
      fileList.innerHTML = '<div class="tnfs-empty">Enter a TNFS server address and click Connect</div>';
      return;
    }

    let html = "";
    for (const entry of this.entries) {
      const ext = entry.name.split(".").pop().toLowerCase();
      const loadable = !entry.isDir && LOADABLE_EXTENSIONS.has(ext);
      const iconClass = entry.isDir ? "tnfs-icon-dir" : (loadable ? "tnfs-icon-file-loadable" : "tnfs-icon-file");
      const sizeStr = entry.isDir ? "" : this._formatSize(entry.size);
      const itemClass = `tnfs-item${entry.isDir ? " tnfs-item-dir" : ""}${loadable ? " tnfs-item-loadable" : ""}`;

      html += `
        <div class="${itemClass}" data-name="${this._escapeAttr(entry.name)}" data-dir="${entry.isDir}">
          <span class="tnfs-item-icon ${iconClass}"></span>
          <span class="tnfs-item-name">${this._escapeHtml(entry.name)}</span>
          <span class="tnfs-item-size">${sizeStr}</span>
        </div>`;
    }
    fileList.innerHTML = html;
  }

  _updateDownloadState() {
    const items = this.element.querySelectorAll(".tnfs-item");
    for (const item of items) {
      if (this.downloading && item.dataset.name === this.downloading) {
        item.classList.add("tnfs-downloading");
      } else {
        item.classList.remove("tnfs-downloading");
      }
    }
  }

  _setStatus(text) {
    const el = this.element.querySelector("#tnfs-status-text");
    if (el) el.textContent = text;
  }

  _formatSize(bytes) {
    if (bytes === 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  _escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  _escapeAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  getState() {
    const base = super.getState();
    return {
      ...base,
      serverUrl: this.serverUrl,
      lastPath: this.currentPath,
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.serverUrl !== undefined) {
      this.serverUrl = state.serverUrl;
      localStorage.setItem("zxspec-tnfs-server", this.serverUrl);
    }
  }

  destroy() {
    this.client.destroy();
    super.destroy();
  }
}
