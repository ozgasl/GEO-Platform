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
}
