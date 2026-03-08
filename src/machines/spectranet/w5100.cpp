/*
 * w5100.cpp - W5100 Ethernet controller emulation for Spectranet
 *
 * Behaviour modelled on Fuse's peripherals/nic/w5100.c and w5100_socket.c
 * by Philip Kendall, adapted for the WASM/JS bridge architecture.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#include "w5100.hpp"
#include <cstring>

namespace zxspec {

W5100::W5100()
{
    reset();
}

void W5100::reset()
{
    commonRegs_.fill(0);
    socketRegs_.fill(0);
    txBuffer_.fill(0);
    rxBuffer_.fill(0);
    commandQueue_.clear();
    oldRxRd_.fill(0);

    // Default MAC address
    commonRegs_[W5100_SHAR + 0] = 0x00;
    commonRegs_[W5100_SHAR + 1] = 0x08;
    commonRegs_[W5100_SHAR + 2] = 0xDC;
    commonRegs_[W5100_SHAR + 3] = 0x01;
    commonRegs_[W5100_SHAR + 4] = 0x02;
    commonRegs_[W5100_SHAR + 5] = 0x03;

    // Default buffer sizes: 2KB per socket (fixed, like Fuse)
    commonRegs_[W5100_RMSR] = 0x55;
    commonRegs_[W5100_TMSR] = 0x55;

    // Set initial TX free size and TTL for each socket
    for (int s = 0; s < 4; s++) {
        uint16_t base = s * 0x100;
        socketRegs_[base + Sn_TX_FSR] = (TX_SOCK_SIZE >> 8) & 0xFF;
        socketRegs_[base + Sn_TX_FSR + 1] = TX_SOCK_SIZE & 0xFF;
        socketRegs_[base + Sn_TTL] = 128;
    }
}

uint8_t W5100::read(uint16_t address) const
{
    // Common registers
    if (address < 0x0030) {
        switch (address) {
        case W5100_MR:
            // Fuse: always returns 0 (no flags supported)
            return 0x00;
        case W5100_IMR:
            // Fuse: always returns 0xEF ("allow all")
            return 0xEF;
        case W5100_RMSR:
        case W5100_TMSR:
            // Fuse: always returns 0x55 (2KB per socket, fixed)
            return 0x55;
        default:
            return commonRegs_[address];
        }
    }

    // Socket registers
    if (address >= 0x0400 && address < 0x0800) {
        uint16_t offset = address - 0x0400;
        uint8_t socket = (offset >> 8) & 0x03;
        uint8_t reg = offset & 0xFF;
        uint16_t base = socket * 0x100;

        // Compute TX_FSR dynamically (like Fuse: 0x800 - (tx_wr - tx_rr))
        if (reg == Sn_TX_FSR || reg == Sn_TX_FSR + 1) {
            uint16_t txRr = (socketRegs_[base + Sn_TX_RD] << 8) | socketRegs_[base + Sn_TX_RD + 1];
            uint16_t txWr = (socketRegs_[base + Sn_TX_WR] << 8) | socketRegs_[base + Sn_TX_WR + 1];
            uint16_t fsr = TX_SOCK_SIZE - (txWr - txRr);
            int regOffset = reg - Sn_TX_FSR;
            return (fsr >> (8 * (1 - regOffset))) & 0xFF;
        }

        return socketRegs_[offset];
    }

    // TX buffer
    if (address >= TX_BUFFER_BASE && address < TX_BUFFER_BASE + TX_BUFFER_SIZE) {
        return txBuffer_[address - TX_BUFFER_BASE];
    }

    // RX buffer
    if (address >= RX_BUFFER_BASE && address < RX_BUFFER_BASE + RX_BUFFER_SIZE) {
        return rxBuffer_[address - RX_BUFFER_BASE];
    }

    return 0xFF;
}

void W5100::write(uint16_t address, uint8_t data)
{
    // Common registers
    if (address < 0x0030) {
        switch (address) {
        case W5100_MR:
            // Handle software reset (bit 7), warn on unsupported flags
            if (data & 0x80) {
                reset();
                return;
            }
            break;
        case W5100_IMR:
            // Fuse: only supports 0xEF, warns on anything else
            break;
        case W5100_RMSR:
        case W5100_TMSR:
            // Fuse: only supports 0x55 (2KB per socket), warns on anything else
            break;
        default:
            commonRegs_[address] = data;
            break;
        }
        return;
    }

    // Socket registers
    if (address >= 0x0400 && address < 0x0800) {
        uint16_t offset = address - 0x0400;
        uint8_t socket = (offset >> 8) & 0x03;
        uint8_t reg = offset & 0xFF;

        // Command register triggers action
        if (reg == Sn_CR) {
            handleSocketCommand(socket, data);
            // Command register auto-clears (per W5100 spec)
            socketRegs_[offset] = 0x00;
            return;
        }

        // Sn_IR: write-to-clear (writing 1 bits clears them, per W5100 spec)
        // Fuse: socket->ir &= ~b
        if (reg == Sn_IR) {
            socketRegs_[offset] &= ~data;
            return;
        }

        socketRegs_[offset] = data;
        return;
    }

    // TX buffer
    if (address >= TX_BUFFER_BASE && address < TX_BUFFER_BASE + TX_BUFFER_SIZE) {
        txBuffer_[address - TX_BUFFER_BASE] = data;
        return;
    }

    // RX buffer (normally read-only, but allow writes for testing)
    if (address >= RX_BUFFER_BASE && address < RX_BUFFER_BASE + RX_BUFFER_SIZE) {
        rxBuffer_[address - RX_BUFFER_BASE] = data;
        return;
    }
}

void W5100::handleSocketCommand(uint8_t socket, uint8_t cmd)
{
    uint16_t base = socket * 0x100;
    uint8_t protocol = socketRegs_[base + Sn_MR] & 0x0F;
    uint8_t state = socketRegs_[base + Sn_SR];

    switch (cmd) {
    case CMD_OPEN: {
        // Fuse: only opens if mode is TCP/UDP and state is CLOSED
        if ((protocol == PROTO_TCP || protocol == PROTO_UDP) &&
            state == SOCK_CLOSED) {

            // Clean socket state first (matches Fuse's w5100_socket_clean)
            socketRegs_[base + Sn_IR] = 0;
            socketRegs_[base + Sn_TX_RD] = 0;
            socketRegs_[base + Sn_TX_RD + 1] = 0;
            socketRegs_[base + Sn_TX_WR] = 0;
            socketRegs_[base + Sn_TX_WR + 1] = 0;
            socketRegs_[base + Sn_RX_RSR] = 0;
            socketRegs_[base + Sn_RX_RSR + 1] = 0;
            socketRegs_[base + Sn_RX_RD] = 0;
            socketRegs_[base + Sn_RX_RD + 1] = 0;
            oldRxRd_[socket] = 0;

            if (protocol == PROTO_TCP) {
                socketRegs_[base + Sn_SR] = SOCK_INIT;
            } else {
                socketRegs_[base + Sn_SR] = SOCK_UDP;
            }

            NetCommand nc;
            nc.type = NetCommandType::OPEN;
            nc.socket = socket;
            nc.protocol = protocol;
            nc.srcPort = (socketRegs_[base + Sn_PORT] << 8) | socketRegs_[base + Sn_PORT + 1];
            commandQueue_.push_back(nc);
        }
        break;
    }

    case CMD_LISTEN:
        // Fuse: only if state == INIT
        if (state == SOCK_INIT) {
            socketRegs_[base + Sn_SR] = SOCK_LISTEN;

            NetCommand nc;
            nc.type = NetCommandType::LISTEN;
            nc.socket = socket;
            nc.protocol = protocol;
            nc.srcPort = (socketRegs_[base + Sn_PORT] << 8) | socketRegs_[base + Sn_PORT + 1];
            commandQueue_.push_back(nc);
        }
        break;

    case CMD_CONNECT: {
        // Fuse: only if state == INIT
        if (state == SOCK_INIT) {
            NetCommand nc;
            nc.type = NetCommandType::CONNECT;
            nc.socket = socket;
            nc.protocol = protocol;
            nc.destIP[0] = socketRegs_[base + Sn_DIPR];
            nc.destIP[1] = socketRegs_[base + Sn_DIPR + 1];
            nc.destIP[2] = socketRegs_[base + Sn_DIPR + 2];
            nc.destIP[3] = socketRegs_[base + Sn_DIPR + 3];
            nc.destPort = (socketRegs_[base + Sn_DPORT] << 8) | socketRegs_[base + Sn_DPORT + 1];
            nc.srcPort = (socketRegs_[base + Sn_PORT] << 8) | socketRegs_[base + Sn_PORT + 1];
            commandQueue_.push_back(nc);

            // Set SYNSENT — the JS layer will transition to ESTABLISHED + CON
            // interrupt when the WebSocket actually connects.  The Spectranet ROM
            // polls Sn_SR across frames with a generous TCP timeout, so the async
            // round-trip through the WebSocket proxy has plenty of time.
            socketRegs_[base + Sn_SR] = SOCK_SYNSENT;
        }
        break;
    }

    case CMD_DISCON:
        // Fuse: goes straight to CLOSED with DISCON interrupt
        if (state == SOCK_ESTABLISHED || state == SOCK_CLOSE_WAIT) {
            socketRegs_[base + Sn_IR] |= 0x02;  // DISCON interrupt
            socketRegs_[base + Sn_SR] = SOCK_CLOSED;

            NetCommand nc;
            nc.type = NetCommandType::DISCONNECT;
            nc.socket = socket;
            nc.protocol = protocol;
            commandQueue_.push_back(nc);
        }
        break;

    case CMD_CLOSE:
        socketRegs_[base + Sn_SR] = SOCK_CLOSED;
        // Reset TX/RX pointers
        socketRegs_[base + Sn_TX_RD] = 0;
        socketRegs_[base + Sn_TX_RD + 1] = 0;
        socketRegs_[base + Sn_TX_WR] = 0;
        socketRegs_[base + Sn_TX_WR + 1] = 0;
        socketRegs_[base + Sn_RX_RSR] = 0;
        socketRegs_[base + Sn_RX_RSR + 1] = 0;
        socketRegs_[base + Sn_RX_RD] = 0;
        socketRegs_[base + Sn_RX_RD + 1] = 0;
        oldRxRd_[socket] = 0;
        {
            NetCommand nc;
            nc.type = NetCommandType::CLOSE;
            nc.socket = socket;
            nc.protocol = protocol;
            commandQueue_.push_back(nc);
        }
        break;

    case CMD_SEND: {
        if (state == SOCK_UDP || state == SOCK_ESTABLISHED) {
            // Check for DHCP: UDP to destination port 67
            uint16_t destPort = (socketRegs_[base + Sn_DPORT] << 8) | socketRegs_[base + Sn_DPORT + 1];
            if (protocol == PROTO_UDP && destPort == 67) {
                // Synthesize DHCP response locally
                handleDHCPRequest(socket);
                break;
            }

            // Calculate TX data range from TX_RD to TX_WR
            uint16_t txRd = (socketRegs_[base + Sn_TX_RD] << 8) | socketRegs_[base + Sn_TX_RD + 1];
            uint16_t txWr = (socketRegs_[base + Sn_TX_WR] << 8) | socketRegs_[base + Sn_TX_WR + 1];
            uint16_t txMask = TX_SOCK_SIZE - 1;
            uint16_t txBase = socket * TX_SOCK_SIZE;
            uint16_t len = (txWr - txRd) & txMask;

            NetCommand nc;
            nc.type = NetCommandType::SEND;
            nc.socket = socket;
            nc.protocol = protocol;
            nc.destIP[0] = socketRegs_[base + Sn_DIPR];
            nc.destIP[1] = socketRegs_[base + Sn_DIPR + 1];
            nc.destIP[2] = socketRegs_[base + Sn_DIPR + 2];
            nc.destIP[3] = socketRegs_[base + Sn_DIPR + 3];
            nc.destPort = destPort;
            nc.txOffset = txBase + (txRd & txMask);
            nc.txLength = len;
            commandQueue_.push_back(nc);

            // Advance TX_RD to TX_WR (data consumed)
            socketRegs_[base + Sn_TX_RD] = socketRegs_[base + Sn_TX_WR];
            socketRegs_[base + Sn_TX_RD + 1] = socketRegs_[base + Sn_TX_WR + 1];

            // Set SEND_OK interrupt (Fuse sets this after actual send on I/O thread,
            // but in our async browser model the Z80 polls within the frame, so we
            // set it immediately to prevent hangs)
            socketRegs_[base + Sn_IR] |= 0x10;
        }
        break;
    }

    case CMD_RECV: {
        // Fuse: rx_rsr -= (rx_rd - old_rx_rd); old_rx_rd = rx_rd
        // Valid in UDP, ESTABLISHED, or CLOSE_WAIT (server closed but
        // buffered data may remain to be read)
        if (state == SOCK_UDP || state == SOCK_ESTABLISHED || state == SOCK_CLOSE_WAIT) {
            uint16_t rxRd = (socketRegs_[base + Sn_RX_RD] << 8) | socketRegs_[base + Sn_RX_RD + 1];
            uint16_t rxRsr = (socketRegs_[base + Sn_RX_RSR] << 8) | socketRegs_[base + Sn_RX_RSR + 1];
            uint16_t consumed = rxRd - oldRxRd_[socket];

            rxRsr -= consumed;
            oldRxRd_[socket] = rxRd;

            socketRegs_[base + Sn_RX_RSR] = (rxRsr >> 8) & 0xFF;
            socketRegs_[base + Sn_RX_RSR + 1] = rxRsr & 0xFF;

            // Fuse: if there's still data, re-set RECV interrupt
            if (rxRsr != 0) {
                socketRegs_[base + Sn_IR] |= 0x04;
            }

            NetCommand nc;
            nc.type = NetCommandType::RECV;
            nc.socket = socket;
            nc.protocol = protocol;
            commandQueue_.push_back(nc);
        }
        break;
    }

    default:
        break;
    }
}

void W5100::handleDHCPRequest(uint8_t socket)
{
    uint16_t base = socket * 0x100;

    // Read TX buffer to extract the DHCP request
    uint16_t txRd = (socketRegs_[base + Sn_TX_RD] << 8) | socketRegs_[base + Sn_TX_RD + 1];
    uint16_t txMask = TX_SOCK_SIZE - 1;
    uint16_t txBase = socket * TX_SOCK_SIZE;

    // Helper to read from circular TX buffer
    auto txRead = [&](uint16_t off) -> uint8_t {
        return txBuffer_[txBase + ((txRd + off) & txMask)];
    };

    // Extract transaction ID (bytes 4-7) and client MAC (bytes 28-33)
    uint8_t xid[4], chaddr[6];
    for (int i = 0; i < 4; i++) xid[i] = txRead(4 + i);
    for (int i = 0; i < 6; i++) chaddr[i] = txRead(28 + i);

    // Detect DHCP message type from option 53 at byte offset 240
    // DHCP options start at offset 236 (after magic cookie 99.130.83.99)
    // Standard layout: option 53 is at offset 240 (236 + 4 for magic cookie)
    uint8_t msgType = 0;
    // Scan options starting after the magic cookie at offset 240
    uint16_t optOff = 240;
    for (int attempts = 0; attempts < 50; attempts++) {
        uint8_t opt = txRead(optOff);
        if (opt == 0xFF) break;  // End option
        if (opt == 0x00) { optOff++; continue; }  // Padding
        uint8_t len = txRead(optOff + 1);
        if (opt == 53 && len >= 1) {
            msgType = txRead(optOff + 2);
            break;
        }
        optOff += 2 + len;
    }

    // Determine response type
    uint8_t respType;
    if (msgType == 1) {
        respType = 2;  // DISCOVER -> OFFER
    } else if (msgType == 3) {
        respType = 5;  // REQUEST -> ACK
    } else {
        // Unknown message type, just advance pointers and set SEND_OK
        socketRegs_[base + Sn_TX_RD] = socketRegs_[base + Sn_TX_WR];
        socketRegs_[base + Sn_TX_RD + 1] = socketRegs_[base + Sn_TX_WR + 1];
        socketRegs_[base + Sn_IR] |= 0x10;
        return;
    }

    // Build DHCP response (BOOTP reply)
    // Assigned IP: 192.168.0.177, Server/Gateway: 192.168.0.1
    // Subnet: 255.255.255.0, DNS: 8.8.8.8
    uint8_t assignedIP[4] = {255, 255, 255, 255};
    uint8_t serverIP[4]   = {192, 168, 0, 1};
    uint8_t subnetMask[4]  = {255, 255, 255, 0};
    uint8_t dnsIP[4]       = {8, 8, 8, 8};

    // DHCP response payload
    uint8_t dhcp[300];
    std::memset(dhcp, 0, sizeof(dhcp));

    dhcp[0] = 0x02;  // op: BOOTREPLY
    dhcp[1] = 0x01;  // htype: Ethernet
    dhcp[2] = 0x06;  // hlen: 6
    dhcp[3] = 0x00;  // hops: 0

    // Transaction ID
    std::memcpy(&dhcp[4], xid, 4);

    // yiaddr: assigned IP
    std::memcpy(&dhcp[16], assignedIP, 4);

    // siaddr: server IP
    std::memcpy(&dhcp[20], serverIP, 4);

    // chaddr: client MAC
    std::memcpy(&dhcp[28], chaddr, 6);

    // Magic cookie: 99.130.83.99
    dhcp[236] = 99; dhcp[237] = 130; dhcp[238] = 83; dhcp[239] = 99;

    // DHCP options
    uint16_t optPos = 240;

    // Option 53: DHCP Message Type
    dhcp[optPos++] = 53; dhcp[optPos++] = 1; dhcp[optPos++] = respType;

    // Option 54: Server Identifier
    dhcp[optPos++] = 54; dhcp[optPos++] = 4;
    std::memcpy(&dhcp[optPos], serverIP, 4); optPos += 4;

    // Option 51: IP Address Lease Time (1 day = 86400 seconds)
    dhcp[optPos++] = 51; dhcp[optPos++] = 4;
    dhcp[optPos++] = 0x00; dhcp[optPos++] = 0x01;
    dhcp[optPos++] = 0x51; dhcp[optPos++] = 0x80;

    // Option 1: Subnet Mask
    dhcp[optPos++] = 1; dhcp[optPos++] = 4;
    std::memcpy(&dhcp[optPos], subnetMask, 4); optPos += 4;

    // Option 3: Router/Gateway
    dhcp[optPos++] = 3; dhcp[optPos++] = 4;
    std::memcpy(&dhcp[optPos], serverIP, 4); optPos += 4;

    // Option 6: DNS Server
    dhcp[optPos++] = 6; dhcp[optPos++] = 4;
    std::memcpy(&dhcp[optPos], dnsIP, 4); optPos += 4;

    // End option
    dhcp[optPos++] = 0xFF;

    // W5100 UDP RX format: 4-byte source IP + 2-byte source port (BE) + 2-byte data length (BE) + payload
    uint16_t dhcpLen = optPos;
    uint16_t headerLen = 8;  // 4 IP + 2 port + 2 length
    uint16_t totalLen = headerLen + dhcpLen;

    uint8_t rxPacket[308];
    // Source IP (DHCP server)
    std::memcpy(&rxPacket[0], serverIP, 4);
    // Source port: 67 (big-endian)
    rxPacket[4] = 0x00; rxPacket[5] = 67;
    // Data length (big-endian)
    rxPacket[6] = (dhcpLen >> 8) & 0xFF;
    rxPacket[7] = dhcpLen & 0xFF;
    // DHCP payload
    std::memcpy(&rxPacket[8], dhcp, dhcpLen);

    // Push response into RX buffer
    pushReceivedData(socket, rxPacket, totalLen);

    // Advance TX_RD to TX_WR (request consumed)
    socketRegs_[base + Sn_TX_RD] = socketRegs_[base + Sn_TX_WR];
    socketRegs_[base + Sn_TX_RD + 1] = socketRegs_[base + Sn_TX_WR + 1];

    // Set SEND_OK interrupt
    socketRegs_[base + Sn_IR] |= 0x10;

}

void W5100::setSocketStatus(uint8_t socket, uint8_t status)
{
    if (socket >= 4) return;
    uint16_t base = socket * 0x100;
    socketRegs_[base + Sn_SR] = status;

    // Set appropriate interrupt bits based on status transitions (matches Fuse)
    if (status == SOCK_ESTABLISHED) {
        socketRegs_[base + Sn_IR] |= 0x01;  // CON interrupt
    } else if (status == SOCK_CLOSE_WAIT) {
        socketRegs_[base + Sn_IR] |= 0x02;  // DISCON interrupt
    } else if (status == SOCK_CLOSED) {
        socketRegs_[base + Sn_IR] |= 0x02;  // DISCON interrupt
    }
}

uint16_t W5100::pushReceivedData(uint8_t socket, const uint8_t* data, uint16_t length)
{
    if (socket >= 4 || !data || length == 0) return 0;

    uint16_t base = socket * 0x100;
    uint16_t rxRsr = (socketRegs_[base + Sn_RX_RSR] << 8) | socketRegs_[base + Sn_RX_RSR + 1];
    uint16_t rxMask = RX_SOCK_SIZE - 1;
    uint16_t rxBase = socket * RX_SOCK_SIZE;

    // Calculate write offset using old_rx_rd + rx_rsr (matches Fuse)
    uint16_t offset = (oldRxRd_[socket] + rxRsr) & rxMask;
    uint16_t available = RX_SOCK_SIZE - rxRsr;
    uint16_t toWrite = (length < available) ? length : available;

    if (toWrite == 0) return 0;

    // Two-chunk memcpy for circular buffer (matches Fuse, more efficient than byte loop)
    if (offset + toWrite <= RX_SOCK_SIZE) {
        std::memcpy(&rxBuffer_[rxBase + offset], data, toWrite);
    } else {
        uint16_t firstChunk = RX_SOCK_SIZE - offset;
        std::memcpy(&rxBuffer_[rxBase + offset], data, firstChunk);
        std::memcpy(&rxBuffer_[rxBase], data + firstChunk, toWrite - firstChunk);
    }

    // Update received size
    rxRsr += toWrite;
    socketRegs_[base + Sn_RX_RSR] = (rxRsr >> 8) & 0xFF;
    socketRegs_[base + Sn_RX_RSR + 1] = rxRsr & 0xFF;

    // Set RECV interrupt
    socketRegs_[base + Sn_IR] |= 0x04;

    return toWrite;
}

uint16_t W5100::getRxAvailable(uint8_t socket) const
{
    if (socket >= 4) return 0;
    uint16_t base = socket * 0x100;
    uint16_t rxRsr = (socketRegs_[base + Sn_RX_RSR] << 8) | socketRegs_[base + Sn_RX_RSR + 1];
    return RX_SOCK_SIZE - rxRsr;
}

uint8_t W5100::getSocketStatus(uint8_t socket) const
{
    if (socket >= 4) return SOCK_CLOSED;
    return socketRegs_[socket * 0x100 + Sn_SR];
}

bool W5100::hasInterrupt() const
{
    // Check if any socket has pending interrupts (matches Fuse)
    for (int s = 0; s < 4; s++) {
        uint8_t ir = socketRegs_[s * 0x100 + Sn_IR];
        if (ir) {
            return true;
        }
    }
    return false;
}

uint16_t W5100::getSocketBase(uint8_t socket) const
{
    return 0x0400 + socket * 0x100;
}

} // namespace zxspec
