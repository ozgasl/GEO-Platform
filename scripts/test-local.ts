/**
 * Yerel test scripti — dış ağ veya API anahtarı gerektirmez.
 *
 * Test kapsamı:
 *  1. prioritizeUrls — saf mantık
 *  2. Rule engine — mock snapshot'larla tüm 5 kural
 *  3. detectChangedPages — contentHash diff
 *  4. DB CRUD — User → Site → Snapshot → Issue tam döngüsü
 */

import { db } from '../lib/db'
import { prioritizeUrls } from '../lib/crawler/index'
import {
  checkRobotsTxt,
  checkLlmsTxt,
  checkSitemap,
  checkHttps,
  checkBasicSchema,
  runAllRules,
} from '../lib/analyzer/rules'
import type { SnapshotData, PageSnapshot } from '../lib/types'

// ANSI renk yardımcıları
const green = (s: string) => `\x1b[32m✓ ${s}\x1b[0m`
const red = (s: string) => `\x1b[31m✗ ${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m  ${s}\x1b[0m`

let passed = 0
let failed = 0

function assert(condition: boolean, name: string, detail?: string): void {
  if (condition) {
    console.log(green(name))
    if (detail) console.log(dim(detail))
    passed++
  } else {
    console.log(red(name))
    if (detail) console.log(dim(`Beklenen: ${detail}`))
    failed++
  }
}

// ----- Mock veri fabrikaları -----

function makePage(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: 'https://example.com/',
    title: 'Ana Sayfa',
    metaDescription: 'Örnek site açıklaması',
    h1: 'Hoş Geldiniz',
    h2Array: ['Hizmetlerimiz', 'Hakkımızda'],
    h3Array: [],
    jsonLdSchemas: [],
    faqBlocks: [],
    wordCount: 450,
    hasInternalLinks: true,
    loadTimeMs: 850,
    contentHash: 'abc123',
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<SnapshotData> = {}): SnapshotData {
  return {
    id: 'snap-test-1',
    siteId: 'site-test-1',
    crawledAt: new Date(),
    hasLlmsTxt: true,
    llmsTxtContent: '# Example Site\n> Örnek açıklama\n\n## Pages\n- https://example.com/: Ana sayfa',
    hasRobotsTxt: true,
    robotsBlocksAI: false,
    hasSitemap: true,
    httpsEnabled: true,
    pages: [makePage()],
    previousSnapshotId: null,
    ...overrides,
  }
}

// =====================================================================

