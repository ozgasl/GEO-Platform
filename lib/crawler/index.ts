import { chromium, type BrowserContext, type Page, type Response as PwResponse } from 'playwright'
import { parseStringPromise } from 'xml2js'
import crypto from 'crypto'
import { db } from '@/lib/db'
import type {
  PageSnapshot,
  PrioritizedUrl,
  CrawlResult,
  CrawlError,
  CrawlHealth,
  FaqBlock,
} from '@/lib/types'

const GPTBOT_UA = 'GPTBot/1.0 (+https://openai.com/gptbot)'
const MAX_URLS = 50
const CRAWL_TIMEOUT_MS = 15_000
const FETCH_TIMEOUT_MS = 10_000
// Burst'ü düşür: WP Engine/Cloudflare gibi rate-limiter'ları tetiklemeyelim (429 → boş sayfa).
const MAX_CONCURRENT_PAGES = 2

// --- Rate-limit dayanıklılığı (429/5xx) ---
// 429 yanıtı ANINDA döner (timeout değil); asıl risk her sayfanın Retry-After kadar beklemesi.
// Bu yüzden: Retry-After 5s ile sınırlı, en fazla 3 deneme, ve ardışık throttle'da devre kesici.
const MAX_FETCH_ATTEMPTS = 3
const RETRY_AFTER_CAP_S = 5
const POLITE_DELAY_MS = 250
// Bu kadar istek tüm denemelerini tükettiği hâlde hâlâ throttle'lıysa kalan sayfaları taramayı bırak.
const THROTTLE_CIRCUIT_THRESHOLD = 3
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function backoffMs(attempt: number): number {
  // Gerçek dünyada 429'lar genelde Retry-After'sız gelir (ör. WP Engine). Throttle penceresi
  // saniyeler sürer; kısa backoff yetmez. Sadece 429 görüldüğünde tetiklenir — sağlıklı siteyi yavaşlatmaz.
  return 2000 * 2 ** attempt // 2s, 4s, ...
}

/**
 * Retry-After başlığını milisaniyeye çevirir. Saniye veya HTTP-date formatını destekler.
 * RETRY_AFTER_CAP_S ile sınırlanır; geçersiz/yok ise null.
 */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) {
    return Math.min(parseInt(trimmed, 10), RETRY_AFTER_CAP_S) * 1000
  }
  const dateMs = Date.parse(trimmed)
  if (!Number.isNaN(dateMs)) {
    const deltaMs = dateMs - Date.now()
    if (deltaMs <= 0) return 0
    return Math.min(deltaMs, RETRY_AFTER_CAP_S * 1000)
  }
  return null
}

/** page.goto'yu 429/5xx durumunda Retry-After/backoff ile yeniden dener. */
async function gotoWithRetry(page: Page, url: string): Promise<PwResponse | null> {
  let lastResp: PwResponse | null = null
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    if (attempt === 0) await sleep(POLITE_DELAY_MS) // nazik gecikme — burst'ü dağıt
    lastResp = await page.goto(url, { timeout: CRAWL_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
    const status = lastResp?.status() ?? 0
    if (!lastResp || !RETRYABLE_STATUS.has(status)) return lastResp
    if (attempt < MAX_FETCH_ATTEMPTS - 1) {
      await sleep(parseRetryAfter(lastResp.headers()['retry-after']) ?? backoffMs(attempt))
    }
  }
  return lastResp
}

/** fetch'i 429/5xx durumunda Retry-After/backoff ile yeniden dener. Ağ hatası → null. */
async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response | null> {
  let lastRes: Response | null = null
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      lastRes = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers })
    } catch {
      return null // ağ hatası/timeout — yeniden denemeden çık
    }
    if (!RETRYABLE_STATUS.has(lastRes.status)) return lastRes
    if (attempt < MAX_FETCH_ATTEMPTS - 1) {
      await sleep(parseRetryAfter(lastRes.headers.get('retry-after')) ?? backoffMs(attempt))
    }
  }
  return lastRes
}

/** page.goto bir hata sayfası (non-2xx) döndürdüğünde içerik AYRIŞTIRILMAZ — bunun yerine bu hata fırlatılır. */
class CrawlStatusError extends Error {
  status: number
  constructor(url: string, status: number) {
    super(`HTTP ${status} — ${url}`)
    this.name = 'CrawlStatusError'
    this.status = status
  }
}

