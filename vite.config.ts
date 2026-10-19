import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: { input: { main: "index.html", print: "print.html" } },
  },
  server: { host: "127.0.0.1" },
});
