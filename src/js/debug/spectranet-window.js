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
  updateFlashSnapshot,
  listFlashSnapshots,
  loadFlashSnapshot,
  deleteFlashSnapshot,
  renameFlashSnapshot,
  clearFlashData,
} from "../spectranet/spectranet-persistence.js";
import { showToast } from "../ui/toast.js";
import "../css/spectranet.css";

// Flash config page layout (page 0x1F, from Spectranet flashconf.inc)
// Config sections:  page offset 0x0000-0x0CFF (module key-value configs)
// Mount table:      page offset 0x0D00-0x0EFF (4 mounts x 128 bytes)
// Network config:   page offset 0x0F00-0x0FFF
const CFG_PAGE = 0x1F * 4096;  // Absolute start of config page in 128KB flash

// Network config offsets (absolute in flash)
const NET = {
  GATEWAY:       CFG_PAGE + 0x0F00,
  SUBNET:        CFG_PAGE + 0x0F04,
  MAC:           CFG_PAGE + 0x0F08,
  IP:            CFG_PAGE + 0x0F0E,
  INITFLAGS:     CFG_PAGE + 0x0F12,
  HOSTNAME:      CFG_PAGE + 0x0F13,
  PRIMARY_DNS:   CFG_PAGE + 0x0F24,
  SECONDARY_DNS: CFG_PAGE + 0x0F28,
};

// Mount table: 4 entries starting at page offset 0x0D00, each 0x80 bytes
const MOUNT_BASE = CFG_PAGE + 0x0D00;
const MOUNT_STRIDE = 0x80;
const MOUNT_FIELDS = { POINT: 0x00, PROTO: 0x01, HOST: 0x07, PATH: 0x30, USER: 0x60, PASS: 0x70 };
const MOUNT_PROTO_LEN = 0x07 - 0x01; // 6 bytes (null-terminated string, e.g. "tnfs")
const MOUNT_HOST_LEN = 0x30 - 0x07;  // 41 bytes
const MOUNT_PATH_LEN = 0x60 - 0x30;  // 48 bytes
const MOUNT_USER_LEN = 0x70 - 0x60;  // 16 bytes

// Config section system: starts at page offset 0x0000
const CFG_SECTIONS_BASE = CFG_PAGE;
const AM_SECTION_ID = 0x01FF;   // Automount config section
const AM_FS0 = 0x00;            // Automount URL keys (string items)
const AM_FS3 = 0x03;
const AM_AUTOBOOT = 0x81;       // Autoboot key (byte item)

function readFlashString(data, offset, maxLen) {
  let s = "";
  for (let i = 0; i < maxLen; i++) {
    const b = data[offset + i];
    if (b === 0 || b === 0xFF) break;
    s += String.fromCharCode(b);
  }
  return s;
}

function parseMounts(data) {
  const mounts = [];
  for (let i = 0; i < 4; i++) {
    const base = MOUNT_BASE + i * MOUNT_STRIDE;
    const proto = readFlashString(data, base + MOUNT_FIELDS.PROTO, MOUNT_PROTO_LEN);
    const host = readFlashString(data, base + MOUNT_FIELDS.HOST, MOUNT_HOST_LEN);
    if (!proto && !host) continue;  // Unconfigured slot (all 0xFF or 0x00)
    const path = readFlashString(data, base + MOUNT_FIELDS.PATH, MOUNT_PATH_LEN);
    const user = readFlashString(data, base + MOUNT_FIELDS.USER, MOUNT_USER_LEN);
    mounts.push({ index: i, proto: proto || "tnfs", host: host || "", path: path || "/", user: user || null });
  }
  return mounts;
}

