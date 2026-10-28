import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker pequena: .next/standalone traz só o necessário para o servidor web.
  output: "standalone",
  // pg e pg-boss ficam fora do bundle do servidor.
  serverExternalPackages: ["pg", "pg-boss"],
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
