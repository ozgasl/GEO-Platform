/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['playwright', '@react-pdf/renderer'],
  },
}

export default nextConfig
