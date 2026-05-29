'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface ScanButtonProps {
  siteId: string
  lastCrawledAt: Date | null
}

const POLL_INTERVAL_MS = 10_000  // 10 saniye
const SCAN_TIMEOUT_MS  = 8 * 60 * 1000 // 8 dakika

export default function ScanButton({ siteId, lastCrawledAt }: ScanButtonProps) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const baselineRef = useRef<string | null>(lastCrawledAt ? new Date(lastCrawledAt).toISOString() : null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}`)
        if (!res.ok) return
        const data = await res.json()
        const newCrawledAt = data.lastCrawledAt as string | null
        if (newCrawledAt && newCrawledAt !== baselineRef.current) {
          stopPolling()
          setState('done')
          router.refresh()
        }
      } catch {
        // ağ hatası — polling devam eder
      }
    }, POLL_INTERVAL_MS)

    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setState('idle')
      setMessage('Tarama zaman aşımına uğradı. Lütfen tekrar deneyin.')
    }, SCAN_TIMEOUT_MS)
  }

  useEffect(() => () => stopPolling(), [])

  async function handleScan() {
    setState('scanning')
    setMessage(null)

    const res = await fetch(`/api/sites/${siteId}/crawl`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))

    if (res.status === 429) {
      setState('idle')
      setMessage(data.error ?? 'Az önce tarandı, bekleyin.')
      return
    }

    if (!res.ok) {
      setState('idle')
      setMessage(data.error ?? 'Tarama başlatılamadı.')
      return
    }

    // 202 — pipeline arka planda çalışıyor, polling başlat
    baselineRef.current = lastCrawledAt ? new Date(lastCrawledAt).toISOString() : null
    startPolling()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleScan}
        disabled={state === 'scanning'}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
          state === 'scanning'
            ? 'border-blue-200 bg-blue-50 text-blue-500 cursor-not-allowed'
            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
        }`}
      >
        {state === 'scanning' ? (
          <>
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Taranıyor…
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Şimdi Tara
          </>
        )}
      </button>
      {message && (
        <p className="text-xs text-gray-500 max-w-48 text-right">{message}</p>
      )}
    </div>
  )
}
