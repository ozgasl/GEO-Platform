import { NextResponse } from 'next/server'
import { getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'

function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${mm}${dd}${yyyy}`
}

function buildActionPlan(
  report: { generatedAt: Date; period: string; summary: string },
  issues: Array<{
    severity: string
    category: string
    title: string
    description: string
    impact: string
    actionType: string
    actionPayload: unknown
    status: string
  }>,
  siteName: string
): string {
  const dateStr = formatDate(new Date(report.generatedAt))
  const pendingIssues = issues.filter(i => i.status === 'PENDING')
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  const sorted = [...pendingIssues].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  )

  const lines: string[] = [
    `# GEO Action Plan — ${siteName}`,
    `**Dönem:** ${report.period}  `,
    `**Oluşturuldu:** ${new Date(report.generatedAt).toLocaleDateString('tr-TR')}  `,
    `**Durum:** ${report.summary}`,
    '',
    '---',
    '',
    '## Bekleyen İyileştirmeler',
    '',
  ]

  if (sorted.length === 0) {
    lines.push('Bekleyen issue bulunamadı.')
  } else {
    sorted.forEach((issue, idx) => {
      lines.push(`### ${idx + 1}. [${issue.severity}] ${issue.title}`)
      lines.push('')
      lines.push(`**Kategori:** ${issue.category}`)
      lines.push(`**Aksiyon Tipi:** ${issue.actionType}`)
      lines.push('')
      lines.push(`**Açıklama:**`)
      lines.push(issue.description)
      lines.push('')
      lines.push(`**Etki:**`)
      lines.push(issue.impact)

      if (issue.actionPayload) {
        const payload = issue.actionPayload as Record<string, unknown>
        lines.push('')
        lines.push('**Önerilen Değişiklik:**')
        lines.push('```')
        if (typeof payload.content === 'string') {
          lines.push(payload.content)
        } else {
          lines.push(JSON.stringify(payload, null, 2))
        }
        lines.push('```')
      }

      lines.push('')
      lines.push('---')
      lines.push('')
    })
  }

  lines.push('*Bu dosya GEO Platform tarafından otomatik oluşturulmuştur.*')

  return lines.join('\n')
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
  siteName: string,
  prevReport: { issuesFound: number; issuesFixed: number } | null
): string {
  const lines: string[] = [
    `# GEO Raporu — ${siteName}`,
    `**Dönem:** ${report.period}  `,
    `**Tetikleyici:** ${report.triggerType === 'WEEKLY' ? 'Haftalık Otomatik' : 'Manuel'}  `,
    `**Oluşturuldu:** ${new Date(report.generatedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    '',
    '---',
    '',
    '## Özet',
    '',
    report.summary,
    '',
    '## İstatistikler',
    '',
    `| Metrik | Değer |`,
    `|--------|-------|`,
    `| Bulunan issue | ${report.issuesFound} |`,
    `| Çözülen issue | ${report.issuesFixed} |`,
    `| AI bot ziyareti | ${report.aiCrawlerVisits} |`,
    `| llms.txt güncellendi | ${report.llmsTxtUpdated ? 'Evet' : 'Hayır'} |`,
  ]

  if (prevReport) {
    const issueDelta = report.issuesFound - prevReport.issuesFound
    const fixedDelta = report.issuesFixed - prevReport.issuesFixed
    lines.push('')
    lines.push('## Önceki Dönemle Karşılaştırma')
    lines.push('')
    lines.push(`| Metrik | Önceki | Şu An | Değişim |`)
    lines.push(`|--------|--------|-------|---------|`)
    lines.push(`| Bulunan issue | ${prevReport.issuesFound} | ${report.issuesFound} | ${issueDelta >= 0 ? '+' : ''}${issueDelta} |`)
    lines.push(`| Çözülen issue | ${prevReport.issuesFixed} | ${report.issuesFixed} | ${fixedDelta >= 0 ? '+' : ''}${fixedDelta} |`)
  }

  lines.push('')
  lines.push('---')
  lines.push('*Bu rapor GEO Platform tarafından otomatik oluşturulmuştur.*')

  return lines.join('\n')
}

export async function GET(
  request: Request,
  { params }: { params: { siteId: string; reportId: string } }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Giriş yapmanız gerekiyor.' }, { status: 401 })

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  const report = await db.report.findFirst({
    where: { id: params.reportId, siteId: params.siteId },
  })
  if (!report) return NextResponse.json({ error: 'Rapor bulunamadı.' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'report'
  const dateStr = formatDate(new Date(report.generatedAt))

  if (type === 'action-plan') {
    const issues = report.snapshotId
      ? await db.issue.findMany({
          where: { snapshotId: report.snapshotId },
          orderBy: [{ severity: 'asc' }],
        })
      : []

    const content = buildActionPlan(report, issues, site.name)
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="Action_Plan_${dateStr}.md"`,
      },
    })
  }

  // type === 'report'
  const prevReport = await db.report.findFirst({
    where: {
      siteId: params.siteId,
      generatedAt: { lt: report.generatedAt },
    },
    orderBy: { generatedAt: 'desc' },
    select: { issuesFound: true, issuesFixed: true },
  })

  const content = buildReportMd(report, site.name, prevReport)
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="Report_${dateStr}.md"`,
    },
  })
}
