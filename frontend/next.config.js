/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.TRISCRIPT_NEXT_DIST_DIR || ".next",
  output: "standalone",
};

module.exports = nextConfig;
