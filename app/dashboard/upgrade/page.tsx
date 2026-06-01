import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/api-utils'

const plans = [
  {
    name: 'Ücretsiz',
    price: '0 TL',
    period: '',
    sites: '1 site',
    features: ['1 deneme raporu'],
    isPaid: false,
    highlight: false,
    badge: null,
  },
  {
    name: 'Starter',
    price: '~1.000 TL',
    period: '/ay',
    sites: '1 site',
    features: ['Sınırsız tarama', 'Tüm özellikler'],
    isPaid: true,
    highlight: true,
    badge: 'En Popüler',
  },
  {
    name: 'Growth',
    price: '~3.200 TL',
    period: '/ay',
    sites: '5 site',
    features: ['Sınırsız tarama', 'Tüm özellikler'],
    isPaid: true,
    highlight: false,
    badge: null,
  },
  {
    name: 'Scale',
    price: '~8.000 TL',
    period: '/ay',
    sites: '20 site',
    features: ['Sınırsız tarama', 'Tüm özellikler'],
    isPaid: true,
    highlight: false,
    badge: null,
  },
]

export default async function UpgradePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8 max-w-5xl">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-8"
      >
        ← Dashboard&apos;a Dön
      </Link>

      {/* Heading */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold text-gray-900">Planınızı Yükseltin</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sınırsız tarama, gelişmiş raporlar ve daha fazlası için aşağıdaki planlardan birini seçin.
        </p>
      </div>

      {/* Pricing table */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative bg-white rounded-xl border p-6 flex flex-col ${
              plan.highlight
                ? 'border-blue-400 shadow-md ring-1 ring-blue-400'
                : 'border-gray-200'
            }`}
          >
            {/* Badge */}
            {plan.badge && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                {plan.badge}
              </span>
            )}

            {/* Plan name */}
            <h2 className="text-base font-semibold text-gray-900 mb-1">{plan.name}</h2>

            {/* Price */}
            <div className="mb-3">
              <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
              {plan.period && (
                <span className="text-sm text-gray-500">{plan.period}</span>
              )}
            </div>

            {/* Sites */}
            <p className="text-sm text-gray-600 mb-4">{plan.sites}</p>

            {/* Features */}
            <ul className="space-y-1.5 mb-6 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-green-500 font-bold text-xs">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* CTA */}
            {plan.isPaid ? (
              <div>
                <button
                  type="button"
                  className={`w-full text-sm font-medium py-2 px-4 rounded-lg mb-3 ${
                    plan.highlight
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  } transition-colors`}
                >
                  Seç
                </button>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                  Ödeme entegrasyonu yakında aktif olacak. Satın almak için bizimle iletişime geçin.
                </p>
              </div>
            ) : (
              <div className="w-full text-sm font-medium py-2 px-4 rounded-lg bg-gray-50 text-gray-400 text-center border border-gray-200">
                Mevcut Plan
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
