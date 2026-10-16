import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { basePath } from "./shared/base-path.mjs";
export default defineConfig({
  base: basePath(process.env.APP_BASE_PATH) + "/",
  plugins: [react()],
  server: { host: "127.0.0.1" },
  build: { outDir: "dist" },
});
