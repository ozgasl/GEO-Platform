import type { Metadata } from 'next'
import Providers from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Obsey',
  description: 'AI arama motorlarında görünürlüğünüzü analiz edin ve iyileştirin.',
  metadataBase: new URL('https://obsey.io'),
  openGraph: {
    siteName: 'Obsey',
    title: 'Obsey',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
