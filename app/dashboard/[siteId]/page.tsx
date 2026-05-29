import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { calculateGeoScore } from '@/lib/reports/score'
import ScoreBadge from '@/components/dashboard/ScoreBadge'
import IssueList from '@/components/dashboard/IssueList'
import SnippetPanel from '@/components/dashboard/SnippetPanel'
import ModeToggle from '@/components/dashboard/ModeToggle'
import type { PageSnapshot } from '@/lib/types'

async function getSiteData(siteId: string, userId: string) {
  const site = await requireSiteOwner(siteId, userId)
  if (!site) return null

  const fullSite = await db.site.findUniqueOrThrow({
    where: { id: siteId },
    include: {
      snapshots: {
        orderBy: { crawledAt: 'desc' },
        take: 1,
        include: {
          issues: {
            where: { status: 'PENDING' },
            orderBy: [{ severity: 'asc' }],
          },
        },
      },
      reports: { orderBy: { generatedAt: 'desc' }, take: 3 },
    },
  })

  return fullSite
}

function TechStatus({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className={ok ? 'text-green-800' : 'text-red-800'}>{label}</span>
    </div>
  )
}

export default async function SiteDetailPage({ params }: { params: { siteId: string } }) {
  const user = await getSessionUser()
  if (!user) return null

  const site = await getSiteData(params.siteId, user.id)
  if (!site) notFound()

  const snapshot = site.snapshots[0]
  const issues = snapshot?.issues ?? []

  // GEO skoru
  const snapshotData = snapshot ? {
    id: snapshot.id,
    siteId: snapshot.siteId,
    crawledAt: snapshot.crawledAt,
    hasLlmsTxt: snapshot.hasLlmsTxt,
    llmsTxtContent: snapshot.llmsTxtContent,
    hasRobotsTxt: snapshot.hasRobotsTxt,
    robotsBlocksAI: snapshot.robotsBlocksAI,
    hasSitemap: snapshot.hasSitemap,
    httpsEnabled: snapshot.httpsEnabled,
    pages: snapshot.pages as unknown as PageSnapshot[],
    previousSnapshotId: snapshot.previousSnapshotId,
  } : null

  const geoScore = snapshotData
    ? calculateGeoScore(snapshotData, snapshot!.issues)
    : null

  const aiVisits = (snapshot?.aiCrawlerVisits ?? {}) as Record<string, number>
  const totalVisits = Object.values(aiVisits).reduce((s, v) => s + v, 0)

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard" className="hover:text-gray-600">Siteler</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{site.name}</span>
      </div>

      {/* Site header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{site.name}</h1>
          <a href={site.url} target="_blank" rel="noopener noreferrer"
            className="text-sm text-gray-400 hover:text-blue-600 mt-0.5 inline-block">
            {site.url} ↗
          </a>
        </div>
        <ModeToggle siteId={site.id} currentMode={site.mode} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* GEO Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2">GEO Skoru</p>
          {geoScore ? (
            <ScoreBadge score={geoScore.total} size="lg" />
          ) : (
            <span className="text-sm text-gray-400">Veri yok</span>
          )}
        </div>

        {/* Pending issues */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2">Bekleyen Issue</p>
          <p className="text-2xl font-bold text-gray-900">{issues.length}</p>
        </div>

        {/* AI visits */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2">AI Bot Ziyareti</p>
          <p className="text-2xl font-bold text-gray-900">{totalVisits}</p>
        </div>

        {/* Pages */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2">Taranan Sayfa</p>
          <p className="text-2xl font-bold text-gray-900">
            {snapshot ? (snapshot.pages as unknown as unknown[]).length : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main: issues */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Bekleyen İyileştirmeler
              {issues.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-400">({issues.length})</span>
              )}
            </h2>
            {snapshot && (
              <Link href={`/dashboard/${site.id}/reports`}
                className="text-sm text-blue-600 hover:text-blue-700">
                Raporlar →
              </Link>
            )}
          </div>
          <IssueList issues={issues} siteId={site.id} />
        </div>

        {/* Sidebar: tech status + snippet */}
        <div className="space-y-4">
          {/* Tech status */}
          {snapshot && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Teknik Durum</h3>
              <div className="space-y-2">
                <TechStatus ok={snapshot.hasLlmsTxt} label="llms.txt" />
                <TechStatus ok={snapshot.hasRobotsTxt} label="robots.txt" />
                <TechStatus ok={!snapshot.robotsBlocksAI} label="AI botlara izin" />
                <TechStatus ok={snapshot.hasSitemap} label="Sitemap" />
                <TechStatus ok={snapshot.httpsEnabled} label="HTTPS" />
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Son tarama: {new Date(snapshot.crawledAt).toLocaleString('tr-TR', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          )}

          {/* AI bot visits */}
          {totalVisits > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Bot Ziyaretleri</h3>
              <div className="space-y-1.5">
                {Object.entries(aiVisits)
                  .sort(([, a], [, b]) => b - a)
                  .map(([bot, count]) => (
                    <div key={bot} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-mono">{bot}</span>
                      <span className="font-semibold text-gray-900">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Monitoring snippet */}
          <SnippetPanel siteId={site.id} />
        </div>
      </div>

      {/* No snapshot yet */}
      {!snapshot && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200 mt-6">
          <p className="text-gray-500 text-sm font-medium">Site henüz taranmadı.</p>
          <p className="text-gray-400 text-xs mt-1">İlk crawl otomatik olarak başlatılacak.</p>
        </div>
      )}
    </div>
  )
}
