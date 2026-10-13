import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // fotos do check-list chegam pelo formulário (já reduzidas no navegador)
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
