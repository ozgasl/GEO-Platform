export interface QualityScore {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  label: string
  detail: string
}

const AI_BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot']

function toGrade(score: number): QualityScore['grade'] {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 55) return 'C'
  if (score >= 30) return 'D'
  return 'F'
}

function toLabel(grade: QualityScore['grade']): string {
  return { A: 'Mükemmel', B: 'İyi', C: 'Orta', D: 'Zayıf', F: 'Yok/Kötü' }[grade]
}

export function scoreLlmsTxt(content: string | null, hasLlmsTxt: boolean): QualityScore {
  if (!hasLlmsTxt || !content) {
    return { score: 0, grade: 'F', label: 'Yok', detail: 'llms.txt dosyası bulunamadı.' }
  }

  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return { score: 10, grade: 'F', label: 'Boş', detail: 'llms.txt var ama içeriği boş.' }
  }

  let score = 10
  const details: string[] = []

  const hasTitle = /^#\s+\S/m.test(trimmed)
  const hasDescription = /^>\s+\S/m.test(trimmed)
  const sectionCount = (trimmed.match(/^##\s+/gm) ?? []).length
  const charCount = trimmed.length

  if (hasTitle) { score += 15; details.push('başlık ✓') }
  if (hasDescription) { score += 20; details.push('açıklama ✓') }
  score += Math.min(sectionCount * 10, 30)
  if (sectionCount > 0) details.push(`${sectionCount} bölüm`)
  if (charCount > 500) { score += 15; details.push('yeterli içerik') }
  if (charCount > 1500) { score += 10; details.push('zengin içerik') }

  score = Math.min(score, 100)
  const grade = toGrade(score)
  return {
    score,
    grade,
    label: toLabel(grade),
    detail: details.length > 0 ? details.join(', ') : `${charCount} karakter`,
  }
}

export function scoreRobotsTxt(
  hasRobotsTxt: boolean,
  robotsBlocksAI: boolean,
  robotsContent?: string | null
): QualityScore {
  if (!hasRobotsTxt) {
    return { score: 30, grade: 'D', label: 'Yok', detail: 'robots.txt yok — varsayılan izin.' }
  }
  if (robotsBlocksAI) {
    return { score: 0, grade: 'F', label: 'Engelliyor', detail: 'AI botlar robots.txt ile engellendi.' }
  }

  let score = 60
  const details: string[] = ['mevcut']

  if (robotsContent) {
    if (/Sitemap:/i.test(robotsContent)) { score += 10; details.push('sitemap referansı') }
    const agentCount = (robotsContent.match(/^User-agent:/gim) ?? []).length
    if (agentCount >= 2) { score += 20; details.push(`${agentCount} ajan kuralı`) }
  }

  score = Math.min(score, 100)
  const grade = toGrade(score)
  return { score, grade, label: toLabel(grade), detail: details.join(', ') }
}

export function scoreAiBotAccess(
  robotsBlocksAI: boolean,
  hasRobotsTxt: boolean,
  allowedBots?: string[]
): QualityScore {
  if (robotsBlocksAI) {
    return { score: 0, grade: 'F', label: 'Engelli', detail: 'AI botlar erişemiyor.' }
  }
  if (!hasRobotsTxt) {
    return { score: 50, grade: 'C', label: 'Varsayılan', detail: 'robots.txt yok, botlar varsayılan olarak serbest.' }
  }

  const allowed = allowedBots ?? []
  let score = 50
  const foundBots: string[] = []

  if (allowed.includes('GPTBot')) { score += 20; foundBots.push('GPTBot') }
  if (allowed.includes('ClaudeBot')) { score += 15; foundBots.push('ClaudeBot') }
  if (allowed.includes('PerplexityBot')) { score += 10; foundBots.push('PerplexityBot') }
  if (allowed.includes('OAI-SearchBot')) { score += 5; foundBots.push('OAI-SearchBot') }

  score = Math.min(score, 100)
  const grade = toGrade(score)
  const detail = foundBots.length > 0
    ? `Explicit izin: ${foundBots.join(', ')}`
    : 'Genel izin var, explicit kural yok.'
  return { score, grade, label: toLabel(grade), detail }
}

export function scoreSitemap(hasSitemap: boolean, urlCount?: number | null): QualityScore {
  if (!hasSitemap) {
    return { score: 0, grade: 'F', label: 'Yok', detail: 'Sitemap bulunamadı.' }
  }

  if (urlCount == null || urlCount === 0) {
    return { score: 60, grade: 'C', label: 'Mevcut', detail: 'Sitemap var, URL sayısı bilinmiyor.' }
  }

  let score: number
  if (urlCount >= 50) score = 100
  else if (urlCount >= 11) score = 85
  else score = 70

  const grade = toGrade(score)
  return { score, grade, label: toLabel(grade), detail: `${urlCount} URL` }
}

export function scoreHttps(httpsEnabled: boolean): QualityScore {
  if (!httpsEnabled) {
    return { score: 0, grade: 'F', label: 'HTTP', detail: 'HTTPS aktif değil.' }
  }
  return { score: 100, grade: 'A', label: 'Güvenli', detail: 'HTTPS aktif.' }
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
}) {
  const td = snapshot.technicalDetails ?? {}
  return {
    llmsTxt: scoreLlmsTxt(snapshot.llmsTxtContent, snapshot.hasLlmsTxt),
    robotsTxt: scoreRobotsTxt(snapshot.hasRobotsTxt, snapshot.robotsBlocksAI, td.robotsContent),
    aiBotAccess: scoreAiBotAccess(snapshot.robotsBlocksAI, snapshot.hasRobotsTxt, td.allowedBots),
    sitemap: scoreSitemap(snapshot.hasSitemap, td.sitemapUrlCount),
    https: scoreHttps(snapshot.httpsEnabled),
  }
}

export { AI_BOTS }
