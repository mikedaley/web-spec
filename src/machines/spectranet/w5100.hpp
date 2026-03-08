/*
 * w5100.hpp - W5100 Ethernet controller emulation for Spectranet
 *
 * Emulates the WIZnet W5100 register file and buffer space.
 * The W5100 provides 4 hardware sockets with independent TX/RX buffers.
 * Commands from the Z80 side are queued as NetCommand structs for
 * JavaScript to poll and execute via browser networking APIs.
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

#pragma once

#include <cstdint>
#include <cstring>
#include <array>
#include <vector>

namespace zxspec {

// W5100 common register offsets
constexpr uint16_t W5100_MR     = 0x0000;  // Mode register
constexpr uint16_t W5100_GAR    = 0x0001;  // Gateway address (4 bytes)
constexpr uint16_t W5100_SUBR   = 0x0005;  // Subnet mask (4 bytes)
constexpr uint16_t W5100_SHAR   = 0x0009;  // Source hardware address / MAC (6 bytes)
constexpr uint16_t W5100_SIPR   = 0x000F;  // Source IP address (4 bytes)
constexpr uint16_t W5100_IR     = 0x0015;  // Interrupt register
constexpr uint16_t W5100_IMR    = 0x0016;  // Interrupt mask register
constexpr uint16_t W5100_RTR    = 0x0017;  // Retry time (2 bytes)
constexpr uint16_t W5100_RCR    = 0x0019;  // Retry count
constexpr uint16_t W5100_RMSR   = 0x001A;  // RX memory size register
constexpr uint16_t W5100_TMSR   = 0x001B;  // TX memory size register

// Socket register base addresses (0x100 apart)
constexpr uint16_t W5100_S0_BASE = 0x0400;
constexpr uint16_t W5100_S1_BASE = 0x0500;
constexpr uint16_t W5100_S2_BASE = 0x0600;
constexpr uint16_t W5100_S3_BASE = 0x0700;

// Socket register offsets (relative to socket base)
constexpr uint8_t Sn_MR    = 0x00;  // Socket mode
constexpr uint8_t Sn_CR    = 0x01;  // Socket command
constexpr uint8_t Sn_IR    = 0x02;  // Socket interrupt
constexpr uint8_t Sn_SR    = 0x03;  // Socket status
constexpr uint8_t Sn_PORT  = 0x04;  // Source port (2 bytes)
constexpr uint8_t Sn_DHAR  = 0x06;  // Dest hardware address (6 bytes)
constexpr uint8_t Sn_DIPR  = 0x0C;  // Dest IP address (4 bytes)
constexpr uint8_t Sn_DPORT = 0x10;  // Dest port (2 bytes)
constexpr uint8_t Sn_MSSR  = 0x12;  // Max segment size (2 bytes)
constexpr uint8_t Sn_PROTO = 0x14;  // IP protocol (raw mode)
constexpr uint8_t Sn_TOS   = 0x15;  // Type of service
constexpr uint8_t Sn_TTL   = 0x16;  // Time to live
constexpr uint8_t Sn_TX_FSR = 0x20; // TX free size (2 bytes)
constexpr uint8_t Sn_TX_RD  = 0x22; // TX read pointer (2 bytes)
constexpr uint8_t Sn_TX_WR  = 0x24; // TX write pointer (2 bytes)
constexpr uint8_t Sn_RX_RSR = 0x26; // RX received size (2 bytes)
constexpr uint8_t Sn_RX_RD  = 0x28; // RX read pointer (2 bytes)

// Socket commands (written to Sn_CR)
constexpr uint8_t CMD_OPEN      = 0x01;
constexpr uint8_t CMD_LISTEN    = 0x02;
constexpr uint8_t CMD_CONNECT   = 0x04;
constexpr uint8_t CMD_DISCON    = 0x08;
constexpr uint8_t CMD_CLOSE     = 0x10;
constexpr uint8_t CMD_SEND      = 0x20;
constexpr uint8_t CMD_RECV      = 0x40;

// Socket status values (read from Sn_SR)
constexpr uint8_t SOCK_CLOSED      = 0x00;
constexpr uint8_t SOCK_INIT        = 0x13;
constexpr uint8_t SOCK_LISTEN      = 0x14;
constexpr uint8_t SOCK_ESTABLISHED = 0x17;
constexpr uint8_t SOCK_CLOSE_WAIT  = 0x1C;
constexpr uint8_t SOCK_UDP         = 0x22;
constexpr uint8_t SOCK_SYNSENT     = 0x15;
constexpr uint8_t SOCK_SYNRECV     = 0x16;
constexpr uint8_t SOCK_FIN_WAIT    = 0x18;
constexpr uint8_t SOCK_CLOSING     = 0x1A;
constexpr uint8_t SOCK_TIME_WAIT   = 0x1B;
constexpr uint8_t SOCK_LAST_ACK    = 0x1D;

// Socket protocol modes (Sn_MR bits 0-3)
constexpr uint8_t PROTO_CLOSED = 0x00;
constexpr uint8_t PROTO_TCP    = 0x01;
constexpr uint8_t PROTO_UDP    = 0x02;
constexpr uint8_t PROTO_RAW    = 0x03;

// Net command types for JS bridge
enum class NetCommandType : uint8_t {
    NONE = 0,
    OPEN,
    LISTEN,
    CONNECT,
    DISCONNECT,
    CLOSE,
    SEND,
    RECV
};

struct NetCommand {
    NetCommandType type = NetCommandType::NONE;
    uint8_t socket = 0;
    uint8_t protocol = 0;
    uint8_t destIP[4] = {};
    uint16_t destPort = 0;
    uint16_t srcPort = 0;
    uint16_t txOffset = 0;   // Offset into TX buffer
    uint16_t txLength = 0;   // Length of TX data
};

class W5100 {
public:
    W5100();

    void reset();

    // Register/buffer access (32KB address space: 0x0000-0x7FFF)
    uint8_t read(uint16_t address) const;
    void write(uint16_t address, uint8_t data);

    // Command queue for JS bridge (replaces single-command to prevent loss)
    bool hasPendingCommand() const { return !commandQueue_.empty(); }
    const NetCommand& getPendingCommand() const { return commandQueue_.front(); }
    void clearPendingCommand() { if (!commandQueue_.empty()) commandQueue_.erase(commandQueue_.begin()); }

    // JS-side updates
    void setSocketStatus(uint8_t socket, uint8_t status);
    uint16_t pushReceivedData(uint8_t socket, const uint8_t* data, uint16_t length);
    uint16_t getRxAvailable(uint8_t socket) const;

    // TX buffer access for JS to read outgoing data
    const uint8_t* getTxBuffer() const { return txBuffer_.data(); }
    uint16_t getTxBufferSize() const { return TX_BUFFER_SIZE; }

    // Socket state access
    uint8_t getSocketStatus(uint8_t socket) const;
    bool hasInterrupt() const;

private:
    void handleSocketCommand(uint8_t socket, uint8_t cmd);
    void handleDHCPRequest(uint8_t socket);
    uint16_t getSocketBase(uint8_t socket) const;

    // Default buffer sizes: 2KB per socket (total 8KB TX + 8KB RX)
    static constexpr uint16_t TX_BUFFER_BASE = 0x4000;
    static constexpr uint16_t TX_BUFFER_SIZE = 0x2000;  // 8KB total
    static constexpr uint16_t RX_BUFFER_BASE = 0x6000;
    static constexpr uint16_t RX_BUFFER_SIZE = 0x2000;  // 8KB total
    static constexpr uint16_t TX_SOCK_SIZE   = 0x0800;  // 2KB per socket
    static constexpr uint16_t RX_SOCK_SIZE   = 0x0800;  // 2KB per socket

    // Common registers (0x0000-0x003F)
    std::array<uint8_t, 0x0040> commonRegs_{};

    // Socket registers (0x0400-0x07FF)
    std::array<uint8_t, 0x0400> socketRegs_{};

    // TX buffers (0x4000-0x5FFF)
    std::array<uint8_t, TX_BUFFER_SIZE> txBuffer_{};

    // RX buffers (0x6000-0x7FFF)
    std::array<uint8_t, RX_BUFFER_SIZE> rxBuffer_{};

    // Command queue for JS bridge
    std::vector<NetCommand> commandQueue_;

    // Per-socket old_rx_rd for RECV delta tracking (matches Fuse behaviour)
    std::array<uint16_t, 4> oldRxRd_{};
};

} // namespace zxspec