function parseConfigSections(data) {
  // Config section binary format (from Spectranet configdata.asm):
  //   2-byte total size (LE), then sections:
  //     2-byte section ID (LE), 2-byte section size (LE), then items
  //   Item types by ID bit pattern (Z80 checks bit 7, then bit 6):
  //     0x00-0x7F (bit 7 = 0): string — 1-byte ID + null-terminated string
  //     0x80-0xBF (bit 7 = 1, bit 6 = 0): byte — 1-byte ID + 1-byte value
  //     0xC0-0xFF (bit 7 = 1, bit 6 = 1): word — 1-byte ID + 2-byte value (LE)
  const result = { autoboot: null, automountUrls: [] };
  const base = CFG_SECTIONS_BASE;
  if (data.length < base + 4) return result;

  const totalSize = data[base] | (data[base + 1] << 8);
  if (totalSize === 0 || totalSize === 0xFFFF || totalSize > 0x0CFF) return result;

  let pos = base + 2;
  const end = base + 2 + totalSize;

  while (pos + 4 <= end) {
    const sectionId = data[pos] | (data[pos + 1] << 8);
    const sectionSize = data[pos + 2] | (data[pos + 3] << 8);
    if (sectionId === 0xFFFF || sectionSize === 0xFFFF) break;

    const sectionEnd = pos + 4 + sectionSize;
    if (sectionId === AM_SECTION_ID) {
      // Parse items within the automount section
      let itemPos = pos + 4;
      while (itemPos < sectionEnd) {
        const id = data[itemPos++];
        if (id === 0xFF) break;
        if ((id & 0x80) === 0x00) {
          // String item (0x00-0x7F) — read null-terminated string
          let str = "";
          while (itemPos < sectionEnd && data[itemPos] !== 0) {
            str += String.fromCharCode(data[itemPos++]);
          }
          itemPos++;  // Skip null terminator
          if (id >= AM_FS0 && id <= AM_FS3 && str) {
            result.automountUrls.push({ index: id, url: str });
          }
        } else if ((id & 0xC0) === 0x80) {
          // Byte item
          if (itemPos < sectionEnd) {
            if (id === AM_AUTOBOOT) result.autoboot = data[itemPos];
            itemPos++;
          }
        } else {
          // Word item (0xC0-0xFF)
          itemPos += 2;
        }
      }
    }
    pos = sectionEnd;
  }
  return result;
}

