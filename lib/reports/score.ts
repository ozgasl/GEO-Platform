import type { SnapshotData } from '@/lib/types'
import type { Issue } from '@prisma/client'

const SEVERITY_PENALTY: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 8,
  LOW: 3,
}

const CATEGORY_LABELS: Record<string, string> = {
  ROBOTS: 'Robots.txt',
  LLMS_TXT: 'llms.txt',
  SCHEMA: 'Schema Markup',
  CONTENT: 'İçerik Kalitesi',
  TECHNICAL: 'Teknik',
}

export interface GeoScore {
  total: number         // 0–100
  breakdown: {
    technical: number   // HTTPS, sitemap, robots — max 30
    llmstxt: number     // llms.txt varlığı ve kalitesi — max 25
    schema: number      // Schema markup — max 20
    content: number     // İçerik yoğunluğu — max 25
  }
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  summary: string
}

export function calculateGeoScore(snapshot: SnapshotData, issues: Issue[]): GeoScore {
  // Her kategori için 100'den başla, issue'lara göre düş
  let technical = 30
  let llmsScore = 25
  let schemaScore = 20
  let contentScore = 25

  for (const issue of issues) {
    if (issue.status === 'DISMISSED') continue
    const penalty = SEVERITY_PENALTY[issue.severity] ?? 0

    switch (issue.category) {
      case 'ROBOTS':
      case 'TECHNICAL':
        technical = Math.max(0, technical - penalty)
        break
      case 'LLMS_TXT':
        llmsScore = Math.max(0, llmsScore - penalty)
        break
      case 'SCHEMA':
        schemaScore = Math.max(0, schemaScore - penalty)
        break
      case 'CONTENT':
        contentScore = Math.max(0, contentScore - penalty)
        break
    }
  }

  // Temel teknik sağlık bonusları (issue yoksa bu zaten tam puan verir, çift sayma yok)
  const total = Math.min(100, Math.max(0, technical + llmsScore + schemaScore + contentScore))

  const grade: GeoScore['grade'] =
    total >= 90 ? 'A' :
    total >= 75 ? 'B' :
    total >= 60 ? 'C' :
    total >= 45 ? 'D' : 'F'

  const criticalCount = issues.filter(i => i.severity === 'CRITICAL' && i.status !== 'DISMISSED').length
  const highCount = issues.filter(i => i.severity === 'HIGH' && i.status !== 'DISMISSED').length
  const summary = buildSummary(total, grade, criticalCount, highCount, snapshot)

  return {
    total,
    breakdown: { technical, llmstxt: llmsScore, schema: schemaScore, content: contentScore },
    grade,
    summary,
  }
}

function buildSummary(
  score: number,
  grade: string,
  criticalCount: number,
  highCount: number,
  snapshot: SnapshotData
): string {
  const parts: string[] = []

  if (criticalCount > 0) {
    parts.push(`${criticalCount} kritik sorun AI botların sitenize erişimini engelliyor.`)
  }
  if (!snapshot.hasLlmsTxt) {
    parts.push('llms.txt dosyası eksik — AI motorları sitenizi anlayamıyor.')
  }
  if (snapshot.robotsBlocksAI) {
    parts.push('robots.txt AI botları engelliyor.')
  }
  if (!snapshot.hasSitemap) {
    parts.push('Sitemap eksik — sayfa keşfi zayıf.')
  }
  if (highCount > 0 && criticalCount === 0) {
    parts.push(`${highCount} yüksek öncelikli iyileştirme fırsatı mevcut.`)
  }
  if (score >= 90) {
    parts.push('Siteniz AI motorları için mükemmel durumda.')
  } else if (score >= 75) {
    parts.push('Siteniz iyi durumda, birkaç iyileştirme ile daha fazla görünürlük kazanabilir.')
  }

  return parts.join(' ') || `GEO skoru: ${score}/100 (${grade})`
}
