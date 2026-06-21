/**
 * READ-ONLY teşhis: GEO Skoru ile Teknik Durum paneli neden ayrışıyor?
 *
 * Bir site için en son snapshot'ın issue'larını (durumlarıyla) ve "zayıf-durum
 * köprüsünün" tetiklenmesi gereken sinyalleri raporlar. HİÇBİR YAZMA YAPMAZ.
 *
 * Kullanım (prod DATABASE_URL ayarlıyken — Railway shell veya direct URL ile lokal):
 *   npx tsx scripts/diag-score.ts dxturkiye
 *   npx tsx scripts/diag-score.ts            # arg yoksa: "dxturkiye"
 *
 * Not: pgbouncer'lı pooled URL yerine DIRECT_URL kullanmak daha güvenli.
 */
import { PrismaClient } from '@prisma/client'
import { scoreAiBotAccess, scoreRobotsTxt } from '../lib/analyzer/quality'

const db = new PrismaClient()
const needle = (process.argv[2] ?? 'dxturkiye').toLowerCase()

async function main() {
  // Siteyi url/ad ile bul (read-only)
  const sites = await db.site.findMany({
    where: {
      OR: [
        { url: { contains: needle, mode: 'insensitive' } },
        { name: { contains: needle, mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, url: true, mode: true },
  })

  if (sites.length === 0) {
    console.log(`Eşleşen site yok: "${needle}"`)
    return
  }
  if (sites.length > 1) {
    console.log(`Birden fazla site eşleşti, ilki kullanılıyor:`, sites.map(s => s.url))
  }
  const site = sites[0]
  console.log(`\n=== SITE ===`)
  console.log(`${site.name}  (${site.url})  mode=${site.mode}  id=${site.id}`)

  // En son snapshot + issue'lar (read-only)
  const snap = await db.snapshot.findFirst({
    where: { siteId: site.id },
    orderBy: { crawledAt: 'desc' },
    include: { issues: { select: { category: true, severity: true, status: true, title: true } } },
  })

  if (!snap) {
    console.log('\nBu sitenin hiç snapshot kaydı yok.')
    return
  }

  const td = (snap.technicalDetails ?? {}) as {
    robotsContent?: string | null
    allowedBots?: string[]
    sitemapUrlCount?: number | null
    crawl?: { robotsStatus?: number | null; llmsStatus?: number | null; sitemapStatus?: number | null; homepageStatus?: number | null } | null
  }
  const pageCount = (snap.pages as unknown[]).length

  console.log(`\n=== EN SON SNAPSHOT ===`)
  console.log(`id=${snap.id}`)
  console.log(`crawledAt=${snap.crawledAt.toISOString()}`)
  console.log(`taranan sayfa=${pageCount}`)
  console.log(`hasRobotsTxt=${snap.hasRobotsTxt}  robotsBlocksAI=${snap.robotsBlocksAI}`)
  console.log(`hasLlmsTxt=${snap.hasLlmsTxt}  hasSitemap=${snap.hasSitemap}  httpsEnabled=${snap.httpsEnabled}`)
  console.log(`technicalDetails.allowedBots=${JSON.stringify(td.allowedBots ?? null)}`)
  console.log(`technicalDetails.sitemapUrlCount=${td.sitemapUrlCount ?? null}`)
  console.log(`technicalDetails mevcut mu=${snap.technicalDetails != null}  robotsContent var mı=${!!td.robotsContent}`)
  console.log(`crawl probe statusleri=${JSON.stringify(td.crawl ?? null)}`)

  console.log(`\n=== ISSUE'LAR (bu snapshot) ===`)
  if (snap.issues.length === 0) {
    console.log('HİÇ ISSUE YOK — köprü hiç issue üretmemiş demektir.')
  } else {
    const byStatus: Record<string, number> = {}
    for (const i of snap.issues) byStatus[i.status] = (byStatus[i.status] ?? 0) + 1
    console.log(`toplam=${snap.issues.length}  durum dağılımı=${JSON.stringify(byStatus)}`)
    for (const i of snap.issues) {
      console.log(`  - [${i.status}] ${i.severity}/${i.category}: ${i.title}`)
    }
  }

  // "Köprü beklentisi": panelin kullandığı aynı fonksiyonlarla, robots zayıf-durum
  // issue'sunun TETİKLENMESİ gerekip gerekmediğini göster (eşik <75).
  console.log(`\n=== KÖPRÜ BEKLENTİSİ (robots/AI-bot) ===`)
  const aiBot = scoreAiBotAccess(snap.robotsBlocksAI, snap.hasRobotsTxt, td.allowedBots)
  const robots = scoreRobotsTxt(snap.hasRobotsTxt, snap.robotsBlocksAI, td.robotsContent)
  console.log(`panel: robots.txt=${robots.score}/100 (${robots.grade}), AI botlara izin=${aiBot.score}/100 (${aiBot.grade})`)
  const guardOk = snap.technicalDetails != null
  const shouldFireWeak = guardOk && !snap.robotsBlocksAI && snap.hasRobotsTxt && aiBot.score < 75
  console.log(`checkRobotsTxt zayıf-issue tetiklenmeli mi? ${shouldFireWeak}  (guard technicalDetails!=null=${guardOk}, aiBot<75=${aiBot.score < 75})`)

  const hasRobotsIssue = snap.issues.some(i => i.category === 'ROBOTS')
  console.log(`bu snapshot'ta ROBOTS issue var mı? ${hasRobotsIssue}`)

  console.log(`\n=== YORUM ===`)
  if (shouldFireWeak && !hasRobotsIssue) {
    console.log('→ (a) KÖPRÜ KOPUK olabilir: issue tetiklenmeli ama hiç ROBOTS issue yok → correctness bug adayı (#2).')
  } else if (hasRobotsIssue) {
    const robotsIssues = snap.issues.filter(i => i.category === 'ROBOTS')
    const allClosed = robotsIssues.every(i => i.status === 'DISMISSED' || i.status === 'APPLIED')
    console.log(`→ ROBOTS issue(lar) üretilmiş. Hepsi kapatılmış mı (DISMISSED/APPLIED)? ${allClosed}`)
    console.log('→ Kapatılmışsa (b) TEST ARTIĞI: kod değişikliği yok, sadece state temizliği.')
  } else {
    console.log('→ Köprü zaten tetiklenmemeli (robots güçlü ya da guard kapalı). Ayrışma tasarım gereği; #1/#3 tartışılır.')
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
