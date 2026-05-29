'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Issue {
  id: string
  severity: string
  category: string
  title: string
  description: string
  impact: string
  actionType: string
  status: string
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

interface IssueItemProps {
  issue: Issue
  siteId: string
}

function IssueItem({ issue, siteId }: IssueItemProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'dismiss' | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [result, setResult] = useState<{ after?: string; instructions?: string } | null>(null)

  async function approve() {
    setLoading('approve')
    const res = await fetch(`/api/sites/${siteId}/issues/${issue.id}/approve`, { method: 'POST' })
    const data = await res.json()
    setLoading(null)
    if (res.ok) {
      setResult({ after: data.after, instructions: data.instructions })
      router.refresh()
    }
  }

  async function dismiss() {
    setLoading('dismiss')
    await fetch(`/api/sites/${siteId}/issues/${issue.id}/dismiss`, { method: 'POST' })
    setLoading(null)
    router.refresh()
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

            {/* Impact */}
            <p className="text-xs text-gray-600 mt-2 bg-amber-50 rounded px-2 py-1.5 border border-amber-100">
              💡 {issue.impact}
            </p>

            {/* Result */}
            {result && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs font-medium text-green-800 mb-1">✓ Aksiyon uygulandı</p>
                {result.instructions && (
                  <p className="text-xs text-green-700">{result.instructions}</p>
                )}
                {result.after && (
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs text-green-600 underline mt-1"
                  >
                    {expanded ? 'İçeriği gizle' : 'Oluşturulan içeriği gör'}
                  </button>
                )}
                {expanded && result.after && (
                  <pre className="mt-2 text-xs bg-white rounded p-2 overflow-auto max-h-48 border border-green-200 whitespace-pre-wrap">
                    {result.after}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      {issue.status === 'PENDING' && !result && (
        <div className="flex border-t border-gray-100">
          <button
            onClick={approve}
            disabled={!!loading}
            className="flex-1 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {loading === 'approve' ? '…' : '✓ Uygula'}
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={dismiss}
            disabled={!!loading}
            className="flex-1 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading === 'dismiss' ? '…' : 'Yoksay'}
          </button>
        </div>
      )}
    </div>
  )
}

interface IssueListProps {
  issues: Issue[]
  siteId: string
}

export default function IssueList({ issues, siteId }: IssueListProps) {
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
        <IssueItem key={issue.id} issue={issue} siteId={siteId} />
      ))}
    </div>
  )
}
