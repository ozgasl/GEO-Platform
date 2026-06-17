import Link from 'next/link'
import { COMPANY } from '@/lib/legal/company'

const legalLinks = [
  { href: '/gizlilik', label: 'Gizlilik Politikası' },
  { href: '/teslimat-iade', label: 'Teslimat ve İade' },
  { href: '/mesafeli-satis-sozlesmesi', label: 'Mesafeli Satış Sözleşmesi' },
  { href: '/iletisim', label: 'İletişim' },
]

export default function Footer() {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          {/* Brand + iletişim */}
          <div className="space-y-2">
            <img src="/brand/obsey-wordmark-light.svg" alt="Obsey" style={{ height: '32px' }} />
            <p className="text-sm text-gray-500">{COMPANY.name}</p>
            <a
              href={`mailto:${COMPANY.email}`}
              className="inline-block text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              {COMPANY.email}
            </a>
          </div>

          {/* Yasal linkler */}
          <nav aria-label="Yasal" className="flex flex-col gap-2">
            {legalLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Ödeme logoları — iyzico resmi logo bandı (iyzico ile Öde · Mastercard · Visa · Amex · Troy) */}
        <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <img
            src="/payment/iyzico-logo-band.svg"
            alt="iyzico ile Öde · Mastercard · Visa · American Express · Troy"
            style={{ height: '28px' }}
          />
          <p className="text-sm text-gray-400">
            Obsey &copy; 2026 · {COMPANY.name}
          </p>
        </div>
      </div>
    </footer>
  )
}
