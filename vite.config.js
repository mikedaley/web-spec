import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

// Fix MIME type for classic worker/worklet files served from outside Vite's root.
// Vite serves the correct content but with text/html Content-Type, which browsers
// reject for worker scripts due to strict MIME checking.
const fixWorkerMimeTypes = () => ({
  name: "fix-worker-mime-types",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && (
        req.url === "/src/js/emulator-worker.js" ||
        req.url === "/src/js/audio/audio-worklet.js"
      )) {
        const origSetHeader = res.setHeader.bind(res);
        res.setHeader = (name, value) => {
          if (name.toLowerCase() === "content-type") {
            return origSetHeader(name, "text/javascript");
          }
          return origSetHeader(name, value);
        };
      }
      next();
    });
  },
});

// Plugin to copy worker files that can't be bundled (classic workers, worklets)
const copyWorkerFiles = () => ({
  name: "copy-worker-files",
  writeBundle() {
    mkdirSync(resolve(__dirname, "dist/src/js/audio"), { recursive: true });
    copyFileSync(
      resolve(__dirname, "src/js/audio/audio-worklet.js"),
      resolve(__dirname, "dist/src/js/audio/audio-worklet.js"),
    );
    copyFileSync(
      resolve(__dirname, "src/js/emulator-worker.js"),
      resolve(__dirname, "dist/src/js/emulator-worker.js"),
    );
    copyFileSync(
      resolve(__dirname, "public/service-worker.js"),
      resolve(__dirname, "dist/service-worker.js"),
    );
  },
});

// Tauri sets TAURI_ENV_* during its beforeDevCommand. When present we are being
// launched as the desktop build's dev server, so don't auto-open a browser tab
// and keep the port fixed (Tauri loads it via devUrl in tauri.conf.json).
const underTauri = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig({
  root: "public",
  publicDir: "../public",

  // Tauri pipes the dev server output through its own console.
  clearScreen: false,

  server: {
    port: 3000,
    strictPort: underTauri,
    open: !underTauri,
    headers: {
      // Required for SharedArrayBuffer (if needed for AudioWorklet)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "public/index.html"),
      },
    },
  },

  resolve: {
    alias: {
      "/src": resolve(__dirname, "src"),
    },
  },

  // Handle WASM files
  assetsInclude: ["**/*.wasm"],

  optimizeDeps: {
    exclude: ["zxspec.js"],
  },

  plugins: [fixWorkerMimeTypes(), copyWorkerFiles()],
});
