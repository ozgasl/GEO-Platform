'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import IssueList from './IssueList'

interface Action {
  id: string
  changeType: string
  after: string
  isReversible: boolean
  reversedAt: Date | string | null
  appliedAt: Date | string
  appliedBy: string
}

interface Issue {
  id: string
  severity: string
  category: string
  title: string
  description: string
  impact: string
  actionType: string
  status: string
  action: Action | null
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

function CompletedIssueItem({ issue, siteId }: { issue: Issue; siteId: string }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [reverting, setReverting] = useState(false)

  const isApplied = issue.status === 'APPLIED'
  const isDismissed = issue.status === 'DISMISSED'
  const action = issue.action

  async function revert() {
    if (!action) return
    setReverting(true)
    await fetch(`/api/sites/${siteId}/actions/${action.id}/revert`, { method: 'POST' })
    setReverting(false)
    router.refresh()
  }

  const appliedDate = action?.appliedAt
    ? new Date(action.appliedAt).toLocaleString('tr-TR', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : null

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${isDismissed ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className={`flex-shrink-0 mt-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.LOW}`}>
            {SEVERITY_LABEL[issue.severity] ?? issue.severity}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{issue.title}</h3>
              <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                isApplied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {isApplied ? '✓ Uygulandı' : 'Yoksayıldı'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{issue.description}</p>
            {appliedDate && (
              <p className="text-xs text-gray-400 mt-1">{appliedDate}</p>
            )}

            {/* Applied action content */}
            {isApplied && action?.after && (
              <div className="mt-3">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-blue-600 underline"
                >
                  {expanded ? 'İçeriği gizle' : 'Uygulanan içeriği gör'}
                </button>
                {expanded && (
                  <pre className="mt-2 text-xs bg-gray-50 rounded p-2 overflow-auto max-h-64 border border-gray-200 whitespace-pre-wrap">
                    {action.after}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Revert button */}
      {isApplied && action?.isReversible && !action.reversedAt && (
        <div className="border-t border-gray-100">
          <button
            onClick={revert}
            disabled={reverting}
            className="w-full py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {reverting ? '…' : '↩ Geri Al'}
          </button>
        </div>
      )}
    </div>
  )
}

interface IssueTabsProps {
  allIssues: Issue[]
  siteId: string
}

export default function IssueTabs({ allIssues, siteId }: IssueTabsProps) {
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')

  const pending = allIssues.filter(i => i.status === 'PENDING')
  const completed = allIssues.filter(i => i.status === 'APPLIED' || i.status === 'DISMISSED')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        <button
          onClick={() => setTab('pending')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Bekleyen
          {pending.length > 0 && (
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('completed')}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'completed'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Tamamlanan
          {completed.length > 0 && (
            <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
              {completed.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === 'pending' && (
        <IssueList issues={pending} siteId={siteId} />
      )}

      {tab === 'completed' && (
        completed.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200">
            <p className="text-sm text-gray-400">Henüz tamamlanan işlem yok.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {completed.map(issue => (
              <CompletedIssueItem key={issue.id} issue={issue} siteId={siteId} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
