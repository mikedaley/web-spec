/*
 * snapshot-loader.js - SNA and Z80 snapshot file loading for the browser
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { addToRecentTapes } from "../tape/tape-persistence.js";
import { addToRecentDisks } from "../disk/disk-persistence.js";
import { addToRecentSnapshots } from "./snapshot-persistence.js";
import { showToast } from "../ui/toast.js";

const SNA_48K_SIZE = 49179;
const SNA_128K_SIZE = 131103;

export class SnapshotLoader {
  constructor(proxy) {
    this.proxy = proxy;
    this.fileInput = null;
    this.onLoaded = null;
    this.onBeforeLoad = null;
  }

  init() {
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".sna,.z80,.dsk,.p";
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
        showToast(`Loaded ${this._pendingFileName}`);
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
        if (data.length !== SNA_48K_SIZE && data.length !== SNA_128K_SIZE) {
          showToast("Invalid SNA file");
          return;
        }
        if (this.onBeforeLoad) this.onBeforeLoad();
        this._pendingFileName = file.name;
        addToRecentSnapshots(file.name, data);
        this.proxy.loadSnapshot("sna", data.buffer);
      } else if (ext === "z80") {
        if (data.length < 30) {
          showToast("Invalid Z80 file");
          return;
        }
        if (this.onBeforeLoad) this.onBeforeLoad();
        this._pendingFileName = file.name;
        addToRecentSnapshots(file.name, data);
        this.proxy.loadSnapshot("z80", data.buffer);
      } else if (ext === "tzx") {
        if (data.length < 10) {
          showToast("Invalid TZX file");
          return;
        }
        this._pendingFileName = file.name;
        addToRecentSnapshots(file.name, data);
        addToRecentTapes(file.name, data);
        this.proxy.loadTZXTape(data.buffer);
      } else if (ext === "tap") {
        if (data.length < 2) {
          showToast("Invalid TAP file");
          return;
        }
        this._pendingFileName = file.name;
        addToRecentSnapshots(file.name, data);
        addToRecentTapes(file.name, data);
        this.proxy.loadTAP(data.buffer);
      } else if (ext === "p") {
        if (data.length < 1) {
          showToast("Invalid .P file");
          return;
        }
        if (this.onBeforeLoad) this.onBeforeLoad();
        this._pendingFileName = file.name;
        addToRecentSnapshots(file.name, data);
        this.proxy.loadP(data.buffer);
      } else if (ext === "dsk") {
        if (data.length < 256) {
          showToast("Invalid DSK file");
          return;
        }
        this._pendingFileName = file.name;
        addToRecentSnapshots(file.name, data);
        addToRecentDisks(file.name, data);
        this.proxy.diskInsert(0, data.buffer);
        if (this.onDiskLoaded) this.onDiskLoaded(file.name);
      } else {
        showToast(`Unsupported format: .${ext}`);
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
