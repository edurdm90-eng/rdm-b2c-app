import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    server: "./src/server.ts",
    vercel: "./src/index.ts",
  },
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/@rdm-b2c\/.*/],
  },
});
