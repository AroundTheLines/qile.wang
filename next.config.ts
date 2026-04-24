import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
    ],
  },
  // Allow the LAN dev server (dev-lan.sh, binds 0.0.0.0) to serve HMR + RSC
  // payloads to devices on the local network. Without this, Next 15 blocks
  // cross-origin dev requests and HMR websocket upgrades fail with
  // "cannot parse response" on mobile browsers.
  allowedDevOrigins: ['10.88.111.4', '*.local', '192.168.*.*', '10.*.*.*'],
}

export default nextConfig
