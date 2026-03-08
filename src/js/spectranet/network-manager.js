/*
 * network-manager.js - Bridges Spectranet W5100 network commands to browser APIs
 *
 * Strategy:
 *   - TCP → WebSocket via configurable proxy (wss://proxy/tcp/{ip}/{port})
 *   - UDP → WebSocket via configurable proxy (ws://proxy/udp/{ip}/{port})
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

// W5100 socket status constants (must match w5100.hpp)
const SOCK_CLOSED      = 0x00;
const SOCK_INIT        = 0x13;
const SOCK_LISTEN      = 0x14;
const SOCK_ESTABLISHED = 0x17;
const SOCK_CLOSE_WAIT  = 0x1C;
const SOCK_UDP         = 0x22;
const SOCK_SYNSENT     = 0x15;
const SOCK_FIN_WAIT    = 0x18;

// NetCommandType enum (must match w5100.hpp)
const CMD_NONE       = 0;
const CMD_OPEN       = 1;
const CMD_LISTEN     = 2;
const CMD_CONNECT    = 3;
const CMD_DISCONNECT = 4;
const CMD_CLOSE      = 5;
const CMD_SEND       = 6;
const CMD_RECV       = 7;

// Protocol types
const PROTO_TCP = 1;
const PROTO_UDP = 2;

// How often to send a keepalive ping on idle UDP WebSockets (ms).
// Must be shorter than the proxy's idle timeout to prevent disconnection.
const UDP_KEEPALIVE_INTERVAL = 15000;

// How long to keep idle cached UDP WebSockets alive (ms).
const UDP_CACHE_TTL = 30000;

export class NetworkManager {
  constructor(emulatorProxy) {
    this.proxy = emulatorProxy;
    this.sockets = [null, null, null, null];  // Per-socket state
    this.corsProxyUrl = '';  // Configurable CORS proxy URL
    this.udpWsCache = new Map();  // URL → { ws, keepaliveTimer, ttlTimer }

    // Wire up the command handler
    this.proxy.onSpectranetCommand = (cmd) => this.handleCommand(cmd);
  }

  setCorsProxyUrl(url) {
    this.corsProxyUrl = url;
  }

  handleCommand(cmd) {
    switch (cmd.type) {
      case CMD_OPEN:
        this.handleOpen(cmd);
        break;
      case CMD_CONNECT:
        this.handleConnect(cmd);
        break;
      case CMD_SEND:
        this.handleSend(cmd);
        break;
      case CMD_DISCONNECT:
      case CMD_CLOSE:
        this.handleClose(cmd);
        break;
      case CMD_RECV:
        // RECV is handled implicitly — data is pushed when received
        break;
      default:
        break;
    }
  }

  handleOpen(cmd) {
    // Clean up any existing state on this socket index before reopening
    const existing = this.sockets[cmd.socket];
    if (existing) {
      this.stopUdpKeepalive(cmd.socket);
      if (existing.ws) {
        if (existing.protocol === PROTO_UDP && existing.udpWsUrl) {
          // Move UDP WebSocket to cache for reuse instead of closing it
          this.cacheUdpWebSocket(existing.udpWsUrl, existing.ws);
        } else {
          existing.ws.onclose = null;
          existing.ws.onerror = null;
          existing.ws.onmessage = null;
          existing.ws.close();
        }
      }
    }

    this.sockets[cmd.socket] = {
      protocol: cmd.protocol,
      srcPort: cmd.srcPort,
      destIP: null,
      destPort: 0,
      ws: null,
      tcpSendBuffer: [],
    };
  }

  handleConnect(cmd) {
    const sock = this.sockets[cmd.socket];
    if (!sock) return;

    sock.destIP = cmd.destIP;
    sock.destPort = cmd.destPort;

    const ipStr = cmd.destIP.join('.');

    if (sock.protocol === PROTO_TCP) {
      if (this.corsProxyUrl) {
        const wsUrl = `${this.corsProxyUrl}/tcp/${ipStr}/${cmd.destPort}`;
        this.connectWebSocket(cmd.socket, wsUrl);
      } else {
        this.proxy.spectranetSetSocketStatus(cmd.socket, SOCK_CLOSED);
      }
    } else if (sock.protocol === PROTO_UDP) {
      sock.destIP = cmd.destIP;
      sock.destPort = cmd.destPort;
      this.proxy.spectranetSetSocketStatus(cmd.socket, SOCK_UDP);
    }
  }

  handleSend(cmd) {
    const sock = this.sockets[cmd.socket];
    if (!sock) return;

    if (sock.protocol === PROTO_UDP) {
      this.handleUdpSend(cmd);
      return;
    }

    // TCP — send via WebSocket (buffering if not yet open)
    if (sock.ws && cmd.txData) {
      if (sock.ws.readyState === WebSocket.OPEN) {
        sock.ws.send(cmd.txData);
      } else {
        sock.tcpSendBuffer.push(cmd.txData);
      }
    }
  }

  handleUdpSend(cmd) {
    const sock = this.sockets[cmd.socket];
    if (!sock) return;

    // Use destIP/destPort from the SEND command (W5100 socket registers)
    const destIP = cmd.destIP || sock.destIP;
    const destPort = cmd.destPort || sock.destPort;

    if (!destIP || !destPort) {
      return;
    }

    const ipStr = destIP.join('.');

    // If the WebSocket is stale or points to a different destination, close and reconnect
    if (sock.ws) {
      if (sock.ws.readyState === WebSocket.CLOSING || sock.ws.readyState === WebSocket.CLOSED) {
        sock.ws = null;
      } else if (sock.udpDestIP && (ipStr !== sock.udpDestIP.join('.') || destPort !== sock.udpDestPort)) {
        // Destination changed — cache old WebSocket and create new one
        this.stopUdpKeepalive(cmd.socket);
        if (sock.udpWsUrl) {
          this.cacheUdpWebSocket(sock.udpWsUrl, sock.ws);
        } else {
          sock.ws.onclose = null;
          sock.ws.onerror = null;
          sock.ws.onmessage = null;
          sock.ws.close();
        }
        sock.ws = null;
      }
    }

    // Lazily open WebSocket on first send (or reconnect after close)
    if (!sock.ws) {
      if (!this.corsProxyUrl) {
        return;
      }

      const wsUrl = `${this.corsProxyUrl}/udp/${ipStr}/${destPort}`;
      sock.udpSendBuffer = [];
      sock.udpDestIP = destIP;
      sock.udpDestPort = destPort;
      sock.udpWsUrl = wsUrl;

      // Check cache for an existing warm WebSocket to this destination
      const cached = this.takeCachedUdpWebSocket(wsUrl);
      if (cached) {
        sock.ws = cached;
        this.wireUdpHandlers(cached, cmd.socket, sock, destIP, destPort);
        if (cached.readyState === WebSocket.OPEN) {
          this.startUdpKeepalive(cmd.socket);
        } else {
          // Still connecting — wire up onopen to flush buffer
          cached.onopen = () => {
            if (sock.udpSendBuffer) {
              for (const buf of sock.udpSendBuffer) {
                cached.send(buf);
              }
              sock.udpSendBuffer = [];
            }
            this.startUdpKeepalive(cmd.socket);
          };
        }
      } else {
        try {
          const ws = new WebSocket(wsUrl);
          ws.binaryType = 'arraybuffer';
          sock.ws = ws;

          ws.onopen = () => {
            if (sock.udpSendBuffer) {
              for (const buf of sock.udpSendBuffer) {
                ws.send(buf);
              }
              sock.udpSendBuffer = [];
            }
            this.startUdpKeepalive(cmd.socket);
          };

          this.wireUdpHandlers(ws, cmd.socket, sock, destIP, destPort);
        } catch (err) {
          return;
        }
      }
    }

    // Send or buffer the data
    if (cmd.txData) {
      if (sock.ws.readyState === WebSocket.OPEN) {
        sock.ws.send(cmd.txData);
      } else if (sock.udpSendBuffer) {
        sock.udpSendBuffer.push(cmd.txData);
      } else {
      }
    }
  }

  handleClose(cmd) {
    const sock = this.sockets[cmd.socket];
    if (!sock) return;

    this.stopUdpKeepalive(cmd.socket);

    if (sock.ws) {
      if (sock.protocol === PROTO_UDP && sock.udpWsUrl) {
        // Move UDP WebSocket to cache for reuse
        this.cacheUdpWebSocket(sock.udpWsUrl, sock.ws);
      } else {
        sock.ws.onclose = null;
        sock.ws.onerror = null;
        sock.ws.onmessage = null;
        sock.ws.close();
      }
      sock.ws = null;
    }

    this.sockets[cmd.socket] = null;
    // Do NOT call spectranetSetSocketStatus here — the C++ W5100 already set
    // SOCK_CLOSED synchronously when the command was issued.  Calling it now
    // (asynchronously, after the frame batch) would overwrite any state changes
    // from a subsequent OPEN on the same socket index.
  }

  startUdpKeepalive(socketIdx) {
    const sock = this.sockets[socketIdx];
    if (!sock) return;

    this.stopUdpKeepalive(socketIdx);

    sock.keepaliveTimer = setInterval(() => {
      if (sock.ws && sock.ws.readyState === WebSocket.OPEN) {
        // Send a 1-byte ping through the WebSocket to reset the proxy's
        // idle timer.  TNFS requires at least 4 bytes (session + seq + cmd)
        // so the server will silently discard this as a runt packet.
        sock.ws.send(new Uint8Array([0]));
      }
    }, UDP_KEEPALIVE_INTERVAL);
  }

  stopUdpKeepalive(socketIdx) {
    const sock = this.sockets[socketIdx];
    if (!sock || !sock.keepaliveTimer) return;

    clearInterval(sock.keepaliveTimer);
    sock.keepaliveTimer = null;
  }

  wireUdpHandlers(ws, socketIdx, sock, destIP, destPort) {
    ws.onmessage = (event) => {
      const payload = new Uint8Array(event.data);
      const srcIP = sock.udpDestIP || destIP;
      const srcPort = sock.udpDestPort || destPort;
      const header = new Uint8Array(8);
      header[0] = srcIP[0];
      header[1] = srcIP[1];
      header[2] = srcIP[2];
      header[3] = srcIP[3];
      header[4] = (srcPort >> 8) & 0xFF;
      header[5] = srcPort & 0xFF;
      header[6] = (payload.length >> 8) & 0xFF;
      header[7] = payload.length & 0xFF;

      const fullData = new Uint8Array(8 + payload.length);
      fullData.set(header);
      fullData.set(payload, 8);

      this.proxy.spectranetPushData(socketIdx, fullData);
    };

    ws.onclose = () => {
      this.stopUdpKeepalive(socketIdx);
      if (sock.ws === ws) sock.ws = null;
    };

    ws.onerror = () => {
      this.stopUdpKeepalive(socketIdx);
      if (sock.ws === ws) sock.ws = null;
    };
  }

  cacheUdpWebSocket(url, ws) {
    // Detach current handlers
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;

    // Evict any existing cached entry for this URL
    this.evictCachedUdpWebSocket(url);

    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
      const entry = { ws };

      // Keepalive to prevent proxy idle timeout while cached
      entry.keepaliveTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(new Uint8Array([0]));
        }
      }, UDP_KEEPALIVE_INTERVAL);

      // TTL — close if not reclaimed within the cache window
      entry.ttlTimer = setTimeout(() => {
        this.evictCachedUdpWebSocket(url);
      }, UDP_CACHE_TTL);

      // If WebSocket closes while cached, clean up the entry
      ws.onclose = () => this.evictCachedUdpWebSocket(url);
      ws.onerror = () => this.evictCachedUdpWebSocket(url);

      this.udpWsCache.set(url, entry);
    } else {
      ws.close();
    }
  }

  takeCachedUdpWebSocket(url) {
    const entry = this.udpWsCache.get(url);
    if (!entry) return null;

    // Remove from cache
    clearInterval(entry.keepaliveTimer);
    clearTimeout(entry.ttlTimer);
    this.udpWsCache.delete(url);

    const ws = entry.ws;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      return ws;
    }

    // Stale — discard
    ws.close();
    return null;
  }

  evictCachedUdpWebSocket(url) {
    const entry = this.udpWsCache.get(url);
    if (!entry) return;

    clearInterval(entry.keepaliveTimer);
    clearTimeout(entry.ttlTimer);
    entry.ws.onclose = null;
    entry.ws.onerror = null;
    entry.ws.onmessage = null;
    entry.ws.close();
    this.udpWsCache.delete(url);
  }

  connectWebSocket(socketIdx, wsUrl) {
    const sock = this.sockets[socketIdx];
    if (!sock) return;

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      sock.ws = ws;

      ws.onopen = () => {
        this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_ESTABLISHED);
        if (sock.tcpSendBuffer) {
          for (const buf of sock.tcpSendBuffer) {
            ws.send(buf);
          }
          sock.tcpSendBuffer = [];
        }
      };

      ws.onmessage = (event) => {
        this.proxy.spectranetPushData(socketIdx, new Uint8Array(event.data));
      };

      ws.onclose = (event) => {
        this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_CLOSE_WAIT);
        if (sock.ws === ws) sock.ws = null;
      };

      ws.onerror = () => {
        this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_CLOSED);
        if (sock.ws === ws) sock.ws = null;
      };
    } catch (err) {
      this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_CLOSED);
    }
  }

  destroy() {
    for (let i = 0; i < 4; i++) {
      this.stopUdpKeepalive(i);
      if (this.sockets[i]?.ws) {
        this.sockets[i].ws.close();
      }
      this.sockets[i] = null;
    }
    for (const url of this.udpWsCache.keys()) {
      this.evictCachedUdpWebSocket(url);
    }
  }
}
