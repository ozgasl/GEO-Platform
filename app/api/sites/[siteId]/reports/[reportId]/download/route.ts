import { NextResponse } from 'next/server'
import { getSessionUser, requireSiteOwner, isAdminUser } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { computeTechnicalScores, type QualityScore } from '@/lib/analyzer/quality'
import { t } from '@/lib/i18n'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { ActionPlanPdf, ReportPdf } from '@/lib/reports/pdf'

const locale = 'tr'

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${mm}${dd}${yyyy}`
}

function siteSlug(siteUrl: string): string {
  try {
    const host = new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).hostname
    const bare = host.replace(/^www\./, '')
    return bare.split('.')[0]
  } catch {
    return 'site'
  }
}

function renderPayload(actionType: string, payload: unknown): string {
  if (!payload) return ''
  const p = payload as Record<string, unknown>

  if (p.suggestedContent) {
    return `${t('report.payload.suggestedContent', locale)}\n\`\`\`\n${p.suggestedContent}\n\`\`\``
  }
  if (p.instruction) {
    return `${t('report.payload.instruction', locale)}\n${p.instruction}`
  }
  if (p.fixType === 'generate_llms_txt' || p.fixType === 'regenerate_llms_txt') {
    return t('report.payload.generateLlms', locale)
  }
  if (p.fixType === 'update_llms_txt' && Array.isArray(p.newPageUrls)) {
    return `${t('report.payload.newPages', locale)}\n${(p.newPageUrls as string[]).map(u => `- ${u}`).join('\n')}`
  }
  if (p.fixType === 'add_schema') {
    return `${t('report.payload.addSchema.type', locale)} ${p.schemaType}\n${t('report.payload.addSchema.page', locale)} ${p.url}\n\n${t('report.payload.addSchema.note', locale, { schemaType: String(p.schemaType) })}`
  }
  if (p.recommendation) {
    return `${t('report.payload.recommendation', locale)} ${p.recommendation}`
  }
  if (p.affectedPages && Array.isArray(p.affectedPages)) {
    return `${t('report.payload.affectedPages', locale)}\n${(p.affectedPages as string[]).map(u => `- ${u}`).join('\n')}`
  }

  return `\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\``
}

const GRADE_EMOJI: Record<string, string> = { A: '🟢', B: '🟡', C: '🟡', D: '🟠', F: '🔴' }

function buildTechStatusTable(
  scores: ReturnType<typeof computeTechnicalScores>,
  pageCount: number
): string[] {
  const rows = [
    { label: t('report.tech.https', locale),       s: scores.https },
    { label: t('report.tech.llmsTxt', locale),     s: scores.llmsTxt },
    { label: t('report.tech.robotsTxt', locale),   s: scores.robotsTxt },
    { label: t('report.tech.aiBotAccess', locale), s: scores.aiBotAccess },
    { label: t('report.tech.sitemap', locale),     s: scores.sitemap },
  ]

  const lines: string[] = [
    `| ${t('report.tech.control', locale)} | ${t('report.tech.grade', locale)} | ${t('report.tech.score', locale)} |`,
    `|---------|-----|------|`,
    ...rows.map(r => r.s.unknown
      ? `| ${r.label} | ⚪ — | Bilinmiyor |`
      : `| ${r.label} | ${GRADE_EMOJI[r.s.grade]} ${r.s.grade} | ${r.s.score}/100 |`),
    `| ${t('report.tech.pagesScanned', locale)} | — | ${pageCount} |`,
    ``,
  ]

  const withRecs = rows.filter(r => r.s.recommendation && !r.s.unknown)
  if (withRecs.length > 0) {
    lines.push(`### ${t('report.tech.recommendationsHeading', locale)}`, ``)
    for (const { label, s } of withRecs) {
      lines.push(`- **${label} (${s.grade} ${s.score}/100):** ${s.recommendation}`)
    }
    lines.push(``)
  }

  return lines
}

type Issue = {
  severity: string
  category: string
  title: string
  description: string
  impact: string
  actionType: string
  actionPayload: unknown
  status: string
}

