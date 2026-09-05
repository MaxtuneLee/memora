import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  platform: "browser",
});
