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
        target: "http://localhost:3847",
        ws: true,
      },
      "/api": "http://localhost:3847",
    },
  },
});