function buildActionPlan(
  report: { generatedAt: Date; period: string; summary: string },
  issues: Issue[],
  siteName: string,
  siteUrl: string,
  qualityScores: ReturnType<typeof computeTechnicalScores> | null,
  pageCount: number
): string {
  const pendingIssues = issues.filter(i => i.status === 'PENDING')
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const sorted = [...pendingIssues].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  )

  const lines: string[] = [
    `# ${t('report.actionPlan.heading', locale, { siteName })}`,
    ``,
    `| ${t('report.field', locale)} | ${t('report.value', locale)} |`,
    `|------|-------|`,
    `| ${t('report.field.site', locale)} | ${siteUrl} |`,
    `| ${t('report.field.period', locale)} | ${report.period} |`,
    `| ${t('report.field.generatedAt', locale)} | ${new Date(report.generatedAt).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} |`,
    `| ${t('report.field.pendingImprovements', locale)} | ${pendingIssues.length} |`,
    ``,
    `> ${report.summary}`,
    ``,
    `---`,
    ``,
  ]

  // Teknik Durum
  if (qualityScores) {
    lines.push(`## ${t('report.section.techStatus', locale)}`, ``)
    lines.push(...buildTechStatusTable(qualityScores, pageCount))
    lines.push(`---`, ``)
  }

  // Teknik Durum önerilerini topla (score < 100 olan tüm maddeler)
  const techRecs = qualityScores
    ? Object.entries(qualityScores)
        .filter(([, s]) => (s as QualityScore).recommendation && !(s as QualityScore).unknown)
        .map(([, s]) => s as QualityScore)
    : []

  lines.push(`## ${t('report.section.pendingImprovements', locale)}`, ``)

  if (sorted.length === 0 && techRecs.length === 0) {
    lines.push(t('report.allChecksPassed', locale))
  } else if (sorted.length === 0) {
    lines.push(t('report.noActiveIssues', locale))
    lines.push(``)
  } else {
    sorted.forEach((issue, idx) => {
      const severityLabel: Record<string, string> = {
        CRITICAL: t('report.severity.critical', locale), HIGH: t('report.severity.high', locale),
        MEDIUM: t('report.severity.medium', locale), LOW: t('report.severity.low', locale),
      }
      lines.push(`### ${idx + 1}. ${severityLabel[issue.severity] ?? issue.severity} — ${issue.title}`)
      lines.push(``)
      lines.push(`${t('report.label.category', locale)} ${issue.category} &nbsp;|&nbsp; ${t('report.label.action', locale)} ${issue.actionType}`)
      lines.push(``)
      lines.push(`${t('report.label.description', locale)}  `)
      lines.push(issue.description)
      lines.push(``)
      lines.push(`${t('report.label.impact', locale)}  `)
      lines.push(issue.impact)
      lines.push(``)
      const payloadStr = renderPayload(issue.actionType, issue.actionPayload)
      if (payloadStr) {
        lines.push(payloadStr)
        lines.push(``)
      }
      lines.push(`---`)
      lines.push(``)
    })
  }

  lines.push(t('report.autoGenerated', locale))
  return lines.join('\n')
}

type Snapshot = {
  hasLlmsTxt: boolean
  llmsTxtContent: string | null
  hasRobotsTxt: boolean
  robotsBlocksAI: boolean
  hasSitemap: boolean
  httpsEnabled: boolean
  pages: unknown
  technicalDetails: unknown
}

