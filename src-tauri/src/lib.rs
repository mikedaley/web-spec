//! Native backend for the desktop (Tauri) build of SpectrEm.
//!
//! The web build and the desktop build share the *entire* frontend in `src/js`
//! and the same Emscripten WASM core. The only thing the desktop build adds is
//! native capabilities the browser sandbox cannot offer — raw UDP and TCP
//! sockets for the Spectranet/W5100 + TNFS stack. In the browser these are
//! tunnelled through the `proxy/` WebSocket bridge; here they are native, so the
//! proxy is not needed when running under Tauri.
//!
//! ## Session model
//!
//! Both transports mirror the WebSocket semantics of `proxy/udp-proxy.js`: a
//! session is opened, datagrams/bytes are sent on it, and inbound bytes are
//! pushed to the frontend asynchronously as events. `src/js/platform/native-net.js`
//! wraps each in a `WebSocket`-shaped object so the Spectranet clients use one
//! code path for both hosts.
//!
//! TCP sessions are *resumed* explicitly (`tcp_resume`) after the frontend has
//! attached its event listeners, so a server banner sent immediately on connect
//! (or an inbound peer) cannot race ahead of the listener and be dropped.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::Mutex;

/// Per-app networking state: an id counter and the live sessions.
#[derive(Default)]
struct NetState {
    next_id: AtomicU32,
    udp: Mutex<HashMap<u32, UdpSession>>,
    tcp: Mutex<HashMap<u32, Arc<TcpSession>>>,
}

impl NetState {
    fn next_id(&self) -> u32 {
        self.next_id.fetch_add(1, Ordering::Relaxed) + 1
    }
}

struct UdpSession {
    socket: Arc<UdpSocket>,
    recv_task: JoinHandle<()>,
}

struct TcpSession {
    /// Write half, filled on connect or on accept (listen mode).
    writer: Mutex<Option<OwnedWriteHalf>>,
    /// Read half awaiting `tcp_resume` (connect mode).
    pending_read: Mutex<Option<OwnedReadHalf>>,
    /// Listener awaiting `tcp_resume` (listen mode).
    pending_listener: Mutex<Option<TcpListener>>,
    /// The pump task, once resumed.
    task: Mutex<Option<JoinHandle<()>>>,
}

/// `{ id, data }` event payload for inbound bytes (udp-recv / tcp-recv).
#[derive(Clone, Serialize)]
struct BytesEvent {
    id: u32,
    data: Vec<u8>,
}

/// `tcp-accept` payload: an inbound peer connected to a listening socket.
#[derive(Clone, Serialize)]
struct AcceptEvent {
    id: u32,
    peer_ip: [u8; 4],
    peer_port: u16,
}

fn ipv4_octets(addr: &SocketAddr) -> ([u8; 4], u16) {
    match addr {
        SocketAddr::V4(v4) => (v4.ip().octets(), v4.port()),
        SocketAddr::V6(v6) => ([0, 0, 0, 0], v6.port()),
    }
}

// ============================================================================
// UDP
// ============================================================================

/// Open a connected UDP socket to `host:port` and start pumping replies as
/// `udp-recv` events. Returns a session id for `udp_send` / `udp_close`.
#[tauri::command]
async fn udp_open(
    app: AppHandle,
    state: State<'_, NetState>,
    host: String,
    port: u16,
) -> Result<u32, String> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("bind: {e}"))?;
    socket
        .connect((host.as_str(), port))
        .await
        .map_err(|e| format!("connect {host}:{port}: {e}"))?;
    let socket = Arc::new(socket);
    let id = state.next_id();

    let recv_socket = socket.clone();
    let app_handle = app.clone();
    let recv_task = tauri::async_runtime::spawn(async move {
        let mut buf = vec![0u8; 65_535];
        loop {
            match recv_socket.recv(&mut buf).await {
                Ok(n) => {
                    let _ = app_handle.emit(
                        "udp-recv",
                        BytesEvent {
                            id,
                            data: buf[..n].to_vec(),
                        },
                    );
                }
                Err(_) => {
                    let _ = app_handle.emit("udp-close", id);
                    break;
                }
            }
        }
    });

    state
        .udp
        .lock()
        .await
        .insert(id, UdpSession { socket, recv_task });
    Ok(id)
}

