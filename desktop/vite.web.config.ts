import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web build of the DESKTOP UI — "web y hệt desktop".
// Same entry (index.html -> src/main.tsx), same Monaco editor, same styling.
// The bundle is staged into dist-web/ and installed into ../public/ by
// scripts/build-web.mjs (Cloudflare Pages serves public/ with no build step).
export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: "esbuild",
    sourcemap: false,
    outDir: "dist-web",
    emptyOutDir: true,
    assetsDir: "app",
    rollupOptions: {
      input: resolve(import.meta.dirname, "index.html"),
    },
  },
});
