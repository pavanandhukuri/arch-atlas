/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@arch-atlas/core-model', '@arch-atlas/layout', '@arch-atlas/renderer'],
};

module.exports = nextConfig;
