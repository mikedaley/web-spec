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

export class NetworkManager {
  constructor(emulatorProxy) {
    this.proxy = emulatorProxy;
    this.sockets = [null, null, null, null];  // Per-socket state
    this.corsProxyUrl = '';  // Configurable CORS proxy URL

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
    // Clean up any existing WebSocket on this socket index before reopening
    const existing = this.sockets[cmd.socket];
    if (existing) {
      this.stopUdpKeepalive(cmd.socket);
      if (existing.ws) {
        existing.ws.onclose = null;
        existing.ws.onerror = null;
        existing.ws.onmessage = null;
        existing.ws.close();
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
      // All TCP connections (including HTTP) go through the WebSocket proxy
      if (this.corsProxyUrl) {
        const wsUrl = `${this.corsProxyUrl}/tcp/${ipStr}/${cmd.destPort}`;
        this.connectWebSocket(cmd.socket, wsUrl);
      } else {
        // No proxy configured — report connection failed
        this.proxy.spectranetSetSocketStatus(cmd.socket, SOCK_CLOSED);
      }
    } else if (sock.protocol === PROTO_UDP) {
      // UDP — connection is established lazily at first SEND
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
        // Destination changed — close old WebSocket and create new one
        this.stopUdpKeepalive(cmd.socket);
        sock.ws.onclose = null;
        sock.ws.onerror = null;
        sock.ws.onmessage = null;
        sock.ws.close();
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

      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        sock.ws = ws;

        ws.onopen = () => {
          // Flush buffered sends
          if (sock.udpSendBuffer) {
            for (const buf of sock.udpSendBuffer) {
              ws.send(buf);
            }
            sock.udpSendBuffer = [];
          }
          // Start keepalive timer to prevent proxy idle timeout
          this.startUdpKeepalive(cmd.socket);
        };

        ws.onmessage = (event) => {
          // Prepend W5100 UDP RX header: [IP0][IP1][IP2][IP3][PORT_HI][PORT_LO][LEN_HI][LEN_LO]
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

          this.proxy.spectranetPushData(cmd.socket, fullData);
        };

        ws.onclose = (event) => {
          this.stopUdpKeepalive(cmd.socket);
          if (sock.ws === ws) sock.ws = null;
        };

        ws.onerror = () => {
          this.stopUdpKeepalive(cmd.socket);
          if (sock.ws === ws) sock.ws = null;
        };
      } catch (err) {
        return;
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
      sock.ws.onclose = null;
      sock.ws.onerror = null;
      sock.ws.onmessage = null;
      sock.ws.close();
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

  connectWebSocket(socketIdx, wsUrl) {
    const sock = this.sockets[socketIdx];
    if (!sock) return;

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      sock.ws = ws;

      ws.onopen = () => {
        this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_ESTABLISHED);
        // Flush any data buffered while the WebSocket was connecting
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
  }
}
