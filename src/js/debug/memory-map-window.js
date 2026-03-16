/*
 * memory-map-window.js - Memory map debug window
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/memory-map.css";

const MACHINE_NAMES = {
  0: "ZX Spectrum 48K",
  1: "ZX Spectrum 128K",
  2: "ZX Spectrum 128K +2",
  3: "ZX Spectrum 128K +2A",
  4: "ZX Spectrum +3",
  5: "ZX81",
};

// +2A/+3 special paging RAM configurations (port 0x1FFD bits 2:1)
const SPECIAL_CONFIGS = [
  [0, 1, 2, 3],  // Config 0
  [4, 5, 6, 7],  // Config 1
  [4, 5, 6, 3],  // Config 2
  [4, 7, 6, 3],  // Config 3
];

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
    this._lastPagingReg1FFD = -1;
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
    const pagingReg1FFD = proxy.getPagingRegister1FFD();

    // Full re-render when paging state changes
    if (machineId !== this._lastMachineId || pagingReg !== this._lastPagingReg || pagingReg1FFD !== this._lastPagingReg1FFD) {
      this._lastMachineId = machineId;
      this._lastPagingReg = pagingReg;
      this._lastPagingReg1FFD = pagingReg1FFD;
      this._lastSpSlot = -1;

      this._machineNameEl.textContent = MACHINE_NAMES[machineId] || "Unknown";

      const is128k = machineId >= 1 && machineId <= 4;
      const isPlus2AOrPlus3 = machineId === 3 || machineId === 4;
      const pagingLocked = is128k && (pagingReg & 0x20) !== 0;
      const specialPaging = isPlus2AOrPlus3 && (pagingReg1FFD & 0x01) !== 0;

      const slots = this._computeSlots(machineId, pagingReg, pagingReg1FFD);
      this._renderSlots(slots, is128k, pagingLocked, specialPaging);
    }

    // Lightweight SP badge update every frame
    this._updateSpBadge(proxy);
  }

  _computeSlots(machineId, pagingReg, pagingReg1FFD) {
    // ZX81
    if (machineId === 5) {
      return [
        {
          addr: "0000–1FFF",
          label: "ROM",
          type: "rom",
          contended: false,
          screen: false,
          switchable: false,
        },
        {
          addr: "2000–3FFF",
          label: "ROM (mirror)",
          type: "rom",
          contended: false,
          screen: false,
          switchable: false,
        },
        {
          addr: "4000–7FFF",
          label: "RAM (16K)",
          type: "ram",
          contended: false,
          screen: true,
          switchable: false,
        },
        {
          addr: "8000–BFFF",
          label: "ROM (mirror)",
          type: "rom",
          contended: false,
          screen: false,
          switchable: false,
        },
        {
          addr: "C000–FFFF",
          label: "RAM (mirror)",
          type: "ram",
          contended: false,
          screen: false,
          switchable: false,
        },
      ];
    }

    // +2A / +3 with special all-RAM paging
    if ((machineId === 3 || machineId === 4) && (pagingReg1FFD & 0x01) !== 0) {
      const config = (pagingReg1FFD >> 1) & 0x03;
      const banks = SPECIAL_CONFIGS[config];
      const screenBank = (pagingReg & 0x08) ? 7 : 5;
      const addrs = ["0000–3FFF", "4000–7FFF", "8000–BFFF", "C000–FFFF"];

      return addrs.map((addr, i) => ({
        addr,
        label: `Bank ${banks[i]}`,
        type: "ram",
        contended: (banks[i] & 1) === 1 && banks[i] >= 4,
        screen: banks[i] === screenBank,
        switchable: true,
      }));
    }

    // +2A / +3 normal paging mode
    if (machineId === 3 || machineId === 4) {
      // ROM select: 0x7FFD bit 4 (low) + 0x1FFD bit 2 (high) = 4 ROM banks
      const romBank = ((pagingReg & 0x10) >> 4) | ((pagingReg1FFD & 0x04) >> 1);
      const screenBank = (pagingReg & 0x08) ? 7 : 5;
      const switchBank = pagingReg & 0x07;
      const isSwitchContended = (switchBank & 1) === 1 && switchBank >= 4;

      return [
        {
          addr: "0000–3FFF",
          label: `ROM ${romBank}`,
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

    // 128K / +2: decode port 0x7FFD
    if (machineId === 1 || machineId === 2) {
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

  _renderSlots(slots, is128k, pagingLocked = false, specialPaging = false) {
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
      if (slot.switchable && pagingLocked && !specialPaging) {
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
        <span class="memmap-legend-item" title="Bank switched via paging ports">
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
    const spSlot = this._spToSlotIndex(sp);
    if (spSlot === this._lastSpSlot) return;

    // Remove old SP badge
    if (this._lastSpSlot >= 0 && this._lastSpSlot < this._slotEls.length) {
      const old = this._slotEls[this._lastSpSlot].querySelector(".memmap-badge-sp");
      if (old) old.remove();
    }

    // Add new SP badge
    if (spSlot >= 0 && spSlot < this._slotEls.length) {
      const badge = document.createElement("span");
      badge.className = "memmap-badge memmap-badge-sp";
      badge.title = `Stack pointer (SP: ${sp.toString(16).toUpperCase().padStart(4, "0")}h)`;
      badge.textContent = "SP";
      this._slotEls[spSlot].appendChild(badge);
    }

    this._lastSpSlot = spSlot;
  }

  _spToSlotIndex(sp) {
    const machineId = this._lastMachineId;

    // ZX81: 5 slots with non-uniform sizes
    if (machineId === 5) {
      if (sp < 0x2000) return 0;       // ROM
      if (sp < 0x4000) return 1;       // ROM mirror
      if (sp < 0x8000) return 2;       // RAM
      if (sp < 0xC000) return 3;       // ROM mirror
      return 4;                         // RAM mirror
    }

    // All Spectrum models: 4 x 16K slots
    return (sp >> 14) & 3;
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
