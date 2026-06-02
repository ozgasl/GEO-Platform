/**
 * Yerel test scripti — dış ağ veya API anahtarı gerektirmez.
 *
 * Test kapsamı:
 *  1. prioritizeUrls — saf mantık
 *  2. Rule engine — mock snapshot'larla tüm 5 kural
 *  3. detectChangedPages — contentHash diff
 *  4. DB CRUD — User → Site → Snapshot → Issue tam döngüsü
 *  5. Action Engine — applyAction, queueActions, revertAction (DB gerektirir)
 */

import { db } from '../lib/db'
import { prioritizeUrls, parseRetryAfter } from '../lib/crawler/index'
import {
  checkRobotsTxt,
  checkLlmsTxt,
  checkSitemap,
  checkHttps,
  checkBasicSchema,
  runAllRules,
} from '../lib/analyzer/rules'
import { applyAction } from '../lib/actions/apply'
import { queueActions } from '../lib/actions/queue'
import { revertAction } from '../lib/actions/revert'
import { encryptSiteId, decryptToken, generateSnippet } from '../lib/monitoring/snippet'
import { detectBot, recordVisit } from '../lib/monitoring/tracker'
import { calculateGeoScore } from '../lib/reports/score'
import { isSitemapIncomplete, isCrawlDegenerate, isThrottledOrUnknownStatus, assessCrawlConfidence, computeTechnicalScores, detectAiBotBlock } from '../lib/analyzer/quality'
import type { CrawlHealth } from '../lib/types'
import { generateReport } from '../lib/reports/generator'
import { functions } from '../lib/inngest/functions'
import type { SnapshotData, PageSnapshot, IssueInput } from '../lib/types'

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
    technicalDetails: {
      robotsContent: 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml',
      allowedBots: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot'],
      blockedBots: [],
      sitemapUrlCount: 50,
    },
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

  // Mutual exclusivity: robots YOKSA yalnızca "absent" (LOW, CONTENT_SUGGESTION) üretilir — zayıf issue'a düşmez
  const r2 = checkRobotsTxt(makeSnapshot({ hasRobotsTxt: false, robotsBlocksAI: false, technicalDetails: { allowedBots: [] } }))
  assert(r2 !== null && r2.severity === 'LOW', 'robots.txt yoksa LOW issue üretilir')
  assert(r2?.actionType === 'CONTENT_SUGGESTION', 'robots.txt yoksa üretilen issue absent (CONTENT_SUGGESTION) tipidir, zayıf değil')

  const r3 = checkRobotsTxt(makeSnapshot({ robotsBlocksAI: true }))
  assert(r3 !== null && r3.severity === 'CRITICAL', 'AI botu engellenince CRITICAL issue')
  assert(r3?.actionType === 'AUTO_FIX', 'Robots bloğu AUTO_FIX aksiyonu içermeli')

  // robots var, engellemiyor ama YZ botlarına açık izin yok → MEDIUM iyileştirme
  const r4 = checkRobotsTxt(makeSnapshot({
    hasRobotsTxt: true, robotsBlocksAI: false,
    technicalDetails: { robotsContent: 'User-agent: *\nAllow: /', allowedBots: [], sitemapUrlCount: 50 },
  }))
  assert(r4 !== null && r4.severity === 'MEDIUM', 'Açık izin yoksa MEDIUM iyileştirme issue üretilir')
  assert(r4?.actionType === 'AUTO_FIX' && (r4.actionPayload as { fixType?: string })?.fixType === 'robots_allow_ai_bots',
    'Zayıf robots issue mevcut robots_allow_ai_bots fix tipini kullanır')

  // robots var, engellemiyor, açık izinler tam → issue yok (r1 + bu, strong path)
  const r5 = checkRobotsTxt(makeSnapshot({ hasRobotsTxt: true, robotsBlocksAI: false }))
  assert(r5 === null, 'YZ botlarına açık izinler tamsa issue üretilmez')

  // technicalDetails yoksa (legacy snapshot) bilinmeyen veriden ceza kesilmez
  const r6 = checkRobotsTxt(makeSnapshot({ hasRobotsTxt: true, robotsBlocksAI: false, technicalDetails: null }))
  assert(r6 === null, 'technicalDetails null ise zayıf-robots issue üretilmez')

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
  assert(s2 === null, 'Sitemap varsa (ve tamsa) sorun yok')

  // isSitemapIncomplete — tek kaynak yardımcı fonksiyonun birim testleri
  assert(isSitemapIncomplete(5, 47) === true, 'isSitemapIncomplete: 5 URL / 47 sayfa → eksik')
  assert(isSitemapIncomplete(50, 47) === false, 'isSitemapIncomplete: 50 URL / 47 sayfa → tam')
  assert(isSitemapIncomplete(5, 8) === false, 'isSitemapIncomplete: küçük site (8 sayfa) → eşik altı, eksik değil')
  assert(isSitemapIncomplete(0, 47) === false, 'isSitemapIncomplete: 0 URL (parse edilemeyen index) → ceza yok')
  assert(isSitemapIncomplete(null, 47) === false, 'isSitemapIncomplete: null URL → ceza yok')

  const manyPages = Array.from({ length: 12 }, (_, i) =>
    makePage({ url: `https://example.com/p${i}`, contentHash: `h${i}` }))

  // Sitemap var ama taranan sayfalardan az URL içeriyor → MEDIUM eksik issue
  const s3 = checkSitemap(makeSnapshot({
    hasSitemap: true, pages: manyPages,
    technicalDetails: { sitemapUrlCount: 5, allowedBots: [] },
  }))
  assert(s3 !== null && s3.severity === 'MEDIUM', 'Eksik sitemap (5 URL / 12 sayfa) → MEDIUM issue')
  assert(s3?.category === 'TECHNICAL' && s3.actionType === 'CONTENT_SUGGESTION',
    'Eksik sitemap issue TECHNICAL + CONTENT_SUGGESTION')

  // Sitemap taranan sayfalardan çok URL içeriyor → issue yok
  const s4 = checkSitemap(makeSnapshot({
    hasSitemap: true, pages: manyPages,
    technicalDetails: { sitemapUrlCount: 20, allowedBots: [] },
  }))
  assert(s4 === null, 'Sitemap taranan sayfa kadar/fazla URL içeriyorsa issue yok')

  // Çok küçük site (eşik altı) → eksik sayılmaz
  const s5 = checkSitemap(makeSnapshot({
    hasSitemap: true, pages: [makePage(), makePage({ url: 'https://example.com/x' })],
    technicalDetails: { sitemapUrlCount: 1, allowedBots: [] },
  }))
  assert(s5 === null, 'Küçük sitede (eşik altı) eksik sitemap issue üretilmez')

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

  // BÖLÜM 8: Action Engine
  console.log('\n' + bold('8. Action Engine — applyAction / queueActions / revertAction'))
  console.log('─'.repeat(50))

  // Temiz kullanıcı + site + snapshot oluştur
  await db.action.deleteMany({ where: { site: { name: '__test_action__' } } })
  await db.issue.deleteMany({ where: { snapshot: { site: { name: '__test_action__' } } } })
  await db.snapshot.deleteMany({ where: { site: { name: '__test_action__' } } })
  await db.site.deleteMany({ where: { name: '__test_action__' } })
  await db.user.deleteMany({ where: { email: 'action_test@geo-platform.local' } })

  const actUser = await db.user.create({
    data: { email: 'action_test@geo-platform.local', name: 'Action Test User' },
  })
  const actSite = await db.site.create({
    data: { userId: actUser.id, url: 'https://action-test.example.com', name: '__test_action__', mode: 'ADVISOR' },
  })
  const actPages: PageSnapshot[] = [makePage({ url: 'https://action-test.example.com/' })]
  const actSnapshot = await db.snapshot.create({
    data: {
      siteId: actSite.id,
      hasLlmsTxt: false,
      llmsTxtContent: null,
      hasRobotsTxt: true,
      robotsBlocksAI: false,
      hasSitemap: true,
      httpsEnabled: true,
      pages: actPages as unknown as object[],
    },
  })

  // 8a: queueActions — ADVISOR modunda AUTO_FIX otomatik uygulanmaz
  const issueInputs: IssueInput[] = [
    {
      snapshotId: actSnapshot.id,
      severity: 'HIGH',
      category: 'LLMS_TXT',
      title: 'llms.txt eksik',
      description: 'Sitenizde llms.txt bulunamadı.',
      impact: 'AI motorları sitenizi anlayamıyor.',
      actionType: 'AUTO_FIX',
      actionPayload: { fixType: 'generate_llms_txt' },
    },
  ]
  const queueResult = await queueActions(actSite.id, actSnapshot.id, issueInputs)
  assert(queueResult.queued === 1, 'queueActions: 1 issue kuyruğa eklendi')
  assert(queueResult.autoApplied === 0, 'ADVISOR modunda AUTO_FIX otomatik uygulanmaz')

  // DB'de PENDING durumunda mı?
  const pendingIssues = await db.issue.findMany({
    where: { snapshotId: actSnapshot.id, status: 'PENDING' },
  })
  assert(pendingIssues.length === 1, 'Issue PENDING durumunda kaydedildi')

  // 8b: applyAction — FAQ fix (DB/LLM gerektirmez, sadece payload işler)
  const faqIssue = await db.issue.create({
    data: {
      snapshotId: actSnapshot.id,
      severity: 'MEDIUM',
      category: 'CONTENT',
      title: 'SSS içeriği eksik',
      description: 'Sıkça sorulan sorular eklenmeli.',
      impact: 'İçerik zayıf.',
      actionType: 'CONTENT_SUGGESTION',
      status: 'PENDING',
      actionPayload: {
        suggestedFaqItems: [
          { question: 'Ürünleriniz neler?', answer: 'Traktör ve tarım ekipmanları.' },
          { question: 'Teslimat süresi nedir?', answer: '3-5 iş günü.' },
        ],
      },
    },
  })
  const applyResult = await applyAction(faqIssue.id, 'USER_APPROVED')
  assert(applyResult.success, 'applyAction: FAQ önerisi başarıyla uygulandı')
  assert(applyResult.changeType === 'faq_suggested', 'changeType doğru: faq_suggested')
  assert(applyResult.after.includes('Ürünleriniz neler?'), 'FAQ içeriği after alanında')
  assert(!applyResult.isReversible, 'FAQ önerisi geri alınamaz (isReversible: false)')

  const appliedIssue = await db.issue.findUniqueOrThrow({ where: { id: faqIssue.id } })
  assert(appliedIssue.status === 'APPLIED', 'Issue status → APPLIED güncellendi')

  const action = await db.action.findUniqueOrThrow({ where: { issueId: faqIssue.id } })
  assert(!!action.id, 'Action kaydı oluşturuldu')
  assert(action.appliedBy === 'USER_APPROVED', 'appliedBy: USER_APPROVED')

  // 8c: revertAction — isReversible=false olan aksiyon geri alınamaz
  try {
    await revertAction(action.id)
    assert(false, 'FAQ aksiyonu geri alınmamalıydı — hata bekleniyor')
  } catch (e) {
    assert(
      e instanceof Error && e.message.includes('geri alınamaz'),
      'isReversible=false için hata fırlatıldı'
    )
  }

  // 8d: revertAction — isReversible=true olan aksiyon geri alınabilir
  const revertableIssue = await db.issue.create({
    data: {
      snapshotId: actSnapshot.id,
      severity: 'CRITICAL',
      category: 'ROBOTS',
      title: 'Robots test',
      description: 'Test',
      impact: 'Test',
      actionType: 'AUTO_FIX',
      status: 'APPLIED',
    },
  })
  const revertableAction = await db.action.create({
    data: {
      siteId: actSite.id,
      issueId: revertableIssue.id,
      appliedBy: 'USER_APPROVED',
      changeType: 'robots_txt_updated',
      before: 'User-agent: *\nDisallow: /api/',
      after: 'User-agent: *\nDisallow: /api/\n\nUser-agent: GPTBot\nAllow: /',
      isReversible: true,
    },
  })
  const revertResult = await revertAction(revertableAction.id)
  assert(revertResult.success, 'revertAction: geri alma başarılı')
  assert(revertResult.restoredContent.includes('Disallow: /api/'), 'before içeriği geri yüklendi')

  const revertedIssue = await db.issue.findUniqueOrThrow({ where: { id: revertableIssue.id } })
  assert(revertedIssue.status === 'PENDING', 'Geri alınan issue → PENDING durumuna döndü')

  const revertedAction = await db.action.findUniqueOrThrow({ where: { id: revertableAction.id } })
  assert(!!revertedAction.reversedAt, 'Action.reversedAt güncellendi')

  // 8e: queueActions — PILOT modunda AUTO_FIX otomatik uygulanır
  await db.site.update({ where: { id: actSite.id }, data: { mode: 'PILOT' } })
  const pilotSnapshot = await db.snapshot.create({
    data: {
      siteId: actSite.id,
      hasLlmsTxt: false,
      llmsTxtContent: null,
      hasRobotsTxt: true,
      robotsBlocksAI: false,
      hasSitemap: true,
      httpsEnabled: true,
      pages: actPages as unknown as object[],
    },
  })
  const pilotIssues: IssueInput[] = [
    {
      snapshotId: pilotSnapshot.id,
      severity: 'MEDIUM',
      category: 'CONTENT',
      title: 'PILOT FAQ testi',
      description: 'Test',
      impact: 'Test',
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        suggestedFaqItems: [{ question: 'Pilot soru?', answer: 'Pilot cevap.' }],
      },
    },
  ]
  const pilotResult = await queueActions(actSite.id, pilotSnapshot.id, pilotIssues)
  assert(pilotResult.queued === 1, 'PILOT: 1 issue kuyruğa eklendi')
  assert(pilotResult.autoApplied === 0, 'CONTENT_SUGGESTION PILOT modunda otomatik uygulanmaz (sadece AUTO_FIX)')

  // Temizlik
  await db.action.deleteMany({ where: { siteId: actSite.id } })
  await db.issue.deleteMany({ where: { snapshot: { siteId: actSite.id } } })
  await db.snapshot.deleteMany({ where: { siteId: actSite.id } })
  await db.site.delete({ where: { id: actSite.id } })
  await db.user.delete({ where: { id: actUser.id } })
  assert(true, 'Action Engine test verisi temizlendi')

  // BÖLÜM 9: Monitoring Engine
  console.log('\n' + bold('9. Monitoring Engine — snippet / detectBot / recordVisit'))
  console.log('─'.repeat(50))

  // 9a: Token şifreleme / çözme
  const testSiteId = 'test_site_id_abc123'
  const token9 = encryptSiteId(testSiteId)
  assert(token9 !== testSiteId, 'encryptSiteId: token düz metin değil')
  assert(!token9.includes(testSiteId), 'encryptSiteId: siteId token içinde görünmüyor')
  const decoded9 = decryptToken(token9)
  assert(decoded9 === testSiteId, 'decryptToken: şifresi çözülmüş ID eşleşiyor')
  assert(decryptToken('invalid_garbage_token') === null, 'decryptToken: geçersiz token → null')

  // 9b: Snippet üretimi
  const snippet9 = generateSnippet(testSiteId, 'https://app.geo-platform.com')
  assert(snippet9.includes('/api/beacon'), 'Snippet beacon URL içeriyor')
  assert(snippet9.includes(token9), 'Snippet şifreli token içeriyor')
  assert(!snippet9.includes(testSiteId), 'Snippet düz siteId içermiyor')
  assert(snippet9.includes('<script>'), 'Snippet script etiketi içeriyor')

  // 9c: Bot tespiti
  assert(detectBot('Mozilla/5.0 GPTBot/1.0') === 'gptbot', 'GPTBot tespit edildi')
  assert(detectBot('ClaudeBot/1.0 (+https://www.anthropic.com/en/claude-bot)') === 'claudebot', 'ClaudeBot tespit edildi')
  assert(detectBot('Mozilla/5.0 PerplexityBot/1.0') === 'perplexitybot', 'PerplexityBot tespit edildi')
  assert(detectBot('OAI-SearchBot/1.0') === 'oai_searchbot', 'OAI-SearchBot tespit edildi')
  assert(detectBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120') === null, 'Normal tarayıcı → null')
  assert(detectBot('') === null, 'Boş UA → null')

  // 9d: recordVisit — DB'de sayaç artışı
  const monUser = await db.user.create({
    data: { email: 'monitoring_test@geo-platform.local', name: 'Monitor Test' },
  })
  const monSite = await db.site.create({
    data: { userId: monUser.id, url: 'https://monitor.example.com', name: '__test_monitor__', mode: 'ADVISOR' },
  })
  const monSnapshot = await db.snapshot.create({
    data: {
      siteId: monSite.id,
      hasLlmsTxt: false, hasRobotsTxt: true, robotsBlocksAI: false,
      hasSitemap: true, httpsEnabled: true,
      pages: [],
    },
  })

  const monToken = encryptSiteId(monSite.id)

  // GPTBot ziyareti kaydet
  const visit1 = await recordVisit(monToken, 'GPTBot/1.0 (+https://openai.com/gptbot)')
  assert(visit1.ok, 'recordVisit: GPTBot ziyareti kaydedildi')

  // Aynı bot tekrar ziyaret — sayaç artmalı
  await recordVisit(monToken, 'GPTBot/1.0')
  const snap9 = await db.snapshot.findUniqueOrThrow({ where: { id: monSnapshot.id } })
  const visits9 = snap9.aiCrawlerVisits as Record<string, number>
  assert(visits9['gptbot'] === 2, `GPTBot sayacı 2 olmalı (gerçek: ${visits9['gptbot']})`)

  // ClaudeBot ziyareti
  await recordVisit(monToken, 'ClaudeBot/1.0')
  const snap9b = await db.snapshot.findUniqueOrThrow({ where: { id: monSnapshot.id } })
  const visits9b = snap9b.aiCrawlerVisits as Record<string, number>
  assert(visits9b['claudebot'] === 1, 'ClaudeBot sayacı 1 olmalı')

  // Geçersiz token → ok: false
  const visitInvalid = await recordVisit('totally_invalid', 'GPTBot/1.0')
  assert(!visitInvalid.ok && visitInvalid.reason === 'invalid_token', 'Geçersiz token → {ok: false}')

  // Temizlik
  await db.snapshot.delete({ where: { id: monSnapshot.id } })
  await db.site.delete({ where: { id: monSite.id } })
  await db.user.delete({ where: { id: monUser.id } })
  assert(true, 'Monitoring test verisi temizlendi')

  // BÖLÜM 10: Report Engine
  console.log('\n' + bold('10. Report Engine — calculateGeoScore / generateReport'))
  console.log('─'.repeat(50))

  // 10a: calculateGeoScore — saf fonksiyon, DB gerektirmez
  const perfectSnapshot: SnapshotData = makeSnapshot({
    hasLlmsTxt: true,
    llmsTxtContent: '# Test\n> Desc\n\n## Pages\n- /: Ana sayfa',
    hasRobotsTxt: true,
    robotsBlocksAI: false,
    hasSitemap: true,
    httpsEnabled: true,
    pages: [makePage({ jsonLdSchemas: [{ '@type': 'Organization' }] })],
  })
  const perfectScore = calculateGeoScore(perfectSnapshot, [])
  assert(perfectScore.total === 100, `Sorunsuz site → 100 puan (gerçek: ${perfectScore.total})`)
  assert(perfectScore.grade === 'A', `100 puan → A notu (gerçek: ${perfectScore.grade})`)

  // CRITICAL issue cezası
  const critIssue = { severity: 'CRITICAL', category: 'ROBOTS', status: 'PENDING' } as Parameters<typeof calculateGeoScore>[1][0]
  const critScore = calculateGeoScore(perfectSnapshot, [critIssue])
  assert(critScore.total <= 75, `CRITICAL issue → 25 puan düşüş (gerçek: ${critScore.total})`)

  // Tüm sorunlar DISMISSED ise ceza uygulanmaz
  const dismissedIssue = { ...critIssue, status: 'DISMISSED' } as Parameters<typeof calculateGeoScore>[1][0]
  const dismissedScore = calculateGeoScore(perfectSnapshot, [dismissedIssue])
  assert(dismissedScore.total === 100, `DISMISSED issue ceza uygulamaz (gerçek: ${dismissedScore.total})`)

  // F notu
  const badSnapshot: SnapshotData = makeSnapshot({ hasLlmsTxt: false, robotsBlocksAI: true, hasSitemap: false })
  const manyIssues = [
    { severity: 'CRITICAL', category: 'ROBOTS', status: 'PENDING' },
    { severity: 'HIGH', category: 'LLMS_TXT', status: 'PENDING' },
    { severity: 'HIGH', category: 'SCHEMA', status: 'PENDING' },
    { severity: 'HIGH', category: 'CONTENT', status: 'PENDING' },
  ] as Parameters<typeof calculateGeoScore>[1]
  const badScore = calculateGeoScore(badSnapshot, manyIssues)
  assert(badScore.total <= 45, `Kötü site → düşük puan (gerçek: ${badScore.total})`)
  assert(['D', 'F'].includes(badScore.grade), `Düşük puan → D veya F notu (gerçek: ${badScore.grade})`)
  assert(badScore.summary.length > 10, 'Summary boş değil')

  // 10b: generateReport — DB gerektirir
  const repUser = await db.user.create({
    data: { email: 'report_test@geo-platform.local', name: 'Report Test' },
  })
  const repSite = await db.site.create({
    data: { userId: repUser.id, url: 'https://report.example.com', name: '__test_report__', mode: 'ADVISOR' },
  })
  const repSnapshot = await db.snapshot.create({
    data: {
      siteId: repSite.id,
      hasLlmsTxt: true,
      llmsTxtContent: '# Test\n> Desc\n\n## Pages\n- /: Ana',
      hasRobotsTxt: true, robotsBlocksAI: false,
      hasSitemap: true, httpsEnabled: true,
      pages: [makePage()] as unknown as object[],
    },
  })
  await db.issue.create({
    data: {
      snapshotId: repSnapshot.id,
      severity: 'HIGH', category: 'SCHEMA',
      title: 'Schema eksik', description: 'Test', impact: 'Test',
      actionType: 'AUTO_FIX', status: 'PENDING',
    },
  })

  const reportResult = await generateReport(repSite.id)
  assert(typeof reportResult.score === 'number' && reportResult.score >= 0 && reportResult.score <= 100,
    `generateReport: geçerli skor döndü (${reportResult.score}/100)`)
  assert(['A','B','C','D','F'].includes(reportResult.grade ?? ''), `Geçerli not: ${reportResult.grade}`)
  assert(reportResult.issuesFound === 1, 'issuesFound doğru sayıldı')
  assert(reportResult.topIssues.length === 1, 'topIssues listesi dolu')
  assert(reportResult.topIssues[0].severity === 'HIGH', 'En ağır issue listede')
  assert(!!reportResult.period.match(/^\d{4}-W\d{2}$/), `period formatı doğru: ${reportResult.period}`)

  // DB'de Report kaydı oluştu mu?
  const dbReport = await db.report.findUnique({ where: { id: reportResult.reportId } })
  assert(!!dbReport, 'generateReport: DB\'ye Report kaydı yazıldı')
  assert(dbReport!.issuesFound === 1, 'DB Report.issuesFound doğru')

  // Temizlik
  await db.report.delete({ where: { id: reportResult.reportId } })
  await db.issue.deleteMany({ where: { snapshotId: repSnapshot.id } })
  await db.snapshot.delete({ where: { id: repSnapshot.id } })
  await db.site.delete({ where: { id: repSite.id } })
  await db.user.delete({ where: { id: repUser.id } })
  assert(true, 'Report Engine test verisi temizlendi')

  // BÖLÜM 11: Inngest Jobs — config doğrulama
  console.log('\n' + bold('11. Inngest Jobs — fonksiyon config doğrulama'))
  console.log('─'.repeat(50))

  assert(functions.length === 4, `4 Inngest fonksiyonu tanımlı (gerçek: ${functions.length})`)

  // Inngest'te id() bir method'dur
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fnIds = functions.map((f: any) => f.id() as string)
  assert(fnIds.includes('crawl-site'), 'crawl-site fonksiyonu mevcut')
  assert(fnIds.includes('scheduled-crawl'), 'scheduled-crawl (cron) fonksiyonu mevcut')
  assert(fnIds.includes('weekly-report'), 'weekly-report (cron) fonksiyonu mevcut')
  assert(fnIds.includes('generate-report'), 'generate-report fonksiyonu mevcut')

  assert(true, 'Inngest fonksiyonları import edilip yapılandırıldı (gerçek çalışma Inngest Dev Server gerektirir)')

  // BÖLÜM 12: Crawl Robustness — 429 / rate-limit dayanıklılığı
  console.log('\n' + bold('12. Crawl Robustness — parseRetryAfter / degenerate / throttle guard'))
  console.log('─'.repeat(50))

  // 12a: parseRetryAfter
  assert(parseRetryAfter('3') === 3000, 'parseRetryAfter: "3" → 3000ms')
  assert(parseRetryAfter('100') === 5000, 'parseRetryAfter: "100" → 5000ms (cap 5s)')
  assert(parseRetryAfter(null) === null, 'parseRetryAfter: null → null')
  assert(parseRetryAfter('garbage') === null, 'parseRetryAfter: geçersiz → null')
  const futureDate = new Date(Date.now() + 2000).toUTCString()
  const raDate = parseRetryAfter(futureDate)
  assert(raDate !== null && raDate <= 5000 && raDate > 0, `parseRetryAfter: HTTP-date → ${raDate}ms (0–5000 arası)`)

  // 12b: isThrottledOrUnknownStatus
  assert(isThrottledOrUnknownStatus(429) === true, 'isThrottledOrUnknown: 429 → true')
  assert(isThrottledOrUnknownStatus(503) === true, 'isThrottledOrUnknown: 503 → true')
  assert(isThrottledOrUnknownStatus(null) === true, 'isThrottledOrUnknown: null (ağ hatası) → true')
  assert(isThrottledOrUnknownStatus(404) === false, 'isThrottledOrUnknown: 404 (kesin yok) → false')
  assert(isThrottledOrUnknownStatus(200) === false, 'isThrottledOrUnknown: 200 → false')

  // 12c: isCrawlDegenerate
  assert(isCrawlDegenerate(429, 0) === true, 'isCrawlDegenerate: 429 / 0 sayfa → true (stradiji vakası)')
  assert(isCrawlDegenerate(200, 5) === false, 'isCrawlDegenerate: 200 / 5 sayfa → false')
  assert(isCrawlDegenerate(200, 0) === true, 'isCrawlDegenerate: 0 sayfa → true (durumdan bağımsız)')
  assert(isCrawlDegenerate(null, 3) === false, 'isCrawlDegenerate: durum yok ama sayfa var (legacy) → false')
  assert(isCrawlDegenerate(429, 2) === false, 'isCrawlDegenerate: ana sayfa 429 ama 2 sayfa alındı → false (kısmi dürüst rapor)')

  // 12d: A5 — throttle'lı probe sahte "eksik" issue üretmemeli
  const throttledCrawl = { homepageStatus: 200, robotsStatus: 429, sitemapStatus: 429, llmsStatus: 429, throttled: true, failures: [] }
  const cleanCrawl = { homepageStatus: 200, robotsStatus: 404, sitemapStatus: 404, llmsStatus: 404, throttled: false, failures: [] }

  const sm429 = checkSitemap(makeSnapshot({ hasSitemap: false, technicalDetails: { sitemapUrlCount: null, allowedBots: [], crawl: throttledCrawl } }))
  assert(sm429 === null, 'checkSitemap: sitemap probe 429 → sahte "eksik" issue üretilmez')
  const sm404 = checkSitemap(makeSnapshot({ hasSitemap: false, technicalDetails: { sitemapUrlCount: null, allowedBots: [], crawl: cleanCrawl } }))
  assert(sm404 !== null && sm404.severity === 'HIGH', 'checkSitemap: sitemap probe 404 → "eksik" issue üretilir')

  const rb429 = checkRobotsTxt(makeSnapshot({ hasRobotsTxt: false, robotsBlocksAI: false, technicalDetails: { allowedBots: [], crawl: throttledCrawl } }))
  assert(rb429 === null, 'checkRobotsTxt: robots probe 429 → sahte "yok" issue üretilmez')

  const lm429 = checkLlmsTxt(makeSnapshot({ hasLlmsTxt: false, llmsTxtContent: null, technicalDetails: { allowedBots: [], crawl: throttledCrawl } }))
  assert(lm429 === null, 'checkLlmsTxt: llms probe 429 → sahte "yok" issue üretilmez')

  // Legacy snapshot (crawl health yok) → eski davranış korunur, "eksik" issue üretilir
  const smLegacy = checkSitemap(makeSnapshot({ hasSitemap: false, technicalDetails: { sitemapUrlCount: null, allowedBots: [] } }))
  assert(smLegacy !== null && smLegacy.severity === 'HIGH', 'checkSitemap: legacy (crawl yok) → "eksik" issue korunur')

  // 12e: generateReport — degenerate crawl → "tarama başarısız" raporu (skor null)
  const failUser = await db.user.create({ data: { email: 'crawlfail_test@geo-platform.local', name: 'Crawl Fail Test' } })
  const failSite = await db.site.create({
    data: { userId: failUser.id, url: 'https://crawlfail.example.com', name: '__test_crawlfail__', mode: 'ADVISOR' },
  })
  await db.snapshot.create({
    data: {
      siteId: failSite.id,
      hasLlmsTxt: false, llmsTxtContent: null,
      hasRobotsTxt: false, robotsBlocksAI: false,
      hasSitemap: false, httpsEnabled: true,
      pages: [] as unknown as object[],
      technicalDetails: { crawl: { homepageStatus: 429, robotsStatus: 429, sitemapStatus: 429, llmsStatus: 429, throttled: true, failures: [] } },
    },
  })
  const failReport = await generateReport(failSite.id)
  assert(failReport.crawlFailed === true, 'generateReport: degenerate crawl → crawlFailed: true')
  assert(failReport.confidence === 'FAILED', 'generateReport: degenerate crawl → confidence FAILED')
  assert(failReport.score === null, 'generateReport: degenerate crawl → score null (sahte F üretilmez)')
  assert(failReport.grade === null, 'generateReport: degenerate crawl → grade null')
  assert(failReport.summary.includes('Tarama tamamlanamadı'), 'generateReport: özet "Tarama tamamlanamadı" içeriyor')
  assert(!failReport.summary.includes('5 kelime'), 'generateReport: özet "5 kelime" gibi sahte bulgu içermiyor')
  const failDbReport = await db.report.findUnique({ where: { id: failReport.reportId } })
  assert(failDbReport?.score === null, 'DB: crawl-failed report.score null kaydedildi')

  await db.report.deleteMany({ where: { siteId: failSite.id } })
  await db.snapshot.deleteMany({ where: { siteId: failSite.id } })
  await db.site.delete({ where: { id: failSite.id } })
  await db.user.delete({ where: { id: failUser.id } })
  assert(true, 'Crawl Robustness test verisi temizlendi')

  // BÖLÜM 13: Crawl Confidence — tek sinyal (OK / PARTIAL / FAILED)
  console.log('\n' + bold('13. Crawl Confidence — assessCrawlConfidence / computeTechnicalScores unknown'))
  console.log('─'.repeat(50))

  const ch = (o: Partial<CrawlHealth> = {}): CrawlHealth => ({
    homepageStatus: 200, robotsStatus: 200, sitemapStatus: 200, llmsStatus: 200,
    throttled: false, discoveredCount: 50, failures: [], ...o,
  })

  // 13a: eşik matrisi (not 1)
  assert(assessCrawlConfidence(ch({ robotsStatus: 429, sitemapStatus: 429, llmsStatus: 429 }), 1).level === 'PARTIAL',
    '3 probe 429 / 1 sayfa → PARTIAL')
  assert(assessCrawlConfidence(ch({ sitemapStatus: 429 }), 10).level === 'OK',
    'Tek probe blip + 10 sayfa kapsama → OK (skor gösterilir)')
  assert(assessCrawlConfidence(ch({ homepageStatus: 429 }), 2).level === 'PARTIAL',
    'Ana sayfa non-2xx ama 2 sayfa var → PARTIAL (homepage güvenilmez)')
  assert(assessCrawlConfidence(ch({ failures: [{ url: 'a', status: 0 }, { url: 'b', status: 0 }, { url: 'c', status: 0 }] }), 2).level === 'PARTIAL',
    'Sayfaların >%50\'si başarısız (3 fail / 2 ok) → PARTIAL')
  assert(assessCrawlConfidence(ch(), 8).level === 'OK', 'Temiz tarama / 8 sayfa → OK')
  assert(assessCrawlConfidence(null, 3).level === 'OK', 'crawl health yok (legacy) / 3 sayfa → OK')
  assert(assessCrawlConfidence(ch(), 0).level === 'FAILED', '0 sayfa → FAILED')

  // 13b: yavaş ama sağlıklı site cezalandırılmaz (not 2)
  const slowHealthy = assessCrawlConfidence(ch({ failures: [{ url: 'slow', status: 0 }] }), 10)
  assert(slowHealthy.level === 'OK',
    'Yavaş ama sağlıklı: 1 timeout (status 0) + 10 sayfa kapsama → OK (haksız PARTIAL değil)')

  // 13c: per-probe unknown panel gösterimi (genel level\'dan bağımsız)
  const okWithBlip = assessCrawlConfidence(ch({ sitemapStatus: 429 }), 10)
  assert(okWithBlip.level === 'OK' && okWithBlip.probeUnknown.sitemap === true && okWithBlip.probeUnknown.llms === false,
    'Tek probe blip: level OK ama o probe panelde "unknown" işaretli')

  // 13c2: AI bot 403 engeli (Cloudflare/WAF) — blocked algılama + CRITICAL bulgu
  const blockedConf = assessCrawlConfidence(ch({ homepageStatus: 403, robotsStatus: 403, sitemapStatus: 403, llmsStatus: 403 }), 0)
  assert(blockedConf.level === 'FAILED' && blockedConf.blocked === true, '403 ana sayfa / 0 sayfa → FAILED + blocked:true')
  assert(!!blockedConf.reason && blockedConf.reason.includes('403') && blockedConf.reason.includes('engelliyor'),
    'blocked reason 403 + "engelliyor" içeriyor (yeniden dene mesajı DEĞİL)')
  assert(assessCrawlConfidence(ch(), 8).blocked === false, 'Temiz tarama → blocked:false')
  // Tek korumalı probe 403 (sayfalar açık) → engel SAYILMAZ (yanlış pozitif yok)
  assert(assessCrawlConfidence(ch({ sitemapStatus: 403 }), 8).blocked === false, 'Yalnızca sitemap 403 + sayfalar açık → blocked:false')
  const block = detectAiBotBlock(ch({ homepageStatus: 403 }), 'snap-x')
  assert(block !== null && block.severity === 'CRITICAL' && block.category === 'ROBOTS', 'detectAiBotBlock: 403 → CRITICAL ROBOTS issue')
  assert((block?.title ?? '').includes('engelliyor'), 'detectAiBotBlock: başlık "engelliyor" içeriyor')
  assert(detectAiBotBlock(ch(), 'snap-x') === null, 'detectAiBotBlock: temiz crawl → null')

  // 13d: computeTechnicalScores — throttled probe "F/eksik" yerine unknown
  const tsThrottled = computeTechnicalScores({
    hasLlmsTxt: false, llmsTxtContent: null, hasRobotsTxt: false, robotsBlocksAI: false,
    hasSitemap: false, httpsEnabled: true,
    technicalDetails: { allowedBots: [], crawl: ch({ sitemapStatus: 429, llmsStatus: 429, robotsStatus: 429 }) },
    crawledPageCount: 1,
  })
  assert(tsThrottled.sitemap.unknown === true, 'computeTechnicalScores: sitemap probe 429 → unknown (F değil)')
  assert(tsThrottled.llmsTxt.unknown === true, 'computeTechnicalScores: llms probe 429 → unknown')
  assert(tsThrottled.https.unknown !== true && tsThrottled.https.grade === 'A', 'computeTechnicalScores: HTTPS probe-bağımsız → A kalır')

  const tsClean404 = computeTechnicalScores({
    hasLlmsTxt: false, llmsTxtContent: null, hasRobotsTxt: true, robotsBlocksAI: false,
    hasSitemap: false, httpsEnabled: true,
    technicalDetails: { allowedBots: [], crawl: ch({ sitemapStatus: 404, llmsStatus: 404 }) },
    crawledPageCount: 5,
  })
  assert(tsClean404.sitemap.unknown !== true && tsClean404.sitemap.grade === 'F',
    'computeTechnicalScores: sitemap 404 (kesin yok) → unknown DEĞİL, F kalır')

  // 13e: generateReport PARTIAL — skor üretilmez, "85/iyi durumda" ASLA
  const partUser = await db.user.create({ data: { email: 'partial_test@geo-platform.local', name: 'Partial Test' } })
  const partSite = await db.site.create({
    data: { userId: partUser.id, url: 'https://partial.example.com', name: '__test_partial__', mode: 'ADVISOR' },
  })
  const partSnapshot = await db.snapshot.create({
    data: {
      siteId: partSite.id,
      hasLlmsTxt: false, llmsTxtContent: null,
      hasRobotsTxt: false, robotsBlocksAI: false,
      hasSitemap: false, httpsEnabled: true,
      pages: [makePage({ url: 'https://partial.example.com/', jsonLdSchemas: [] })] as unknown as object[],
      technicalDetails: { allowedBots: [], crawl: ch({ homepageStatus: 200, robotsStatus: 429, sitemapStatus: 429, llmsStatus: 429, throttled: true, discoveredCount: 50, failures: [{ url: 'x', status: 0 }, { url: 'y', status: 0 }, { url: 'z', status: 0 }] }) } as unknown as object,
    },
  })
  // PARTIAL snapshot analiz edilir (homepage schema issue\'sı için)
  await db.issue.create({
    data: {
      snapshotId: partSnapshot.id,
      severity: 'HIGH', category: 'SCHEMA',
      title: 'Ana sayfada Organization schema eksik', description: 'Test', impact: 'Test',
      actionType: 'AUTO_FIX', status: 'PENDING',
    },
  })
  const partReport = await generateReport(partSite.id)
  assert(partReport.confidence === 'PARTIAL', 'generateReport: kısmi tarama → confidence PARTIAL')
  assert(partReport.score === null && partReport.grade === null, 'generateReport: PARTIAL → score/grade null (85/B ASLA)')
  assert(partReport.summary.includes('Kısmi tarama'), 'generateReport: PARTIAL özeti "Kısmi tarama" içeriyor')
  assert(!partReport.summary.includes('iyi durumda'), 'generateReport: PARTIAL özeti "iyi durumda" gibi sahte güven içermiyor')
  assert(partReport.topIssues.length === 1, 'generateReport: PARTIAL yine de bulunan gerçek issue\'ları listeler')
  const partDbReport = await db.report.findUnique({ where: { id: partReport.reportId } })
  assert(partDbReport?.score === null, 'DB: PARTIAL report.score null kaydedildi')

  await db.report.deleteMany({ where: { siteId: partSite.id } })
  await db.issue.deleteMany({ where: { snapshot: { siteId: partSite.id } } })
  await db.snapshot.deleteMany({ where: { siteId: partSite.id } })
  await db.site.delete({ where: { id: partSite.id } })
  await db.user.delete({ where: { id: partUser.id } })
  assert(true, 'Crawl Confidence test verisi temizlendi')

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
