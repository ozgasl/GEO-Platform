'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ActiveToggleProps {
  siteId: string
  isActive: boolean
  /** Pasif bir siteyi aktif etmeye izin var mı? (aktif limiti dolmadıysa true) */
  canActivate: boolean
}

export default function ActiveToggle({ siteId, isActive, canActivate }: ActiveToggleProps) {
  const router = useRouter()
  const [active, setActive] = useState(isActive)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Link içinde olduğumuz için navigasyonu engelle
  function stop(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  async function toggle(e: React.MouseEvent) {
    stop(e)
    if (loading) return
    const next = !active
    // Pasif → aktif ve limit doluysa engelle
    if (next && !canActivate) {
      setError('Aktif site limitine ulaştınız. Önce bir siteyi pasif yapın.')
      return
    }
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/sites/${siteId}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    })
    setLoading(false)
    if (res.ok) {
      setActive(next)
      router.refresh()
    } else {
      const data = await res.json().catch(() => null)
      setError(data?.error ?? 'İşlem başarısız oldu.')
    }
  }

  const disabled = loading || (!active && !canActivate)

  return (
    <div className="relative inline-flex flex-col items-end" onClick={stop}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        title={active ? 'Aktif — pasife almak için tıklayın' : (canActivate ? 'Pasif — aktif etmek için tıklayın' : 'Aktif site limiti dolu')}
        aria-label={active ? 'Siteyi pasif yap' : 'Siteyi aktif yap'}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          active ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            active ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
      {error && (
        <span className="absolute right-0 top-full mt-1 z-50 whitespace-nowrap rounded-md bg-red-600 px-2 py-1 text-[10px] text-white shadow-lg">
          {error}
        </span>
      )}
    </div>
  )
}
