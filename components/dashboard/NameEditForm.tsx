'use client'

import { useState } from 'react'

export default function NameEditForm({ currentName }: { currentName: string | null }) {
  const [name, setName] = useState(currentName ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 80) {
      setErrorMsg('İsim 1–80 karakter arasında olmalıdır.')
      setStatus('error')
      return
    }
    setStatus('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Bir hata oluştu.')
      }
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bir hata oluştu.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 mt-1">
      <input
        type="text"
        value={name}
        onChange={e => { setName(e.target.value); setStatus('idle'); setErrorMsg('') }}
        maxLength={80}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
        placeholder="Adınız"
      />
      <button
        type="submit"
        disabled={status === 'saving'}
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {status === 'saving' ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
      {status === 'success' && (
        <span className="text-sm text-green-600">Kaydedildi.</span>
      )}
      {status === 'error' && (
        <span className="text-sm text-red-600">{errorMsg}</span>
      )}
    </form>
  )
}
