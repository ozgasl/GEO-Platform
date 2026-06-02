// Tek bir sayfanın tarama sonucu
export interface PageSnapshot {
  url: string
  title: string
  metaDescription: string | null
  h1: string | null
  h2Array: string[]
  h3Array: string[]
  jsonLdSchemas: Record<string, unknown>[]
  faqBlocks: FaqBlock[]
  wordCount: number
  hasInternalLinks: boolean
  loadTimeMs: number
  // HTTP durum kodu (page.goto yanıtı). Yalnızca 2xx sayfalar pages[]'e girer; alan geriye dönük uyumluluk için opsiyonel.
  httpStatus?: number
  // SHA-256(title + h1 + wordCount) — değişmemiş sayfaları LLM analizinden muaf tutmak için
  contentHash: string
}

export interface FaqBlock {
  question: string
  answer?: string
}

// URL + öncelik skoru
export interface PrioritizedUrl {
  url: string
  priority: 1 | 2 | 3
}

// crawlSite() dönüş değeri
export interface CrawlResult {
  siteId: string
  snapshotId: string
  crawledAt: Date
  pages: PageSnapshot[]
  hasLlmsTxt: boolean
  llmsTxtContent: string | null
  hasRobotsTxt: boolean
  robotsContent: string | null
  robotsBlocksAI: boolean
  blockedBots: string[]
  hasSitemap: boolean
  httpsEnabled: boolean
  crawlHealth: CrawlHealth
  errors: CrawlError[]
}

export interface CrawlError {
  url: string
  error: string
}

// LLM içerik analizi çıktısı — sayfa başına
export interface ContentIssue {
  url: string
  answerDensity: number // 0-10: ilk 200 kelimede net, alıntılanabilir yanıt var mı?
  missingQuestions: string[]
  suggestedFaqItems: FaqBlock[]
  schemaRecommendation: { type: string; reason: string } | null
  contentGap: string | null
}

// Kural ve LLM motorlarının Issue oluşturmak için kullandığı girdi
export interface IssueInput {
  snapshotId: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'ROBOTS' | 'LLMS_TXT' | 'SCHEMA' | 'CONTENT' | 'TECHNICAL'
  title: string
  description: string
  impact: string
  actionType: 'AUTO_FIX' | 'CONTENT_SUGGESTION' | 'MANUAL_REQUIRED'
  actionPayload?: Record<string, unknown>
}

// Kural motoruna geçirilen zenginleştirilmiş snapshot
export interface SnapshotData {
  id: string
  siteId: string
  crawledAt: Date
  hasLlmsTxt: boolean
  llmsTxtContent: string | null
  hasRobotsTxt: boolean
  robotsBlocksAI: boolean
  hasSitemap: boolean
  httpsEnabled: boolean
  pages: PageSnapshot[]
  previousSnapshotId: string | null
  technicalDetails?: {
    robotsContent?: string | null
    allowedBots?: string[]
    blockedBots?: string[]
    sitemapUrlCount?: number | null
    // Crawl sağlığı — 429/5xx rate-limit teşhisi ve "tarama başarısız" tespiti için
    crawl?: CrawlHealth | null
  } | null
}

// Crawl sırasında toplanan HTTP durum bilgisi.
// homepageStatus 2xx değilse (veya hiç sayfa taranamadıysa) tarama "degenerate" sayılır.
// Probe status'ları (robots/sitemap/llms) 429/503/5xx ise "yok" yerine "bilinmiyor" demektir.
export interface CrawlHealth {
  homepageStatus: number | null
  robotsStatus: number | null
  sitemapStatus: number | null
  llmsStatus: number | null
  throttled: boolean
  failures: { url: string; status: number }[]
}
