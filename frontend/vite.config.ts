import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const frontendRoot = fileURLToPath(new URL(".", import.meta.url))
const docsImages = fileURLToPath(new URL("../docs/images", import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      allow: [frontendRoot, docsImages],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 12000, // circuit viewers are heavy by nature
  },
})
