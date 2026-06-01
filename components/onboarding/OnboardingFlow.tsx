'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AddSiteForm from '@/components/dashboard/AddSiteForm'

interface Site {
  id: string
  url: string
  name: string
}

type Step = 'welcome' | 'crawling'
type CrawlStatus = 'polling' | 'done' | 'timeout'

const POLL_INTERVAL_MS = 5_000
const CRAWL_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutes

export default function OnboardingFlow() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('welcome')
  const [site, setSite] = useState<Site | null>(null)
  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus>('polling')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }

  function startPolling(siteId: string) {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}`)
        if (!res.ok) return
        const data = await res.json() as { _count?: { snapshots?: number } }
        if ((data._count?.snapshots ?? 0) > 0) {
          stopPolling()
          setCrawlStatus('done')
        }
      } catch {
        // Network error — silently retry
      }
    }, POLL_INTERVAL_MS)

    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setCrawlStatus('timeout')
    }, CRAWL_TIMEOUT_MS)
  }

  useEffect(() => () => stopPolling(), [])

  function handleSiteCreated(newSite: Site) {
    setSite(newSite)
    setStep('crawling')
    startPolling(newSite.id)
  }

  if (step === 'welcome') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-lg w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              Obsey&apos;e Hoş Geldiniz 🎉
            </h1>
            <p className="text-gray-500 text-base leading-relaxed">
              AI arama motorlarında sitenizin görünürlüğünü analiz edelim.
              Başlamak için sitenizin URL&apos;ini ekleyin.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <p className="text-sm font-medium text-gray-700 mb-4">Sitenizin URL&apos;ini girin</p>
            <AddSiteForm onSuccess={handleSiteCreated} />
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[10px]">1</span>
              Site ekle
            </span>
            <span className="w-4 h-px bg-gray-300" />
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center font-bold text-[10px]">2</span>
              Analiz et
            </span>
            <span className="w-4 h-px bg-gray-300" />
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center font-bold text-[10px]">3</span>
              Raporu gör
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Step 2 — crawling
  const siteUrl = site?.url ?? ''
  const siteId = site?.id ?? ''

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          {crawlStatus === 'done' ? (
            <>
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Analiziniz hazır!</h2>
              <p className="text-gray-500 text-sm">Sitenizin GEO raporu oluşturuldu. Sonuçları görüntüleyin.</p>
            </>
          ) : crawlStatus === 'timeout' ? (
            <>
              <div className="text-4xl mb-3">⏳</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Analiz devam ediyor</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Analiz beklenenden uzun sürüyor. Arka planda devam ediyor — birazdan kontrol edin.
              </p>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-3">
                <span className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Siteniz taranıyor…</h2>
              <p className="text-gray-500 text-sm leading-relaxed">
                Siteniz analiz ediliyor. Bu 30-90 saniye sürebilir. Dashboard&apos;u keşfedebilirsiniz, rapor hazır olduğunda bildirileceksiniz.
              </p>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
          <p className="text-xs text-gray-400 mb-1">Analiz edilen site</p>
          <p className="text-sm font-medium text-gray-800 truncate">{siteUrl}</p>
        </div>

        {crawlStatus === 'done' ? (
          <button
            onClick={() => router.push(`/dashboard/${siteId}`)}
            className="w-full py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Raporumu Görüntüle
          </button>
        ) : (
          <button
            onClick={() => router.push(`/dashboard/${siteId}`)}
            className="w-full py-3 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
          >
            Dashboard&apos;a Git
          </button>
        )}
      </div>
    </div>
  )
}
