import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^onnxruntime-web\/(webgpu|wasm)$/,
        replacement: path.resolve(
          "node_modules/onnxruntime-web/dist/ort.wasm.bundle.min.mjs",
        ),
      },
    ],
  },
  worker: { format: "es" },
  build: {
    rollupOptions: { input: { main: "index.html", print: "print.html" } },
  },
  server: { host: "127.0.0.1" },
});
