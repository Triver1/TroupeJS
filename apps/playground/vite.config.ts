import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      troupejs: fileURLToPath(
        new URL("../../packages/troupejs/src/browser.ts", import.meta.url),
      ),
      "troupejs-react": fileURLToPath(
        new URL("../../packages/troupejs-react/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
});
