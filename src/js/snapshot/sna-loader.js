/*
 * sna-loader.js - SNA snapshot file loading for the browser
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const SNA_48K_SIZE = 49179;

export class SNALoader {
  constructor(wasmModule) {
    this.wasmModule = wasmModule;
    this.fileInput = null;
    this.onLoaded = null;
  }

  init() {
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".sna";
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

      if (data.length !== SNA_48K_SIZE) {
        console.error(`Invalid SNA file: expected ${SNA_48K_SIZE} bytes, got ${data.length}`);
        return;
      }

      const ptr = this.wasmModule._malloc(data.length);
      this.wasmModule.HEAPU8.set(data, ptr);
      this.wasmModule._loadSNA(ptr, data.length);
      this.wasmModule._free(ptr);

      console.log(`Loaded SNA: ${file.name} (${data.length} bytes)`);

      if (this.onLoaded) {
        this.onLoaded(file.name);
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
