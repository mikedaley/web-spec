import { defineConfig } from "vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

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
  },
});

export default defineConfig({
  root: "public",
  publicDir: "../public",

  server: {
    port: 3000,
    open: true,
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

  plugins: [copyWorkerFiles()],
});
