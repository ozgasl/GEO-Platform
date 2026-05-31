'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Site {
  id: string
  url: string
  name: string
}

interface AddSiteFormProps {
  onSuccess?: (site: Site) => void
}

export default function AddSiteForm({ onSuccess }: AddSiteFormProps = {}) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Site eklenemedi.')
      return
    }

    setUrl('')
    if (onSuccess) {
      onSuccess(data as Site)
    } else {
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="url"
        required
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://siteniz.com"
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
      >
        {loading ? '…' : 'Site Ekle'}
      </button>
      {error && <p className="text-sm text-red-600 self-center">{error}</p>}
    </form>
  )
}