function buildReportMd(
  report: {
    generatedAt: Date
    period: string
    summary: string
    issuesFound: number
    issuesFixed: number
    aiCrawlerVisits: number
    llmsTxtUpdated: boolean
    triggerType: string
  },
  issues: Issue[],
  snapshot: Snapshot | null,
  siteName: string,
  siteUrl: string,
  prevReport: { issuesFound: number; issuesFixed: number } | null,
  qualityScores: ReturnType<typeof computeTechnicalScores> | null,
  pageCount: number
): string {
  const lines: string[] = [
    `# ${t('report.heading', locale, { siteName })}`,
    ``,
    `| ${t('report.field', locale)} | ${t('report.value', locale)} |`,
    `|------|-------|`,
    `| ${t('report.field.site', locale)} | ${siteUrl} |`,
    `| ${t('report.field.period', locale)} | ${report.period} |`,
    `| ${t('report.field.trigger', locale)} | ${report.triggerType === 'WEEKLY' ? t('report.trigger.weekly', locale) : t('report.trigger.manual', locale)} |`,
    `| ${t('report.field.generatedAt', locale)} | ${new Date(report.generatedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })} |`,
    ``,
    `---`,
    ``,
    `## ${t('report.section.summary', locale)}`,
    ``,
    `> ${report.summary}`,
    ``,
  ]

  // Teknik Durum — enhanced with grades and scores
  if (snapshot) {
    lines.push(`## ${t('report.section.techStatus', locale)}`, ``)

    if (qualityScores) {
      lines.push(...buildTechStatusTable(qualityScores, pageCount))
    } else {
      // Fallback: simple ✅/❌ table if scores unavailable
      const ok = '✅', fail = '❌'
      lines.push(`| ${t('report.tech.control', locale)} | ${t('report.tech.status', locale)} |`)
      lines.push(`|---------|-------|`)
      lines.push(`| ${t('report.tech.https', locale)} | ${snapshot.httpsEnabled ? ok : fail} |`)
      lines.push(`| ${t('report.tech.llmsTxt', locale)} | ${snapshot.hasLlmsTxt ? ok : fail} |`)
      lines.push(`| ${t('report.tech.robotsTxt', locale)} | ${snapshot.hasRobotsTxt ? ok : fail} |`)
      lines.push(`| ${t('report.tech.aiBotsBlocked', locale)} | ${snapshot.robotsBlocksAI ? `${fail} ${t('report.tech.yes', locale)}` : `${ok} ${t('report.tech.no', locale)}`} |`)
      lines.push(`| ${t('report.tech.sitemap', locale)} | ${snapshot.hasSitemap ? ok : fail} |`)
      lines.push(`| ${t('report.tech.pagesScanned', locale)} | ${pageCount} |`)
      lines.push(``)
    }

    if (snapshot.hasLlmsTxt && snapshot.llmsTxtContent) {
      lines.push(`### ${t('report.section.currentLlms', locale)}`, ``)
      lines.push(`\`\`\``)
      lines.push((snapshot.llmsTxtContent as string).trim())
      lines.push(`\`\`\``)
      lines.push(``)
    }
  }

  // Stats
  lines.push(`## ${t('report.section.stats', locale)}`, ``)
  lines.push(`| ${t('report.stats.metric', locale)} | ${t('report.value', locale)} |`)
  lines.push(`|--------|-------|`)
  lines.push(`| ${t('report.stats.issuesFound', locale)} | ${report.issuesFound} |`)
  lines.push(`| ${t('report.stats.issuesFixed', locale)} | ${report.issuesFixed} |`)
  lines.push(`| ${t('report.stats.pendingIssues', locale)} | ${issues.filter(i => i.status === 'PENDING').length} |`)
  lines.push(`| ${t('report.stats.aiBotVisits', locale)} | ${report.aiCrawlerVisits} |`)
  lines.push(`| ${t('report.stats.llmsUpdated', locale)} | ${report.llmsTxtUpdated ? t('report.tech.yes', locale) : t('report.tech.no', locale)} |`)
  lines.push(``)

  // Prev period comparison
  if (prevReport) {
    const issueDelta = report.issuesFound - prevReport.issuesFound
    const fixedDelta = report.issuesFixed - prevReport.issuesFixed
    lines.push(`## ${t('report.section.comparison', locale)}`, ``)
    lines.push(`| ${t('report.stats.metric', locale)} | ${t('report.comparison.previous', locale)} | ${t('report.comparison.current', locale)} | ${t('report.comparison.change', locale)} |`)
    lines.push(`|--------|--------|-------|---------|`)
    lines.push(`| ${t('report.stats.issuesFound', locale)} | ${prevReport.issuesFound} | ${report.issuesFound} | ${issueDelta >= 0 ? '+' : ''}${issueDelta} |`)
    lines.push(`| ${t('report.stats.issuesFixed', locale)} | ${prevReport.issuesFixed} | ${report.issuesFixed} | ${fixedDelta >= 0 ? '+' : ''}${fixedDelta} |`)
    lines.push(``)
  }

  // All findings grouped by severity
  if (issues.length > 0) {
    lines.push(`## ${t('report.section.allFindings', locale)}`, ``)

    const severityGroups: Record<string, Issue[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] }
    for (const issue of issues) {
      const g = severityGroups[issue.severity]
      if (g) g.push(issue)
    }

    const severityLabel: Record<string, string> = {
      CRITICAL: t('report.severityHeading.critical', locale), HIGH: t('report.severityHeading.high', locale),
      MEDIUM: t('report.severityHeading.medium', locale), LOW: t('report.severityHeading.low', locale),
    }
    const statusLabel: Record<string, string> = {
      PENDING: t('report.status.pending', locale), APPLIED: t('report.status.applied', locale), DISMISSED: t('report.status.dismissed', locale),
    }

    for (const [severity, group] of Object.entries(severityGroups)) {
      if (group.length === 0) continue
      lines.push(`### ${severityLabel[severity]}`, ``)
      for (const issue of group) {
        lines.push(`#### ${issue.title}`, ``)
        lines.push(`${t('report.label.status', locale)} ${statusLabel[issue.status] ?? issue.status} &nbsp;|&nbsp; ${t('report.label.category', locale)} ${issue.category} &nbsp;|&nbsp; ${t('report.label.action', locale)} ${issue.actionType}`)
        lines.push(``)
        lines.push(issue.description)
        lines.push(``)
        lines.push(t('report.label.impactInline', locale, { impact: issue.impact }))
        lines.push(``)
        const payloadStr = renderPayload(issue.actionType, issue.actionPayload)
        if (payloadStr) {
          lines.push(payloadStr)
          lines.push(``)
        }
      }
    }
  }

  lines.push(`---`)
  lines.push(t('report.autoGenerated.report', locale))
  return lines.join('\n')
}

