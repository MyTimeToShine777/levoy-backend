import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This app is standalone inside a repo that also contains the main frontend.
  // Pinning the root keeps Turbopack from walking up and picking up unrelated
  // lockfiles / configs from the parent directory.
  turbopack: {
    root: path.join(__dirname),
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
