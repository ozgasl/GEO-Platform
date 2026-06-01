import { t } from '@/lib/i18n'

export interface QualityScore {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  label: string
  detail: string
  recommendation?: string
}

const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot', 'Google-Extended']

// Sitemap eksiklik kontrolü için minimum taranan sayfa eşiği — çok küçük siteleri nazlamamak için
const SITEMAP_MIN_PAGES = 10

/**
 * Sitemap'in eksik olup olmadığını belirler — hem panel notu hem de issue üretimi için TEK kaynak.
 * Yalnızca sitemap, taranan sayfa sayısından AZ URL içerdiğinde eksik sayılır.
 * urlCount 0/null ise (genelde parse edilemeyen sitemap index'i) cezalandırmaz.
 */
export function isSitemapIncomplete(urlCount?: number | null, crawledPageCount?: number | null): boolean {
  if (urlCount == null || urlCount <= 0) return false
  if (crawledPageCount == null || crawledPageCount < SITEMAP_MIN_PAGES) return false
  return urlCount < crawledPageCount
}

function toGrade(score: number): QualityScore['grade'] {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 55) return 'C'
  if (score >= 30) return 'D'
  return 'F'
}

function toLabel(grade: QualityScore['grade'], locale: string): string {
  return t(`quality.grade.${grade}`, locale)
}