#[tauri::command]
async fn udp_send(state: State<'_, NetState>, id: u32, data: Vec<u8>) -> Result<(), String> {
    let map = state.udp.lock().await;
    let session = map.get(&id).ok_or("unknown udp socket")?;
    session
        .socket
        .send(&data)
        .await
        .map_err(|e| format!("send: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn udp_close(state: State<'_, NetState>, id: u32) -> Result<(), String> {
    if let Some(session) = state.udp.lock().await.remove(&id) {
        session.recv_task.abort();
    }
    Ok(())
}

// ============================================================================
// TCP
// ============================================================================

/// Connect a TCP socket to `host:port`. The connection is established before
/// this returns; call `tcp_resume` to start pumping inbound bytes once the
/// frontend has attached its listeners. Returns a session id.
#[tauri::command]
async fn tcp_connect(
    state: State<'_, NetState>,
    host: String,
    port: u16,
) -> Result<u32, String> {
    let stream = TcpStream::connect((host.as_str(), port))
        .await
        .map_err(|e| format!("connect {host}:{port}: {e}"))?;
    let _ = stream.set_nodelay(true);
    let (reader, writer) = stream.into_split();
    let id = state.next_id();

    state.tcp.lock().await.insert(
        id,
        Arc::new(TcpSession {
            writer: Mutex::new(Some(writer)),
            pending_read: Mutex::new(Some(reader)),
            pending_listener: Mutex::new(None),
            task: Mutex::new(None),
        }),
    );
    Ok(id)
}

/// Bind a TCP listener on `0.0.0.0:port` for an inbound (Spectranet LISTEN)
/// connection. Call `tcp_resume` to begin accepting. On accept, a `tcp-accept`
/// event fires and the socket then behaves like a connected one. Returns a
/// session id.
#[tauri::command]
async fn tcp_listen(state: State<'_, NetState>, port: u16) -> Result<u32, String> {
    let listener = TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("listen :{port}: {e}"))?;
    let id = state.next_id();

    state.tcp.lock().await.insert(
        id,
        Arc::new(TcpSession {
            writer: Mutex::new(None),
            pending_read: Mutex::new(None),
            pending_listener: Mutex::new(Some(listener)),
            task: Mutex::new(None),
        }),
    );
    Ok(id)
}

/// Read-loop shared by connect and (post-accept) listen sessions.
async fn pump_reads(app: AppHandle, id: u32, mut reader: OwnedReadHalf) {
    let mut buf = vec![0u8; 65_535];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => {
                let _ = app.emit("tcp-close", id);
                break;
            }
            Ok(n) => {
                let _ = app.emit(
                    "tcp-recv",
                    BytesEvent {
                        id,
                        data: buf[..n].to_vec(),
                    },
                );
            }
            Err(_) => {
                let _ = app.emit("tcp-close", id);
                break;
            }
        }
    }
}

/// Start a TCP session's pump task. Safe to call once; subsequent calls no-op.
#[tauri::command]
async fn tcp_resume(app: AppHandle, state: State<'_, NetState>, id: u32) -> Result<(), String> {
    let session = {
        let map = state.tcp.lock().await;
        map.get(&id).cloned().ok_or("unknown tcp socket")?
    };

    // Connect mode: a read half is waiting.
    if let Some(reader) = session.pending_read.lock().await.take() {
        let task = tauri::async_runtime::spawn(pump_reads(app.clone(), id, reader));
        *session.task.lock().await = Some(task);
        return Ok(());
    }

    // Listen mode: accept one connection, then pump it.
    if let Some(listener) = session.pending_listener.lock().await.take() {
        let app_handle = app.clone();
        let session_for_task = session.clone();
        let task = tauri::async_runtime::spawn(async move {
            match listener.accept().await {
                Ok((stream, peer)) => {
                    let _ = stream.set_nodelay(true);
                    let (reader, writer) = stream.into_split();
                    *session_for_task.writer.lock().await = Some(writer);
                    let (peer_ip, peer_port) = ipv4_octets(&peer);
                    let _ = app_handle.emit(
                        "tcp-accept",
                        AcceptEvent {
                            id,
                            peer_ip,
                            peer_port,
                        },
                    );
                    pump_reads(app_handle, id, reader).await;
                }
                Err(_) => {
                    let _ = app_handle.emit("tcp-close", id);
                }
            }
        });
        *session.task.lock().await = Some(task);
        return Ok(());
    }

    Ok(())
}

#[tauri::command]
async fn tcp_send(state: State<'_, NetState>, id: u32, data: Vec<u8>) -> Result<(), String> {
    let session = {
        let map = state.tcp.lock().await;
        map.get(&id).cloned().ok_or("unknown tcp socket")?
    };
    let mut guard = session.writer.lock().await;
    // No writer yet means a listening socket with no peer — drop (the frontend
    // only sends once the socket reports ESTABLISHED, so this is a stray keepalive).
    if let Some(writer) = guard.as_mut() {
        writer.write_all(&data).await.map_err(|e| format!("send: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn tcp_close(state: State<'_, NetState>, id: u32) -> Result<(), String> {
    if let Some(session) = state.tcp.lock().await.remove(&id) {
        if let Some(task) = session.task.lock().await.take() {
            task.abort();
        }
        // Dropping the session drops the write half (and any pending halves),
        // closing the connection.
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(NetState::default())
        .invoke_handler(tauri::generate_handler![
            udp_open,
            udp_send,
            udp_close,
            tcp_connect,
            tcp_listen,
            tcp_resume,
            tcp_send,
            tcp_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SpectrEm");
}
