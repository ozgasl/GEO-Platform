import { db } from '@/lib/db'
import { calculateGeoScore } from './score'
import { isCrawlDegenerate } from '@/lib/analyzer/quality'
import type { SnapshotData, PageSnapshot, CrawlHealth } from '@/lib/types'

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export interface ReportSummary {
  reportId: string
  siteId: string
  snapshotId: string
  period: string
  score: number | null
  grade: string | null
  summary: string
  crawlFailed?: boolean
  topIssues: Array<{
    severity: string
    category: string
    title: string
    description: string
  }>
  breakdown: Record<string, number>
  crawledAt: Date | string
  pagesAnalyzed: number
  issuesFound: number
  issuesFixed: number
  aiCrawlerVisits: number
}

/**
 * Bir site için haftalık/aylık GEO raporu oluşturur ve DB'ye kaydeder.
 * En son snapshot ve açık issue'ları baz alır.
 */
export async function generateReport(siteId: string, triggerType: 'MANUAL' | 'WEEKLY' = 'MANUAL'): Promise<ReportSummary> {
  const snapshot = await db.snapshot.findFirst({
    where: { siteId },
    orderBy: { crawledAt: 'desc' },
    include: { issues: true },
  })

  if (!snapshot) throw new Error(`Site için snapshot bulunamadı: ${siteId}`)

  // period: ISO hafta numarası — "2026-W21"
  const now = new Date()
  const weekNum = getISOWeek(now)
  const period = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`

  // --- Tarama başarısız (degenerate) guard ---
  // Ana sayfa 2xx alınamadı / hiç sayfa yok → skor üretme, sahte düşük not gösterme.
  const crawl = (snapshot.technicalDetails as { crawl?: CrawlHealth } | null)?.crawl ?? null
  const crawledPageCount = (snapshot.pages as unknown as unknown[]).length
  if (isCrawlDegenerate(crawl?.homepageStatus, crawledPageCount)) {
    const statusPart = crawl?.homepageStatus ? ` (HTTP ${crawl.homepageStatus})` : ''
    const failSummary =
      `Tarama tamamlanamadı — siteye erişilemedi${statusPart}. ` +
      `Site geçici olarak tarayıcı erişimini sınırlamış olabilir (ör. hız sınırı / 429). ` +
      `Lütfen birkaç dakika sonra yeniden tarayın.`

    const failReport = await db.report.create({
      data: {
        siteId,
        period,
        summary: `[—] ${failSummary}`,
        triggerType,
        snapshotId: snapshot.id,
        issuesFound: snapshot.issues.length,
        issuesFixed: 0,
        aiCrawlerVisits: 0,
        llmsTxtUpdated: false,
        score: null,
        grade: null,
      },
    })

    return {
      reportId: failReport.id,
      siteId,
      snapshotId: snapshot.id,
      period,
      score: null,
      grade: null,
      summary: failSummary,
      crawlFailed: true,
      topIssues: [],
      breakdown: {},
      crawledAt: snapshot.crawledAt,
      pagesAnalyzed: crawledPageCount,
      issuesFound: snapshot.issues.length,
      issuesFixed: 0,
      aiCrawlerVisits: 0,
    }
  }

  const snapshotData: SnapshotData = {
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
    previousSnapshotId: snapshot.previousSnapshotId ?? null,
  }

  const geoScore = calculateGeoScore(snapshotData, snapshot.issues)

  const pendingIssues = snapshot.issues.filter(i => i.status === 'PENDING' || i.status === 'APPLIED')
  const topIssues = pendingIssues
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
      return (order[a.severity as keyof typeof order] ?? 4) - (order[b.severity as keyof typeof order] ?? 4)
    })
    .slice(0, 5)
    .map(i => ({
      severity: i.severity,
      category: i.category,
      title: i.title,
      description: i.description,
    }))

  const issuesFixed = snapshot.issues.filter(i => i.status === 'APPLIED').length

  const totalAiVisits = snapshot.aiCrawlerVisits
    ? Object.values(snapshot.aiCrawlerVisits as Record<string, number>).reduce((s, v) => s + v, 0)
    : 0

  const llmsTxtUpdated = snapshot.issues.some(
    i => (i.actionType === 'AUTO_FIX') &&
    i.status === 'APPLIED' &&
    (i.category === 'LLMS_TXT')
  )

  const report = await db.report.create({
    data: {
      siteId,
      period,
      summary: `[${geoScore.grade}] ${geoScore.summary}`,
      triggerType,
      snapshotId: snapshot.id,
      issuesFound: snapshot.issues.length,
      issuesFixed,
      aiCrawlerVisits: totalAiVisits,
      llmsTxtUpdated,
      score: geoScore.total,
      grade: geoScore.grade,
    },
  })

  // Mark trial as consumed for STARTER users (first report)
  const site = await db.site.findUnique({ where: { id: siteId }, select: { userId: true } })
  if (site?.userId) {
    const siteUser = await db.user.findUnique({ where: { id: site.userId }, select: { plan: true, freeReportUsed: true } })
    if (siteUser && !siteUser.freeReportUsed) {
      await db.user.update({ where: { id: site.userId }, data: { freeReportUsed: true } })
    }
  }

  return {
    reportId: report.id,
    siteId,
    snapshotId: snapshot.id,
    period,
    score: geoScore.total,
    grade: geoScore.grade,
    summary: geoScore.summary,
    topIssues,
    breakdown: geoScore.breakdown as unknown as Record<string, number>,
    crawledAt: snapshot.crawledAt,
    pagesAnalyzed: (snapshot.pages as unknown as unknown[]).length,
    issuesFound: snapshot.issues.length,
    issuesFixed,
    aiCrawlerVisits: totalAiVisits,
  }
}
