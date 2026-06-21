'use client'

import { useState } from 'react'
import {
  getCheckMetadata,
  LAYER_LABEL,
  LAYER_STYLE,
} from '@/lib/check-metadata'
import { buildCombinedAgentPrompt } from '@/lib/fixes/agent-prompt'

interface ModalIssue {
  id: string
  severity: string
  category: string
  title: string
  description: string
  actionPayload?: Record<string, unknown> | null
}

interface ImproveScoreModalProps {
  issues: ModalIssue[]   // yalnızca doğrulanmış (confidence OK) + PENDING bulgular
  siteId: string
  siteUrl: string
  gain: number           // tahmini skor artışı (+N)
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
    >
      {copied ? '✓ Kopyalandı!' : label}
    </button>
  )
}

/** Grup B — tek içerik bulgusu için talep üzerine LLM hazır metni üretir (review-only). */
function ReadyCopyItem({ issue, siteId }: { issue: ModalIssue; siteId: string }) {
  const [loading, setLoading] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/sites/${siteId}/issues/${issue.id}/preview`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (res.ok) setOutput(data.output ?? '')
    else setError(data.error ?? 'Metin oluşturulamadı.')
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-900">{issue.title}</p>
        {!output && (
          <button
            onClick={generate}
            disabled={loading}
            className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {loading ? '…' : '📝 Metni oluştur'}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">⚠ {error}</p>}
      {output && (
        <div className="mt-2">
          <p className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
            ⚠ Yayınlamadan önce gözden geçir
          </p>
          <pre className="text-xs bg-gray-50 rounded p-2 overflow-auto max-h-56 border border-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
            {output}
          </pre>
          <div className="mt-1.5">
            <CopyButton text={output} label="Metni kopyala" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function ImproveScoreModal({ issues, siteId, siteUrl, gain }: ImproveScoreModalProps) {
  const [open, setOpen] = useState(false)

  const agentPromptIssues = issues.filter(i => getCheckMetadata(i.category).fixDelivery === 'agent_prompt' && getCheckMetadata(i.category).layer !== 'frontier')
  const readyCopyIssues = issues.filter(i => getCheckMetadata(i.category).fixDelivery === 'ready_copy')
  const frontierIssues = issues.filter(i => getCheckMetadata(i.category).layer === 'frontier')

  const combinedPrompt = agentPromptIssues.length > 0
    ? buildCombinedAgentPrompt(agentPromptIssues, siteUrl)
    : ''

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
      >
        Skoru yükselt {gain > 0 ? `(+${gain})` : ''}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-50 rounded-2xl shadow-xl w-full max-w-2xl my-8"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-gray-50 rounded-t-2xl">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Skoru yükselt</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {gain > 0 ? `Bu adımlar GEO skorunu tahminen +${gain} puan artırabilir.` : 'Önceliklendirilmiş iyileştirmeler.'}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Grup A — Hızlı teknik kazanımlar (bedrock → ai_specific, birleşik prompt) */}
              {agentPromptIssues.length > 0 && (
                <section>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Hızlı teknik kazanımlar
                      <span className="ml-1.5 text-xs font-normal text-gray-500">({agentPromptIssues.length})</span>
                    </h3>
                    <CopyButton text={combinedPrompt} label="Birleşik prompt'u kopyala" />
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Tüm kod/config düzeltmeleri tek ajan prompt'unda, en yüksek etkiden başlayarak. Coding agent'ınıza yapıştırın.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {agentPromptIssues.map(i => (
                      <span key={i.id} className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${LAYER_STYLE[getCheckMetadata(i.category).layer]}`}>
                        {i.title}
                      </span>
                    ))}
                  </div>
                  <pre className="text-xs bg-white rounded-lg p-3 overflow-auto max-h-64 border border-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
                    {combinedPrompt}
                  </pre>
                </section>
              )}

              {/* Grup B — İnceleme gerektiren içerik (ayrı ayrı, review-only) */}
              {readyCopyIssues.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    İnceleme gerektiren içerik
                    <span className="ml-1.5 text-xs font-normal text-gray-500">({readyCopyIssues.length})</span>
                  </h3>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
                    Bu metinler ayrı ayrı üretilir ve <strong>insan kararı gerektirir</strong> — birleşik prompt'a karıştırılmaz.
                  </p>
                  <div className="space-y-2">
                    {readyCopyIssues.map(i => (
                      <ReadyCopyItem key={i.id} issue={i} siteId={siteId} />
                    ))}
                  </div>
                </section>
              )}

              {/* Grup C — İleri (frontier), opsiyonel, düşük öncelik */}
              <section>
                <h3 className="text-sm font-semibold text-gray-500 mb-1">
                  İleri katman <span className="text-xs font-normal">(opsiyonel)</span>
                </h3>
                {frontierIssues.length > 0 ? (
                  <div className="space-y-1.5">
                    {frontierIssues.map(i => (
                      <div key={i.id} className="flex items-center gap-2 text-xs text-gray-500">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ring-1 ${LAYER_STYLE.frontier}`}>{LAYER_LABEL.frontier}</span>
                        <span>{i.title}</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-gray-400 italic mt-1">Erken aşama; şimdilik izleniyor. Skoru zorlamak için öne çıkarılmaz.</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">İleri (ajan) katmanında şu an izlenecek bulgu yok.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
