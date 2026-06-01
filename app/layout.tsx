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
        {/* Obsey Monitoring Snippet — tracking obsey.io itself */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t="eb6VCLkdUYtUED0N3-nM6nH_2sh4eubZwpheHvDcy5Y";var i=new Image();i.src="https://obsey.io/api/beacon?t="+t+"&r="+encodeURIComponent(document.referrer);i.width=1;i.height=1;i.style.position="absolute";i.style.left="-9999px";document.body&&document.body.appendChild(i);})();` }} />
      </body>
    </html>
  )
}
