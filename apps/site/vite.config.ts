import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the same build serves correctly from both
//   GitHub Pages  (https://binjie09.github.io/ChatMux/)
// and the Aliyun DCDN origin served from an OSS bucket root (https://chatmux.binjie.fun/).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    assetsInlineLimit: 4096,
  },
});
