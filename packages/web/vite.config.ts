import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { routeBuilderPlugin } from "vite-plugin-route-builder";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { livestoreDevtoolsPlugin } from "@livestore/devtools-vite";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    livestoreDevtoolsPlugin({
      schemaPath: "./src/livestore/schema.ts",
    }),
    tailwindcss(),
    routeBuilderPlugin({
      pagePattern: "./src/pages/**/*.{tsx,sync.tsx}",
      outputPath: "./src/generated-routes.ts",
    }),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js",
          dest: "./",
        },
        {
          src: "node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx",
          dest: "./",
        },
        {
          src: "node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx",
          dest: "./",
        },
        {
          src: "node_modules/onnxruntime-web/dist/*.wasm",
          dest: "./",
        },
        {
          src: "node_modules/onnxruntime-web/dist/*.mjs",
          dest: "./",
        },
      ],
    }),
  ],
  server: {
    port: 9001,
  },
  build: {
    target: "esnext",
    minify: false,
    sourcemap: true,
  },
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
