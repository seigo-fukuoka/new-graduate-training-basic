import type { NextConfig } from "next";

const apiOrigin =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://backend:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/:path*",
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