// AI bot user-agent'larını robots.txt'te engelleme tespiti için
const AI_BOT_PATTERNS = [
  { name: 'GPTBot', regex: /user-agent:\s*gptbot/i },
  { name: 'ClaudeBot', regex: /user-agent:\s*claudebot/i },
  { name: 'PerplexityBot', regex: /user-agent:\s*perplexitybot/i },
  { name: 'OAI-SearchBot', regex: /user-agent:\s*oai-searchbot/i },
]

// Yüksek öncelikli sayfa path pattern'leri
const HIGH_PRIORITY_PATTERNS = [
  /^\/$/,
  /^\/about/i,
  /^\/hakkimizda/i,
  /^\/products?/i,
  /^\/urunler?/i,
  /^\/services?/i,
  /^\/hizmetler?/i,
  /^\/pricing/i,
  /^\/fiyat/i,
  /^\/blog$/i,
]

// Tarama dışı bırakılacak path pattern'leri (düşük değer + gizlilik)
const SKIP_PATTERNS = [
  /^\/privacy/i,
  /^\/gizlilik/i,
  /^\/terms/i,
  /^\/kosullar/i,
  /^\/login/i,
  /^\/logout/i,
  /^\/register/i,
  /^\/signup/i,
  /^\/checkout/i,
  /^\/cart/i,
  /^\/sepet/i,
  /^\/wp-admin/i,
  /^\/wp-login/i,
  /^\/admin/i,
  /^\/dashboard/i,
  /^\/account/i,
  /^\/profile/i,
  /^\/_next/,
  /^\/api\//,
]

// robots.txt, llms.txt, sitemap gibi özel URL'ler sayfa olarak taranmaz
const SPECIAL_URL_SUFFIXES = [
  '/robots.txt',
  '/llms.txt',
  '/llms-full.txt',
  '/sitemap.xml',
  '/sitemap_index.xml',
]

// ----- Yardımcı fonksiyonlar -----

async function fetchText(url: string): Promise<{ ok: boolean; content: string | null; status: number | null }> {
  const res = await fetchWithRetry(url, { 'User-Agent': GPTBOT_UA })
  if (!res) return { ok: false, content: null, status: null } // ağ hatası → durum bilinmiyor
  if (!res.ok) return { ok: false, content: null, status: res.status }
  try {
    const content = await res.text()
    return { ok: true, content, status: res.status }
  } catch {
    return { ok: false, content: null, status: res.status }
  }
}

/**
 * Gerçek bir llms.txt mi yoksa soft-404 HTML sayfası mı?
 */
function isValidLlmsTxt(content: string | null): boolean {
  if (!content || content.trim().length === 0) return false
  const lower = content.slice(0, 500).toLowerCase()
  if (lower.includes('<!doctype') || lower.includes('<html')) return false
  return true
}

/**
 * robots.txt'den hangi AI botların açıkça izin verildiğini tespit eder.
 */
function parseAllowedBots(robotsContent: string): string[] {
  const AI_BOT_NAMES = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot']
  const allowed: string[] = []
  for (const bot of AI_BOT_NAMES) {
    const pattern = new RegExp(`User-agent:\\s*${bot}[\\s\\S]*?Allow:\\s*/`, 'i')
    if (pattern.test(robotsContent)) allowed.push(bot)
  }
  return allowed
}

const SITEMAP_MAX_DEPTH = 2
const SITEMAP_MAX_FETCHES = 10

/**
 * Sitemap veya sitemap index'inden gerçek sayfa URL sayısını döndürür.
 * <sitemapindex> tespit edilirse alt sitemapları fetch eder (max 2 seviye, max 10 fetch).
 * Her seviyede fetchText hatası görmezden gelinir — kısmi sonuç yanlış 0'dan iyidir.
 */
