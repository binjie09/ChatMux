import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.muxchat.app",
  appName: "MuxChat",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