export async function GET(
  request: Request,
  { params }: { params: { siteId: string; reportId: string } }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: t('api.error.unauthorized', locale) }, { status: 401 })

  let site = await requireSiteOwner(params.siteId, user.id)
  if (!site && isAdminUser(user)) {
    site = await db.site.findUnique({ where: { id: params.siteId } })
  }
  if (!site) return NextResponse.json({ error: t('api.error.notFound', locale) }, { status: 404 })

  const report = await db.report.findFirst({
    where: { id: params.reportId, siteId: params.siteId },
  })
  if (!report) return NextResponse.json({ error: t('api.error.reportNotFound', locale) }, { status: 404 })

  const { searchParams } = new URL(request.url)
  // TODO(security): [LOW] `type` doğrulanmıyor; 'action-plan' dışındaki tüm değerler
  // sessizce 'report' gibi davranıyor. Bilinmeyen değer için 400 döndürmek daha temiz olur.
  const type = searchParams.get('type') ?? 'report'
  const format = searchParams.get('format') ?? 'pdf'
  const dateStr = formatDate(new Date(report.generatedAt))
  const slug = siteSlug(site.url)

  const issues = report.snapshotId
    ? await db.issue.findMany({ where: { snapshotId: report.snapshotId } })
    : []

  const snapshot = report.snapshotId
    ? await db.snapshot.findUnique({
        where: { id: report.snapshotId },
        select: {
          hasLlmsTxt: true,
          llmsTxtContent: true,
          hasRobotsTxt: true,
          robotsBlocksAI: true,
          hasSitemap: true,
          httpsEnabled: true,
          pages: true,
          technicalDetails: true,
        },
      })
    : null

  const pageCount = Array.isArray(snapshot?.pages) ? (snapshot!.pages as unknown[]).length : 0

  const qualityScores = snapshot
    ? computeTechnicalScores({
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
          crawl?: import('@/lib/types').CrawlHealth | null
        } | null,
        crawledPageCount: pageCount,
      })
    : null

  if (type === 'action-plan' && format === 'pdf') {
    const techScores = qualityScores ? [
      { label: 'HTTPS',           grade: qualityScores.https.grade,        score: qualityScores.https.score,        recommendation: qualityScores.https.recommendation,       unknown: qualityScores.https.unknown },
      { label: 'llms.txt',        grade: qualityScores.llmsTxt.grade,      score: qualityScores.llmsTxt.score,      recommendation: qualityScores.llmsTxt.recommendation,     unknown: qualityScores.llmsTxt.unknown },
      { label: 'robots.txt',      grade: qualityScores.robotsTxt.grade,    score: qualityScores.robotsTxt.score,    recommendation: qualityScores.robotsTxt.recommendation,   unknown: qualityScores.robotsTxt.unknown },
      { label: 'AI Botlara İzin', grade: qualityScores.aiBotAccess.grade,  score: qualityScores.aiBotAccess.score,  recommendation: qualityScores.aiBotAccess.recommendation, unknown: qualityScores.aiBotAccess.unknown },
      { label: 'Sitemap',         grade: qualityScores.sitemap.grade,      score: qualityScores.sitemap.score,      recommendation: qualityScores.sitemap.recommendation,     unknown: qualityScores.sitemap.unknown },
    ] : []

    const pendingIssues = issues.filter(i => i.status === 'PENDING')
      .sort((a, b) => {
        const o: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
        return (o[a.severity] ?? 4) - (o[b.severity] ?? 4)
      })
      .map(i => ({
        severity: i.severity,
        category: i.category,
        title: i.title,
        description: i.description,
        impact: i.impact,
        actionType: i.actionType,
        deployInstructions: renderPayload(i.actionType, i.actionPayload) || undefined,
      }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(React.createElement(ActionPlanPdf, {
      siteName: site.name,
      siteUrl: site.url,
      period: report.period,
      generatedAt: new Date(report.generatedAt),
      summary: report.summary,
      pendingCount: pendingIssues.length,
      techScores,
      issues: pendingIssues,
    }) as any)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Action_Plan_${slug}_${dateStr}.pdf"`,
      },
    })
  }

  if (type === 'action-plan') {
    const content = buildActionPlan(report, issues, site.name, site.url, qualityScores, pageCount)
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="Action_Plan_${slug}_${dateStr}.md"`,
      },
    })
  }

  const prevReport = await db.report.findFirst({
    where: { siteId: params.siteId, generatedAt: { lt: report.generatedAt } },
    orderBy: { generatedAt: 'desc' },
    select: { issuesFound: true, issuesFixed: true },
  })

  if (format === 'pdf') {
    const techScores = qualityScores ? [
      { label: 'HTTPS',           grade: qualityScores.https.grade,        score: qualityScores.https.score,        recommendation: qualityScores.https.recommendation,       unknown: qualityScores.https.unknown },
      { label: 'llms.txt',        grade: qualityScores.llmsTxt.grade,      score: qualityScores.llmsTxt.score,      recommendation: qualityScores.llmsTxt.recommendation,     unknown: qualityScores.llmsTxt.unknown },
      { label: 'robots.txt',      grade: qualityScores.robotsTxt.grade,    score: qualityScores.robotsTxt.score,    recommendation: qualityScores.robotsTxt.recommendation,   unknown: qualityScores.robotsTxt.unknown },
      { label: 'AI Botlara İzin', grade: qualityScores.aiBotAccess.grade,  score: qualityScores.aiBotAccess.score,  recommendation: qualityScores.aiBotAccess.recommendation, unknown: qualityScores.aiBotAccess.unknown },
      { label: 'Sitemap',         grade: qualityScores.sitemap.grade,      score: qualityScores.sitemap.score,      recommendation: qualityScores.sitemap.recommendation,     unknown: qualityScores.sitemap.unknown },
    ] : []

    const pendingCount = issues.filter(i => i.status === 'PENDING').length

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(React.createElement(ReportPdf, {
      siteName: site.name,
      siteUrl: site.url,
      period: report.period,
      triggerType: report.triggerType,
      generatedAt: new Date(report.generatedAt),
      summary: report.summary,
      techScores,
      llmsTxtContent: snapshot?.llmsTxtContent ?? null,
      stats: {
        issuesFound: report.issuesFound,
        issuesFixed: report.issuesFixed,
        issuesPending: pendingCount,
        aiVisits: report.aiCrawlerVisits,
        llmsTxtUpdated: report.llmsTxtUpdated,
      },
      prevStats: prevReport ?? null,
      findings: issues.map(i => ({
        severity: i.severity,
        category: i.category,
        title: i.title,
        description: i.description,
        impact: i.impact,
        status: i.status,
        actionType: i.actionType,
      })),
    }) as any)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Report_${slug}_${dateStr}.pdf"`,
      },
    })
  }

  const content = buildReportMd(report, issues, snapshot, site.name, site.url, prevReport, qualityScores, pageCount)
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="Report_${slug}_${dateStr}.md"`,
    },
  })
}
