import { NextResponse } from 'next/server'
import { getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { computeTechnicalScores, type QualityScore } from '@/lib/analyzer/quality'

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
    return `**Önerilen İçerik:**\n\`\`\`\n${p.suggestedContent}\n\`\`\``
  }
  if (p.instruction) {
    return `**Uygulama Talimatı:**\n${p.instruction}`
  }
  if (p.fixType === 'generate_llms_txt' || p.fixType === 'regenerate_llms_txt') {
    return `**Aksiyon:** GEO Platform bu dosyayı site içeriğinizden otomatik oluşturacak. Dashboard'dan "Göster" butonunu kullanın.`
  }
  if (p.fixType === 'update_llms_txt' && Array.isArray(p.newPageUrls)) {
    return `**Eklenecek Sayfalar:**\n${(p.newPageUrls as string[]).map(u => `- ${u}`).join('\n')}`
  }
  if (p.fixType === 'add_schema') {
    return `**Schema Türü:** ${p.schemaType}\n**Sayfa:** ${p.url}\n\nGEO Platform bu sayfaya ${p.schemaType} JSON-LD kodu ekleyecek. Dashboard'dan "Göster" butonunu kullanın.`
  }
  if (p.recommendation) {
    return `**Öneri:** ${p.recommendation}`
  }
  if (p.affectedPages && Array.isArray(p.affectedPages)) {
    return `**Etkilenen Sayfalar:**\n${(p.affectedPages as string[]).map(u => `- ${u}`).join('\n')}`
  }

  return `\`\`\`json\n${JSON.stringify(p, null, 2)}\n\`\`\``
}

const GRADE_EMOJI: Record<string, string> = { A: '🟢', B: '🟡', C: '🟡', D: '🟠', F: '🔴' }

