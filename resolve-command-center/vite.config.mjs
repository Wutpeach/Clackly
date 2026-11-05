import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const devServerPort = Number(process.env.VITE_DEV_SERVER_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  root: ".",
  base: "./",
  // Scan the app entry, not archived packages and installer fixtures under build/release.
  optimizeDeps: { entries: ["index.html"] },
  server: {
    host: "127.0.0.1",
    port: devServerPort,
    strictPort: true
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  }
});
