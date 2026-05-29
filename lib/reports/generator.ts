import { db } from '@/lib/db'
import { calculateGeoScore } from './score'
import type { SnapshotData, PageSnapshot } from '@/lib/types'

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
  score: number
  grade: string
  summary: string
  topIssues: Array<{
    severity: string
    category: string
    title: string
    description: string
  }>
  breakdown: Record<string, number>
  crawledAt: Date
  pagesAnalyzed: number
  issuesFound: number
  issuesFixed: number
  aiCrawlerVisits: number
}

/**
 * Bir site için haftalık/aylık GEO raporu oluşturur ve DB'ye kaydeder.
 * En son snapshot ve açık issue'ları baz alır.
 */
export async function generateReport(siteId: string): Promise<ReportSummary> {
  const snapshot = await db.snapshot.findFirst({
    where: { siteId },
    orderBy: { crawledAt: 'desc' },
    include: { issues: true },
  })

  if (!snapshot) throw new Error(`Site için snapshot bulunamadı: ${siteId}`)

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

  // period: ISO hafta numarası — "2026-W21"
  const now = new Date()
  const weekNum = getISOWeek(now)
  const period = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`

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
      issuesFound: snapshot.issues.length,
      issuesFixed,
      aiCrawlerVisits: totalAiVisits,
      llmsTxtUpdated,
    },
  })

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