function parseFlashConfig(data) {
  if (!data || data.length < CFG_PAGE + 0x0F2C) return null;

  const ip = (o) => `${data[o]}.${data[o + 1]}.${data[o + 2]}.${data[o + 3]}`;
  const mac = (o) => Array.from(data.slice(o, o + 6), b => b.toString(16).toUpperCase().padStart(2, "0")).join(":");
  const hostname = readFlashString(data, NET.HOSTNAME, 16);
  const flags = data[NET.INITFLAGS];

  const mounts = parseMounts(data);
  const sections = parseConfigSections(data);

  return {
    ip: ip(NET.IP),
    gateway: ip(NET.GATEWAY),
    subnet: ip(NET.SUBNET),
    primaryDns: ip(NET.PRIMARY_DNS),
    secondaryDns: ip(NET.SECONDARY_DNS),
    mac: mac(NET.MAC),
    hostname: hostname || "(none)",
    staticIp: (flags & 0x02) !== 0,
    disableRst8: (flags & 0x04) !== 0,
    mounts,
    automountUrls: sections.automountUrls,
    autoboot: sections.autoboot,
  };
}

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
      defaultHeight: 520,
      defaultPosition: { x: 80, y: 80 },
      resizeDirections: ["s"],
    });

    this.proxy = proxy;
    this.corsProxyUrl = localStorage.getItem("zxspec-spectranet-cors-proxy") || "wss://spectrem-proxy.retrotech71.co.uk";
    this.snapshots = [];
    this.activeSnapshotId = localStorage.getItem("zxspec-spectranet-active-flash") || "__rom_default__";
    this.configCache = new Map();
    this.tooltip = null;
    this.tooltipHoverTimer = null;
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
    // Insert TX/RX LEDs into window header
    const closeBtn = this.headerElement.querySelector(".debug-window-close");
    if (closeBtn) {
      const ledContainer = document.createElement("span");
      ledContainer.className = "spectranet-header-leds";
      ledContainer.innerHTML = `<span class="spectranet-led" id="snet-tx-led">TX</span><span class="spectranet-led" id="snet-rx-led">RX</span>`;
      closeBtn.parentNode.insertBefore(ledContainer, closeBtn);
    }

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

        showToast("CORS proxy URL applied");
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
            const newId = await saveFlashSnapshot(name, flashData);
            nameInput.value = "";
            if (newId) this.setActiveSnapshot(newId);
            else await this.refreshSnapshotList();
            showToast(`Flash snapshot "${name}" saved`);
          }
        } catch (error) {
          console.error("Failed to save flash snapshot:", error);
        }
      });
    }

    // Create config tooltip element
    this.tooltip = document.createElement("div");
    this.tooltip.className = "spectranet-flash-tooltip";
    document.body.appendChild(this.tooltip);

    // Initial snapshot list load
    this.refreshSnapshotList();
  }

  async refreshSnapshotList() {
    this.snapshots = await listFlashSnapshots();
    const listEl = this.element?.querySelector("#snet-flash-list");
    if (!listEl) return;

    // Fixed ROM entry at top + user snapshots
    const active = this.activeSnapshotId;
    let html = `
      <div class="spectranet-flash-item${active === "__rom_default__" ? " spectranet-flash-active" : ""}" data-id="__rom_default__">
        <div class="spectranet-flash-item-info">
          <span class="spectranet-flash-item-name">Default</span>
          <span class="spectranet-flash-item-date">Built-in firmware</span>
        </div>
        <div class="spectranet-flash-item-actions">
          <button class="spectranet-flash-action-btn snet-flash-load" title="Load">Load</button>
        </div>
      </div>`;

    html += this.snapshots.map(snap => `
      <div class="spectranet-flash-item${active === snap.id ? " spectranet-flash-active" : ""}" data-id="${snap.id}">
        <div class="spectranet-flash-item-info">
          <span class="spectranet-flash-item-name">${this.escapeAttr(snap.name)}</span>
          <span class="spectranet-flash-item-date">${this.formatDate(snap.savedAt)}</span>
        </div>
        <div class="spectranet-flash-item-actions">
          <button class="spectranet-flash-action-btn snet-flash-save" title="Save current flash to this snapshot">Save</button>
          <button class="spectranet-flash-action-btn snet-flash-load" title="Load">Load</button>
          <button class="spectranet-flash-action-btn snet-flash-rename" title="Rename">Ren</button>
          <button class="spectranet-flash-action-btn snet-flash-delete" title="Delete">Del</button>
        </div>
      </div>
    `).join("");

    listEl.innerHTML = html;

    // Bind action buttons
    for (const item of listEl.querySelectorAll(".spectranet-flash-item")) {
      const id = item.dataset.id;
      const itemName = item.querySelector(".spectranet-flash-item-name")?.textContent || id;

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
        this.setActiveSnapshot(id);
        showToast(`Flash "${itemName}" loaded`);
      });

      item.querySelector(".snet-flash-save")?.addEventListener("click", async () => {
        try {
          const flashData = await this.proxy.spectranetGetFlashData();
          if (flashData) {
            await updateFlashSnapshot(id, flashData);
            this.configCache.delete(id);
            await this.refreshSnapshotList();
            showToast(`Flash "${itemName}" updated`);
          }
        } catch (error) {
          console.error("Failed to update flash snapshot:", error);
        }
      });

      item.querySelector(".snet-flash-rename")?.addEventListener("click", () => {
        const nameEl = item.querySelector(".spectranet-flash-item-name");
        if (!nameEl) return;

        const input = document.createElement("input");
        input.type = "text";
        input.className = "spectranet-config-input spectranet-flash-rename-input";
        input.value = itemName;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const commit = async () => {
          const newName = input.value.trim();
          if (newName && newName !== itemName) {
            await renameFlashSnapshot(id, newName);
            showToast(`Renamed to "${newName}"`);
          }
          await this.refreshSnapshotList();
        };

        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); this.refreshSnapshotList(); }
        });
        input.addEventListener("blur", commit);
      });

      item.querySelector(".snet-flash-delete")?.addEventListener("click", async () => {
        await deleteFlashSnapshot(id);
        this.configCache.delete(id);
        showToast(`Flash "${itemName}" deleted`);
        await this.refreshSnapshotList();
      });

      // Hover tooltip for snapshot config
      if (id !== "__rom_default__") {
        item.addEventListener("mouseenter", (e) => {
          clearTimeout(this.tooltipHoverTimer);
          this.tooltipHoverTimer = setTimeout(() => this.showConfigTooltip(id, e), 400);
        });
        item.addEventListener("mousemove", (e) => this.positionTooltip(e));
        item.addEventListener("mouseleave", () => {
          clearTimeout(this.tooltipHoverTimer);
          this.hideConfigTooltip();
        });
      }
    }

  }

  flashTx() {
    this.flashLed("snet-tx-led");
  }

  flashRx() {
    this.flashLed("snet-rx-led");
  }

  flashLed(id) {
    const el = this.element?.querySelector(`#${id}`);
    if (!el) return;
    el.classList.add("spectranet-led-on");
    clearTimeout(el._ledTimer);
    el._ledTimer = setTimeout(() => el.classList.remove("spectranet-led-on"), 100);
  }

  setActiveSnapshot(id) {
    this.activeSnapshotId = id;
    localStorage.setItem("zxspec-spectranet-active-flash", id);
    this.refreshSnapshotList();
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

  async showConfigTooltip(id, e) {
    if (!this.tooltip) return;

    let config = this.configCache.get(id);
    if (!config) {
      const data = await loadFlashSnapshot(id);
      if (!data) return;
      config = parseFlashConfig(data);
      if (!config) return;
      this.configCache.set(id, config);
    }

    const row = (label, value) =>
      `<div class="spectranet-tooltip-row"><span class="spectranet-tooltip-label">${label}</span><span class="spectranet-tooltip-value">${this.escapeAttr(value)}</span></div>`;
    const heading = (text) =>
      `<div class="spectranet-tooltip-heading">${text}</div>`;

    let html = heading("Network");
    html += row("Hostname", config.hostname);
    html += row("IP", config.ip);
    html += row("Gateway", config.gateway);
    html += row("Subnet", config.subnet);
    html += row("DNS", config.primaryDns);
    html += row("DNS 2", config.secondaryDns);
    html += row("MAC", config.mac);
    html += row("Mode", config.staticIp ? "Static" : "DHCP");
    if (config.disableRst8) html += row("RST8 Traps", "Disabled");

    // Merge both sources: automount URLs (config sections) and fixed mount table.
    // Show automount URL when available, otherwise fall back to mount table fields.
    const hasMounts = config.mounts.length > 0 || config.automountUrls.length > 0;
    if (hasMounts) {
      html += heading("Filesystems");
      const urlMap = new Map(config.automountUrls.map(u => [u.index, u.url]));
      const mountMap = new Map(config.mounts.map(m => [m.index, m]));
      const allIndices = new Set([...urlMap.keys(), ...mountMap.keys()]);
      for (const idx of [...allIndices].sort()) {
        const url = urlMap.get(idx);
        const mt = mountMap.get(idx);
        if (url) {
          html += row(`Mount ${idx}`, url);
        } else if (mt) {
          html += row(`Mount ${idx}`, `${mt.proto}://${mt.host}${mt.path}`);
        }
        if (mt?.user) html += row(`  User`, mt.user);
      }
    }

    if (config.autoboot !== null && config.autoboot !== undefined && config.autoboot !== 0xFF) {
      html += heading("Autoboot");
      html += row("Boot from", `Mount ${config.autoboot}`);
    }

    this.tooltip.innerHTML = html;
    this.positionTooltip(e);
    this.tooltip.classList.add("spectranet-flash-tooltip-visible");
  }

  positionTooltip(e) {
    if (!this.tooltip) return;
    const pad = 12;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const rect = this.tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = e.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - pad;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  hideConfigTooltip() {
    if (this.tooltip) this.tooltip.classList.remove("spectranet-flash-tooltip-visible");
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
