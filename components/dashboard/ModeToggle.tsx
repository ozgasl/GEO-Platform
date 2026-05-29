'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ModeToggleProps {
  siteId: string
  currentMode: 'ADVISOR' | 'PILOT'
}

export default function ModeToggle({ siteId, currentMode }: ModeToggleProps) {
  const router = useRouter()
  const [mode, setMode] = useState(currentMode)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = mode === 'ADVISOR' ? 'PILOT' : 'ADVISOR'
    setLoading(true)
    const res = await fetch(`/api/sites/${siteId}/mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    })
    setLoading(false)
    if (res.ok) {
      setMode(next)
      router.refresh()
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all disabled:opacity-50 ${
        mode === 'PILOT'
          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${mode === 'PILOT' ? 'bg-purple-500' : 'bg-gray-400'}`} />
      {mode === 'PILOT' ? 'Pilot mod' : 'Advisor mod'}
      <span className="text-gray-400 ml-1">geçiş yap →</span>
    </button>
  )
}
