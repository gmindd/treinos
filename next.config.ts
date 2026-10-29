import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker pequena: .next/standalone traz só o necessário para o servidor web.
  output: "standalone",
  // pg e pg-boss ficam fora do bundle do servidor.
  serverExternalPackages: ["pg", "pg-boss"],
  // Ficheiros GPX de voltas longas chegam a vários MB (upload de percursos-alvo).
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
    proxyClientMaxBodySize: "20mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
