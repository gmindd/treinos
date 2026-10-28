// Empacota o worker e o script de arranque em dist/ (com dependências) para a imagem Docker.
import { build } from "esbuild";

await build({
  entryPoints: { worker: "src/worker/index.ts", start: "scripts/start.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: ["pg-native"],
  // Dependências CommonJS (pg) precisam de `require` dentro de um bundle ESM.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
