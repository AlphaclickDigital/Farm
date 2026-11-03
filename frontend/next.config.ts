import path from "node:path";
import type { NextConfig } from "next";

// The repo root has its own package-lock.json (Neon's neon.ts tooling), which
// would make Next infer the repo root as the workspace root. Pin it here.
const appRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  outputFileTracingRoot: appRoot,
  turbopack: { root: appRoot },
  images: {
    // Product and farm photos: Cloudinary uploads plus the sample data's
    // stock photography. SmartImage requests these straight from their CDNs
    // (see cdnLoader); listing them here keeps plain next/image usable too.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
