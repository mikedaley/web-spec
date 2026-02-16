/*
 * snapshot-loader.js - SNA and Z80 snapshot file loading for the browser
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const SNA_48K_SIZE = 49179;

export class SnapshotLoader {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.fileInput = null;
    this.onLoaded = null;
  }

  init() {
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".sna,.z80,.tzx";
    this.fileInput.style.display = "none";
    document.body.appendChild(this.fileInput);

    this.fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      this.loadFile(file);
      this.fileInput.value = "";
    });
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
        this.loadIntoWasm(data, "_loadSNA");
      } else if (ext === "z80") {
        if (data.length < 30) {
          console.error(`Invalid Z80 file: too small (${data.length} bytes)`);
          return;
        }
        this.loadIntoWasm(data, "_loadZ80");
      } else if (ext === "tzx") {
        if (data.length < 10) {
          console.error(`Invalid TZX file: too small (${data.length} bytes)`);
          return;
        }
        this.loadIntoWasm(data, "_loadTZX");
      } else {
        console.error(`Unsupported snapshot format: .${ext}`);
        return;
      }

      console.log(`Loaded snapshot: ${file.name} (${data.length} bytes)`);

      if (this.onLoaded) {
        this.onLoaded(file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  loadIntoWasm(data, funcName) {
    const ptr = this.wasmModule._malloc(data.length);
    this.wasmModule.HEAPU8.set(data, ptr);
    this.wasmModule[funcName](ptr, data.length);
    this.wasmModule._free(ptr);
  }

  destroy() {
    if (this.fileInput && this.fileInput.parentNode) {
      this.fileInput.parentNode.removeChild(this.fileInput);
    }
    this.fileInput = null;
    this.onLoaded = null;
  }
}
