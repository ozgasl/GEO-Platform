import { t } from '@/lib/i18n'
import type { CrawlHealth, IssueInput } from '@/lib/types'

export interface QualityScore {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  label: string
  detail: string
  recommendation?: string
  // Probe throttle/timeout nedeniyle belirlenemedi (429/5xx/ağ hatası — kesin 404 değil).
  // true ise panel/tablo "Bilinmiyor — tarama eksik" gösterir, F/eksik DEĞİL.
  unknown?: boolean
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

/**
 * Tarama "degenerate" (geçersiz) mi? — TEK kaynak.
 * Ana sayfa 2xx ile alınamadıysa veya hiç sayfa taranamadıysa true.
 * Böyle bir taramadan içerik/şema/teknik "eksik" sonucu çıkarmak yanıltıcıdır;
 * rapor "tarama başarısız" olarak işaretlenir, sahte düşük skor üretilmez.
 */
export function isCrawlDegenerate(homepageStatus: number | null | undefined, pageCount: number): boolean {
  // Tek ve sağlam sinyal: hiç içerik sayfası alınamadıysa tarama geçersizdir (ör. ana sayfa 429 →
  // tek aday da düştü → 0 sayfa). Ana sayfa geçici 429 alıp BAŞKA sayfalar başarılıysa, kısmi ama
  // dürüst bir rapor üretmek "tarama başarısız" demekten iyidir. homepageStatus teşhis için tutulur.
  void homepageStatus
  return pageCount <= 0
}

/** HTTP durumunun "throttle/bilinmiyor" (429/5xx/ağ hatası) olup olmadığı — kesin 404 değil. */
export function isThrottledOrUnknownStatus(status: number | null | undefined): boolean {
  if (status == null) return true // ağ hatası → bilinmiyor
  return status === 429 || status >= 500
}

export type CrawlConfidenceLevel = 'OK' | 'PARTIAL' | 'FAILED'

export interface CrawlConfidence {
  level: CrawlConfidenceLevel
  // Panel/tablo gösterimi için — her probe ayrı; genel level'dan BAĞIMSIZ.
  // (Tek probe blip + yüksek kapsama → level OK kalır ama o probe satırı "bilinmiyor" görünür.)
  probeUnknown: { llms: boolean; robots: boolean; sitemap: boolean }
  crawledPages: number
  discoveredPages: number | null
  // Site AI bot UA'sını (GPTBot) HTTP 403 ile engelliyor (WAF/Cloudflare) — geçici değil.
  blocked: boolean
  reason: string | null // kısa TR banner metni (level !== OK iken)
}

/**
 * AI bot UA'sı sayfa erişiminde 403 ile engellendi mi? Ana sayfa 403 VEYA sayfa taramalarında
 * 403 = WAF/Cloudflare UA engeli. (Yalnızca korumalı tek bir probe yolu 403 dönerse — sayfalar
 * açıkken — bunu engel saymayız, yanlış pozitif olmasın.)
 */
function isAiBotBlocked(crawl: CrawlHealth | null | undefined): boolean {
  if (!crawl) return false
  if (crawl.homepageStatus === 403) return true
  return crawl.failures?.some(f => f.status === 403) ?? false
}

/**
 * Taramanın güven seviyesi — TÜM yüzeylerin (skor kartı, panel, rapor) okuduğu TEK sinyal.
 * FAILED: hiç sayfa yok. PARTIAL: ≥2 probe bilinmiyor VEYA ana sayfa güvenilmez VEYA sayfaların
 * >%50'si başarısız. Aksi hâlde OK. Tek probe blip + iyi kapsama → OK (panelde o probe yine "bilinmiyor").
 */
export function assessCrawlConfidence(
  crawl: CrawlHealth | null | undefined,
  pageCount: number
): CrawlConfidence {
  const probeUnknown = {
    llms: !!crawl && isThrottledOrUnknownStatus(crawl.llmsStatus),
    robots: !!crawl && isThrottledOrUnknownStatus(crawl.robotsStatus),
    sitemap: !!crawl && isThrottledOrUnknownStatus(crawl.sitemapStatus),
  }
  const discoveredPages = crawl?.discoveredCount ?? null
  const blocked = isAiBotBlocked(crawl)

  if (pageCount <= 0) {
    return {
      level: 'FAILED',
      probeUnknown,
      crawledPages: 0,
      discoveredPages,
      blocked,
      reason: blocked
        ? "Tarama tamamlanamadı — site AI bot'larını (GPTBot) engelliyor (HTTP 403). Muhtemelen bir WAF/Cloudflare bot kuralı; bu geçici bir hız sınırı DEĞİL, yeniden denemek çözmez."
        : 'Tarama tamamlanamadı — siteye erişilemedi (site geçici olarak erişimi sınırlamış olabilir).',
    }
  }

  const unknownProbeCount = Number(probeUnknown.llms) + Number(probeUnknown.robots) + Number(probeUnknown.sitemap)
  const homepageUnreliable =
    !!crawl && crawl.homepageStatus != null && (crawl.homepageStatus < 200 || crawl.homepageStatus >= 300)
  const failureCount = crawl?.failures?.length ?? 0
  const attempted = pageCount + failureCount
  const failRatio = attempted > 0 ? failureCount / attempted : 0

  const partial = unknownProbeCount >= 2 || homepageUnreliable || failRatio > 0.5

  if (partial) {
    const denom = discoveredPages ?? attempted
    return {
      level: 'PARTIAL',
      probeUnknown,
      crawledPages: pageCount,
      discoveredPages,
      blocked,
      reason: blocked
        ? `Kısmi tarama — site bazı isteklerde AI bot'larını (GPTBot) engelledi (HTTP 403, WAF/Cloudflare olabilir). ${pageCount}/${denom} sayfa tarandı; skor güvenilir değil.`
        : `Kısmi tarama — site erişimi sınırladı (ör. hız sınırı). ${pageCount}/${denom} sayfa tarandı; bazı teknik kontroller tamamlanamadı. Skor güvenilir değil.`,
    }
  }

  return { level: 'OK', probeUnknown, crawledPages: pageCount, discoveredPages, blocked, reason: null }
}

/**
 * Site AI bot UA'sını 403 ile engelliyorsa CRITICAL bir GEO bulgusu döndürür.
 * Tarama 0 sayfa ile başarısız olsa bile pipeline bunu kuyruğa ekler (analiz atlanır).
 */
export function detectAiBotBlock(crawl: CrawlHealth | null | undefined, snapshotId: string): IssueInput | null {
  if (!isAiBotBlocked(crawl)) return null
  return {
    snapshotId,
    severity: 'CRITICAL',
    category: 'ROBOTS',
    title: 'Site AI botlarını engelliyor (HTTP 403)',
    description:
      'Siteniz GPTBot gibi AI tarayıcılara HTTP 403 (erişim engellendi) döndürüyor — büyük olasılıkla bir WAF/Cloudflare bot yönetimi kuralı. AI motorları sitenizi tarayamıyor.',
    impact:
      'AI arama motorları (ChatGPT, Claude, Perplexity) sitenizi okuyamaz ve kaynak gösteremez. Bu, AI görünürlüğü için en kritik engeldir — robots.txt veya içerik iyileştirmeleri bu engel kalkmadan işe yaramaz.',
    actionType: 'MANUAL_REQUIRED',
    actionPayload: {
      instruction:
        "WAF/Cloudflare bot yönetiminde şu user-agent'lara erişim izni verin: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended. (Cloudflare: Security → Bots veya WAF custom rules → bu UA'ları allow listesine ekleyin.)",
    },
  }
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

/** Probe throttle/timeout nedeniyle belirlenemeyen kontrol için "Bilinmiyor" skoru. */
function unknownScore(): QualityScore {
  return {
    score: 0,            // unknown=true iken render katmanı görmezden gelir
    grade: 'F',          // unknown=true iken render katmanı görmezden gelir
    unknown: true,
    label: 'Bilinmiyor',
    detail: 'Tarama bu kontrolü tamamlayamadı — site erişimi sınırladı (ör. hız sınırı).',
  }
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
    crawl?: CrawlHealth | null
  } | null
  crawledPageCount?: number
}, locale: string = 'tr') {
  const td = snapshot.technicalDetails ?? {}
  // Probe throttle edildiyse (429/5xx/ağ hatası) "F/eksik" yerine "Bilinmiyor" göster.
  // crawl yoksa (legacy snapshot) eski davranış korunur. Kesin 404 → unknown DEĞİL → normal skor.
  const crawl = td.crawl ?? null
  const u = {
    llms: !!crawl && isThrottledOrUnknownStatus(crawl.llmsStatus),
    robots: !!crawl && isThrottledOrUnknownStatus(crawl.robotsStatus),
    sitemap: !!crawl && isThrottledOrUnknownStatus(crawl.sitemapStatus),
  }
  return {
    llmsTxt: u.llms ? unknownScore() : scoreLlmsTxt(snapshot.llmsTxtContent, snapshot.hasLlmsTxt, locale),
    robotsTxt: u.robots ? unknownScore() : scoreRobotsTxt(snapshot.hasRobotsTxt, snapshot.robotsBlocksAI, td.robotsContent, locale),
    aiBotAccess: u.robots ? unknownScore() : scoreAiBotAccess(snapshot.robotsBlocksAI, snapshot.hasRobotsTxt, td.allowedBots, locale),
    sitemap: u.sitemap ? unknownScore() : scoreSitemap(snapshot.hasSitemap, td.sitemapUrlCount, snapshot.crawledPageCount, locale),
    https: scoreHttps(snapshot.httpsEnabled, locale),
  }
}

export { AI_BOTS }
