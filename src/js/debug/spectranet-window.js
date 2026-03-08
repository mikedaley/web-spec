/*
 * spectranet-window.js - Spectranet Ethernet interface debug window
 *
 * Shows Spectranet register state, socket status, and network configuration.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import {
  saveFlashSnapshot,
  listFlashSnapshots,
  loadFlashSnapshot,
  deleteFlashSnapshot,
  clearFlashData,
} from "../spectranet/spectranet-persistence.js";
import "../css/spectranet.css";

// W5100 socket status names
const SOCK_STATUS_NAMES = {
  0x00: "CLOSED",
  0x13: "INIT",
  0x14: "LISTEN",
  0x15: "SYNSENT",
  0x16: "SYNRECV",
  0x17: "ESTABLISHED",
  0x18: "FIN_WAIT",
  0x1A: "CLOSING",
  0x1B: "TIME_WAIT",
  0x1C: "CLOSE_WAIT",
  0x1D: "LAST_ACK",
  0x22: "UDP",
};

export class SpectranetWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "spectranet",
      title: "Spectranet",
      defaultWidth: 340,
      defaultHeight: 0,
      defaultPosition: { x: 80, y: 80 },
      resizeDirections: [],
    });

    this.proxy = proxy;
    this.corsProxyUrl = localStorage.getItem("zxspec-spectranet-cors-proxy") || "wss://spectrem-proxy.retrotech71.co.uk";
    this.snapshots = [];
  }

  renderContent() {
    return `
      <div class="spectranet-content">
        <div class="spectranet-section">
          <div class="spectranet-section-title">Status</div>
          <div class="spectranet-registers">
            <div class="spectranet-reg-row">
              <span class="spectranet-reg-name">Enabled</span>
              <span class="spectranet-reg-value" id="snet-enabled">No</span>
            </div>
            <div class="spectranet-reg-row">
              <span class="spectranet-reg-name">Paged In</span>
              <span class="spectranet-reg-value" id="snet-paged-in">No</span>
            </div>
            <div class="spectranet-reg-row">
              <span class="spectranet-reg-name">Page A</span>
              <span class="spectranet-reg-value" id="snet-page-a">00</span>
            </div>
            <div class="spectranet-reg-row">
              <span class="spectranet-reg-name">Page B</span>
              <span class="spectranet-reg-value" id="snet-page-b">00</span>
            </div>
            <div class="spectranet-reg-row">
              <span class="spectranet-reg-name">Control</span>
              <span class="spectranet-reg-value" id="snet-control">00</span>
            </div>
            <div class="spectranet-reg-row">
              <span class="spectranet-reg-name">Trap Addr</span>
              <span class="spectranet-reg-value" id="snet-trap-addr">0000</span>
            </div>
            <div class="spectranet-reg-row">
              <span class="spectranet-reg-name">Trap Enabled</span>
              <span class="spectranet-reg-value" id="snet-trap-enabled">No</span>
            </div>
          </div>
        </div>

        <div class="spectranet-section">
          <div class="spectranet-section-title">Sockets</div>
          <div class="spectranet-sockets">
            ${[0, 1, 2, 3].map(i => `
              <div class="spectranet-socket" id="snet-socket-${i}">
                <span class="spectranet-socket-num">${i}</span>
                <span class="spectranet-socket-status" id="snet-sock-status-${i}">CLOSED</span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="spectranet-section">
          <div class="spectranet-section-title">Network Config</div>
          <div class="spectranet-config">
            <div class="spectranet-config-row">
              <label class="spectranet-config-label">Proxy URL</label>
              <input type="text" class="spectranet-config-input" id="snet-cors-proxy"
                     placeholder="wss://proxy.example.com" value="${this.escapeAttr(this.corsProxyUrl)}" />
            </div>
            <button class="spectranet-apply-btn" id="snet-apply-cors">Apply</button>
          </div>
        </div>

        <div class="spectranet-section">
          <div class="spectranet-section-title">Flash Storage</div>
          <div class="spectranet-flash-storage">
            <div class="spectranet-flash-save-row">
              <input type="text" class="spectranet-config-input spectranet-flash-name-input" id="snet-flash-name"
                     placeholder="Snapshot name" />
              <button class="spectranet-apply-btn" id="snet-flash-save">Save</button>
            </div>
            <div class="spectranet-flash-list" id="snet-flash-list"></div>
          </div>
        </div>
      </div>
    `;
  }

  escapeAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  onContentRendered() {
    // Auto-size height to fit content
    this.element.style.height = "auto";

    // Apply CORS proxy button
    const applyBtn = this.element.querySelector("#snet-apply-cors");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => {
        const corsInput = this.element.querySelector("#snet-cors-proxy");
        if (corsInput) {
          this.corsProxyUrl = corsInput.value.trim();
          localStorage.setItem("zxspec-spectranet-cors-proxy", this.corsProxyUrl);
          if (this.onCorsProxyUrlChanged) this.onCorsProxyUrlChanged(this.corsProxyUrl);
        }

        applyBtn.textContent = "Applied!";
        applyBtn.classList.add("spectranet-apply-btn-success");
        setTimeout(() => {
          applyBtn.textContent = "Apply";
          applyBtn.classList.remove("spectranet-apply-btn-success");
        }, 1500);
      });
    }

    // Save flash snapshot
    const saveBtn = this.element.querySelector("#snet-flash-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        const nameInput = this.element.querySelector("#snet-flash-name");
        const name = nameInput?.value.trim();
        if (!name) {
          nameInput?.focus();
          return;
        }
        try {
          const flashData = await this.proxy.spectranetGetFlashData();
          if (flashData) {
            await saveFlashSnapshot(name, flashData);
            nameInput.value = "";
            await this.refreshSnapshotList();
          }
        } catch (error) {
          console.error("Failed to save flash snapshot:", error);
        }
      });
    }

    // Initial snapshot list load
    this.refreshSnapshotList();
  }

  async refreshSnapshotList() {
    this.snapshots = await listFlashSnapshots();
    const listEl = this.element?.querySelector("#snet-flash-list");
    if (!listEl) return;

    // Fixed ROM entry at top + user snapshots
    let html = `
      <div class="spectranet-flash-item" data-id="__rom_default__">
        <div class="spectranet-flash-item-info">
          <span class="spectranet-flash-item-name">Default ROM</span>
          <span class="spectranet-flash-item-date">Built-in firmware</span>
        </div>
        <div class="spectranet-flash-item-actions">
          <button class="spectranet-flash-action-btn snet-flash-load" title="Load">Load</button>
        </div>
      </div>`;

    html += this.snapshots.map(snap => `
      <div class="spectranet-flash-item" data-id="${snap.id}">
        <div class="spectranet-flash-item-info">
          <span class="spectranet-flash-item-name">${this.escapeAttr(snap.name)}</span>
          <span class="spectranet-flash-item-date">${this.formatDate(snap.savedAt)}</span>
        </div>
        <div class="spectranet-flash-item-actions">
          <button class="spectranet-flash-action-btn snet-flash-load" title="Load">Load</button>
          <button class="spectranet-flash-action-btn snet-flash-delete" title="Delete">Del</button>
        </div>
      </div>
    `).join("");

    listEl.innerHTML = html;

    // Bind action buttons
    for (const item of listEl.querySelectorAll(".spectranet-flash-item")) {
      const id = item.dataset.id;

      item.querySelector(".snet-flash-load")?.addEventListener("click", async () => {
        if (id === "__rom_default__") {
          await clearFlashData();
          this.proxy.spectranetReloadROM();
          if (this.onFlashCleared) this.onFlashCleared();
        } else {
          const data = await loadFlashSnapshot(id);
          if (data) {
            this.proxy.spectranetSetFlashData(data);
            if (this.onFlashLoaded) this.onFlashLoaded();
          }
        }
      });

      item.querySelector(".snet-flash-delete")?.addEventListener("click", async () => {
        await deleteFlashSnapshot(id);
        await this.refreshSnapshotList();
      });
    }

    // Re-auto-size after list change
    this.element.style.height = "auto";
  }

  formatDate(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  update(proxy) {
    if (!this.isVisible || !proxy) return;

    const state = proxy.state;
    if (!state) return;

    this.setText("snet-enabled", state.spectranetEnabled ? "Yes" : "No");
    this.setText("snet-paged-in", state.spectranetPagedIn ? "Yes" : "No");
    this.setText("snet-page-a", this.hex8(state.spectranetPageA));
    this.setText("snet-page-b", this.hex8(state.spectranetPageB));
    this.setText("snet-control", this.hex8(state.spectranetControlReg));
    this.setText("snet-trap-addr", this.hex16(state.spectranetTrapAddr));
    this.setText("snet-trap-enabled", state.spectranetTrapEnabled ? "Yes" : "No");

    // Socket status
    const statusFields = [
      state.spectranetSocket0Status,
      state.spectranetSocket1Status,
      state.spectranetSocket2Status,
      state.spectranetSocket3Status,
    ];
    for (let i = 0; i < 4; i++) {
      const statusEl = this.element?.querySelector(`#snet-sock-status-${i}`);
      if (statusEl) {
        const statusName = SOCK_STATUS_NAMES[statusFields[i]] || `0x${this.hex8(statusFields[i])}`;
        statusEl.textContent = statusName;
        statusEl.classList.toggle("spectranet-socket-active", statusFields[i] !== 0x00);
      }
    }
  }

  setText(id, text) {
    const el = this.element?.querySelector(`#${id}`);
    if (el) el.textContent = text;
  }

  hex8(v) {
    return (v ?? 0).toString(16).toUpperCase().padStart(2, "0");
  }

  hex16(v) {
    return (v ?? 0).toString(16).toUpperCase().padStart(4, "0");
  }

  getState() {
    const base = super.getState();
    return {
      ...base,
      corsProxyUrl: this.corsProxyUrl,
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.corsProxyUrl !== undefined) {
      this.corsProxyUrl = state.corsProxyUrl;
      localStorage.setItem("zxspec-spectranet-cors-proxy", this.corsProxyUrl);
    }
  }
}
