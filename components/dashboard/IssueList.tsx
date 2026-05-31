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

// ---- Artifact generation ----

interface ArtifactResult {
  code: string
  instruction: string
}

function generateArtifact(issue: Issue): ArtifactResult | null {
  const payload = (issue.actionPayload ?? {}) as Record<string, unknown>

  if (issue.category === 'LLMS_TXT') {
    const content =
      typeof payload.generatedContent === 'string'
        ? payload.generatedContent
        : `# Siteniz\n> Sitenizin açıklaması — AI sistemleri için kısa ve net bir özet yazın.\n\n## Sayfalar\n- https://siteniz.com/: Ana sayfa\n- https://siteniz.com/hakkimizda: Hakkımızda\n- https://siteniz.com/iletisim: İletişim`
    return {
      code: content,
      instruction: 'Bu içeriği `llms.txt` dosyası olarak sitenizin kök dizinine (`/llms.txt`) yükleyin.',
    }
  }

  if (issue.category === 'ROBOTS') {
    return {
      code: `User-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /`,
      instruction: 'Bu satırları `robots.txt` dosyanızın sonuna ekleyin.',
    }
  }

  if (issue.category === 'SCHEMA') {
    const schemaType = typeof payload.schemaType === 'string' ? payload.schemaType : 'Organization'
    let schemaObj: Record<string, unknown>

    if (schemaType === 'Product') {
      schemaObj = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Ürün Adı',
        description: 'Ürün açıklaması — AI sistemlerinin anlayabileceği şekilde yazın.',
      }
    } else if (schemaType === 'Article') {
      schemaObj = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Makale Başlığı',
        description: 'Makale özeti.',
        author: { '@type': 'Person', name: 'Yazar Adı' },
      }
    } else {
      const url = typeof payload.url === 'string' ? payload.url : 'https://siteniz.com'
      schemaObj = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Şirket Adınız',
        url,
        description: 'Şirketinizin AI sistemlerine yönelik kısa açıklaması.',
      }
    }

    const scriptTag = `<script type="application/ld+json">\n${JSON.stringify(schemaObj, null, 2)}\n</script>`
    return {
      code: scriptTag,
      instruction: 'Bu `<script>` etiketini ilgili sayfanın `<head>` bölümüne ekleyin.',
    }
  }

  if (issue.category === 'TECHNICAL') {
    return {
      code: `# Sitemap Oluşturma

## Next.js
app/sitemap.ts dosyası oluşturun:
\`\`\`ts
import { MetadataRoute } from 'next'
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://siteniz.com', lastModified: new Date() },
  ]
}
\`\`\`

## WordPress
Yoast SEO veya Rank Math eklentisini kullanın (otomatik oluşturur).

## Diğer platformlar
1. sitemap.xml dosyası oluşturun.
2. robots.txt dosyanıza şu satırı ekleyin:
   Sitemap: https://siteniz.com/sitemap.xml`,
      instruction: 'Platformunuza uygun yöntemi seçin ve sitemap\'ınızı oluşturun.',
    }
  }

  if (issue.category === 'CONTENT') {
    const faqItems = Array.isArray(payload.suggestedFaqItems)
      ? (payload.suggestedFaqItems as Array<{ question?: string; answer?: string }>)
      : []

    const faqBlock =
      faqItems.length > 0
        ? faqItems
            .map(
              (item, i) =>
                `### S${i + 1}: ${item.question ?? 'Soru?'}\n${item.answer ?? 'Cevabı buraya yazın.'}`
            )
            .join('\n\n')
        : `### S1: Bu ürün/hizmet ne işe yarar?\nKısa ve net bir cevap yazın.\n\n### S2: Kimler için uygundur?\nHedef kitlenizi açıklayın.\n\n### S3: Nasıl başlayabilirim?\nAdım adım açıklayın.`

    return {
      code: `## Sık Sorulan Sorular\n\n${faqBlock}`,
      instruction:
        'Bu içerik yapısını ilgili sayfanıza ekleyin. FAQ bölümü, AI motorlarının sayfanızdan doğrudan alıntı yapmasını sağlar.',
    }
  }

  return null
}