async function parseSitemapUrlCount(content: string | null): Promise<number> {
  if (!content) return 0
  let fetchBudget = SITEMAP_MAX_FETCHES

  async function countUrls(xml: string, depth: number): Promise<number> {
    if (!/<sitemapindex/i.test(xml)) {
      return (xml.match(/<loc>/gi) ?? []).length
    }
    if (depth >= SITEMAP_MAX_DEPTH) return 0

    const subUrls = (xml.match(/<loc>([^<]+)<\/loc>/gi) ?? [])
      .map(m => m.replace(/<\/?loc>/gi, '').trim())
      .filter(u => u.length > 0)
      .slice(0, fetchBudget)

    let total = 0
    for (const subUrl of subUrls) {
      if (fetchBudget <= 0) break
      fetchBudget--
      try {
        const { content: sub } = await fetchText(subUrl)
        if (sub) total += await countUrls(sub, depth + 1)
      } catch { /* alt sitemap alınamadı — sayabildiğimizi say */ }
    }
    return total
  }

  return countUrls(content, 0)
}

async function checkUrlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': GPTBOT_UA },
    })
    return res.ok
  } catch {
    return false
  }
}

function detectBlockedBots(robotsContent: string): string[] {
  const lines = robotsContent.split(/\r?\n/).map(l => l.trim())
  const blocked: string[] = []

  let currentAgents: string[] = []
  for (const line of lines) {
    if (/^user-agent:/i.test(line)) {
      currentAgents.push(line.replace(/^user-agent:\s*/i, '').trim())
    } else if (/^disallow:/i.test(line)) {
      const path = line.replace(/^disallow:\s*/i, '').trim()
      if (path === '/' || path === '') {
        for (const agent of currentAgents) {
          if (AI_BOT_PATTERNS.some(p => p.regex.test(`user-agent: ${agent}`))) {
            blocked.push(agent)
          }
        }
      }
      currentAgents = []
    } else if (line === '') {
      currentAgents = []
    }
  }

  return [...new Set(blocked)]
}

function contentHash(title: string, h1: string | null, wordCount: number): string {
  return crypto
    .createHash('sha256')
    .update(`${title}|${h1 ?? ''}|${wordCount}`)
    .digest('hex')
}

async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++
      results[i] = await tasks[i]()
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

// ----- Sitemap parse -----

async function parseSitemapUrls(sitemapContent: string): Promise<string[]> {
  try {
    const parsed = await parseStringPromise(sitemapContent, { explicitArray: false })
    const urls: string[] = []

    // Normal urlset
    if (parsed.urlset?.url) {
      const entries = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url]
      for (const entry of entries) {
        if (entry.loc) urls.push(typeof entry.loc === 'string' ? entry.loc : entry.loc._)
      }
    }

    // Sitemap index — alt sitemap'lerin loc'larını döndür (çağıran tarafından fetch edilecek)
    if (parsed.sitemapindex?.sitemap) {
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap]
      for (const sm of sitemaps) {
        if (sm.loc) urls.push(typeof sm.loc === 'string' ? sm.loc : sm.loc._)
      }
    }

    return urls
  } catch {
    return []
  }
}

// ----- Ana export fonksiyonlar -----

/**
 * Sitemap veya Playwright BFS ile sitenin URL haritasını çıkarır.
 * Her iki durumda da /robots.txt, /llms.txt, /llms-full.txt eklenir.
 * Maksimum 50 URL döndürür.
 */
export async function discoverUrls(baseUrl: string): Promise<string[]> {
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    console.error(`[discoverUrls] Geçersiz site URL'i: ${baseUrl}`)
    return []
  }
  const discovered = new Set<string>()

  // 1. Sitemap dene
  const sitemapUrl = `${base.origin}/sitemap.xml`
  const { ok: sitemapOk, content: sitemapContent } = await fetchText(sitemapUrl)

  if (sitemapOk && sitemapContent) {
    const rawUrls = await parseSitemapUrls(sitemapContent)

    // Sitemap index ise alt sitemap'leri fetch et
    if (rawUrls.some(u => u.endsWith('.xml'))) {
      for (const subSitemapUrl of rawUrls.filter(u => u.endsWith('.xml')).slice(0, 5)) {
        const { ok, content } = await fetchText(subSitemapUrl)
        if (ok && content) {
          const subUrls = await parseSitemapUrls(content)
          subUrls.filter(u => !u.endsWith('.xml')).forEach(u => discovered.add(u))
        }
      }
    } else {
      rawUrls.forEach(u => discovered.add(u))
    }
  }

  // 2. Sitemap yoksa Playwright BFS
  if (discovered.size === 0) {
    const bfsUrls = await discoverUrlsWithPlaywright(base.href, base.origin)
    bfsUrls.forEach(u => discovered.add(u))
  }

  // 3. Kritik URL'ler her zaman dahil — slice'dan önce ayrıca tutulur
  const pinned = [
    `${base.origin}/`,
    `${base.origin}/robots.txt`,
    `${base.origin}/llms.txt`,
    `${base.origin}/llms-full.txt`,
  ]
  pinned.forEach(u => discovered.add(u))

  // 4. Aynı domain filtresi + max 50 — ama pinned URL'ler kesilmez
  const rest = [...discovered]
    .filter(u => {
      try {
        return new URL(u).origin === base.origin && !pinned.includes(u)
      } catch {
        return false
      }
    })
    .slice(0, MAX_URLS - pinned.length)

  return [...pinned, ...rest]
}

