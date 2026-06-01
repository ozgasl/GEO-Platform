'use client'

import { useState } from 'react'

export default function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) {
      setErrorMsg('Yeni şifre en az 8 karakter olmalıdır.')
      setStatus('error')
      return
    }
    setStatus('saving')
    setErrorMsg('')
    try {
      const res = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? 'Bir hata oluştu.')
      }
      setStatus('success')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bir hata oluştu.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-xs">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Mevcut Şifre</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={e => { setCurrentPassword(e.target.value); setStatus('idle'); setErrorMsg('') }}
          placeholder="••••••••"
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Yeni Şifre</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={e => { setNewPassword(e.target.value); setStatus('idle'); setErrorMsg('') }}
          placeholder="En az 8 karakter"
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === 'saving' || !currentPassword || !newPassword}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === 'saving' ? 'Kaydediliyor…' : 'Şifreyi Değiştir'}
        </button>
        {status === 'success' && (
          <span className="text-sm text-green-600">Şifre güncellendi.</span>
        )}
        {status === 'error' && (
          <span className="text-sm text-red-600">{errorMsg}</span>
        )}
      </div>
    </form>
  )
}
