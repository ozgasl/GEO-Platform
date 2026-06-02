import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { calculateGeoScore } from '@/lib/reports/score'
import ScoreBadge from '@/components/dashboard/ScoreBadge'
import IssueTabs from '@/components/dashboard/IssueTabs'
import SnippetPanel from '@/components/dashboard/SnippetPanel'
import ModeToggle from '@/components/dashboard/ModeToggle'
import ScanButton from '@/components/dashboard/ScanButton'
import { computeTechnicalScores, assessCrawlConfidence, type QualityScore } from '@/lib/analyzer/quality'
import type { PageSnapshot, CrawlHealth } from '@/lib/types'

function brandName(nameOrUrl: string): string {
  try {
    const host = new URL(nameOrUrl.startsWith('http') ? nameOrUrl : `https://${nameOrUrl}`).hostname
    const bare = host.replace(/^www\./, '')
    const brand = bare.split('.')[0]
    return brand.charAt(0).toUpperCase() + brand.slice(1)
  } catch {
    const bare = nameOrUrl.replace(/^www\./, '')
    const brand = bare.split('.')[0]
    return brand.charAt(0).toUpperCase() + brand.slice(1)
  }
}

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
            orderBy: [{ severity: 'asc' }],
            include: { action: true },
          },
        },
      },
      reports: { orderBy: { generatedAt: 'desc' }, take: 3 },
    },
  })

  return fullSite
}

