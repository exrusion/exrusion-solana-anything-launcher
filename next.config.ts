import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pump.fun" },
      { protocol: "https", hostname: "www.stonkfun.xyz" },
      { protocol: "https", hostname: "embercurve.fun" },
      { protocol: "https", hostname: "www.bonk.fun" },
      { protocol: "https", hostname: "bags.fm" },
      { protocol: "https", hostname: "otcdesks.cash" },
      { protocol: "https", hostname: "raydium.io" },
      { protocol: "https", hostname: "launch.meteora.ag" },
    ],
  },
};

export default nextConfig;
