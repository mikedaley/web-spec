# Desktop build (Tauri v2)

SpectrEm ships as both a **web app** (the existing Vite build) and a **native
desktop app** built with [Tauri v2](https://v2.tauri.app). Both builds share the
*same* frontend (`src/js`) and the *same* Emscripten WASM core — there is no
forked copy of the emulator. The desktop build only adds native capabilities the
browser sandbox cannot offer (raw sockets, native file dialogs).

## Layout

```
src-tauri/                 # Rust backend + Tauri config (desktop only)
  Cargo.toml
  build.rs
  tauri.conf.json          # window, bundle, dev/build wiring
  capabilities/default.json
  icons/                   # generated from public/icons/icon-512.png
  src/
    main.rs                # desktop entry point
    lib.rs                 # shared backend: udp_request / tcp_request commands
src/js/platform/
  runtime.js               # isTauri() detection, shared by both builds
  native-net.js            # native UDP/TCP bridge (replaces proxy/ under Tauri)
```

The web build is untouched: `npm run dev` / `npm run build` work exactly as
before. `vite.config.js` only changes behaviour when launched *by* Tauri (it
skips auto-opening a browser tab).

## Prerequisites (one-time)

The desktop build needs the Rust toolchain, which is **not yet installed** on
this machine:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # install Rust
# macOS: Xcode Command Line Tools (`xcode-select --install`) for the linker
npm install                                                      # pulls @tauri-apps/* (added to package.json)
```

See https://v2.tauri.app/start/prerequisites/ for Linux/Windows system deps.

## Running

```bash
npm run tauri:dev      # builds WASM via `npm run dev`, opens native window w/ hot reload
npm run tauri:build    # production .app/.dmg/.deb/.msi into src-tauri/target/release/bundle
```

`tauri:dev` runs `npm run dev` (Vite on :3000) as its dev server and loads it via
`devUrl` in `tauri.conf.json`. `tauri:build` runs `npm run build` (WASM + Vite)
and packages `dist/` as `frontendDist`.

## Icons

The icons in `src-tauri/icons/` were generated from `public/icons/icon-512.png`
with `sips`/`iconutil`. The Windows `.ico` is **not** included (needs tooling not
on this machine). To regenerate the complete, correct set for all platforms:

```bash
npm run tauri icon public/icons/icon-512.png
```

Then re-add `"icons/icon.ico"` to the `bundle.icon` array in `tauri.conf.json`.

## Native networking (the main win)

In the browser, Spectranet/TNFS traffic is tunnelled through the WebSocket→UDP/TCP
bridge in `proxy/`. Under Tauri the Rust backend exposes `udp_request` and
`tcp_request` commands (`src-tauri/src/lib.rs`), so **the proxy is not needed**.

The integration point is `src/js/platform/native-net.js`. The Spectranet clients
(`src/js/spectranet/tnfs-client.js`, `network-manager.js`) are **not yet rewired**
— wiring them is the next step:

```js
import { hasNativeSockets, nativeUdpRequest } from "../platform/native-net.js";

if (hasNativeSockets()) {
  const reply = await nativeUdpRequest(ip, TNFS_PORT, datagram);
} else {
  /* existing WebSocket-to-proxy path */
}
```

This keeps one client implementation that branches on host, with no duplication.

## Notes / things to verify on first run

- **No SharedArrayBuffer needed.** The JS uses none (verified), so the
  COOP/COEP webview-header caveats for WKWebView do not apply. If that ever
  changes, set `app.security.headers` in `tauri.conf.json` (Tauri ≥ 2.1).
- The classic Web Worker (`emulator-worker.js`) and AudioWorklet load from
  absolute `/` paths; confirm they resolve under Tauri's asset protocol on each
  OS (they serve from `dist/` root in production).
- `.wasm` must be served as `application/wasm`; Tauri's asset protocol infers
  this from the extension, but verify the core boots in the native window.
- The self-destruct `service-worker.js` is a no-op irrelevance under Tauri.