function TechStatusScore({ score, label }: { score: QualityScore; label: string }) {
  // Probe throttle/timeout nedeniyle belirlenemedi → "F/eksik" yerine nötr "Bilinmiyor".
  if (score.unknown) {
    return (
      <details className="rounded-lg bg-gray-50 group">
        <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
          <span className="flex-1 text-sm text-gray-600">{label}</span>
          <span className="text-xs font-semibold text-gray-500">—</span>
          <span className="text-xs text-gray-400">Bilinmiyor</span>
          <span className="text-xs ml-1 text-gray-400 opacity-50 group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-3 pb-3 pt-1 text-xs text-gray-500 opacity-90 leading-relaxed">
          {score.detail}
        </div>
      </details>
    )
  }

  const dotColor = {
    A: 'bg-green-500', B: 'bg-green-400', C: 'bg-yellow-400', D: 'bg-orange-400', F: 'bg-red-500',
  }[score.grade]
  const bgColor = {
    A: 'bg-green-50', B: 'bg-green-50', C: 'bg-yellow-50', D: 'bg-orange-50', F: 'bg-red-50',
  }[score.grade]
  const textColor = {
    A: 'text-green-800', B: 'text-green-700', C: 'text-yellow-800', D: 'text-orange-700', F: 'text-red-700',
  }[score.grade]

  const hasRecommendation = !!score.recommendation

  if (!hasRecommendation) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${bgColor}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className={`flex-1 text-sm ${textColor}`}>{label}</span>
        <span className={`text-xs font-semibold ${textColor}`}>{score.grade}</span>
        <span className="text-xs text-gray-400">{score.score}/100</span>
      </div>
    )
  }

  return (
    <details className={`rounded-lg ${bgColor} group`}>
      <summary className={`flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className={`flex-1 text-sm ${textColor}`}>{label}</span>
        <span className={`text-xs font-semibold ${textColor}`}>{score.grade}</span>
        <span className="text-xs text-gray-400">{score.score}/100</span>
        <span className={`text-xs ml-1 ${textColor} opacity-50 group-open:rotate-180 transition-transform`}>▾</span>
      </summary>
      <div className={`px-3 pb-3 pt-1 text-xs ${textColor} opacity-80 leading-relaxed whitespace-pre-line`}>
        {score.recommendation}
      </div>
    </details>
  )
}

export default async function SiteDetailPage({ params }: { params: { siteId: string } }) {
  const user = await getSessionUser()
  if (!user) return null

  const site = await getSiteData(params.siteId, user.id)
  if (!site) notFound()

  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { plan: true, freeReportUsed: true } })
  const trialUsed = dbUser?.freeReportUsed === true && dbUser?.plan !== 'AGENCY_5' && dbUser?.plan !== 'AGENCY_20'

  const snapshot = site.snapshots[0]
  const allIssues = snapshot?.issues ?? []
  const issues = allIssues.filter(i => i.status === 'PENDING')

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

  // Tek güven sinyali — skor kartı, panel ve banner hepsi bunu okur.
  const crawlHealth = (snapshot?.technicalDetails as { crawl?: CrawlHealth } | null)?.crawl ?? null
  const confidence = snapshot
    ? assessCrawlConfidence(crawlHealth, (snapshot.pages as unknown[]).length)
    : null

  const aiVisits = (snapshot?.aiCrawlerVisits ?? {}) as Record<string, number>
  const totalVisits = Object.values(aiVisits).reduce((s, v) => s + v, 0)

  const qualityScores = snapshot ? computeTechnicalScores({
    hasLlmsTxt: snapshot.hasLlmsTxt,
    llmsTxtContent: snapshot.llmsTxtContent,
    hasRobotsTxt: snapshot.hasRobotsTxt,
    robotsBlocksAI: snapshot.robotsBlocksAI,
    hasSitemap: snapshot.hasSitemap,
    httpsEnabled: snapshot.httpsEnabled,
    technicalDetails: snapshot.technicalDetails as {
      robotsContent?: string | null
      allowedBots?: string[]
      sitemapUrlCount?: number | null
      crawl?: CrawlHealth | null
    } | null,
    crawledPageCount: (snapshot.pages as unknown[]).length,
  }) : null

  return (
    <div className="p-8 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard" className="hover:text-gray-600">Siteler</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">{site.name}</span>
      </div>

      {/* Trial-used banner */}
      {trialUsed && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-2.5 flex items-center gap-2 mb-4">
          <span>⚡</span>
          <span>Deneme raporunuzu kullandınız. Sınırsız tarama için planınızı yükseltin.</span>
          <Link href="/dashboard/upgrade" className="font-semibold underline underline-offset-2 hover:text-amber-900 ml-1">
            Planları Gör →
          </Link>
        </div>
      )}

      {/* Site header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{brandName(site.url || site.name)}</h1>
          <a href={site.url} target="_blank" rel="noopener noreferrer"
            className="text-gray-400 hover:text-blue-600 flex-shrink-0 text-lg leading-none">
            ↗
          </a>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ScanButton siteId={site.id} lastCrawledAt={site.lastCrawledAt} />
          <ModeToggle siteId={site.id} currentMode={site.mode} />
        </div>
      </div>

      {/* Düşük güven / başarısız tarama bandı — skor kartı ve panelle aynı sinyali okur */}
      {confidence && confidence.level !== 'OK' && (
        <div className={`text-sm rounded-lg px-4 py-2.5 flex items-start gap-2 mb-4 border ${
          confidence.level === 'FAILED'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <span>{confidence.level === 'FAILED' ? '⛔' : '⚠️'}</span>
          <span>{confidence.reason}</span>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* GEO Score */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-2">GEO Skoru</p>
          {!snapshot || !confidence ? (
            <span className="text-sm text-gray-400">Veri yok</span>
          ) : confidence.level === 'FAILED' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 bg-red-50 text-red-700 ring-red-200 text-sm px-3 py-1.5">Tarama başarısız</span>
          ) : confidence.level === 'PARTIAL' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 bg-gray-100 text-gray-600 ring-gray-200 text-sm px-3 py-1.5" title="Site erişimi sınırladı; skor güvenilir değil.">Kısmi tarama</span>
          ) : geoScore ? (
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-900">İyileştirmeler</h2>
            {snapshot && (
              <Link href={`/dashboard/${site.id}/reports`}
                className="text-sm text-blue-600 hover:text-blue-700">
                Raporlar →
              </Link>
            )}
          </div>
          <IssueTabs allIssues={allIssues} siteId={site.id} siteMode={site.mode} />
        </div>

        {/* Sidebar: tech status + snippet */}
        <div className="space-y-4">
          {/* Tech status */}
          {snapshot && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Teknik Durum</h3>
              <div className="space-y-2">
                {qualityScores ? (
                  <>
                    <TechStatusScore score={qualityScores.llmsTxt} label="llms.txt" />
                    <TechStatusScore score={qualityScores.robotsTxt} label="robots.txt" />
                    <TechStatusScore score={qualityScores.aiBotAccess} label="AI botlara izin" />
                    <TechStatusScore score={qualityScores.sitemap} label="Sitemap" />
                    <TechStatusScore score={qualityScores.https} label="HTTPS" />
                  </>
                ) : null}
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
          <p className="text-gray-400 text-xs mt-1 mb-4">İlk analizi başlatmak için aşağıdaki butonu kullanın.</p>
          <ScanButton siteId={site.id} lastCrawledAt={site.lastCrawledAt} />
        </div>
      )}
    </div>
  )
}
