'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCheckMetadata, LAYER_LABEL, LAYER_STYLE, engineLabels } from '@/lib/check-metadata'

interface Issue {
  id: string
  severity: string
  category: string
  title: string
  description: string
  impact: string
  actionType: string
  status: string
  actionPayload?: unknown
}

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 ring-red-200',
  HIGH:     'bg-orange-100 text-orange-800 ring-orange-200',
  MEDIUM:   'bg-yellow-100 text-yellow-800 ring-yellow-200',
  LOW:      'bg-gray-100 text-gray-600 ring-gray-200',
}

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Kritik', HIGH: 'Yüksek', MEDIUM: 'Orta', LOW: 'Düşük',
}

const ACTION_TYPE_LABEL: Record<string, string> = {
  AUTO_FIX: 'Otomatik Düzelt',
  CONTENT_SUGGESTION: 'İçerik Önerisi',
  MANUAL_REQUIRED: 'Manuel Gerekli',
}

/** Katman rozeti + motor chip'leri + dürüst not (Görev 4). */
function CheckMeta({ category }: { category: string }) {
  const meta = getCheckMetadata(category)
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ${LAYER_STYLE[meta.layer]}`}>
          {LAYER_LABEL[meta.layer]}
        </span>
        {engineLabels(meta.engines).map(label => (
          <span key={label} className="text-[11px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {label}
          </span>
        ))}
      </div>
      {meta.note && (
        <p className="text-[11px] text-gray-400 italic mt-1">{meta.note}</p>
      )}
    </div>
  )
}

interface PreviewState {
  output: string
  fixDelivery: 'agent_prompt' | 'ready_copy'
  reviewRequired: boolean
  instructions?: string
}

interface IssueItemProps {
  issue: Issue
  siteId: string
  siteMode: 'ADVISOR' | 'PILOT'
  // Tarama güveni OK değilse (PARTIAL/FAILED) yeni fix çıktıları üretilmez.
  confidenceOk: boolean
}

function IssueItem({ issue, siteId, siteMode, confidenceOk }: IssueItemProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'apply' | 'preview' | 'complete' | 'dismiss' | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fixDelivery = getCheckMetadata(issue.category).fixDelivery
  const generateLabel = fixDelivery === 'ready_copy' ? '📝 Metni kopyala' : '⌘ Prompt\'u kopyala'

  async function generateFix() {
    setLoading('preview')
    setActionError(null)
    const res = await fetch(`/api/sites/${siteId}/issues/${issue.id}/preview`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setLoading(null)
    if (res.ok) {
      const state: PreviewState = {
        output: data.output,
        fixDelivery: data.fixDelivery,
        reviewRequired: !!data.reviewRequired,
        instructions: data.instructions,
      }
      setPreview(state)
      // Tek tıkla kopyala — buton etiketiyle tutarlı.
      if (state.output) {
        try {
          await navigator.clipboard.writeText(state.output)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch { /* pano erişimi yoksa sessizce geç; panel yine de gösterilir */ }
      }
    } else {
      setActionError(data.error ?? 'Çıktı oluşturulamadı. Lütfen tekrar deneyin.')
    }
  }

  async function markComplete() {
    setLoading('complete')
    setActionError(null)
    const res = await fetch(`/api/sites/${siteId}/issues/${issue.id}/approve`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setLoading(null)
    if (res.ok) {
      router.refresh()
    } else {
      setActionError(data.error ?? 'Tamamlanamadı. Lütfen tekrar deneyin.')
    }
  }

  async function applyPilot() {
    setLoading('apply')
    setActionError(null)
    const res = await fetch(`/api/sites/${siteId}/issues/${issue.id}/approve`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setLoading(null)
    if (res.ok) {
      router.refresh()
    } else {
      setActionError(data.error ?? 'Aksiyon uygulanamadı. Lütfen tekrar deneyin.')
    }
  }

  async function dismiss() {
    setLoading('dismiss')
    await fetch(`/api/sites/${siteId}/issues/${issue.id}/dismiss`, { method: 'POST' })
    setLoading(null)
    router.refresh()
  }

  async function copyOutput() {
    if (!preview?.output) return
    await navigator.clipboard.writeText(preview.output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className={`flex-shrink-0 mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.LOW}`}>
            {SEVERITY_LABEL[issue.severity] ?? issue.severity}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{issue.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{issue.description}</p>
              </div>
              <span className="flex-shrink-0 text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                {ACTION_TYPE_LABEL[issue.actionType] ?? issue.actionType}
              </span>
            </div>

            {/* Katman rozeti + motor chip'leri + dürüst not */}
            <CheckMeta category={issue.category} />

            {/* Impact */}
            <p className="text-xs text-gray-600 mt-2 bg-amber-50 rounded px-2 py-1.5 border border-amber-100">
              💡 {issue.impact}
            </p>

            {/* Üretilen çıktı — "Prompt'u kopyala" / "Metni kopyala" sonrası */}
            {preview && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                {preview.reviewRequired && (
                  <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
                    ⚠ Yayınlamadan önce gözden geçir
                  </p>
                )}
                {preview.instructions && (
                  <p className="text-xs text-blue-700 mb-2">{preview.instructions}</p>
                )}
                {preview.output && (
                  <>
                    <pre className="text-xs bg-white rounded p-2 overflow-auto max-h-56 border border-blue-200 whitespace-pre-wrap font-mono leading-relaxed">
                      {preview.output}
                    </pre>
                    <button
                      onClick={copyOutput}
                      className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      {copied ? '✓ Kopyalandı!' : (preview.fixDelivery === 'ready_copy' ? 'Metni kopyala' : 'Prompt\'u kopyala')}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Error */}
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5 border border-red-100 mt-2">
                ⚠ {actionError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {issue.status === 'PENDING' && (
        <div className="flex border-t border-gray-100">
          {siteMode === 'PILOT' ? (
            <>
              <button
                onClick={applyPilot}
                disabled={!!loading}
                className="flex-1 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {loading === 'apply' ? '…' : '✓ Uygula'}
              </button>
              <div className="w-px bg-gray-100" />
              <button
                onClick={dismiss}
                disabled={!!loading}
                className="flex-1 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loading === 'dismiss' ? '…' : 'Yoksay'}
              </button>
            </>
          ) : (
            <>
              {/* Çıktı üretimi yalnızca tarama güveni OK iken sunulur */}
              {confidenceOk && (
                !preview ? (
                  <button
                    onClick={generateFix}
                    disabled={!!loading}
                    className="flex-1 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {loading === 'preview' ? '…' : generateLabel}
                  </button>
                ) : (
                  <button
                    onClick={markComplete}
                    disabled={!!loading}
                    className="flex-1 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    {loading === 'complete' ? '…' : '✓ Tamamlandı'}
                  </button>
                )
              )}
              <div className="w-px bg-gray-100" />
              <button
                onClick={dismiss}
                disabled={!!loading}
                className="flex-1 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loading === 'dismiss' ? '…' : 'Yoksay'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface IssueListProps {
  issues: Issue[]
  siteId: string
  siteMode: 'ADVISOR' | 'PILOT'
  confidenceOk?: boolean
}

export default function IssueList({ issues, siteId, siteMode, confidenceOk = true }: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200">
        <p className="text-sm text-gray-400">Bekleyen issue bulunamadı.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {issues.map(issue => (
        <IssueItem key={issue.id} issue={issue} siteId={siteId} siteMode={siteMode} confidenceOk={confidenceOk} />
      ))}
    </div>
  )
}
