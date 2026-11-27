import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: "client",
  publicDir: "public",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/socket.io": {
        // 127.0.0.1 avoids Windows resolving localhost → ::1 while the server is IPv4-only
        target: "http://127.0.0.1:3847",
        ws: true,
      },
      "/api": "http://127.0.0.1:3847",
    },
  },
});
