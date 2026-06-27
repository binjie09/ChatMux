import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [".binjie.site"],
    port: 5173,
    proxy: {
      "/api": {
        changeOrigin: true,
        target: process.env.VITE_GATEWAY_URL || "http://localhost:19327",
        ws: true,
      },
    },
  },
});
