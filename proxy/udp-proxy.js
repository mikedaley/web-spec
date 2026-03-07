/**
 * udp-proxy.js - WebSocket-to-UDP/TCP proxy for Spectranet
 *
 * Routes:
 *   /udp/{dest_ip}/{dest_port} - Relay binary WebSocket frames as UDP datagrams
 *   /tcp/{dest_ip}/{dest_port} - Relay binary WebSocket frames over TCP
 *
 * Security:
 *   - Origin allowlist: only accepts WebSocket upgrades from your domain
 *     (browsers enforce the Origin header — it cannot be spoofed from JS)
 *   - Private/internal IP destinations blocked (prevents SSRF)
 *   - Per-IP connection limit (default 4, matching W5100 socket count)
 *   - Idle timeout closes stale connections
 *   - Destination port allowlist
 *
 * Usage:
 *   ALLOWED_ORIGINS=https://speccy.example.com PORT=8080 node udp-proxy.js
 *
 * Environment variables:
 *   PORT             - Listen port (default: 8080)
 *   ALLOWED_ORIGINS  - Comma-separated list of allowed origins (required)
 *                      e.g. "https://speccy.example.com,http://localhost:3000"
 *   MAX_CONN_PER_IP  - Max concurrent connections per client IP (default: 4)
 *   IDLE_TIMEOUT_MS  - Close idle connections after this many ms (default: 30000)
 *   ALLOWED_PORTS    - Comma-separated list of allowed destination ports
 *                      (default: 53,16384 — DNS and TNFS)
 */

const { WebSocketServer } = require('ws');
const dgram = require('dgram');
const net = require('net');
const url = require('url');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const MAX_CONN_PER_IP = parseInt(process.env.MAX_CONN_PER_IP, 10) || 4;
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS, 10) || 30000;

// Origin allowlist — the primary security gate.
// Browsers send the Origin header automatically on WebSocket upgrades and
// it cannot be forged from client-side JavaScript, so this is a strong check.
const ALLOWED_ORIGINS_ENV = process.env.ALLOWED_ORIGINS || '';
const ALLOWED_ORIGINS = new Set(
  ALLOWED_ORIGINS_ENV.split(',').map(o => o.trim()).filter(Boolean)
);

// Default: DNS (53) and TNFS (16384). Set to '*' to allow all ports.
const ALLOWED_PORTS_ENV = process.env.ALLOWED_PORTS || '53,16384,32768';
const ALLOWED_PORTS = ALLOWED_PORTS_ENV === '*'
  ? null
  : new Set(ALLOWED_PORTS_ENV.split(',').map(p => parseInt(p.trim(), 10)));

// Per-IP connection tracking
const connections = new Map();

// ============================================================================
// Security checks
// ============================================================================

function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  return (
    parts[0] === 0 ||                                          // 0.0.0.0/8
    parts[0] === 10 ||                                         // 10.0.0.0/8
    parts[0] === 127 ||                                        // 127.0.0.0/8
    (parts[0] === 169 && parts[1] === 254) ||                  // 169.254.0.0/16
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||  // 172.16.0.0/12
    (parts[0] === 192 && parts[1] === 168) ||                  // 192.168.0.0/16
    parts[0] >= 224                                            // multicast + reserved
  );
}

function isPortAllowed(port) {
  if (!ALLOWED_PORTS) return true;
  return ALLOWED_PORTS.has(port);
}

function isOriginAllowed(origin) {
  if (ALLOWED_ORIGINS.size === 0) return false;
  return ALLOWED_ORIGINS.has(origin);
}

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress;
}

function trackConnection(clientIP, ws) {
  const count = connections.get(clientIP) || 0;
  if (count >= MAX_CONN_PER_IP) return false;
  connections.set(clientIP, count + 1);
  ws.on('close', () => {
    const c = (connections.get(clientIP) || 1) - 1;
    if (c <= 0) connections.delete(clientIP);
    else connections.set(clientIP, c);
  });
  return true;
}

// ============================================================================
// Idle timeout helper
// ============================================================================

