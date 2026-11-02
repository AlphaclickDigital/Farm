import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
