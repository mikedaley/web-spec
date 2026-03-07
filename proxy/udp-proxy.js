/**
 * udp-proxy.js - WebSocket-to-UDP/TCP proxy for Spectranet
 *
 * Routes:
 *   /udp/{dest_ip}/{dest_port} - Relay binary WebSocket frames as UDP datagrams
 *   /tcp/{dest_ip}/{dest_port} - Relay binary WebSocket frames over TCP
 *
 * Usage:
 *   PORT=8080 node udp-proxy.js
 */

const { WebSocketServer } = require('ws');
const dgram = require('dgram');
const net = require('net');
const url = require('url');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const IDLE_TIMEOUT_MS = 30000;

const wss = new WebSocketServer({ port: PORT });
console.log(`[udp-proxy] Listening on ws://localhost:${PORT}`);

wss.on('connection', (ws, req) => {
  const parsed = url.parse(req.url);
  const parts = parsed.pathname.split('/').filter(Boolean); // [proto, ip, port]

  if (parts.length !== 3) {
    console.error(`[udp-proxy] Invalid path: ${parsed.pathname}`);
    ws.close(1008, 'Invalid path: expected /{udp|tcp}/{ip}/{port}');
    return;
  }

  const [proto, destIP, destPortStr] = parts;
  const destPort = parseInt(destPortStr, 10);

  if (isNaN(destPort) || destPort < 1 || destPort > 65535) {
    ws.close(1008, 'Invalid port');
    return;
  }

  console.log(`[udp-proxy] ${proto.toUpperCase()} connection → ${destIP}:${destPort}`);

  if (proto === 'udp') {
    handleUDP(ws, destIP, destPort);
  } else if (proto === 'tcp') {
    handleTCP(ws, destIP, destPort);
  } else {
    ws.close(1008, 'Unknown protocol: ' + proto);
  }
});

function handleUDP(ws, destIP, destPort) {
  const udp = dgram.createSocket('udp4');

  ws.on('message', (data) => {
    const buf = Buffer.from(data);
    console.log(`[udp-proxy] WS→UDP ${buf.length} bytes → ${destIP}:${destPort}`);
    udp.send(buf, 0, buf.length, destPort, destIP, (err) => {
      if (err) console.error(`[udp-proxy] UDP send error:`, err.message);
    });
  });

  udp.on('message', (msg, rinfo) => {
    console.log(`[udp-proxy] UDP→WS ${msg.length} bytes ← ${rinfo.address}:${rinfo.port}`);
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    } else {
      console.warn(`[udp-proxy] UDP→WS dropped — ws not open (readyState=${ws.readyState})`);
    }
  });

  udp.on('error', (err) => {
    console.error(`[udp-proxy] UDP socket error:`, err.message);
    ws.close(1011, 'UDP error');
  });

  ws.on('close', () => {
    udp.close();
    console.log(`[udp-proxy] UDP closed → ${destIP}:${destPort}`);
  });

  ws.on('error', () => {
    udp.close();
  });
}

function handleTCP(ws, destIP, destPort) {
  const tcp = net.createConnection(destPort, destIP);

  tcp.on('connect', () => {
    console.log(`[udp-proxy] TCP connected → ${destIP}:${destPort}`);
  });

  ws.on('message', (data) => {
    tcp.write(Buffer.from(data));
  });

  tcp.on('data', (data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  });

  tcp.on('end', () => {
    ws.close(1000, 'TCP closed');
  });

  tcp.on('error', (err) => {
    console.error(`[udp-proxy] TCP error:`, err.message);
    ws.close(1011, 'TCP error');
  });

  ws.on('close', () => {
    tcp.destroy();
    console.log(`[udp-proxy] TCP closed → ${destIP}:${destPort}`);
  });

  ws.on('error', () => {
    tcp.destroy();
  });
}
