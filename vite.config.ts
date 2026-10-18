import { cpSync, existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";

// Game fetches data/asset-registry.json, maps/** and assets/** with relative
// URLs at runtime; copy them into dist so the production build keeps working.
const copyRuntimeData: Plugin = {
  name: "knot-copy-runtime-data",
  apply: "build",
  closeBundle() {
    if (!existsSync("dist")) return;
    for (const dir of ["data", "maps", "assets"]) {
      cpSync(dir, `dist/${dir}`, { recursive: true });
    }
  },
};

export default defineConfig({
  // Relative base so the build can be hosted from any sub-path (itch.io, GH Pages, ...).
  base: "./",
  plugins: [copyRuntimeData],
  build: {
    target: "es2022",
    sourcemap: false,
    // Keep bundled JS/CSS in dist/bundle so dist/assets stays the Kenney tree.
    assetsDir: "bundle",
  },
});