async function discoverUrlsWithPlaywright(baseUrl: string, baseOrigin: string): Promise<string[]> {
  const visited = new Set<string>()
  const found = new Set<string>([baseUrl])
  const queue: Array<{ url: string; depth: number }> = [{ url: baseUrl, depth: 0 }]

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: GPTBOT_UA })

  try {
    while (queue.length > 0 && found.size < MAX_URLS - 3) {
      const item = queue.shift()
      if (!item) break
      const { url, depth } = item
      if (visited.has(url) || depth >= 3) continue
      visited.add(url)

      try {
        const page = await context.newPage()
        const response = await gotoWithRetry(page, url)
        // Hata sayfasından (429/5xx vb.) link çıkarma — bağlantı yoktur, keşfi yanıltır.
        if (!response || !response.ok()) {
          await page.close()
          continue
        }

        const links = await page.$$eval(
          'a[href]',
          (els, origin) =>
            els.flatMap(el => {
              try {
                const href = (el as HTMLAnchorElement).href
                const u = new URL(href)
                if (u.origin !== origin) return []
                // Fragment ve query parametrelerini temizle
                return [`${u.origin}${u.pathname}`]
              } catch {
                return []
              }
            }),
          baseOrigin
        )

        await page.close()

        for (const link of links) {
          if (!found.has(link)) {
            found.add(link)
            if (depth < 2) queue.push({ url: link, depth: depth + 1 })
          }
        }
      } catch {
        // Erişilemeyen sayfa — atla
      }
    }
  } finally {
    await browser.close()
  }

  return [...found]
}

/**
 * Her URL'e 1-3 arası öncelik skoru atar.
 * Priority 3 (düşük) URL'ler tarama dışında bırakılır.
 */
export function prioritizeUrls(urls: string[]): PrioritizedUrl[] {
  return urls.map(url => {
    let pathname: string
    try {
      pathname = new URL(url).pathname
    } catch {
      return { url, priority: 3 as const }
    }

    if (SKIP_PATTERNS.some(p => p.test(pathname))) {
      return { url, priority: 3 as const }
    }

    // Homepage her zaman en yüksek öncelik
    if (pathname === '/' || pathname === '') {
      return { url, priority: 1 as const }
    }

    if (HIGH_PRIORITY_PATTERNS.some(p => p.test(pathname))) {
      return { url, priority: 1 as const }
    }

    return { url, priority: 2 as const }
  })
}

/**
 * Tek bir sayfayı GPTBot kimliğiyle tarar ve içeriği çıkarır.
 * Standalone kullanım için kendi browser instance'ını oluşturur.
 */
export async function crawlPage(url: string): Promise<PageSnapshot> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: GPTBOT_UA })
  try {
    return await crawlPageWithContext(url, context)
  } finally {
    await browser.close()
  }
}

