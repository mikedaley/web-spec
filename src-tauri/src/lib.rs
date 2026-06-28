//! Native backend for the desktop (Tauri) build of SpectrEm.
//!
//! The web build and the desktop build share the *entire* frontend in `src/js`
//! and the same Emscripten WASM core. The only thing the desktop build adds is
//! native capabilities the browser sandbox cannot offer — chiefly raw UDP
//! sockets for the Spectranet/TNFS stack, which in the browser have to be
//! tunnelled through the `proxy/` WebSocket→UDP bridge. Here that bridge is
//! native, so the proxy is not needed when running under Tauri.
//!
//! ## UDP session bridge
//!
//! This mirrors the WebSocket semantics of `proxy/udp-proxy.js`: a session is
//! opened once (`udp_open`), datagrams are sent on it (`udp_send`), and inbound
//! datagrams are pushed to the frontend asynchronously as `udp-recv` events.
//! `src/js/platform/native-net.js` wraps this in a `WebSocket`-shaped object so
//! `tnfs-client.js` uses one code path for both hosts.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri::async_runtime::JoinHandle;
use tokio::net::UdpSocket;
use tokio::sync::Mutex;

/// Per-app networking state: an id counter and the live UDP sessions.
#[derive(Default)]
struct NetState {
    next_id: AtomicU32,
    udp: Mutex<HashMap<u32, UdpSession>>,
}

struct UdpSession {
    socket: Arc<UdpSocket>,
    /// Background task pumping inbound datagrams into `udp-recv` events.
    recv_task: JoinHandle<()>,
}

/// Payload for an inbound datagram event. `data` serialises to a JS number[],
/// which the frontend turns back into a Uint8Array. TNFS packets are small
/// (≤ ~600 bytes) so the JSON array overhead is negligible.
#[derive(Clone, Serialize)]
struct UdpRecv {
    id: u32,
    data: Vec<u8>,
}

/// Open a connected UDP socket to `host:port` and start pumping replies.
/// Returns a session id used by `udp_send` / `udp_close`.
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
    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;

    let recv_socket = socket.clone();
    let app_handle = app.clone();
    let recv_task = tauri::async_runtime::spawn(async move {
        let mut buf = vec![0u8; 65_535];
        loop {
            match recv_socket.recv(&mut buf).await {
                Ok(n) => {
                    let _ = app_handle.emit(
                        "udp-recv",
                        UdpRecv {
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

/// Send one datagram on an open session.
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

/// Close a session and stop its receive task.
#[tauri::command]
async fn udp_close(state: State<'_, NetState>, id: u32) -> Result<(), String> {
    if let Some(session) = state.udp.lock().await.remove(&id) {
        session.recv_task.abort();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(NetState::default())
        .invoke_handler(tauri::generate_handler![udp_open, udp_send, udp_close])
        .run(tauri::generate_context!())
        .expect("error while running SpectrEm");
}