interface IssueItemProps {
  issue: Issue
  siteId: string
  siteMode: 'ADVISOR' | 'PILOT'
}

function IssueItem({ issue, siteId, siteMode }: IssueItemProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<'apply' | 'preview' | 'complete' | 'dismiss' | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState<{ after?: string; instructions?: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deployOpen, setDeployOpen] = useState(false)
  const [artifactCopied, setArtifactCopied] = useState(false)

  const artifact = siteMode === 'ADVISOR' && issue.status === 'PENDING'
    ? generateArtifact(issue)
    : null

  async function copyArtifact() {
    if (!artifact) return
    await navigator.clipboard.writeText(artifact.code)
    setArtifactCopied(true)
    setTimeout(() => setArtifactCopied(false), 2000)
  }

  async function showPreview() {
    setLoading('preview')
    setActionError(null)
    const res = await fetch(`/api/sites/${siteId}/issues/${issue.id}/preview`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setLoading(null)
    if (res.ok) {
      setPreview({ after: data.after, instructions: data.instructions })
    } else {
      setActionError(data.error ?? 'Önizleme oluşturulamadı. Lütfen tekrar deneyin.')
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

  async function copyToClipboard() {
    if (!preview?.after) return
    await navigator.clipboard.writeText(preview.after)
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

            {/* Impact */}
            <p className="text-xs text-gray-600 mt-2 bg-amber-50 rounded px-2 py-1.5 border border-amber-100">
              💡 {issue.impact}
            </p>

            {/* Deploy Instructions (Advisor + PENDING only) */}
            {artifact && (
              <div className="mt-2">
                <button
                  onClick={() => setDeployOpen(prev => !prev)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  <span>{deployOpen ? '▾' : '▸'}</span>
                  <span>📋 Deploy Talimatı</span>
                </button>

                {deployOpen && (
                  <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <p className="text-xs text-indigo-700 mb-2">{artifact.instruction}</p>
                    <pre className="text-xs bg-white rounded p-2 overflow-auto max-h-56 border border-indigo-200 whitespace-pre-wrap font-mono leading-relaxed">
                      {artifact.code}
                    </pre>
                    <button
                      onClick={copyArtifact}
                      className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                    >
                      {artifactCopied ? '✓ Kopyalandı!' : 'Kopyala'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5 border border-red-100 mt-2">
                ⚠ {actionError}
              </p>
            )}

            {/* ADVISOR: preview result box */}
            {siteMode === 'ADVISOR' && preview && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-800 mb-1">Önerilen Aksiyon</p>
                {preview.instructions && (
                  <p className="text-xs text-blue-700 mb-2">{preview.instructions}</p>
                )}
                {preview.after && (
                  <>
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="text-xs text-blue-600 underline"
                    >
                      {expanded ? 'İçeriği gizle' : 'Önerilen içeriği gör'}
                    </button>
                    {expanded && (
                      <div className="mt-2">
                        <pre className="text-xs bg-white rounded p-2 overflow-auto max-h-48 border border-blue-200 whitespace-pre-wrap">
                          {preview.after}
                        </pre>
                        <button
                          onClick={copyToClipboard}
                          className="mt-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                        >
                          {copied ? '✓ Kopyalandı!' : 'Kopyala'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
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
              {!preview ? (
                <button
                  onClick={showPreview}
                  disabled={!!loading}
                  className="flex-1 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                >
                  {loading === 'preview' ? '…' : '↗ Göster'}
                </button>
              ) : (
                <button
                  onClick={markComplete}
                  disabled={!!loading}
                  className="flex-1 py-2.5 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                >
                  {loading === 'complete' ? '…' : '✓ Tamamlandı'}
                </button>
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
}

export default function IssueList({ issues, siteId, siteMode }: IssueListProps) {
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
        <IssueItem key={issue.id} issue={issue} siteId={siteId} siteMode={siteMode} />
      ))}
    </div>
  )
}