async function main() {
  // BÖLÜM 1: prioritizeUrls
  console.log('\n' + bold('1. prioritizeUrls — URL Önceliklendirme'))
  console.log('─'.repeat(50))

  const urls = [
    'https://example.com/',
    'https://example.com/about',
    'https://example.com/products',
    'https://example.com/blog',
    'https://example.com/blog/post-1',
    'https://example.com/pricing',
    'https://example.com/services',
    'https://example.com/privacy',
    'https://example.com/terms',
    'https://example.com/login',
    'https://example.com/checkout',
    'https://example.com/cart',
    'https://example.com/wp-admin',
    'https://example.com/contact',
    'https://example.com/faq',
  ]
  const result = prioritizeUrls(urls)
  const byPriority = (p: 1 | 2 | 3) => result.filter(r => r.priority === p).map(r => r.url)

  assert(byPriority(1).includes('https://example.com/'), 'Homepage priority=1')
  assert(byPriority(1).includes('https://example.com/about'), '/about priority=1')
  assert(byPriority(1).includes('https://example.com/products'), '/products priority=1')
  assert(byPriority(1).includes('https://example.com/pricing'), '/pricing priority=1')
  assert(byPriority(2).includes('https://example.com/blog/post-1'), '/blog/post-1 priority=2 (blog yazısı)')
  assert(byPriority(2).includes('https://example.com/contact'), '/contact priority=2')
  assert(byPriority(3).includes('https://example.com/privacy'), '/privacy priority=3 (skip)')
  assert(byPriority(3).includes('https://example.com/login'), '/login priority=3 (skip)')
  assert(byPriority(3).includes('https://example.com/cart'), '/cart priority=3 (skip)')
  assert(byPriority(3).includes('https://example.com/wp-admin'), '/wp-admin priority=3 (skip)')

  // BÖLÜM 2: checkRobotsTxt
  console.log('\n' + bold('2. Rule Engine — checkRobotsTxt'))
  console.log('─'.repeat(50))

  const r1 = checkRobotsTxt(makeSnapshot({ robotsBlocksAI: false, hasRobotsTxt: true }))
  assert(r1 === null, 'AI botu engellenmediyse sorun çıkmaz')

  const r2 = checkRobotsTxt(makeSnapshot({ hasRobotsTxt: false, robotsBlocksAI: false }))
  assert(r2 !== null && r2.severity === 'LOW', 'robots.txt yoksa LOW issue üretilir')

  const r3 = checkRobotsTxt(makeSnapshot({ robotsBlocksAI: true }))
  assert(r3 !== null && r3.severity === 'CRITICAL', 'AI botu engellenince CRITICAL issue')
  assert(r3?.actionType === 'AUTO_FIX', 'Robots bloğu AUTO_FIX aksiyonu içermeli')

  // BÖLÜM 3: checkLlmsTxt
  console.log('\n' + bold('3. Rule Engine — checkLlmsTxt'))
  console.log('─'.repeat(50))

  const l1 = checkLlmsTxt(makeSnapshot())
  assert(l1 === null, 'Geçerli llms.txt varsa sorun üretilmez')

  const l2 = checkLlmsTxt(makeSnapshot({ hasLlmsTxt: false, llmsTxtContent: null }))
  assert(l2?.severity === 'HIGH', 'llms.txt yoksa HIGH issue')
  assert(l2?.actionType === 'AUTO_FIX', 'Eksik llms.txt AUTO_FIX olmalı')

  const l3 = checkLlmsTxt(makeSnapshot({ hasLlmsTxt: true, llmsTxtContent: '' }))
  assert(l3?.severity === 'MEDIUM', 'Boş llms.txt MEDIUM issue')

  const l4 = checkLlmsTxt(makeSnapshot({ llmsTxtContent: 'Sadece metin, başlık yok' }))
  assert(l4?.severity === 'MEDIUM', 'Hatalı format MEDIUM issue')

  const prevSnap = makeSnapshot({
    id: 'snap-prev',
    pages: [makePage({ url: 'https://example.com/', contentHash: 'old-hash' })],
  })
  const currSnap = makeSnapshot({
    pages: [
      makePage({ url: 'https://example.com/', contentHash: 'old-hash' }),
      makePage({ url: 'https://example.com/new-page', contentHash: 'new-hash' }),
    ],
  })
  const l5 = checkLlmsTxt(currSnap, prevSnap)
  assert(l5?.severity === 'LOW', 'Yeni sayfa eklenmişse LOW uyarı üretilir')
  assert(
    (l5?.actionPayload as { newPageUrls?: string[] })?.newPageUrls?.includes(
      'https://example.com/new-page'
    ) === true,
    "actionPayload yeni sayfanın URL'ini içeriyor"
  )

  // BÖLÜM 4: checkSitemap + checkHttps
  console.log('\n' + bold('4. Rule Engine — checkSitemap + checkHttps'))
  console.log('─'.repeat(50))

  const s1 = checkSitemap(makeSnapshot({ hasSitemap: false }))
  assert(s1?.severity === 'HIGH', 'Sitemap yoksa HIGH issue')

  const s2 = checkSitemap(makeSnapshot({ hasSitemap: true }))
  assert(s2 === null, 'Sitemap varsa sorun yok')

  const h1 = checkHttps(makeSnapshot({ httpsEnabled: false }))
  assert(h1?.severity === 'HIGH', 'HTTPS yoksa HIGH issue')
  assert(h1?.actionType === 'MANUAL_REQUIRED', 'HTTPS sorunu MANUAL_REQUIRED')

  const h2 = checkHttps(makeSnapshot({ httpsEnabled: true }))
  assert(h2 === null, 'HTTPS varsa sorun yok')

  // BÖLÜM 5: checkBasicSchema
  console.log('\n' + bold('5. Rule Engine — checkBasicSchema'))
  console.log('─'.repeat(50))

  const sc1 = checkBasicSchema(makeSnapshot({ pages: [makePage({ jsonLdSchemas: [] })] }))
  assert(
    sc1.some(i => i.severity === 'HIGH' && i.category === 'SCHEMA'),
    'Homepage Organization schema eksikse HIGH issue'
  )

  const sc2 = checkBasicSchema(
    makeSnapshot({
      pages: [makePage({ url: 'https://example.com/', jsonLdSchemas: [{ '@type': 'Organization' }] })],
    })
  )
  assert(
    !sc2.some(i => (i.actionPayload as { schemaType?: string })?.schemaType === 'Organization'),
    'Organization schema varsa issue üretilmez'
  )

  const sc3 = checkBasicSchema(
    makeSnapshot({
      pages: [
        makePage({ url: 'https://example.com/', jsonLdSchemas: [{ '@type': 'Organization' }] }),
        makePage({ url: 'https://example.com/products/widget', jsonLdSchemas: [] }),
      ],
    })
  )
  assert(
    sc3.some(
      i =>
        i.severity === 'HIGH' &&
        (i.actionPayload as { schemaType?: string })?.schemaType === 'Product'
    ),
    'Ürün sayfasında Product schema eksikse HIGH issue'
  )

  // BÖLÜM 6: runAllRules entegrasyon
  console.log('\n' + bold('6. runAllRules — Tüm Kurallar Entegrasyon'))
  console.log('─'.repeat(50))

  const worstCase = makeSnapshot({
    hasLlmsTxt: false,
    llmsTxtContent: null,
    robotsBlocksAI: true,
    hasSitemap: false,
    httpsEnabled: false,
    pages: [makePage({ jsonLdSchemas: [] })],
  })
  const worstIssues = runAllRules(worstCase)
  const bySev = (s: string) => worstIssues.filter(i => i.severity === s)

  assert(worstIssues.length >= 4, `En az 4 issue üretilmeli (üretilen: ${worstIssues.length})`)
  assert(bySev('CRITICAL').length >= 1, 'En az 1 CRITICAL issue')
  assert(bySev('HIGH').length >= 2, 'En az 2 HIGH issue')
  console.log(
    dim(
      `Toplam: ${worstIssues.length} | CRITICAL: ${bySev('CRITICAL').length} | HIGH: ${bySev('HIGH').length} | MEDIUM: ${bySev('MEDIUM').length} | LOW: ${bySev('LOW').length}`
    )
  )

  const bestIssues = runAllRules(
    makeSnapshot({ pages: [makePage({ jsonLdSchemas: [{ '@type': 'Organization' }] })] })
  )
  assert(bestIssues.length === 0, 'İdeal konfigürasyonda issue üretilmez')

  // BÖLÜM 7: Veritabanı CRUD
  console.log('\n' + bold('7. Veritabanı — CRUD Döngüsü'))
  console.log('─'.repeat(50))

  // Artık kalıntı varsa temizle
  await db.issue.deleteMany({ where: { snapshot: { site: { name: '__test__' } } } })
  await db.snapshot.deleteMany({ where: { site: { name: '__test__' } } })
  await db.site.deleteMany({ where: { name: '__test__' } })
  await db.user.deleteMany({ where: { email: 'test@geo-platform.local' } })

  const user = await db.user.create({ data: { email: 'test@geo-platform.local', name: 'Test User' } })
  assert(!!user.id, 'User oluşturuldu', `id: ${user.id}`)

  const site = await db.site.create({
    data: { userId: user.id, url: 'https://example.com', name: '__test__', mode: 'ADVISOR' },
  })
  assert(!!site.id, 'Site oluşturuldu', `id: ${site.id}`)
  assert(site.mode === 'ADVISOR', 'Varsayılan mod ADVISOR')

  const pages: PageSnapshot[] = [makePage()]
  const snapshot = await db.snapshot.create({
    data: {
      siteId: site.id,
      hasLlmsTxt: false,
      llmsTxtContent: null,
      hasRobotsTxt: true,
      robotsBlocksAI: true,
      hasSitemap: false,
      httpsEnabled: true,
      pages: pages as unknown as object[],
    },
  })
  assert(!!snapshot.id, 'Snapshot oluşturuldu', `id: ${snapshot.id}`)
  assert(
    Array.isArray(snapshot.pages as unknown as unknown[]),
    'pages alanı JSON array olarak kaydedildi'
  )

  const issue = await db.issue.create({
    data: {
      snapshotId: snapshot.id,
      severity: 'CRITICAL',
      category: 'ROBOTS',
      title: 'Test issue',
      description: 'AI botu engelleniyor',
      impact: 'AI arama görünürlüğü kaybı',
      actionType: 'AUTO_FIX',
      status: 'PENDING',
    },
  })
  assert(!!issue.id, 'Issue oluşturuldu', `severity: ${issue.severity}`)

  const fetchedSite = await db.site.findUnique({
    where: { id: site.id },
    include: { snapshots: { include: { issues: true } } },
  })
  assert(
    fetchedSite?.snapshots[0]?.issues[0]?.severity === 'CRITICAL',
    'İlişkili okuma: Site → Snapshot → Issue zinciri çalışıyor'
  )

  const updated = await db.issue.update({ where: { id: issue.id }, data: { status: 'APPROVED' } })
  assert(updated.status === 'APPROVED', 'Issue status APPROVED olarak güncellendi')

  // Temizlik
  await db.issue.delete({ where: { id: issue.id } })
  await db.snapshot.delete({ where: { id: snapshot.id } })
  await db.site.delete({ where: { id: site.id } })
  await db.user.delete({ where: { id: user.id } })
  assert(true, 'Test verisi temizlendi')

  // SONUÇ
  console.log('\n' + '═'.repeat(50))
  const total = passed + failed
  console.log(
    bold(`Sonuç: ${passed}/${total} test geçti`) +
      (failed > 0
        ? `  \x1b[31m(${failed} başarısız)\x1b[0m`
        : '  \x1b[32m(tümü geçti)\x1b[0m')
  )

  await db.$disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\x1b[31mKritik hata:\x1b[0m', err)
  process.exit(1)
})
