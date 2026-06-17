import Link from 'next/link'
import Footer from '@/components/marketing/Footer'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/brand/obsey-wordmark-light.svg" alt="Obsey" style={{ height: '40px' }} />
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Giriş Yap
          </Link>
        </div>
      </nav>

      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">{children}</article>
      </main>

      <Footer />
    </div>
  )
}
