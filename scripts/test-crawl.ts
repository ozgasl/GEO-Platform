/**
 * Gerçek site crawl test scripti
 *
 * Kullanım (yerel makinede, Playwright tarayıcı kurulu iken):
 *   DATABASE_URL="postgresql://..." npx tsx scripts/test-crawl.ts https://www.gstptractor.com
 *
 * Gereksinimler:
 *   1. npx playwright install chromium
 *   2. DATABASE_URL gerekmez (script DB'ye yazmıyor)
 *   3. Anthropic API anahtarı (LLM analizi için, opsiyonel)
 */

import { discoverUrls, prioritizeUrls, crawlPage } from '../lib/crawler/index'
import { runAllRules } from '../lib/analyzer/rules'
import { analyzePageContent } from '../lib/analyzer/llm'
import type { SnapshotData, PageSnapshot } from '../lib/types'
import crypto from 'crypto'

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`

const SEVERITY_COLOR: Record<string, (s: string) => string> = {
  CRITICAL: red,
  HIGH: (s) => `\x1b[91m${s}\x1b[0m`,
  MEDIUM: yellow,
  LOW: dim,
}

async function main() {
  const targetUrl = process.argv[2]
  if (!targetUrl) {
    console.error('Kullanım: npx tsx scripts/test-crawl.ts <URL>')
    console.error('Örnek:    npx tsx scripts/test-crawl.ts https://www.gstptractor.com')
    process.exit(1)
  }

  const base = new URL(targetUrl)
  console.log('\n' + bold(`🔍 GEO Platform — Site Analizi`))
  console.log(bold(`Hedef: ${base.origin}`))
  console.log('═'.repeat(60))

  // ── 1. URL Keşfi ──────────────────────────────────────────────
  console.log('\n' + bold('1. URL Keşfi'))
  console.log('─'.repeat(40))
  console.log(dim('Sitemap kontrol ediliyor...'))

  const startDiscover = Date.now()
  const allUrls = await discoverUrls(base.origin).catch(err => {
    console.error(red(`URL keşfi başarısız: ${err.message}`))
    return [base.origin]
  })
  console.log(green(`✓ ${allUrls.length} URL keşfedildi`) + dim(` (${Date.now() - startDiscover}ms)`))

  const prioritized = prioritizeUrls(allUrls)
  const high = prioritized.filter(p => p.priority === 1)
  const medium = prioritized.filter(p => p.priority === 2)
  const skip = prioritized.filter(p => p.priority === 3)

  console.log(dim(`  Yüksek öncelik (${high.length}): ${high.map(p => new URL(p.url).pathname || '/').join(', ')}`))
  console.log(dim(`  Orta öncelik  (${medium.length}): blog yazıları, özellik sayfaları vb.`))
  console.log(dim(`  Atlanacak     (${skip.length}): login, privacy, admin vb.`))

  // ── 2. Sayfa Tarama ───────────────────────────────────────────
  const urlsToCrawl = prioritized
    .filter(p => p.priority < 3)
    .filter(p => !['/robots.txt', '/llms.txt', '/llms-full.txt'].some(s => p.url.endsWith(s)))
    .map(p => p.url)
    .slice(0, 8) // Deneme için 8 sayfa yeterli

  console.log('\n' + bold(`2. Sayfa Tarama (${urlsToCrawl.length} sayfa)`))
  console.log('─'.repeat(40))

  const crawledPages: PageSnapshot[] = []
  const crawlErrors: { url: string; error: string }[] = []

  for (const url of urlsToCrawl) {
    const pathname = new URL(url).pathname || '/'
    process.stdout.write(dim(`  Tarıyor: ${pathname.slice(0, 40).padEnd(42)}`))
    const t = Date.now()
    const page = await crawlPage(url).catch(err => {
      crawlErrors.push({ url, error: err.message })
      return null
    })
    if (page) {
      crawledPages.push(page)
      process.stdout.write(green(`✓`) + dim(` ${Date.now() - t}ms | ${page.wordCount} kelime\n`))
    } else {
      process.stdout.write(red(`✗ hata\n`))
    }
  }

  // ── 3. Teknik Kontroller (robots, llms.txt, sitemap) ──────────
  const robotsRes = await fetch(`${base.origin}/robots.txt`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
  const robotsContent = robotsRes?.ok ? await robotsRes.text() : null

  const llmsRes = await fetch(`${base.origin}/llms.txt`, { signal: AbortSignal.timeout(8000) }).catch(() => null)
  const llmsTxtContent = llmsRes?.ok ? await llmsRes.text() : null

  const sitemapRes = await fetch(`${base.origin}/sitemap.xml`, { signal: AbortSignal.timeout(8000), method: 'HEAD' }).catch(() => null)

  // robots.txt'te AI bot engeli var mı?
  function detectBlockedBots(content: string): string[] {
    const blocked: string[] = []
    const bots = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot']
    for (const bot of bots) {
      const pattern = new RegExp(`User-agent:\\s*${bot}[\\s\\S]*?Disallow:\\s*\\/`, 'i')
      if (pattern.test(content)) blocked.push(bot)
    }
    return blocked
  }

  const blockedBots = robotsContent ? detectBlockedBots(robotsContent) : []

  console.log('\n' + bold('3. Teknik Durum'))
  console.log('─'.repeat(40))
  console.log(`  robots.txt:   ${robotsRes?.ok ? green('✓ Mevcut') : red('✗ Bulunamadı')}`)
  if (blockedBots.length > 0) {
    console.log(`  AI bot engeli: ${red('⚠ Engellenen: ' + blockedBots.join(', '))}`)
  }
  console.log(`  llms.txt:     ${llmsRes?.ok ? green('✓ Mevcut') : yellow('⚠ Eksik')}`)
  console.log(`  sitemap.xml:  ${sitemapRes?.ok ? green('✓ Mevcut') : yellow('⚠ Eksik')}`)
  console.log(`  HTTPS:        ${base.protocol === 'https:' ? green('✓ Aktif') : red('✗ HTTP!')}`)

  // ── 4. Kural Motoru ───────────────────────────────────────────
  const snapshotData: SnapshotData = {
    id: 'demo-snapshot',
    siteId: 'demo-site',
    crawledAt: new Date(),
    hasLlmsTxt: !!llmsRes?.ok,
    llmsTxtContent,
    hasRobotsTxt: !!robotsRes?.ok,
    robotsBlocksAI: blockedBots.length > 0,
    hasSitemap: !!sitemapRes?.ok,
    httpsEnabled: base.protocol === 'https:',
    pages: crawledPages,
    previousSnapshotId: null,
  }

  const ruleIssues = runAllRules(snapshotData)

  console.log('\n' + bold(`4. Kural Motoru — ${ruleIssues.length} Sorun/Fırsat`))
  console.log('─'.repeat(40))

  if (ruleIssues.length === 0) {
    console.log(green('  ✓ Kural kontrollerinde sorun bulunamadı'))
  } else {
    for (const issue of ruleIssues) {
      const colorFn = SEVERITY_COLOR[issue.severity] ?? dim
      console.log(`  ${colorFn(`[${issue.severity}]`)} ${issue.title}`)
      console.log(dim(`         ${issue.description.slice(0, 120)}${issue.description.length > 120 ? '...' : ''}`))
    }
  }

  // ── 5. LLM İçerik Analizi (opsiyonel) ────────────────────────
  console.log('\n' + bold('5. İçerik Analizi (LLM)'))
  console.log('─'.repeat(40))

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(yellow('  ⚠ ANTHROPIC_API_KEY bulunamadı — LLM analizi atlandı'))
    console.log(dim('  ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/test-crawl.ts <url>'))
  } else {
    const pagesToAnalyze = crawledPages.slice(0, 5)
    console.log(dim(`  ${pagesToAnalyze.length} sayfa analiz ediliyor...`))

    const contentResults = await analyzePageContent(pagesToAnalyze).catch(err => {
      console.log(red(`  LLM analiz hatası: ${err.message}`))
      return []
    })

    for (const r of contentResults) {
      const density = r.answerDensity
      const densityBar = '█'.repeat(Math.round(density)) + '░'.repeat(10 - Math.round(density))
      const densityColor = density >= 7 ? green : density >= 4 ? yellow : red
      console.log(`\n  ${cyan(new URL(r.url).pathname || '/')}`)
      console.log(`  Answer Density: ${densityColor(densityBar)} ${density}/10`)
      if (r.missingQuestions.length > 0) {
        console.log(dim(`  Yanıtsız sorular:`))
        r.missingQuestions.forEach(q => console.log(dim(`    • ${q}`)))
      }
      if (r.contentGap) {
        console.log(dim(`  İçerik fırsatı: ${r.contentGap}`))
      }
    }
  }

  // ── 6. GEO Sağlık Skoru ───────────────────────────────────────
  const criticalCount = ruleIssues.filter(i => i.severity === 'CRITICAL').length
  const highCount = ruleIssues.filter(i => i.severity === 'HIGH').length
  const hasSchema = crawledPages.some(p => p.jsonLdSchemas.length > 0)

  let score = 0
  if (criticalCount === 0) score += 40
  if (highCount === 0) score += 20
  if (llmsRes?.ok) score += 15
  if (hasSchema) score += 10
  // AI bot ziyareti bilgisi yoksa (monitoring snippet yok) +15 yok

  const scoreColor = score >= 75 ? green : score >= 50 ? yellow : red

  console.log('\n' + bold('6. GEO Sağlık Skoru'))
  console.log('─'.repeat(40))
  console.log(`  ${scoreColor(bold(`${score}/100`))}  ${score >= 75 ? '🟢 İyi' : score >= 50 ? '🟡 Orta' : '🔴 Kritik sorunlar var'}`)
  console.log(dim(`  (Monitoring snippet yoksa AI bot ziyareti +15 puanı kazanılamaz)`))

  // ── Özet ──────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log(bold('Özet'))
  console.log(`  Taranan sayfa:  ${crawledPages.length}  ${crawlErrors.length > 0 ? red(`(${crawlErrors.length} hata)`) : ''}`)
  console.log(`  Tespit edilen:  ${ruleIssues.length} sorun`)
  console.log(`  CRITICAL:       ${criticalCount > 0 ? red(String(criticalCount)) : green('0')}`)
  console.log(`  HIGH:           ${highCount > 0 ? yellow(String(highCount)) : green('0')}`)
  console.log(`  GEO Skoru:      ${scoreColor(String(score) + '/100')}`)
}

main().catch(err => {
  console.error(red('Kritik hata:'), err.message)
  process.exit(1)
})
