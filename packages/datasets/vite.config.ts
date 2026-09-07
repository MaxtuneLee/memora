import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["test/browser/**", "node_modules/**"],
  },
});
