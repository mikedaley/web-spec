/*
 * tape-window.js - Tape Player window with block list and transport controls
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { BaseWindow } from "../windows/base-window.js";
import "../css/tape-window.css";

export class TapeWindow extends BaseWindow {
  constructor(proxy) {
    super({
      id: "tape-window",
      title: "Tape Player",
      minWidth: 280,
      minHeight: 240,
      defaultWidth: 320,
      defaultHeight: 400,
      defaultPosition: { x: 80, y: 80 },
    });
    this._proxy = proxy;
    this._blocks = [];
    this._lastCurrentBlock = -1;
    this._lastIsPlaying = false;
  }

  renderContent() {
    return `
      <div class="tape-player">
        <div class="tape-block-list" id="tape-block-list">
          <div class="tape-empty-state">No tape loaded</div>
        </div>
        <div class="tape-transport">
          <button class="tape-transport-btn rewind" id="tape-btn-rewind" title="Rewind">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>
          <button class="tape-transport-btn play" id="tape-btn-play" title="Play">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <button class="tape-transport-btn stop" id="tape-btn-stop" title="Stop">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="6" y="6" width="12" height="12"/>
            </svg>
          </button>
        </div>
        <div class="tape-status-bar" id="tape-status-bar">
          <div class="tape-status-dot"></div>
          <span class="tape-status-text" id="tape-status-text">No tape</span>
        </div>
      </div>
    `;
  }

  onContentRendered() {
    const playBtn = this.contentElement.querySelector("#tape-btn-play");
    const stopBtn = this.contentElement.querySelector("#tape-btn-stop");
    const rewindBtn = this.contentElement.querySelector("#tape-btn-rewind");

    playBtn.addEventListener("click", () => {
      if (this._proxy.tapeIsPlaying()) {
        this._proxy.tapeStop();
      } else {
        this._proxy.tapePlay();
      }
    });

    stopBtn.addEventListener("click", () => {
      this._proxy.tapeStop();
    });

    rewindBtn.addEventListener("click", () => {
      this._proxy.tapeRewind();
    });
  }

  setBlocks(blocks) {
    this._blocks = blocks;
    this._renderBlocks();
  }

  _renderBlocks() {
    const list = this.contentElement.querySelector("#tape-block-list");
    if (!this._blocks.length) {
      list.innerHTML = '<div class="tape-empty-state">No tape loaded</div>';
      return;
    }

    let html = "";
    for (const block of this._blocks) {
      const isHeader = block.flagByte === 0x00;
      const badgeClass = isHeader ? "header" : "data";
      const badgeText = isHeader ? "HDR" : "DATA";

      let typeName = "";
      if (isHeader) {
        switch (block.headerType) {
          case 0: typeName = "Program"; break;
          case 1: typeName = "Num Array"; break;
          case 2: typeName = "Char Array"; break;
          case 3: typeName = "Code"; break;
          default: typeName = "Header"; break;
        }
      }

      const name = isHeader && block.filename
        ? `${typeName}: ${block.filename}`
        : isHeader ? typeName : "Data";

      html += `<div class="tape-block-item" data-index="${block.index}">
        <span class="tape-block-index">${block.index}</span>
        <span class="tape-block-badge ${badgeClass}">${badgeText}</span>
        <span class="tape-block-name">${name}</span>
        <span class="tape-block-size">${block.dataLength}b</span>
      </div>`;
    }
    list.innerHTML = html;
  }

  update(proxy) {
    if (!this._blocks.length) return;

    const currentBlock = proxy.tapeGetCurrentBlock();
    const isPlaying = proxy.tapeIsPlaying();

    // Update active block highlight
    if (currentBlock !== this._lastCurrentBlock) {
      this._lastCurrentBlock = currentBlock;
      const items = this.contentElement.querySelectorAll(".tape-block-item");
      items.forEach((item) => {
        const idx = parseInt(item.dataset.index, 10);
        item.classList.toggle("active", idx === currentBlock);
      });

      // Auto-scroll to active block
      const activeItem = this.contentElement.querySelector(".tape-block-item.active");
      if (activeItem) {
        activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    // Update play button state
    if (isPlaying !== this._lastIsPlaying) {
      this._lastIsPlaying = isPlaying;
      const playBtn = this.contentElement.querySelector("#tape-btn-play");
      playBtn.classList.toggle("playing", isPlaying);

      // Swap icon between play and pause
      if (isPlaying) {
        playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <rect x="6" y="5" width="4" height="14"/>
          <rect x="14" y="5" width="4" height="14"/>
        </svg>`;
        playBtn.title = "Pause";
      } else {
        playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M8 5v14l11-7z"/>
        </svg>`;
        playBtn.title = "Play";
      }
    }

    // Update status bar
    const statusBar = this.contentElement.querySelector("#tape-status-bar");
    const statusText = this.contentElement.querySelector("#tape-status-text");
    const blockCount = proxy.tapeGetBlockCount();

    if (isPlaying) {
      statusBar.className = "tape-status-bar playing";
      statusText.textContent = `PLAYING block ${currentBlock + 1} of ${blockCount}`;
    } else if (proxy.tapeIsLoaded()) {
      statusBar.className = "tape-status-bar stopped";
      statusText.textContent = `STOPPED - ${blockCount} blocks`;
    } else {
      statusBar.className = "tape-status-bar";
      statusText.textContent = "No tape";
    }
  }
}
