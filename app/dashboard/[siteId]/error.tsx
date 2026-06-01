'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-4">
        <div className="text-6xl font-bold text-gray-200 mb-4">500</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Bir hata oluştu</h1>
        <p className="text-sm text-gray-500 mb-6">Beklenmedik bir sorun meydana geldi. Lütfen tekrar deneyin.</p>
        <button onClick={reset} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
