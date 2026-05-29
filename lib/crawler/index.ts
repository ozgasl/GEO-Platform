import { chromium, type BrowserContext } from 'playwright'
import { parseStringPromise } from 'xml2js'
import crypto from 'crypto'
import { db } from '@/lib/db'
import type {
  PageSnapshot,
  PrioritizedUrl,
  CrawlResult,
  CrawlError,
  FaqBlock,
} from '@/lib/types'

const GPTBOT_UA = 'GPTBot/1.0 (+https://openai.com/gptbot)'
const MAX_URLS = 50
const CRAWL_TIMEOUT_MS = 15_000
const FETCH_TIMEOUT_MS = 10_000
const MAX_CONCURRENT_PAGES = 3

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

async function fetchText(url: string): Promise<{ ok: boolean; content: string | null }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': GPTBOT_UA },
    })
    if (!res.ok) return { ok: false, content: null }
    const content = await res.text()
    return { ok: true, content }
  } catch {
    return { ok: false, content: null }
  }
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
  const lines = robotsContent.split('\n').map(l => l.trim())
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
  const base = new URL(baseUrl)
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

  // 3. Sabit eklemeler — homepage her zaman dahil edilmeli
  discovered.add(`${base.origin}/`)
  discovered.add(`${base.origin}/robots.txt`)
  discovered.add(`${base.origin}/llms.txt`)
  discovered.add(`${base.origin}/llms-full.txt`)

  // 4. Aynı domain'den çık, max 50 URL
  return [...discovered]
    .filter(u => {
      try {
        return new URL(u).origin === base.origin
      } catch {
        return false
      }
    })
    .slice(0, MAX_URLS)
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
        await page.goto(url, { timeout: CRAWL_TIMEOUT_MS, waitUntil: 'domcontentloaded' })

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
    await page.goto(url, { timeout: CRAWL_TIMEOUT_MS, waitUntil: 'domcontentloaded' })

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

  // Robots.txt, llms.txt ve sitemap kontrolü — Playwright yerine basit fetch
  const base = new URL(site.url)
  const [robotsResult, llmsResult, sitemapExists] = await Promise.all([
    fetchText(`${base.origin}/robots.txt`),
    fetchText(`${base.origin}/llms.txt`),
    checkUrlExists(`${base.origin}/sitemap.xml`),
  ])

  const blockedBots = robotsResult.content ? detectBlockedBots(robotsResult.content) : []
  const robotsBlocksAI = blockedBots.length > 0

  // Sayfa taraması — max 3 eş zamanlı
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ userAgent: GPTBOT_UA })

  try {
    const tasks = urlsToCrawl.map(url => async () => {
      const result = await crawlPageWithContext(url, context).catch(err => {
        errors.push({ url, error: err.message })
        return null
      })
      return result
    })

    const results = await withConcurrencyLimit(tasks, MAX_CONCURRENT_PAGES)
    pages.push(...results.filter((p): p is PageSnapshot => p !== null))
  } finally {
    await browser.close()
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
    errors,
  }
}
