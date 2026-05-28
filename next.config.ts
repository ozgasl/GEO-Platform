import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Playwright ve Node.js modülleri serverless bundle'dan hariç tutulmalı.
    // Gerçek crawl işlemleri Inngest background job'larında çalışacak.
    serverComponentsExternalPackages: ['playwright'],
  },
}

export default nextConfig
