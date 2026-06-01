import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/auth'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Obsey — AI Arama Motorlarında Görünürlük',
  description: 'ChatGPT, Claude ve Perplexity gibi AI sistemlerinde sitenizin görünürlüğünü analiz edin, eksiklikleri otomatik tespit edin ve GEO skorunuzu artırın.',
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Obsey',
  url: 'https://obsey.io',
  description: 'GEO (Generative Engine Optimization) SaaS platform. AI arama motorlarında site görünürlüğünü analiz eder ve otomatik olarak iyileştirir.',
  sameAs: ['https://obsey.io'],
}

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Obsey',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://obsey.io',
  description: 'Sitenizin ChatGPT, Claude ve Perplexity gibi AI arama motorlarında ne kadar iyi göründüğünü analiz eden ve otomatik olarak iyileştiren GEO optimizasyon platformu.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'TRY',
    description: 'İlk rapor ücretsiz. Aylık planlar 1.000 TL\'den başlar.',
  },
}

export default async function HomePage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      {/* Nav */}
      <nav className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/brand/obsey-wordmark-light.svg" alt="Obsey" style={{ height: '48px' }} />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Giriş Yap
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              Ücretsiz Başla
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight mb-6">
            Sitenizi AI Arama Motorlarında{' '}
            <span className="text-blue-600">Görünür Yapın</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-500 mb-8 max-w-2xl mx-auto">
            ChatGPT, Claude ve Perplexity gibi AI sistemlerinde sitenizin nasıl göründüğünü
            analiz edin ve otomatik olarak iyileştirin.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-sm"
          >
            Ücretsiz Deneyin →
          </Link>
          <p className="mt-3 text-sm text-gray-400">
            Kredi kartı gerekmez · İlk rapor ücretsiz
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
            Nasıl Çalışır?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Tarayın</h3>
              <p className="text-sm text-gray-500">Sitenizi AI bot gözüyle analiz ederiz</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Anlayın</h3>
              <p className="text-sm text-gray-500">GEO skoru ve teknik durum raporunuzu alın</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">İyileştirin</h3>
              <p className="text-sm text-gray-500">Hazır deploy talimatlarıyla anında harekete geçin</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
            Fiyatlandırma
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Ücretsiz */}
            <div className="rounded-2xl border border-gray-200 p-6 flex flex-col">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Ücretsiz</h3>
              <p className="text-3xl font-extrabold text-gray-900 mb-1">0 ₺</p>
              <p className="text-xs text-gray-400 mb-4">1 rapor (deneme)</p>
              <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-1">
                <li>✓ 1 site</li>
                <li>✓ Tek seferlik analiz</li>
              </ul>
              <Link
                href="/login"
                className="block text-center px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Başla
              </Link>
            </div>

            {/* Starter — highlighted */}
            <div className="rounded-2xl border-2 border-blue-600 p-6 flex flex-col relative shadow-md">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                En Popüler
              </span>
              <h3 className="text-base font-semibold text-gray-900 mb-1">Starter</h3>
              <p className="text-3xl font-extrabold text-gray-900 mb-1">
                ~1.000 ₺
              </p>
              <p className="text-xs text-gray-400 mb-4">/ay</p>
              <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-1">
                <li>✓ 1 site</li>
                <li>✓ Sınırsız tarama</li>
              </ul>
              <Link
                href="/login"
                className="block text-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Başla
              </Link>
            </div>

            {/* Growth */}
            <div className="rounded-2xl border border-gray-200 p-6 flex flex-col">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Growth</h3>
              <p className="text-3xl font-extrabold text-gray-900 mb-1">~3.200 ₺</p>
              <p className="text-xs text-gray-400 mb-4">/ay</p>
              <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-1">
                <li>✓ 5 site</li>
                <li>✓ Sınırsız tarama</li>
              </ul>
              <Link
                href="/login"
                className="block text-center px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Başla
              </Link>
            </div>

            {/* Scale */}
            <div className="rounded-2xl border border-gray-200 p-6 flex flex-col">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Scale</h3>
              <p className="text-3xl font-extrabold text-gray-900 mb-1">~8.000 ₺</p>
              <p className="text-xs text-gray-400 mb-4">/ay</p>
              <ul className="text-sm text-gray-500 space-y-1 mb-6 flex-1">
                <li>✓ 20 site</li>
                <li>✓ Sınırsız tarama</li>
              </ul>
              <Link
                href="/login"
                className="block text-center px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Başla
              </Link>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link
              href="/login"
              className="inline-block px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              Başlamak için kayıt olun →
            </Link>
          </div>
        </div>
      </section>

      {/* Why GEO matters */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Neden GEO Optimizasyonu?</h2>
          <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
            <p>
              ChatGPT, Claude ve Perplexity gibi yapay zeka arama motorları, geleneksel arama motorlarından farklı çalışır.
              Bu sistemler, web sitelerini doğrudan tarayan botlarla içerik toplar ve kullanıcılara doğrudan yanıtlar sunar.
              Siteniz bu botlara uygun şekilde yapılandırılmamışsa, AI sistemleri sizi kaynak olarak göstermez.
            </p>
            <p>
              GEO (Generative Engine Optimization), sitenizin yapay zeka arama motorlarında görünür olması için gerekli
              teknik ve içerik düzenlemelerini kapsar. Bu; <strong>llms.txt dosyası</strong>, AI botlarına izin veren
              <strong> robots.txt</strong>, yapılandırılmış schema markup ve bilgi yoğun içerik gerektirir.
            </p>
            <p>
              Obsey, bu süreci otomatize eder. Sitenizi AI bot gözünden tarar, eksiklikleri tespit eder ve
              her sorun için hazır deploy talimatları ile içerik üretir. GEO skoru ve teknik durum raporunuzla
              hangi adımları atmanız gerektiğini net şekilde görürsünüz.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="text-2xl font-bold text-blue-600 mb-1">llms.txt</div>
              <p className="text-sm text-gray-500">AI sistemlerine sitenizi tanıtan rehber dosya. ChatGPT ve Claude bu dosyayı okur.</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="text-2xl font-bold text-blue-600 mb-1">Schema</div>
              <p className="text-sm text-gray-500">JSON-LD schema markup ile içeriğinizi yapılandırılmış veri olarak sunun.</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="text-2xl font-bold text-blue-600 mb-1">GEO Skoru</div>
              <p className="text-sm text-gray-500">0–100 arası puanlama ile AI görünürlüğünüzü ölçün ve takip edin.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-4 text-center">
        <p className="text-sm text-gray-400">Obsey &copy; 2026</p>
      </footer>
    </div>
  )
}