async function crawlPageWithContext(url: string, context: BrowserContext): Promise<PageSnapshot> {
  const page = await context.newPage()
  const startTime = Date.now()

  try {
    const response = await gotoWithRetry(page, url)
    const status = response?.status() ?? 0
    // KRİTİK: page.goto 429/5xx'te de normal döner. Hata sayfasını içerik sanıp ayrıştırma —
    // "5 kelime / sayfa yok" sahte raporlarının kök nedeni buydu.
    if (!response || !response.ok()) {
      throw new CrawlStatusError(url, status)
    }

    const [title, metaDescription, h1, h2Array, h3Array, jsonLdSchemas, faqBlocks, wordCount, hasInternalLinks] =
      await Promise.all([
        page.$eval('title', el => el.textContent?.trim() ?? '').catch(() => ''),

        page
          .$eval('meta[name="description"]', el => (el as HTMLMetaElement).content)
          .catch(() => null),

        page.$eval('h1', el => el.textContent?.trim() ?? null).catch(() => null),

        page.$$eval('h2', els => els.map(el => el.textContent?.trim() ?? '')).catch(() => []),

        page.$$eval('h3', els => els.map(el => el.textContent?.trim() ?? '')).catch(() => []),

        page
          .$$eval('script[type="application/ld+json"]', els =>
            els.flatMap(el => {
              try {
                return [JSON.parse(el.textContent ?? '')]
              } catch {
                return []
              }
            })
          )
          .catch(() => []),

        // FAQ içerik tespiti: <details>, akordeon class'ları, "?" ile biten paragraflar
        page
          .evaluate((): FaqBlock[] => {
            const items: FaqBlock[] = []

            // <details> + <summary> yapıları
            document.querySelectorAll('details').forEach(detail => {
              const summary = detail.querySelector('summary')
              const question = summary?.textContent?.trim()
              if (!question) return
              const answer = Array.from(detail.childNodes)
                .filter(n => n !== summary)
                .map(n => (n as Element).textContent?.trim() ?? '')
                .join(' ')
                .trim()
              items.push({ question, answer: answer || undefined })
            })

            // FAQ/akordeon class'ları
            document
              .querySelectorAll(
                '[class*="faq"] [class*="question"], [class*="accordion"] [class*="title"], [class*="faq-q"]'
              )
              .forEach(el => {
                const question = el.textContent?.trim()
                if (question && question.length < 300) items.push({ question })
              })

            // "?" ile biten paragraflar (kısa soru paragrafları)
            document.querySelectorAll('p').forEach(p => {
              const text = p.textContent?.trim()
              if (text?.endsWith('?') && text.length > 10 && text.length < 200) {
                items.push({ question: text })
              }
            })

            return items.slice(0, 20)
          })
          .catch(() => [] as FaqBlock[]),

        page
          .evaluate(() => {
            const text = document.body?.innerText ?? ''
            return text.split(/\s+/).filter(w => w.length > 0).length
          })
          .catch(() => 0),

        page
          .evaluate(
            origin =>
              document.querySelectorAll(
                `a[href^="/"], a[href^="${origin}"]`
              ).length > 0,
            new URL(url).origin
          )
          .catch(() => false),
      ])

    const loadTimeMs = Date.now() - startTime

    return {
      url,
      title,
      metaDescription,
      h1,
      h2Array,
      h3Array,
      jsonLdSchemas,
      faqBlocks,
      wordCount,
      hasInternalLinks,
      loadTimeMs,
      httpStatus: status,
      contentHash: contentHash(title, h1, wordCount),
    }
  } finally {
    await page.close()
  }
}

/**
 * Tüm süreci orkestre eden ana fonksiyon.
 * Siteyi tarar, Snapshot olarak DB'ye kaydeder, CrawlResult döndürür.
 */
