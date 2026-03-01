/*
 * memory-map-window.js - Memory map debug window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/memory-map.css";

export class MemoryMapWindow extends BaseWindow {
  constructor() {
    super({
      id: "memory-map",
      title: "Memory Map",
      defaultWidth: 320,
      defaultHeight: 100,
      minWidth: 320,
      minHeight: 100,
      maxWidth: 320,
      defaultPosition: { x: 620, y: 60 },
      resizeDirections: [],
    });
    this._lastMachineId = -1;
    this._lastPagingReg = -1;
    this._lastSpSlot = -1;
    this._slotEls = [];
  }

  renderContent() {
    return `
      <div class="memmap-machine">
        <span>Machine:</span>
        <span class="memmap-machine-name" id="memmap-machine-name">—</span>
      </div>
      <div class="memmap-slots" id="memmap-slots"></div>
      <div class="memmap-legend" id="memmap-legend"></div>
    `;
  }

  onContentRendered() {
    this._machineNameEl = this.contentElement.querySelector("#memmap-machine-name");
    this._slotsEl = this.contentElement.querySelector("#memmap-slots");
    this._legendEl = this.contentElement.querySelector("#memmap-legend");
  }

  update(proxy) {
    if (!proxy || !this._slotsEl) return;

    const machineId = proxy.getMachineId();
    const pagingReg = proxy.getPagingRegister();

    // Full re-render when paging state changes
    if (machineId !== this._lastMachineId || pagingReg !== this._lastPagingReg) {
      this._lastMachineId = machineId;
      this._lastPagingReg = pagingReg;
      this._lastSpSlot = -1;

      const is128k = machineId === 1;
      const pagingLocked = is128k && (pagingReg & 0x20) !== 0;
      this._machineNameEl.textContent = is128k ? "ZX Spectrum 128K" : "ZX Spectrum 48K";


      const slots = this._computeSlots(machineId, pagingReg);
      this._renderSlots(slots, is128k, pagingLocked);
    }

    // Lightweight SP badge update every frame
    this._updateSpBadge(proxy);
  }

  _computeSlots(machineId, pagingReg) {
    if (machineId === 1) {
      // 128K: decode port 0x7FFD
      const romSelect = (pagingReg & 0x10) ? 1 : 0;
      const screenBank = (pagingReg & 0x08) ? 7 : 5;
      const switchBank = pagingReg & 0x07;
      // Contended banks: 1, 3, 5, 7 (odd-numbered)
      const isSwitchContended = (switchBank & 1) === 1;

      return [
        {
          addr: "0000–3FFF",
          label: `ROM ${romSelect}`,
          type: "rom",
          contended: false,
          screen: false,
          switchable: false,
        },
        {
          addr: "4000–7FFF",
          label: "Bank 5",
          type: "ram",
          contended: true,
          screen: screenBank === 5,
          switchable: false,
        },
        {
          addr: "8000–BFFF",
          label: "Bank 2",
          type: "ram",
          contended: false,
          screen: false,
          switchable: false,
        },
        {
          addr: "C000–FFFF",
          label: `Bank ${switchBank}`,
          type: "ram",
          contended: isSwitchContended,
          screen: switchBank === screenBank,
          switchable: true,
        },
      ];
    }

    // 48K: fixed layout
    return [
      {
        addr: "0000–3FFF",
        label: "ROM",
        type: "rom",
        contended: false,
        screen: false,
        switchable: false,
      },
      {
        addr: "4000–7FFF",
        label: "Bank 0",
        type: "ram",
        contended: true,
        screen: true,
        switchable: false,
      },
      {
        addr: "8000–BFFF",
        label: "Bank 1",
        type: "ram",
        contended: false,
        screen: false,
        switchable: false,
      },
      {
        addr: "C000–FFFF",
        label: "Bank 2",
        type: "ram",
        contended: false,
        screen: false,
        switchable: false,
      },
    ];
  }

  _renderSlots(slots, is128k, pagingLocked = false) {
    let html = "";
    for (const slot of slots) {
      const typeClass = `memmap-slot-${slot.type}`;
      const switchClass = slot.switchable ? "memmap-slot-switchable" : "";
      let badges = "";
      if (slot.contended) {
        badges += '<span class="memmap-badge memmap-badge-contended" title="Contended">C</span>';
      }
      if (slot.screen) {
        badges += '<span class="memmap-badge memmap-badge-screen" title="Screen">S</span>';
      }
      if (slot.switchable && pagingLocked) {
        badges += `<span class="memmap-badge memmap-badge-locked" title="Paging locked (bit 5 of port 0x7FFD)">${this._lockSvg(10)}</span>`;
      }
      html += `
        <div class="memmap-slot ${typeClass} ${switchClass}">
          <span class="memmap-addr">${slot.addr}</span>
          <span class="memmap-label">${slot.label}</span>
          <span class="memmap-badges">${badges}</span>
        </div>`;
    }
    this._slotsEl.innerHTML = html;
    this._slotEls = Array.from(this._slotsEl.querySelectorAll(".memmap-badges"));

    // Legend
    let legend = `
      <span class="memmap-legend-item" title="Read-only memory containing the system firmware">
        <span class="memmap-legend-swatch memmap-legend-rom"></span> ROM
      </span>
      <span class="memmap-legend-item" title="Read/write memory available to programs">
        <span class="memmap-legend-swatch memmap-legend-ram"></span> RAM
      </span>`;
    if (is128k) {
      legend += `
        <span class="memmap-legend-item" title="Bank switched via port 0x7FFD">
          <span class="memmap-legend-swatch memmap-legend-switchable"></span> Paged
        </span>
        <span class="memmap-legend-item" title="Paging locked (bit 5 of port 0x7FFD); frozen until reset">
          <span class="memmap-badge memmap-badge-locked">${this._lockSvg(10)}</span> Locked
        </span>`;
    }
    legend += `
      <span class="memmap-legend-item" title="Shared with ULA; CPU access may be delayed">
        <span class="memmap-badge memmap-badge-contended">C</span> Contended
      </span>
      <span class="memmap-legend-item" title="Contains the active display file">
        <span class="memmap-badge memmap-badge-screen">S</span> Screen
      </span>
      <span class="memmap-legend-item" title="Memory bank containing the stack pointer">
        <span class="memmap-badge memmap-badge-sp">SP</span> Stack
      </span>`;
    this._legendEl.innerHTML = legend;

    this._autoFit();
  }

  _updateSpBadge(proxy) {
    const sp = proxy.getSP();
    const spSlot = (sp >> 14) & 3; // 0=0000-3FFF, 1=4000-7FFF, 2=8000-BFFF, 3=C000-FFFF
    if (spSlot === this._lastSpSlot) return;

    // Remove old SP badge
    if (this._lastSpSlot >= 0 && this._lastSpSlot < this._slotEls.length) {
      const old = this._slotEls[this._lastSpSlot].querySelector(".memmap-badge-sp");
      if (old) old.remove();
    }

    // Add new SP badge
    if (spSlot < this._slotEls.length) {
      const badge = document.createElement("span");
      badge.className = "memmap-badge memmap-badge-sp";
      badge.title = `Stack pointer (SP: ${sp.toString(16).toUpperCase().padStart(4, "0")}h)`;
      badge.textContent = "SP";
      this._slotEls[spSlot].appendChild(badge);
    }

    this._lastSpSlot = spSlot;
  }

  _lockSvg(size = 10) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }

  _autoFit() {
    requestAnimationFrame(() => {
      if (!this.element || !this.contentElement) return;
      const headerH = this.headerElement ? this.headerElement.offsetHeight : 0;
      // Measure actual children height rather than scrollHeight (which includes flex stretch)
      let contentH = 0;
      for (const child of this.contentElement.children) {
        contentH += child.offsetHeight;
      }
      const totalH = headerH + contentH;
      this.element.style.height = `${totalH}px`;
      this.currentHeight = totalH;
    });
  }
}
