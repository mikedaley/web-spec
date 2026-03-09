/*
 * tnfs-client.js - TNFS (Trivial Network File System) protocol client
 *
 * Communicates with TNFS servers via the UDP proxy WebSocket bridge.
 * This is a standalone client that bypasses the emulated Spectranet/W5100
 * and talks directly to the proxy.
 *
 * TNFS protocol: UDP port 16384
 * Packet format: session_id (2 bytes LE) + sequence (1 byte) + command (1 byte) + payload
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

const TNFS_PORT = 16384;
const TNFS_TIMEOUT = 5000;
const TNFS_RETRIES = 3;

// TNFS commands
const CMD_MOUNT    = 0x00;
const CMD_UMOUNT   = 0x01;
const CMD_OPENDIR  = 0x10;
const CMD_READDIR  = 0x11;
const CMD_CLOSEDIR = 0x12;
const CMD_STAT     = 0x14;
const CMD_OPEN     = 0x29;
const CMD_READ     = 0x21;
const CMD_CLOSE    = 0x23;

// TNFS error codes
const TNFS_SUCCESS = 0x00;
const TNFS_EOF     = 0x21;  // End of file / end of directory

const ERROR_MESSAGES = {
  0x01: "Permission denied",
  0x02: "No such file or directory",
  0x05: "I/O error",
  0x06: "No such device",
  0x0B: "Try again",
  0x0C: "Out of memory",
  0x0D: "Access denied",
  0x11: "Entry exists",
  0x14: "Not a directory",
  0x15: "Is a directory",
  0x16: "Invalid argument",
  0x1B: "File table overflow",
  0x1C: "Too many open files",
  0x21: "End of file",
  0x24: "Too many symbolic links",
  0x26: "Name too long",
  0x42: "No TNFS connections available",
  0xFF: "Not mounted",
};

// Unix file mode bits
const S_IFMT  = 0xF000;
const S_IFDIR = 0x4000;
const S_IFREG = 0x8000;

export class TNFSClient {
  constructor() {
    this.ws = null;
    this.sessionId = 0;
    this.sequence = 0;
    this.connected = false;
    this.serverHost = null;
    this.proxyUrl = null;
    this._pendingRequests = new Map();
  }

  /**
   * Mount a TNFS server.
   * @param {string} host - Server hostname or IP
   * @param {string} proxyUrl - WebSocket proxy base URL (e.g., "wss://proxy.example.com")
   * @param {string} mountPath - Path to mount (default "/")
   * @returns {Promise<void>}
   */
  async mount(host, proxyUrl, mountPath = "/") {
    if (this.connected) {
      await this.umount();
    }

    this.proxyUrl = proxyUrl;
    this.serverHost = host;
    this.sequence = 0;
    this.sessionId = 0;

    // Resolve hostname to IP if needed
    const ip = await this._resolveHost(host);

    // Open WebSocket to proxy targeting the TNFS server
    const wsUrl = `${proxyUrl}/udp/${ip}/${TNFS_PORT}`;
    await this._connectWebSocket(wsUrl);

    // Build MOUNT packet: version (2 bytes LE) + mount path (null-terminated) + user + password
    const pathBytes = new TextEncoder().encode(mountPath);
    const payload = new Uint8Array(2 + pathBytes.length + 1 + 1 + 1);
    payload[0] = 0x00; // TNFS version minor
    payload[1] = 0x01; // TNFS version major
    payload.set(pathBytes, 2);
    payload[2 + pathBytes.length] = 0x00; // null terminator for path
    payload[2 + pathBytes.length + 1] = 0x00; // empty user
    payload[2 + pathBytes.length + 2] = 0x00; // empty password

    const response = await this._sendCommand(CMD_MOUNT, payload);
    if (response.returnCode !== TNFS_SUCCESS) {
      this._closeWebSocket();
      throw new Error(this._errorMessage(response.returnCode));
    }

    // Parse session ID from response (first 2 bytes of response header)
    this.sessionId = response.sessionId;
    this.connected = true;
  }

  /**
   * Unmount from the current server.
   */
  async umount() {
    if (!this.connected) return;

    try {
      await this._sendCommand(CMD_UMOUNT, new Uint8Array(0));
    } catch (e) {
      // Ignore errors during unmount
    }

    this.connected = false;
    this.sessionId = 0;
    this._closeWebSocket();
  }

  /**
   * List directory contents with file info.
   * @param {string} path - Directory path
   * @returns {Promise<Array<{name: string, isDir: boolean, size: number}>>}
   */
  async listDirectory(path) {
    if (!this.connected) throw new Error("Not connected");

    // OPENDIR
    const pathBytes = this._encodeString(path);
    const openResp = await this._sendCommand(CMD_OPENDIR, pathBytes);
    if (openResp.returnCode !== TNFS_SUCCESS) {
      throw new Error(this._errorMessage(openResp.returnCode));
    }
    const dirHandle = openResp.data[0];

    // READDIR until EOF
    const entries = [];
    try {
      while (true) {
        const readResp = await this._sendCommand(CMD_READDIR, new Uint8Array([dirHandle]));
        if (readResp.returnCode === TNFS_EOF) break;
        if (readResp.returnCode !== TNFS_SUCCESS) {
          throw new Error(this._errorMessage(readResp.returnCode));
        }

        const name = this._decodeString(readResp.data);
        if (name !== "." && name !== "..") {
          entries.push({ name, isDir: false, size: 0 });
        }
      }
    } finally {
      // CLOSEDIR
      try {
        await this._sendCommand(CMD_CLOSEDIR, new Uint8Array([dirHandle]));
      } catch (e) {
        // Ignore close errors
      }
    }

    // STAT each entry to get type and size
    const statPromises = entries.map(async (entry) => {
      try {
        const fullPath = path.endsWith("/") ? path + entry.name : path + "/" + entry.name;
        const stat = await this.stat(fullPath);
        entry.isDir = stat.isDir;
        entry.size = stat.size;
      } catch (e) {
        // If stat fails, keep defaults
      }
      return entry;
    });

    await Promise.all(statPromises);

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return entries;
  }

  /**
   * Get file/directory info.
   * @param {string} path - File path
   * @returns {Promise<{isDir: boolean, size: number, mode: number}>}
   */
  async stat(path) {
    if (!this.connected) throw new Error("Not connected");

    const pathBytes = this._encodeString(path);
    const resp = await this._sendCommand(CMD_STAT, pathBytes);
    if (resp.returnCode !== TNFS_SUCCESS) {
      throw new Error(this._errorMessage(resp.returnCode));
    }

    // Parse stat response: mode(2) + uid(2) + gid(2) + size(4) + atime(4) + mtime(4) + ctime(4)
    const data = resp.data;
    const mode = data[0] | (data[1] << 8);
    const size = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);

    return {
      isDir: (mode & S_IFMT) === S_IFDIR,
      size: size >>> 0, // unsigned
      mode,
    };
  }

  /**
   * Read a file from the server.
   * @param {string} path - File path
   * @returns {Promise<Uint8Array>}
   */
  async readFile(path) {
    if (!this.connected) throw new Error("Not connected");

    // OPEN file for reading (flags: O_RDONLY = 0x0001, mode = 0x0000)
    const pathBytes = this._encodeString(path);
    const openPayload = new Uint8Array(2 + 2 + pathBytes.length);
    openPayload[0] = 0x01; // O_RDONLY
    openPayload[1] = 0x00;
    openPayload[2] = 0x00; // mode
    openPayload[3] = 0x00;
    openPayload.set(pathBytes, 4);

    const openResp = await this._sendCommand(CMD_OPEN, openPayload);
    if (openResp.returnCode !== TNFS_SUCCESS) {
      throw new Error(this._errorMessage(openResp.returnCode));
    }
    const fd = openResp.data[0];

    // READ file in chunks
    const chunks = [];
    try {
      while (true) {
        // READ: fd(1) + offset(4) + length(2)
        // We read in 512-byte chunks to stay well within UDP packet limits
        const totalRead = chunks.reduce((sum, c) => sum + c.length, 0);
        const readPayload = new Uint8Array(7);
        readPayload[0] = fd;
        readPayload[1] = totalRead & 0xFF;
        readPayload[2] = (totalRead >> 8) & 0xFF;
        readPayload[3] = (totalRead >> 16) & 0xFF;
        readPayload[4] = (totalRead >> 24) & 0xFF;
        readPayload[5] = 0x00; // 512 bytes
        readPayload[6] = 0x02;

        const readResp = await this._sendCommand(CMD_READ, readPayload);
        if (readResp.returnCode === TNFS_EOF) break;
        if (readResp.returnCode !== TNFS_SUCCESS) {
          throw new Error(this._errorMessage(readResp.returnCode));
        }

        // Response: actual_length(2 LE) + data
        const actualLen = readResp.data[0] | (readResp.data[1] << 8);
        if (actualLen === 0) break;
        chunks.push(readResp.data.slice(2, 2 + actualLen));
      }
    } finally {
      // CLOSE file
      try {
        await this._sendCommand(CMD_CLOSE, new Uint8Array([fd]));
      } catch (e) {
        // Ignore close errors
      }
    }

    // Concatenate chunks
    const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  async _resolveHost(host) {
    // If it looks like an IP address, return as-is
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return host;
    }

    // Use DNS-over-HTTPS to resolve hostname
    try {
      const resp = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`);
      const json = await resp.json();
      if (json.Answer && json.Answer.length > 0) {
        const aRecord = json.Answer.find(a => a.type === 1);
        if (aRecord) return aRecord.data;
      }
    } catch (e) {
      // Fall through
    }

    throw new Error(`Cannot resolve hostname: ${host}`);
  }

  _connectWebSocket(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket connection timeout"));
      }, TNFS_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;

        ws.onmessage = (event) => {
          this._handleResponse(new Uint8Array(event.data));
        };

        ws.onclose = () => {
          this.connected = false;
          this.ws = null;
          // Reject all pending requests
          for (const [, req] of this._pendingRequests) {
            req.reject(new Error("Connection closed"));
          }
          this._pendingRequests.clear();
        };

        ws.onerror = () => {
          // onclose will fire after this
        };

        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Failed to connect to proxy"));
      };
    });
  }

  _closeWebSocket() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    for (const [, req] of this._pendingRequests) {
      req.reject(new Error("Connection closed"));
    }
    this._pendingRequests.clear();
  }

  _sendCommand(command, payload) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }

      const seq = this.sequence;
      this.sequence = (this.sequence + 1) & 0xFF;

      // Build packet: session_id (2 LE) + sequence (1) + command (1) + payload
      const packet = new Uint8Array(4 + payload.length);
      packet[0] = this.sessionId & 0xFF;
      packet[1] = (this.sessionId >> 8) & 0xFF;
      packet[2] = seq;
      packet[3] = command;
      packet.set(payload, 4);

      let retries = 0;
      let timer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this._pendingRequests.delete(seq);
      };

      const attemptSend = () => {
        timer = setTimeout(() => {
          retries++;
          if (retries >= TNFS_RETRIES) {
            cleanup();
            reject(new Error("Request timed out"));
          } else {
            // Retry
            this.ws.send(packet);
            attemptSend();
          }
        }, TNFS_TIMEOUT);
      };

      this._pendingRequests.set(seq, {
        command,
        resolve: (resp) => { cleanup(); resolve(resp); },
        reject: (err) => { cleanup(); reject(err); },
      });

      this.ws.send(packet);
      attemptSend();
    });
  }

  _handleResponse(data) {
    if (data.length < 4) return;

    const sessionId = data[0] | (data[1] << 8);
    const seq = data[2];
    const command = data[3];

    const pending = this._pendingRequests.get(seq);
    if (!pending) return;

    // For MOUNT, the session ID is in the response
    if (command === CMD_MOUNT && data.length >= 5) {
      const returnCode = data[4];
      pending.resolve({
        sessionId,
        returnCode,
        data: data.slice(5),
      });
      return;
    }

    if (data.length < 5) {
      pending.resolve({ sessionId, returnCode: 0xFF, data: new Uint8Array(0) });
      return;
    }

    const returnCode = data[4];
    pending.resolve({
      sessionId,
      returnCode,
      data: data.slice(5),
    });
  }

  _encodeString(str) {
    const bytes = new TextEncoder().encode(str);
    const result = new Uint8Array(bytes.length + 1);
    result.set(bytes);
    result[bytes.length] = 0x00; // null terminator
    return result;
  }

  _decodeString(data) {
    // Find null terminator
    let end = data.indexOf(0x00);
    if (end === -1) end = data.length;
    return new TextDecoder().decode(data.slice(0, end));
  }

  _errorMessage(code) {
    return ERROR_MESSAGES[code] || `TNFS error 0x${code.toString(16).padStart(2, "0")}`;
  }

  destroy() {
    this.umount().catch(() => {});
    this._closeWebSocket();
  }
}
