/*
 * snapshot-loader.js - SNA and Z80 snapshot file loading for the browser
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { addToRecentTapes } from "../tape/tape-persistence.js";

const SNA_48K_SIZE = 49179;

export class SnapshotLoader {
  constructor(proxy) {
    this.proxy = proxy;
    this.fileInput = null;
    this.onLoaded = null;
  }

  init() {
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".sna,.z80,.tzx,.tap";
    this.fileInput.style.display = "none";
    document.body.appendChild(this.fileInput);

    this.fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this.loadFile(file);
      this.fileInput.value = "";
    });

    // Listen for snapshot loaded confirmation from worker
    this.proxy.onSnapshotLoaded = () => {
      if (this._pendingFileName) {
        console.log(`Loaded snapshot: ${this._pendingFileName}`);
        this._pendingFileName = null;
      }
      if (this.onLoaded) {
        this.onLoaded();
      }
    };
  }

  open() {
    this.fileInput.click();
  }

  loadFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const ext = file.name.split(".").pop().toLowerCase();

      if (ext === "sna") {
        if (data.length !== SNA_48K_SIZE) {
          console.error(`Invalid SNA file: expected ${SNA_48K_SIZE} bytes, got ${data.length}`);
          return;
        }
        this._pendingFileName = file.name;
        this.proxy.loadSnapshot("sna", data.buffer);
      } else if (ext === "z80") {
        if (data.length < 30) {
          console.error(`Invalid Z80 file: too small (${data.length} bytes)`);
          return;
        }
        this._pendingFileName = file.name;
        this.proxy.loadSnapshot("z80", data.buffer);
      } else if (ext === "tzx") {
        if (data.length < 10) {
          console.error(`Invalid TZX file: too small (${data.length} bytes)`);
          return;
        }
        this._pendingFileName = file.name;
        addToRecentTapes(file.name, data);
        this.proxy.loadTZXTape(data.buffer);
      } else if (ext === "tap") {
        if (data.length < 2) {
          console.error(`Invalid TAP file: too small (${data.length} bytes)`);
          return;
        }
        this._pendingFileName = file.name;
        addToRecentTapes(file.name, data);
        this.proxy.loadTAP(data.buffer);
      } else {
        console.error(`Unsupported snapshot format: .${ext}`);
        return;
      }
    };
    reader.readAsArrayBuffer(file);
  }

  destroy() {
    if (this.fileInput && this.fileInput.parentNode) {
      this.fileInput.parentNode.removeChild(this.fileInput);
    }
    this.fileInput = null;
    this.onLoaded = null;
  }
}
