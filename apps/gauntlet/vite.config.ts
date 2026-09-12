import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The page only ever calls its own origin (in production Express serves both).
    // In dev, forward those calls to the server on :4000.
    proxy: {
      "/api": "http://localhost:4000",
      "/events": { target: "ws://localhost:4000", ws: true },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../../shared"),
    },
  },
});
