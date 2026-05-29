'use client'

import { useState } from 'react'

interface SnippetPanelProps {
  siteId: string
}

export default function SnippetPanel({ siteId }: SnippetPanelProps) {
  const [snippet, setSnippet] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function fetchSnippet() {
    setLoading(true)
    const res = await fetch(`/api/sites/${siteId}/snippet`)
    const data = await res.json()
    setLoading(false)
    if (res.ok) setSnippet(data.snippet)
  }

  async function copy() {
    if (!snippet) return
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Monitoring Snippet</h3>
          <p className="text-xs text-gray-500 mt-0.5">AI bot ziyaretlerini takip etmek için sitenize ekleyin</p>
        </div>
        {!snippet && (
          <button
            onClick={fetchSnippet}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          >
            {loading ? '…' : 'Snippet\'i göster'}
          </button>
        )}
      </div>

      {snippet && (
        <div className="mt-3">
          <div className="relative">
            <pre className="text-xs bg-gray-950 text-gray-100 rounded-lg p-3 overflow-auto max-h-40 font-mono">
              {snippet}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
            >
              {copied ? '✓ Kopyalandı' : 'Kopyala'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Bu kodu sitenizin her sayfasının <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code> etiketinden önce ekleyin.
          </p>
        </div>
      )}
    </div>
  )
}
