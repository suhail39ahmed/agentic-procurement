import type { NextConfig } from "next";

const bryntumLicense =
  process.env.NEXT_PUBLIC_BRYNTUM_LICENSE_KEY
  || process.env.VITE_BRYNTUM_LICENSE_KEY
  || process.env.BRYNTUM_LICENSE_KEY
  || "";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: [
    "@bryntum/gantt-react-enterprise",
    "@bryntum/gantt-enterprise",
    "@bryntum/core-enterprise",
  ],
  // Map Vite-style key from .env / Render into the Next public client env.
  env: {
    NEXT_PUBLIC_BRYNTUM_LICENSE_KEY: bryntumLicense,
  },
};

export default nextConfig;
