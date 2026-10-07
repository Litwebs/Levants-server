import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