export function scoreLlmsTxt(content: string | null, hasLlmsTxt: boolean, locale: string = 'tr'): QualityScore {
  if (!hasLlmsTxt || !content) {
    return {
      score: 0, grade: 'F', label: t('quality.llms.missing.label', locale), detail: t('quality.llms.missing.detail', locale),
      recommendation: t('quality.llms.missing.recommendation', locale),
    }
  }

  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return {
      score: 10, grade: 'F', label: t('quality.llms.empty.label', locale), detail: t('quality.llms.empty.detail', locale),
      recommendation: t('quality.llms.empty.recommendation', locale),
    }
  }

  let score = 10
  const details: string[] = []

  const hasTitle = /^#\s+\S/m.test(trimmed)
  const hasDescription = /^>\s+\S/m.test(trimmed)
  const sectionCount = (trimmed.match(/^##\s+/gm) ?? []).length
  const charCount = trimmed.length

  if (hasTitle) { score += 15; details.push(t('quality.llms.detail.title', locale)) }
  if (hasDescription) { score += 20; details.push(t('quality.llms.detail.description', locale)) }
  score += Math.min(sectionCount * 10, 30)
  if (sectionCount > 0) details.push(t('quality.llms.detail.sections', locale, { count: sectionCount }))
  if (charCount > 500) { score += 15; details.push(t('quality.llms.detail.enoughContent', locale)) }
  if (charCount > 1500) { score += 10; details.push(t('quality.llms.detail.richContent', locale)) }

  score = Math.min(score, 100)
  const grade = toGrade(score)

  const missing: string[] = []
  if (!hasTitle) missing.push(t('quality.llms.missing.title', locale))
  if (!hasDescription) missing.push(t('quality.llms.missing.description', locale))
  if (sectionCount === 0) missing.push(t('quality.llms.missing.section', locale))

  const recommendation = missing.length > 0
    ? t('quality.llms.recommendation.missing', locale, { missing: missing.join(', ') })
    : charCount < 500
      ? t('quality.llms.recommendation.enrich', locale)
      : undefined

  return {
    score,
    grade,
    label: toLabel(grade, locale),
    detail: details.length > 0 ? details.join(', ') : t('quality.llms.detail.charCount', locale, { count: charCount }),
    recommendation,
  }
}

export function scoreRobotsTxt(
  hasRobotsTxt: boolean,
  robotsBlocksAI: boolean,
  robotsContent?: string | null,
  locale: string = 'tr'
): QualityScore {
  if (!hasRobotsTxt) {
    return {
      score: 30, grade: 'D', label: t('quality.robots.missing.label', locale), detail: t('quality.robots.missing.detail', locale),
      recommendation: t('quality.robots.missing.recommendation', locale),
    }
  }
  if (robotsBlocksAI) {
    return {
      score: 0, grade: 'F', label: t('quality.robots.blocked.label', locale), detail: t('quality.robots.blocked.detail', locale),
      recommendation: t('quality.robots.blocked.recommendation', locale),
    }
  }

  let score = 50
  const details: string[] = [t('quality.robots.detail.present', locale)]
  const missing: string[] = []

  if (robotsContent) {
    if (/Sitemap:/i.test(robotsContent)) { score += 10; details.push(t('quality.robots.detail.sitemapRef', locale)) }
    else missing.push(t('quality.robots.missing.sitemapRef', locale))
    const agentCount = (robotsContent.match(/^User-agent:/gim) ?? []).length
    if (agentCount >= 2) { score += 20; details.push(t('quality.robots.detail.agentRules', locale, { count: agentCount })) }
    else missing.push(t('quality.robots.missing.multiAgent', locale))
    const hasAiBotRules = /GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot|Google-Extended/i.test(robotsContent)
    if (hasAiBotRules) { score += 20; details.push(t('quality.robots.detail.aiBotRules', locale)) }
    else missing.push(t('quality.robots.missing.aiBots', locale))
  }

  score = Math.min(score, 100)
  const grade = toGrade(score)
  const recommendation = missing.length > 0
    ? t('quality.robots.recommendation', locale, { missing: missing.join(', ') })
    : undefined

  return { score, grade, label: toLabel(grade, locale), detail: details.join(', '), recommendation }
}

export function scoreAiBotAccess(
  robotsBlocksAI: boolean,
  hasRobotsTxt: boolean,
  allowedBots?: string[],
  locale: string = 'tr'
): QualityScore {
  if (robotsBlocksAI) {
    return {
      score: 0, grade: 'F', label: t('quality.aiBot.blocked.label', locale), detail: t('quality.aiBot.blocked.detail', locale),
      recommendation: t('quality.aiBot.blocked.recommendation', locale),
    }
  }
  if (!hasRobotsTxt) {
    return {
      score: 50, grade: 'C', label: t('quality.aiBot.default.label', locale), detail: t('quality.aiBot.default.detail', locale),
      recommendation: t('quality.aiBot.default.recommendation', locale),
    }
  }

  const allowed = allowedBots ?? []
  let score = 50
  const foundBots: string[] = []

  if (allowed.includes('GPTBot')) { score += 15; foundBots.push('GPTBot') }
  if (allowed.includes('ClaudeBot')) { score += 12; foundBots.push('ClaudeBot') }
  if (allowed.includes('PerplexityBot')) { score += 10; foundBots.push('PerplexityBot') }
  if (allowed.includes('OAI-SearchBot')) { score += 8; foundBots.push('OAI-SearchBot') }
  if (allowed.includes('Google-Extended')) { score += 5; foundBots.push('Google-Extended') }

  score = Math.min(score, 100)
  const grade = toGrade(score)
  const detail = foundBots.length > 0
    ? t('quality.aiBot.explicit.detail', locale, { bots: foundBots.join(', ') })
    : t('quality.aiBot.generic.detail', locale)

  const missingBots = AI_BOTS.filter(b => !allowed.includes(b))
  const recommendation = missingBots.length > 0 && score < 100
    ? t('quality.aiBot.recommendation', locale, { bots: missingBots.join(', ') })
    : undefined

  return { score, grade, label: toLabel(grade, locale), detail, recommendation }
}

export function scoreSitemap(hasSitemap: boolean, urlCount?: number | null, crawledPageCount?: number | null, locale: string = 'tr'): QualityScore {
  if (!hasSitemap) {
    return {
      score: 0, grade: 'F', label: t('quality.sitemap.missing.label', locale), detail: t('quality.sitemap.missing.detail', locale),
      recommendation: t('quality.sitemap.missing.recommendation', locale),
    }
  }

  if (urlCount == null || urlCount === 0) {
    return {
      score: 60, grade: 'C', label: t('quality.sitemap.present.label', locale), detail: t('quality.sitemap.present.detail', locale),
      recommendation: t('quality.sitemap.present.recommendation', locale),
    }
  }

  // Eksik sitemap — issue üretimi ile AYNI mantık (tek kaynak): not, oran ile sınırlandırılır.
  if (isSitemapIncomplete(urlCount, crawledPageCount)) {
    const score = Math.min(70, Math.max(30, Math.round((urlCount / crawledPageCount!) * 100)))
    const grade = toGrade(score)
    return {
      score, grade, label: toLabel(grade, locale), detail: t('quality.sitemap.incomplete.detail', locale, { count: urlCount, pages: crawledPageCount! }),
      recommendation: t('quality.sitemap.incomplete.recommendation', locale, { count: urlCount, pages: crawledPageCount! }),
    }
  }

  let score: number
  if (urlCount >= 50) score = 100
  else if (urlCount >= 11) score = 85
  else score = 70

  const grade = toGrade(score)
  const recommendation = urlCount < 50
    ? t('quality.sitemap.recommendation', locale, { count: urlCount })
    : undefined

  return { score, grade, label: toLabel(grade, locale), detail: t('quality.sitemap.detail.urlCount', locale, { count: urlCount }), recommendation }
}

export function scoreHttps(httpsEnabled: boolean, locale: string = 'tr'): QualityScore {
  if (!httpsEnabled) {
    return {
      score: 0, grade: 'F', label: t('quality.https.missing.label', locale), detail: t('quality.https.missing.detail', locale),
      recommendation: t('quality.https.missing.recommendation', locale),
    }
  }
  return { score: 100, grade: 'A', label: t('quality.https.ok.label', locale), detail: t('quality.https.ok.detail', locale) }
}

/** Tüm teknik öğeler için skorları tek çağrıda hesaplar. */
export function computeTechnicalScores(snapshot: {
  hasLlmsTxt: boolean
  llmsTxtContent: string | null
  hasRobotsTxt: boolean
  robotsBlocksAI: boolean
  hasSitemap: boolean
  httpsEnabled: boolean
  technicalDetails?: {
    robotsContent?: string | null
    allowedBots?: string[]
    sitemapUrlCount?: number | null
  } | null
  crawledPageCount?: number
}, locale: string = 'tr') {
  const td = snapshot.technicalDetails ?? {}
  return {
    llmsTxt: scoreLlmsTxt(snapshot.llmsTxtContent, snapshot.hasLlmsTxt, locale),
    robotsTxt: scoreRobotsTxt(snapshot.hasRobotsTxt, snapshot.robotsBlocksAI, td.robotsContent, locale),
    aiBotAccess: scoreAiBotAccess(snapshot.robotsBlocksAI, snapshot.hasRobotsTxt, td.allowedBots, locale),
    sitemap: scoreSitemap(snapshot.hasSitemap, td.sitemapUrlCount, snapshot.crawledPageCount, locale),
    https: scoreHttps(snapshot.httpsEnabled, locale),
  }
}

export { AI_BOTS }