function createIdleTimer(ws, label) {
  let timer = setTimeout(() => {
    console.log(`[proxy] Idle timeout: ${label}`);
    ws.close(1000, 'Idle timeout');
  }, IDLE_TIMEOUT_MS);

  function reset() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[proxy] Idle timeout: ${label}`);
      ws.close(1000, 'Idle timeout');
    }, IDLE_TIMEOUT_MS);
  }

  function clear() {
    clearTimeout(timer);
  }

  return { reset, clear };
}

// ============================================================================
// Server
// ============================================================================

if (ALLOWED_ORIGINS.size === 0) {
  console.warn('[proxy] WARNING: ALLOWED_ORIGINS not set — all connections will be rejected!');
  console.warn('[proxy] Set ALLOWED_ORIGINS=https://your-site.com to enable access.');
}

const wss = new WebSocketServer({ port: PORT });
console.log(`[proxy] Listening on ws://localhost:${PORT}`);
console.log(`[proxy] Allowed origins: ${ALLOWED_ORIGINS.size > 0 ? [...ALLOWED_ORIGINS].join(', ') : '(none)'}`);
console.log(`[proxy] Allowed ports: ${ALLOWED_PORTS ? [...ALLOWED_PORTS].join(', ') : 'all'}`);
console.log(`[proxy] Max connections per IP: ${MAX_CONN_PER_IP}`);
console.log(`[proxy] Idle timeout: ${IDLE_TIMEOUT_MS}ms`);

wss.on('connection', (ws, req) => {
  const clientIP = getClientIP(req);
  const origin = req.headers.origin || '';

  // --- Origin check ---
  if (!isOriginAllowed(origin)) {
    console.warn(`[proxy] Rejected: origin "${origin}" from ${clientIP}`);
    ws.close(1008, 'Origin not allowed');
    return;
  }

  // --- Rate limit ---
  if (!trackConnection(clientIP, ws)) {
    console.warn(`[proxy] Rejected: too many connections from ${clientIP}`);
    ws.close(1008, 'Too many connections');
    return;
  }

  // --- Parse route ---
  const parsed = url.parse(req.url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 3) {
    console.error(`[proxy] Invalid path: ${parsed.pathname}`);
    ws.close(1008, 'Invalid path: expected /{udp|tcp}/{ip}/{port}');
    return;
  }

  const [proto, destIP, destPortStr] = parts;
  const destPort = parseInt(destPortStr, 10);

  if (isNaN(destPort) || destPort < 1 || destPort > 65535) {
    ws.close(1008, 'Invalid port');
    return;
  }

  // --- Destination security checks ---
  if (isPrivateIP(destIP)) {
    console.warn(`[proxy] Rejected: private IP ${destIP} from ${clientIP}`);
    ws.close(1008, 'Private destinations not allowed');
    return;
  }

  if (!isPortAllowed(destPort)) {
    console.warn(`[proxy] Rejected: port ${destPort} not in allowlist from ${clientIP}`);
    ws.close(1008, 'Destination port not allowed');
    return;
  }

  console.log(`[proxy] ${proto.toUpperCase()} ${clientIP} → ${destIP}:${destPort}`);

  if (proto === 'udp') {
    handleUDP(ws, destIP, destPort);
  } else if (proto === 'tcp') {
    handleTCP(ws, destIP, destPort);
  } else {
    ws.close(1008, 'Unknown protocol: ' + proto);
  }
});

// ============================================================================
// Protocol handlers
// ============================================================================

function handleUDP(ws, destIP, destPort) {
  const udp = dgram.createSocket('udp4');
  const label = `UDP ${destIP}:${destPort}`;
  const idle = createIdleTimer(ws, label);

  ws.on('message', (data) => {
    idle.reset();
    const buf = Buffer.from(data);
    console.log(`[proxy] WS→UDP ${buf.length} bytes → ${destIP}:${destPort}`);
    udp.send(buf, 0, buf.length, destPort, destIP, (err) => {
      if (err) console.error(`[proxy] UDP send error:`, err.message);
    });
  });

  udp.on('message', (msg, rinfo) => {
    idle.reset();
    console.log(`[proxy] UDP→WS ${msg.length} bytes ← ${rinfo.address}:${rinfo.port}`);
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    } else {
      console.warn(`[proxy] UDP→WS dropped — ws not open (readyState=${ws.readyState})`);
    }
  });

  udp.on('error', (err) => {
    console.error(`[proxy] UDP socket error:`, err.message);
    ws.close(1011, 'UDP error');
  });

  ws.on('close', () => {
    idle.clear();
    udp.close();
    console.log(`[proxy] UDP closed → ${destIP}:${destPort}`);
  });

  ws.on('error', () => {
    idle.clear();
    udp.close();
  });
}

function handleTCP(ws, destIP, destPort) {
  const tcp = net.createConnection(destPort, destIP);
  const label = `TCP ${destIP}:${destPort}`;
  const idle = createIdleTimer(ws, label);

  tcp.on('connect', () => {
    console.log(`[proxy] TCP connected → ${destIP}:${destPort}`);
  });

  ws.on('message', (data) => {
    idle.reset();
    tcp.write(Buffer.from(data));
  });

  tcp.on('data', (data) => {
    idle.reset();
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });

  tcp.on('end', () => {
    ws.close(1000, 'TCP closed');
  });

  tcp.on('error', (err) => {
    console.error(`[proxy] TCP error:`, err.message);
    ws.close(1011, 'TCP error');
  });

  ws.on('close', () => {
    idle.clear();
    tcp.destroy();
    console.log(`[proxy] TCP closed → ${destIP}:${destPort}`);
  });

  ws.on('error', () => {
    idle.clear();
    tcp.destroy();
  });
}
