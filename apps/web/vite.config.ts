import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3001,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 3001
  },
  resolve: {
    alias: {
      "@anime-buddy/shared": path.resolve(dirname, "../../packages/shared/src/index.ts")
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three") || id.includes("node_modules/@pixiv")) return "three-vrm";
          if (id.includes("node_modules/zod")) return "validation";
          return undefined;
        }
      }
    }
  }
});
