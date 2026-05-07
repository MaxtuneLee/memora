import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9010,
  },
  build: {
    rolldownOptions: {
      experimental: {
        lazyBarrel: true,
      },
    },
  },
  experimental: {
    bundledDev: true,
  },
});
