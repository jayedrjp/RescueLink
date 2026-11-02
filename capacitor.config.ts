import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rescuelink.emergency",
  appName: "RescueLink",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SocialLogin: {
      google: {
        mode: "online",
      },
    },
  },
};

export default config;
