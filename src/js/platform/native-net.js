/*
 * native-net.js - Native networking bridge for the desktop (Tauri) build.
 *
 * In the browser, Spectranet/TNFS traffic is tunnelled through the
 * WebSocket→UDP bridge in proxy/udp-proxy.js because browsers cannot open raw
 * sockets. Under Tauri the Rust backend (src-tauri/src/lib.rs) exposes a UDP
 * session bridge — udp_open / udp_send / udp_close plus async `udp-recv`
 * events — so the proxy is not required.
 *
 * NativeUdpSocket wraps that bridge in a WebSocket-shaped object: same
 * readyState, binaryType, send(), close(), and onopen/onmessage/onclose/onerror
 * callbacks. This lets the TNFS client (src/js/spectranet/tnfs-client.js) use a
 * single code path that just swaps `new WebSocket(url)` for
 * `new NativeUdpSocket(host, port)` when running under Tauri — no duplicated
 * protocol logic.
 */

import { isTauri, tauri } from "./runtime.js";

/** True when native sockets are available (i.e. running under Tauri). */
export function hasNativeSockets() {
  return isTauri();
}

/**
 * A WebSocket-compatible wrapper around the native UDP session bridge.
 * Only the surface used by tnfs-client.js is implemented.
 */
export class NativeUdpSocket {
  constructor(host, port) {
    // Mirror WebSocket readyState constants: 0 CONNECTING, 1 OPEN, 3 CLOSED.
    this.readyState = 0;
    this.binaryType = "arraybuffer";
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;

    this._id = null;
    this._unlisten = [];
    this._open(host, port);
  }

  async _open(host, port) {
    try {
      const { invoke } = await tauri("core");
      const { listen } = await tauri("event");

      this._id = await invoke("udp_open", { host, port });

      const unRecv = await listen("udp-recv", (e) => {
        if (!e.payload || e.payload.id !== this._id) return;
        const bytes = Uint8Array.from(e.payload.data);
        // WebSocket delivers an event with `.data`; arraybuffer to match
        // binaryType, since the TNFS client does `new Uint8Array(event.data)`.
        if (this.onmessage) this.onmessage({ data: bytes.buffer });
      });
      const unClose = await listen("udp-close", (e) => {
        if (e.payload !== this._id) return;
        this._fireClose();
      });
      this._unlisten.push(unRecv, unClose);

      // If close() was called before the async open completed, tear down now.
      if (this.readyState === 3) {
        this._teardownListeners();
        await invoke("udp_close", { id: this._id }).catch(() => {});
        return;
      }

      this.readyState = 1;
      if (this.onopen) this.onopen();
    } catch (err) {
      this.readyState = 3;
      if (this.onerror) this.onerror(err);
      this._fireClose();
    }
  }

  send(data) {
    if (this._id == null || this.readyState !== 1) return;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const payload = Array.from(bytes);
    tauri("core")
      .then(({ invoke }) => invoke("udp_send", { id: this._id, data: payload }))
      .catch(() => {});
  }

  close() {
    if (this._id != null) {
      const id = this._id;
      tauri("core")
        .then(({ invoke }) => invoke("udp_close", { id }))
        .catch(() => {});
    }
    this._fireClose();
  }

  _teardownListeners() {
    for (const un of this._unlisten) {
      try {
        un();
      } catch {
        /* ignore */
      }
    }
    this._unlisten = [];
  }

  _fireClose() {
    this._teardownListeners();
    const wasOpenOrConnecting = this.readyState !== 3;
    this.readyState = 3;
    if (wasOpenOrConnecting && this.onclose) {
      const cb = this.onclose;
      this.onclose = null;
      cb();
    }
  }
}
