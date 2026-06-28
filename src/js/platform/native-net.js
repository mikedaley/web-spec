/*
 * native-net.js - Native networking bridge for the desktop (Tauri) build.
 *
 * In the browser, Spectranet/TNFS traffic is tunnelled through the
 * WebSocket→UDP/TCP bridge in proxy/udp-proxy.js because browsers cannot open
 * raw sockets. Under Tauri the Rust backend (src-tauri/src/lib.rs) exposes
 * native UDP and TCP session bridges, so the proxy is not required.
 *
 * Each class below wraps a native session in a WebSocket-shaped object: same
 * readyState/binaryType, send()/close(), and onopen/onmessage/onclose/onerror
 * callbacks. This lets the Spectranet clients (tnfs-client.js, network-manager.js)
 * use a single code path that just swaps `new WebSocket(url)` for the matching
 * native socket when running under Tauri — no duplicated protocol logic.
 */

import { isTauri, tauri } from "./runtime.js";

/** True when native sockets are available (i.e. running under Tauri). */
export function hasNativeSockets() {
  return isTauri();
}

/**
 * Common WebSocket-shaped surface and event/teardown plumbing shared by the
 * native socket wrappers. Subclasses implement _open(), send() and close().
 */
class NativeSocketBase {
  constructor() {
    // WebSocket readyState constants: 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED.
    this.readyState = 0;
    this.binaryType = "arraybuffer";
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;

    this._id = null;
    this._unlisten = [];
  }

  /** Deliver a message to the consumer, matching WebSocket's event shape. */
  _emit(data) {
    if (this.onmessage) this.onmessage({ data });
  }

  /** Transition to OPEN and fire onopen, unless we were closed mid-open. */
  _markOpen() {
    if (this.readyState === 3) return false;
    this.readyState = 1;
    if (this.onopen) this.onopen();
    return true;
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

  _fail(err) {
    this.readyState = 3;
    if (this.onerror) this.onerror(err);
    this._fireClose();
  }

  _fireClose() {
    this._teardownListeners();
    const wasLive = this.readyState !== 3;
    this.readyState = 3;
    if (wasLive && this.onclose) {
      const cb = this.onclose;
      this.onclose = null;
      cb();
    }
  }
}

/**
 * UDP socket connected to host:port. Inbound datagrams arrive as `udp-recv`
 * events; the socket closes on `udp-close`.
 */
export class NativeUdpSocket extends NativeSocketBase {
  constructor(host, port) {
    super();
    this._open(host, port);
  }

  async _open(host, port) {
    try {
      const { invoke } = await tauri("core");
      const { listen } = await tauri("event");

      this._id = await invoke("udp_open", { host, port });

      this._unlisten.push(
        await listen("udp-recv", (e) => {
          if (!e.payload || e.payload.id !== this._id) return;
          this._emit(Uint8Array.from(e.payload.data).buffer);
        }),
        await listen("udp-close", (e) => {
          if (e.payload === this._id) this._fireClose();
        }),
      );

      if (this.readyState === 3) {
        await invoke("udp_close", { id: this._id }).catch(() => {});
        this._teardownListeners();
        return;
      }
      this._markOpen();
    } catch (err) {
      this._fail(err);
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
}

/**
 * Outbound TCP socket to host:port. The connection is established before
 * onopen fires; inbound bytes arrive as `tcp-recv` events and the socket closes
 * on `tcp-close`.
 */
export class NativeTcpSocket extends NativeSocketBase {
  constructor(host, port) {
    super();
    this._open(host, port);
  }

  async _open(host, port) {
    try {
      const { invoke } = await tauri("core");
      const { listen } = await tauri("event");

      this._id = await invoke("tcp_connect", { host, port });

      this._unlisten.push(
        await listen("tcp-recv", (e) => {
          if (!e.payload || e.payload.id !== this._id) return;
          this._emit(Uint8Array.from(e.payload.data).buffer);
        }),
        await listen("tcp-close", (e) => {
          if (e.payload === this._id) this._fireClose();
        }),
      );

      if (this.readyState === 3) {
        await invoke("tcp_close", { id: this._id }).catch(() => {});
        this._teardownListeners();
        return;
      }

      // Listeners are attached — now let the backend pump reads so a server
      // banner sent immediately on connect can't race ahead of us.
      await invoke("tcp_resume", { id: this._id });
      this._markOpen();
    } catch (err) {
      this._fail(err);
    }
  }

  send(data) {
    if (this._id == null || this.readyState !== 1) return;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const payload = Array.from(bytes);
    tauri("core")
      .then(({ invoke }) => invoke("tcp_send", { id: this._id, data: payload }))
      .catch(() => {});
  }

  close() {
    if (this._id != null) {
      const id = this._id;
      tauri("core")
        .then(({ invoke }) => invoke("tcp_close", { id }))
        .catch(() => {});
    }
    this._fireClose();
  }
}

/**
 * Inbound TCP listener — the native equivalent of a Spectranet LISTEN. Binds a
 * real host port and accepts one connection. To match the proxy's bridge
 * protocol, the first onmessage delivers a JSON *string* control frame
 * `{type:'connect', peerIP, peerPort}` (as network-manager.js expects), and
 * subsequent onmessage events deliver the peer's binary data.
 */
export class NativeTcpListener extends NativeSocketBase {
  constructor(port) {
    super();
    this._open(port);
  }

  async _open(port) {
    try {
      const { invoke } = await tauri("core");
      const { listen } = await tauri("event");

      this._id = await invoke("tcp_listen", { port });

      this._unlisten.push(
        await listen("tcp-accept", (e) => {
          if (!e.payload || e.payload.id !== this._id) return;
          // String frame => control message, mirroring the proxy.
          this._emit(
            JSON.stringify({
              type: "connect",
              peerIP: e.payload.peer_ip,
              peerPort: e.payload.peer_port,
            }),
          );
        }),
        await listen("tcp-recv", (e) => {
          if (!e.payload || e.payload.id !== this._id) return;
          this._emit(Uint8Array.from(e.payload.data).buffer);
        }),
        await listen("tcp-close", (e) => {
          if (e.payload === this._id) this._fireClose();
        }),
      );

      if (this.readyState === 3) {
        await invoke("tcp_close", { id: this._id }).catch(() => {});
        this._teardownListeners();
        return;
      }

      await invoke("tcp_resume", { id: this._id });
      this._markOpen();
    } catch (err) {
      this._fail(err);
    }
  }

  send(data) {
    // Before a peer connects there is no writer; the backend drops the send.
    if (this._id == null || this.readyState !== 1) return;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const payload = Array.from(bytes);
    tauri("core")
      .then(({ invoke }) => invoke("tcp_send", { id: this._id, data: payload }))
      .catch(() => {});
  }

  close() {
    if (this._id != null) {
      const id = this._id;
      tauri("core")
        .then(({ invoke }) => invoke("tcp_close", { id }))
        .catch(() => {});
    }
    this._fireClose();
  }
}
