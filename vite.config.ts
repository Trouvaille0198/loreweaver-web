/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import pkg from "./package.json" with { type: "json" }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // The web client is served by the loreweaver server's `--web` mode (and by
  // any static host); it must not assume a fixed port.
  clearScreen: false,
  server: {
    port: 1420,
  },
  // The web client's own version, for the client/server drift readout next to
  // the server's `welcome.version`. A define rather than an import so
  // package.json never lands in the bundle.
  define: { __WEB_VERSION__: JSON.stringify(pkg.version) },
  envPrefix: ["VITE_"],
  build: {
    target: "es2020",
    sourcemap: false,
  },

  test: {
    environment: "jsdom",
    // Globals let @testing-library/react register its automatic DOM cleanup.
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
})