export async function crawlSite(siteId: string): Promise<CrawlResult> {
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } })

  const errors: CrawlError[] = []
  const pages: PageSnapshot[] = []

  // URL keşfi + önceliklendirme
  const allUrls = await discoverUrls(site.url).catch(err => {
    errors.push({ url: site.url, error: `URL keşfi başarısız: ${err.message}` })
    return [] as string[]
  })

  const prioritized = prioritizeUrls(allUrls)
  const urlsToCrawl = prioritized
    .filter(p => p.priority < 3)
    .filter(p => !SPECIAL_URL_SUFFIXES.some(s => p.url.endsWith(s)))
    .map(p => p.url)

  // Robots.txt, llms.txt ve sitemap kontrolü — Playwright yerine basit fetch.
  // Sıralı (paralel değil): aynı origin'e aynı anda istek yağdırıp 429 tetiklemeyelim.
  const base = new URL(site.url)
  const robotsResult = await fetchText(`${base.origin}/robots.txt`)
  const llmsResultRaw = await fetchText(`${base.origin}/llms.txt`)
  const sitemapResult = await fetchText(`${base.origin}/sitemap.xml`)

  const sitemapExists = sitemapResult.ok && !!sitemapResult.content

  // llms.txt doğrulaması: HTML sayfa döndüren soft-404'leri ele
  const llmsResult = {
    ok: llmsResultRaw.ok && isValidLlmsTxt(llmsResultRaw.content),
    content: llmsResultRaw.ok && isValidLlmsTxt(llmsResultRaw.content) ? llmsResultRaw.content : null,
  }

  const blockedBots = robotsResult.content ? detectBlockedBots(robotsResult.content) : []
  const allowedBots = robotsResult.content ? parseAllowedBots(robotsResult.content) : []
  const robotsBlocksAI = blockedBots.length > 0
  const sitemapUrlCount = await parseSitemapUrlCount(sitemapResult.content)

  // Sayfa taraması — düşük eş zamanlılık + devre kesici.
  // Bir sayfa non-2xx dönerse CrawlStatusError fırlatılır; içerik OLARAK ayrıştırılmaz.
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: GPTBOT_UA })

  const failures: { url: string; status: number }[] = []
  let throttleCount = 0
  let circuitOpen = false

  try {
    const tasks = urlsToCrawl.map(url => async () => {
      if (circuitOpen) return null // site açıkça throttle ediyor — kalan sayfaları hammerlamayı bırak
      try {
        return await crawlPageWithContext(url, context)
      } catch (err) {
        const status = err instanceof CrawlStatusError ? err.status : 0
        failures.push({ url, status })
        if (RETRYABLE_STATUS.has(status)) {
          throttleCount++
          if (throttleCount >= THROTTLE_CIRCUIT_THRESHOLD) circuitOpen = true
        }
        errors.push({ url, error: err instanceof Error ? err.message : String(err) })
        return null
      }
    })

    const results = await withConcurrencyLimit(tasks, MAX_CONCURRENT_PAGES)
    pages.push(...results.filter((p): p is PageSnapshot => p !== null))
  } finally {
    await browser.close()
  }

  // Crawl sağlığı — "tarama başarısız" tespiti ve 429 teşhisi için
  const homepagePath = (u: string): boolean => {
    try { return new URL(u).pathname === '/' } catch { return false }
  }
  const homepagePage = pages.find(p => homepagePath(p.url))
  const homepageFailure = failures.find(f => homepagePath(f.url))
  const crawlHealth: CrawlHealth = {
    homepageStatus: homepagePage?.httpStatus ?? homepageFailure?.status ?? null,
    robotsStatus: robotsResult.status,
    sitemapStatus: sitemapResult.status,
    llmsStatus: llmsResultRaw.status,
    throttled: circuitOpen || throttleCount > 0,
    failures,
  }

  // Önceki snapshot'ı bul
  const previousSnapshot = await db.snapshot.findFirst({
    where: { siteId },
    orderBy: { crawledAt: 'desc' },
    select: { id: true },
  })

  // Snapshot'ı DB'ye kaydet
  const snapshot = await db.snapshot.create({
    data: {
      siteId,
      hasLlmsTxt: llmsResult.ok,
      llmsTxtContent: llmsResult.content,
      hasRobotsTxt: robotsResult.ok,
      robotsBlocksAI,
      hasSitemap: sitemapExists,
      httpsEnabled: site.url.startsWith('https://'),
      pages: pages as unknown as object[],
      technicalDetails: {
        robotsContent: robotsResult.content ?? null,
        blockedBots,
        allowedBots,
        sitemapUrlCount,
        crawl: crawlHealth as unknown as object,
      },
      previousSnapshotId: previousSnapshot?.id ?? null,
    },
  })

  await db.site.update({
    where: { id: siteId },
    data: { lastCrawledAt: new Date() },
  })

  return {
    siteId,
    snapshotId: snapshot.id,
    crawledAt: snapshot.crawledAt,
    pages,
    hasLlmsTxt: llmsResult.ok,
    llmsTxtContent: llmsResult.content,
    hasRobotsTxt: robotsResult.ok,
    robotsContent: robotsResult.content,
    robotsBlocksAI,
    blockedBots,
    hasSitemap: sitemapExists,
    httpsEnabled: site.url.startsWith('https://'),
    crawlHealth,
    errors,
  }
}