function buildTechStatusTable(
  scores: ReturnType<typeof computeTechnicalScores>,
  pageCount: number
): string[] {
  const rows = [
    { label: 'HTTPS',          s: scores.https },
    { label: 'llms.txt',       s: scores.llmsTxt },
    { label: 'robots.txt',     s: scores.robotsTxt },
    { label: 'AI Botlara İzin', s: scores.aiBotAccess },
    { label: 'Sitemap',        s: scores.sitemap },
  ]

  const lines: string[] = [
    `| Kontrol | Not | Skor |`,
    `|---------|-----|------|`,
    ...rows.map(r => `| ${r.label} | ${GRADE_EMOJI[r.s.grade]} ${r.s.grade} | ${r.s.score}/100 |`),
    `| Taranan Sayfa | — | ${pageCount} |`,
    ``,
  ]

  const withRecs = rows.filter(r => r.s.grade !== 'A' && r.s.recommendation)
  if (withRecs.length > 0) {
    lines.push(`### Teknik Öneriler`, ``)
    for (const { label, s } of withRecs) {
      lines.push(`- **${label} (${s.grade}):** ${s.recommendation}`)
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
    `# GEO Aksiyon Planı — ${siteName}`,
    ``,
    `| Alan | Değer |`,
    `|------|-------|`,
    `| Site | ${siteUrl} |`,
    `| Dönem | ${report.period} |`,
    `| Oluşturuldu | ${new Date(report.generatedAt).toLocaleDateString('tr-TR')} |`,
    `| Bekleyen İyileştirme | ${pendingIssues.length} |`,
    ``,
    `> ${report.summary}`,
    ``,
    `---`,
    ``,
  ]

  // Teknik Durum
  if (qualityScores) {
    lines.push(`## Teknik Durum`, ``)
    lines.push(...buildTechStatusTable(qualityScores, pageCount))
    lines.push(`---`, ``)
  }

  lines.push(`## Bekleyen İyileştirmeler`, ``)

  if (sorted.length === 0) {
    lines.push('Bekleyen issue bulunamadı. Site iyi durumda!')
  } else {
    sorted.forEach((issue, idx) => {
      const severityLabel: Record<string, string> = {
        CRITICAL: '🔴 KRİTİK', HIGH: '🟠 YÜKSEK', MEDIUM: '🟡 ORTA', LOW: '🟢 DÜŞÜK',
      }
      lines.push(`### ${idx + 1}. ${severityLabel[issue.severity] ?? issue.severity} — ${issue.title}`)
      lines.push(``)
      lines.push(`**Kategori:** ${issue.category} &nbsp;|&nbsp; **Aksiyon:** ${issue.actionType}`)
      lines.push(``)
      lines.push(`**Açıklama:**  `)
      lines.push(issue.description)
      lines.push(``)
      lines.push(`**Etki:**  `)
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

  lines.push(`*Bu dosya GEO Platform tarafından otomatik oluşturulmuştur.*`)
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
    `# GEO Raporu — ${siteName}`,
    ``,
    `| Alan | Değer |`,
    `|------|-------|`,
    `| Site | ${siteUrl} |`,
    `| Dönem | ${report.period} |`,
    `| Tetikleyici | ${report.triggerType === 'WEEKLY' ? 'Haftalık Otomatik' : 'Manuel'} |`,
    `| Oluşturuldu | ${new Date(report.generatedAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })} |`,
    ``,
    `---`,
    ``,
    `## Özet`,
    ``,
    `> ${report.summary}`,
    ``,
  ]

  // Teknik Durum — enhanced with grades and scores
  if (snapshot) {
    lines.push(`## Teknik Durum`, ``)

    if (qualityScores) {
      lines.push(...buildTechStatusTable(qualityScores, pageCount))
    } else {
      // Fallback: simple ✅/❌ table if scores unavailable
      const ok = '✅', fail = '❌'
      lines.push(`| Kontrol | Durum |`)
      lines.push(`|---------|-------|`)
      lines.push(`| HTTPS | ${snapshot.httpsEnabled ? ok : fail} |`)
      lines.push(`| llms.txt | ${snapshot.hasLlmsTxt ? ok : fail} |`)
      lines.push(`| robots.txt | ${snapshot.hasRobotsTxt ? ok : fail} |`)
      lines.push(`| AI Botlar Engelli | ${snapshot.robotsBlocksAI ? `${fail} Evet` : `${ok} Hayır`} |`)
      lines.push(`| Sitemap | ${snapshot.hasSitemap ? ok : fail} |`)
      lines.push(`| Taranan Sayfa | ${pageCount} |`)
      lines.push(``)
    }

    if (snapshot.hasLlmsTxt && snapshot.llmsTxtContent) {
      lines.push(`### Mevcut llms.txt İçeriği`, ``)
      lines.push(`\`\`\``)
      lines.push((snapshot.llmsTxtContent as string).trim())
      lines.push(`\`\`\``)
      lines.push(``)
    }
  }

  // Stats
  lines.push(`## İstatistikler`, ``)
  lines.push(`| Metrik | Değer |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Bulunan issue | ${report.issuesFound} |`)
  lines.push(`| Çözülen issue | ${report.issuesFixed} |`)
  lines.push(`| Bekleyen issue | ${issues.filter(i => i.status === 'PENDING').length} |`)
  lines.push(`| AI bot ziyareti | ${report.aiCrawlerVisits} |`)
  lines.push(`| llms.txt güncellendi | ${report.llmsTxtUpdated ? 'Evet' : 'Hayır'} |`)
  lines.push(``)

  // Prev period comparison
  if (prevReport) {
    const issueDelta = report.issuesFound - prevReport.issuesFound
    const fixedDelta = report.issuesFixed - prevReport.issuesFixed
    lines.push(`## Önceki Dönemle Karşılaştırma`, ``)
    lines.push(`| Metrik | Önceki | Şu An | Değişim |`)
    lines.push(`|--------|--------|-------|---------|`)
    lines.push(`| Bulunan issue | ${prevReport.issuesFound} | ${report.issuesFound} | ${issueDelta >= 0 ? '+' : ''}${issueDelta} |`)
    lines.push(`| Çözülen issue | ${prevReport.issuesFixed} | ${report.issuesFixed} | ${fixedDelta >= 0 ? '+' : ''}${fixedDelta} |`)
    lines.push(``)
  }

  // All findings grouped by severity
  if (issues.length > 0) {
    lines.push(`## Tüm Bulgular`, ``)

    const severityGroups: Record<string, Issue[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] }
    for (const issue of issues) {
      const g = severityGroups[issue.severity]
      if (g) g.push(issue)
    }

    const severityLabel: Record<string, string> = {
      CRITICAL: '🔴 Kritik', HIGH: '🟠 Yüksek', MEDIUM: '🟡 Orta', LOW: '🟢 Düşük',
    }
    const statusLabel: Record<string, string> = {
      PENDING: 'Bekliyor', APPLIED: 'Uygulandı', DISMISSED: 'Reddedildi',
    }

    for (const [severity, group] of Object.entries(severityGroups)) {
      if (group.length === 0) continue
      lines.push(`### ${severityLabel[severity]}`, ``)
      for (const issue of group) {
        lines.push(`#### ${issue.title}`, ``)
        lines.push(`**Durum:** ${statusLabel[issue.status] ?? issue.status} &nbsp;|&nbsp; **Kategori:** ${issue.category} &nbsp;|&nbsp; **Aksiyon:** ${issue.actionType}`)
        lines.push(``)
        lines.push(issue.description)
        lines.push(``)
        lines.push(`*Etki: ${issue.impact}*`)
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
  lines.push(`*Bu rapor GEO Platform tarafından otomatik oluşturulmuştur.*`)
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
        } | null,
      })
    : null

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

  const content = buildReportMd(report, issues, snapshot, site.name, site.url, prevReport, qualityScores, pageCount)
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="Report_${slug}_${dateStr}.md"`,
    },
  })
}
