'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteAccountButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    const confirmed = confirm(
      'Hesabınızı silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz. Tüm siteleriniz, raporlarınız ve verileriniz kalıcı olarak silinecektir.'
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        alert(data.error ?? 'Hesap silinirken bir hata oluştu.')
        return
      }
      router.push('/login')
    } catch {
      alert('Hesap silinirken bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
    >
      {loading ? 'Siliniyor...' : 'Hesabı Sil'}
    </button>
  )
}
