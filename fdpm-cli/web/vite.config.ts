import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BRIDGE_PORT = process.env.FDPM_BRIDGE_PORT ?? "5174";
// FDPM_WEB_PORT is set by scripts/dev.ts to a port it has already verified free
// on both loopback stacks. When present we bind it with strictPort so Vite fails
// loudly on a collision instead of silently drifting onto another server's port.
// Absent (e.g. running `vite` standalone), fall back to Vite's default behavior.
const WEB_PORT = process.env.FDPM_WEB_PORT ? Number(process.env.FDPM_WEB_PORT) : 5173;
const STRICT_PORT = Boolean(process.env.FDPM_WEB_PORT);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: WEB_PORT,
    strictPort: STRICT_PORT,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${BRIDGE_PORT}`,
        changeOrigin: false,
      },
    },
  },
});
