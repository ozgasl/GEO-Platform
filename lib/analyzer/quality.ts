export interface QualityScore {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  label: string
  detail: string
  recommendation?: string
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
    return {
      score: 0, grade: 'F', label: 'Yok', detail: 'llms.txt dosyası bulunamadı.',
      recommendation: 'Sitenizin kök dizinine llms.txt oluşturun. # başlık, > açıklama ve ## Sayfalar bölümlerini ekleyin. AI sistemleri bu dosyayı rehber olarak kullanır.',
    }
  }

  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return {
      score: 10, grade: 'F', label: 'Boş', detail: 'llms.txt var ama içeriği boş.',
      recommendation: 'llms.txt dosyasına içerik ekleyin: # Şirket Adı, > Kısa açıklama ve ## Sayfalar bölümüyle önemli URL\'lerinizi listeleyin.',
    }
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

  const missing: string[] = []
  if (!hasTitle) missing.push('# başlık')
  if (!hasDescription) missing.push('> açıklama')
  if (sectionCount === 0) missing.push('## bölüm')

  const recommendation = missing.length > 0
    ? `Eksik bölümleri ekleyin: ${missing.join(', ')}. İçerik zenginleştikçe skor otomatik yükselir.`
    : charCount < 500
      ? 'Sayfa URL\'lerini ve kısa açıklamalarını llms.txt\'e ekleyerek içeriği zenginleştirin.'
      : undefined

  return {
    score,
    grade,
    label: toLabel(grade),
    detail: details.length > 0 ? details.join(', ') : `${charCount} karakter`,
    recommendation,
  }
}

export function scoreRobotsTxt(
  hasRobotsTxt: boolean,
  robotsBlocksAI: boolean,
  robotsContent?: string | null
): QualityScore {
  if (!hasRobotsTxt) {
    return {
      score: 30, grade: 'D', label: 'Yok', detail: 'robots.txt yok — varsayılan izin.',
      recommendation: 'robots.txt dosyası oluşturun. En azından "User-agent: *\\nAllow: /" ve "Sitemap: https://siteniz.com/sitemap.xml" satırlarını ekleyin.',
    }
  }
  if (robotsBlocksAI) {
    return {
      score: 0, grade: 'F', label: 'Engelliyor', detail: 'AI botlar robots.txt ile engellendi.',
      recommendation: 'robots.txt\'teki GPTBot, ClaudeBot, PerplexityBot için Disallow kurallarını kaldırın ya da "Allow: /" ekleyin. Aksi hâlde AI arama motorları sitenizi indexleyemez.',
    }
  }

  let score = 60
  const details: string[] = ['mevcut']
  const missing: string[] = []

  if (robotsContent) {
    if (/Sitemap:/i.test(robotsContent)) { score += 10; details.push('sitemap referansı') }
    else missing.push('Sitemap referansı')
    const agentCount = (robotsContent.match(/^User-agent:/gim) ?? []).length
    if (agentCount >= 2) { score += 20; details.push(`${agentCount} ajan kuralı`) }
    else missing.push('birden fazla User-agent kuralı')
  }

  score = Math.min(score, 100)
  const grade = toGrade(score)
  const recommendation = missing.length > 0
    ? `Eklemeler yaparak skoru artırın: ${missing.join(', ')}.`
    : undefined

  return { score, grade, label: toLabel(grade), detail: details.join(', '), recommendation }
}

export function scoreAiBotAccess(
  robotsBlocksAI: boolean,
  hasRobotsTxt: boolean,
  allowedBots?: string[]
): QualityScore {
  if (robotsBlocksAI) {
    return {
      score: 0, grade: 'F', label: 'Engelli', detail: 'AI botlar erişemiyor.',
      recommendation: 'robots.txt\'ten AI bot Disallow kurallarını kaldırın. GPTBot, ClaudeBot, PerplexityBot ve OAI-SearchBot için "Allow: /" ekleyin.',
    }
  }
  if (!hasRobotsTxt) {
    return {
      score: 50, grade: 'C', label: 'Varsayılan', detail: 'robots.txt yok, botlar varsayılan olarak serbest.',
      recommendation: 'robots.txt oluşturun ve şu kuralları ekleyin:\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /',
    }
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

  const missingBots = AI_BOTS.filter(b => !allowed.includes(b))
  const recommendation = missingBots.length > 0 && grade !== 'A'
    ? `robots.txt\'e şu botlar için explicit "Allow: /" ekleyin: ${missingBots.join(', ')}.`
    : undefined

  return { score, grade, label: toLabel(grade), detail, recommendation }
}

export function scoreSitemap(hasSitemap: boolean, urlCount?: number | null): QualityScore {
  if (!hasSitemap) {
    return {
      score: 0, grade: 'F', label: 'Yok', detail: 'Sitemap bulunamadı.',
      recommendation: 'sitemap.xml oluşturun ve robots.txt\'e "Sitemap: https://siteniz.com/sitemap.xml" satırını ekleyin. WordPress ve Next.js için otomatik sitemap eklentileri mevcuttur.',
    }
  }

  if (urlCount == null || urlCount === 0) {
    return {
      score: 60, grade: 'C', label: 'Mevcut', detail: 'Sitemap var, URL sayısı tespit edilemedi.',
      recommendation: 'Sitemap erişilebilir ancak URL\'ler okunamadı. sitemap.xml\'in kamuya açık ve geçerli XML formatında olduğunu doğrulayın.',
    }
  }

  let score: number
  if (urlCount >= 50) score = 100
  else if (urlCount >= 11) score = 85
  else score = 70

  const grade = toGrade(score)
  const recommendation = urlCount < 11
    ? `Sitemap\'te yalnızca ${urlCount} URL var. Tüm önemli sayfaları (ürün, hizmet, blog) sitemap\'e ekleyin.`
    : undefined

  return { score, grade, label: toLabel(grade), detail: `${urlCount} URL`, recommendation }
}

export function scoreHttps(httpsEnabled: boolean): QualityScore {
  if (!httpsEnabled) {
    return {
      score: 0, grade: 'F', label: 'HTTP', detail: 'HTTPS aktif değil.',
      recommendation: 'SSL sertifikası edinin (Let\'s Encrypt ücretsizdir) ve tüm HTTP trafiğini HTTPS\'e 301 yönlendirme ile aktarın.',
    }
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
