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
    const cmdNames = ['NONE', 'OPEN', 'LISTEN', 'CONNECT', 'DISCONNECT', 'CLOSE', 'SEND', 'RECV'];
    const name = cmdNames[cmd.type] || cmd.type;
    if (cmd.type !== CMD_RECV) {
      console.log(`[Spectranet] CMD ${name} sock=${cmd.socket} proto=${cmd.protocol === PROTO_UDP ? 'UDP' : 'TCP'}` +
        (cmd.destIP ? ` dest=${cmd.destIP.join('.')}:${cmd.destPort}` : '') +
        (cmd.txLength ? ` txLen=${cmd.txLength}` : ''));
    }

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
        console.warn(`[Spectranet] No WebSocket proxy configured for TCP ${ipStr}:${cmd.destPort}`);
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
      console.warn(`[Spectranet] UDP send on socket ${cmd.socket} — no destination`);
      return;
    }

    const ipStr = destIP.join('.');

    // If the WebSocket is in CLOSING or CLOSED state, discard it so we reconnect
    if (sock.ws && (sock.ws.readyState === WebSocket.CLOSING || sock.ws.readyState === WebSocket.CLOSED)) {
      console.warn(`[Spectranet] UDP socket ${cmd.socket} WebSocket stale (readyState=${sock.ws.readyState}), will reconnect`);
      sock.ws = null;
    }

    // Lazily open WebSocket on first send (or reconnect after close)
    if (!sock.ws) {
      if (!this.corsProxyUrl) {
        console.warn(`[Spectranet] No WebSocket proxy configured for UDP ${ipStr}:${destPort}`);
        return;
      }

      const wsUrl = `${this.corsProxyUrl}/udp/${ipStr}/${destPort}`;
      console.log(`[Spectranet] UDP socket ${cmd.socket} creating WebSocket → ${wsUrl}`);
      sock.udpSendBuffer = [];
      sock.udpDestIP = destIP;
      sock.udpDestPort = destPort;

      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        sock.ws = ws;

        ws.onopen = () => {
          console.log(`[Spectranet] UDP socket ${cmd.socket} WebSocket OPEN`);
          // Flush buffered sends
          if (sock.udpSendBuffer) {
            console.log(`[Spectranet] UDP socket ${cmd.socket} flushing ${sock.udpSendBuffer.length} buffered sends`);
            for (const buf of sock.udpSendBuffer) {
              ws.send(buf);
            }
            sock.udpSendBuffer = [];
          }
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

          console.log(`[Spectranet] UDP socket ${cmd.socket} RX ${payload.length} bytes from ${srcIP.join('.')}:${srcPort}`);
          this.proxy.spectranetPushData(cmd.socket, fullData);
        };

        ws.onclose = (event) => {
          console.warn(`[Spectranet] UDP socket ${cmd.socket} WebSocket CLOSED (code=${event.code}, reason=${event.reason})`);
          if (sock.ws === ws) sock.ws = null;
        };

        ws.onerror = () => {
          console.error(`[Spectranet] UDP WebSocket error on socket ${cmd.socket}`);
          if (sock.ws === ws) sock.ws = null;
        };
      } catch (err) {
        console.error(`[Spectranet] UDP WebSocket connect failed:`, err);
        return;
      }
    }

    // Send or buffer the data
    if (cmd.txData) {
      if (sock.ws.readyState === WebSocket.OPEN) {
        console.log(`[Spectranet] UDP socket ${cmd.socket} TX ${cmd.txData.byteLength} bytes`);
        sock.ws.send(cmd.txData);
      } else if (sock.udpSendBuffer) {
        console.log(`[Spectranet] UDP socket ${cmd.socket} buffering ${cmd.txData.byteLength} bytes (wsState=${sock.ws.readyState})`);
        sock.udpSendBuffer.push(cmd.txData);
      } else {
        console.error(`[Spectranet] UDP socket ${cmd.socket} DATA DROPPED — ws not open and no buffer!`);
      }
    }
  }

  handleClose(cmd) {
    const sock = this.sockets[cmd.socket];
    if (!sock) return;

    if (sock.ws) {
      sock.ws.close();
      sock.ws = null;
    }

    this.sockets[cmd.socket] = null;
    // Do NOT call spectranetSetSocketStatus here — the C++ W5100 already set
    // SOCK_CLOSED synchronously when the command was issued.  Calling it now
    // (asynchronously, after the frame batch) would overwrite any state changes
    // from a subsequent OPEN on the same socket index.
  }

  connectWebSocket(socketIdx, wsUrl) {
    const sock = this.sockets[socketIdx];
    if (!sock) return;

    console.log(`[Spectranet] TCP socket ${socketIdx} creating WebSocket → ${wsUrl}`);

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      sock.ws = ws;

      ws.onopen = () => {
        console.log(`[Spectranet] TCP socket ${socketIdx} WebSocket OPEN → ESTABLISHED`);
        this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_ESTABLISHED);
        // Flush any data buffered while the WebSocket was connecting
        if (sock.tcpSendBuffer) {
          console.log(`[Spectranet] TCP socket ${socketIdx} flushing ${sock.tcpSendBuffer.length} buffered sends`);
          for (const buf of sock.tcpSendBuffer) {
            ws.send(buf);
          }
          sock.tcpSendBuffer = [];
        }
      };

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data);
        console.log(`[Spectranet] TCP socket ${socketIdx} RX ${data.length} bytes`);
        this.proxy.spectranetPushData(socketIdx, data);
      };

      ws.onclose = (event) => {
        console.warn(`[Spectranet] TCP socket ${socketIdx} WebSocket CLOSED (code=${event.code}, reason=${event.reason})`);
        this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_CLOSE_WAIT);
        if (sock.ws === ws) sock.ws = null;
      };

      ws.onerror = () => {
        console.error(`[Spectranet] TCP socket ${socketIdx} WebSocket ERROR`);
        this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_CLOSED);
        if (sock.ws === ws) sock.ws = null;
      };
    } catch (err) {
      console.error(`[Spectranet] TCP socket ${socketIdx} WebSocket connect failed:`, err);
      this.proxy.spectranetSetSocketStatus(socketIdx, SOCK_CLOSED);
    }
  }

  destroy() {
    for (let i = 0; i < 4; i++) {
      if (this.sockets[i]?.ws) {
        this.sockets[i].ws.close();
      }
      this.sockets[i] = null;
    }
  }
}
