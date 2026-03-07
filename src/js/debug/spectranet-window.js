/*
 * spectranet-window.js - Spectranet Ethernet interface debug window
 *
 * Shows Spectranet register state, socket status, and network configuration.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
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
      minWidth: 340,
      minHeight: 300,
      defaultWidth: 380,
      defaultHeight: 420,
      defaultPosition: { x: 80, y: 80 },
    });

    this.proxy = proxy;
    this.corsProxyUrl = localStorage.getItem("zxspec-spectranet-cors-proxy") || "";
    this.useStaticIP = localStorage.getItem("zxspec-spectranet-static-ip") !== "false";
    this.ipAddress = localStorage.getItem("zxspec-spectranet-ip") || "192.168.1.100";
    this.gateway = localStorage.getItem("zxspec-spectranet-gateway") || "192.168.1.1";
    this.subnet = localStorage.getItem("zxspec-spectranet-subnet") || "255.255.255.0";
    this.dns = localStorage.getItem("zxspec-spectranet-dns") || "8.8.8.8";
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
            <div class="spectranet-config-row spectranet-checkbox-row">
              <label class="spectranet-config-label">
                <input type="checkbox" id="snet-static-ip" ${this.useStaticIP ? "checked" : ""} />
                Use Static IP
              </label>
            </div>
            <div class="spectranet-config-row">
              <label class="spectranet-config-label">IP Address</label>
              <input type="text" class="spectranet-config-input spectranet-ip-input" id="snet-ip"
                     placeholder="192.168.1.100" value="${this.escapeAttr(this.ipAddress)}" />
            </div>
            <div class="spectranet-config-row">
              <label class="spectranet-config-label">Gateway</label>
              <input type="text" class="spectranet-config-input spectranet-ip-input" id="snet-gateway"
                     placeholder="192.168.1.1" value="${this.escapeAttr(this.gateway)}" />
            </div>
            <div class="spectranet-config-row">
              <label class="spectranet-config-label">Subnet</label>
              <input type="text" class="spectranet-config-input spectranet-ip-input" id="snet-subnet"
                     placeholder="255.255.255.0" value="${this.escapeAttr(this.subnet)}" />
            </div>
            <div class="spectranet-config-row">
              <label class="spectranet-config-label">DNS</label>
              <input type="text" class="spectranet-config-input spectranet-ip-input" id="snet-dns"
                     placeholder="8.8.8.8" value="${this.escapeAttr(this.dns)}" />
            </div>
            <button class="spectranet-apply-btn" id="snet-apply-network">Apply</button>
            <div class="spectranet-config-row">
              <label class="spectranet-config-label">CORS Proxy URL</label>
              <input type="text" class="spectranet-config-input" id="snet-cors-proxy"
                     placeholder="wss://proxy.example.com" value="${this.escapeAttr(this.corsProxyUrl)}" />
            </div>
          </div>
        </div>
      </div>
    `;
  }

  escapeAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  onContentRendered() {
    // CORS proxy input
    const corsInput = this.element.querySelector("#snet-cors-proxy");
    if (corsInput) {
      corsInput.addEventListener("change", () => {
        this.corsProxyUrl = corsInput.value.trim();
        localStorage.setItem("zxspec-spectranet-cors-proxy", this.corsProxyUrl);
        if (this.onCorsProxyUrlChanged) this.onCorsProxyUrlChanged(this.corsProxyUrl);
      });
    }

    // Static IP checkbox
    const staticCheckbox = this.element.querySelector("#snet-static-ip");
    if (staticCheckbox) {
      staticCheckbox.addEventListener("change", () => {
        this.useStaticIP = staticCheckbox.checked;
        localStorage.setItem("zxspec-spectranet-static-ip", this.useStaticIP);
        this.updateIPFieldsState();
      });
    }

    this.updateIPFieldsState();

    // Apply network config button
    const applyBtn = this.element.querySelector("#snet-apply-network");
    if (applyBtn) {
      applyBtn.addEventListener("click", () => this.applyNetworkConfig());
    }
  }

  parseIP(str) {
    const parts = str.trim().split(".").map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
    return parts;
  }

  updateIPFieldsState() {
    const disabled = !this.useStaticIP;
    for (const id of ["snet-ip", "snet-gateway", "snet-subnet", "snet-dns"]) {
      const el = this.element?.querySelector(`#${id}`);
      if (el) el.disabled = disabled;
    }
  }

  applyNetworkConfig() {
    const ipEl = this.element.querySelector("#snet-ip");
    const gwEl = this.element.querySelector("#snet-gateway");
    const snEl = this.element.querySelector("#snet-subnet");
    const dnsEl = this.element.querySelector("#snet-dns");

    const ip = this.parseIP(ipEl?.value || "");
    const gw = this.parseIP(gwEl?.value || "");
    const sn = this.parseIP(snEl?.value || "");
    const dns = this.parseIP(dnsEl?.value || "");

    if (!ip || !gw || !sn || !dns) return;

    this.ipAddress = ipEl.value.trim();
    this.gateway = gwEl.value.trim();
    this.subnet = snEl.value.trim();
    this.dns = dnsEl.value.trim();

    localStorage.setItem("zxspec-spectranet-ip", this.ipAddress);
    localStorage.setItem("zxspec-spectranet-gateway", this.gateway);
    localStorage.setItem("zxspec-spectranet-subnet", this.subnet);
    localStorage.setItem("zxspec-spectranet-dns", this.dns);

    this.proxy.spectranetSetStaticIP(this.useStaticIP);
    if (this.useStaticIP) {
      this.proxy.spectranetSetNetworkConfig(ip, gw, sn, dns);
    }
    this.proxy.reset();
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
      useStaticIP: this.useStaticIP,
      ipAddress: this.ipAddress,
      gateway: this.gateway,
      subnet: this.subnet,
      dns: this.dns,
    };
  }

  restoreState(state) {
    super.restoreState(state);
    if (state.corsProxyUrl !== undefined) {
      this.corsProxyUrl = state.corsProxyUrl;
      localStorage.setItem("zxspec-spectranet-cors-proxy", this.corsProxyUrl);
    }
    if (state.useStaticIP !== undefined) {
      this.useStaticIP = state.useStaticIP;
      localStorage.setItem("zxspec-spectranet-static-ip", this.useStaticIP);
    }
    if (state.ipAddress !== undefined) {
      this.ipAddress = state.ipAddress;
      localStorage.setItem("zxspec-spectranet-ip", this.ipAddress);
    }
    if (state.gateway !== undefined) {
      this.gateway = state.gateway;
      localStorage.setItem("zxspec-spectranet-gateway", this.gateway);
    }
    if (state.subnet !== undefined) {
      this.subnet = state.subnet;
      localStorage.setItem("zxspec-spectranet-subnet", this.subnet);
    }
    if (state.dns !== undefined) {
      this.dns = state.dns;
      localStorage.setItem("zxspec-spectranet-dns", this.dns);
    }
  }
}
