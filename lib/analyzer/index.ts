import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { IssueInput, PageSnapshot, SnapshotData } from '@/lib/types'
import { runAllRules } from './rules'
import { analyzePagesBatched } from './llm'

/**
 * Bir snapshot için tam analizi çalıştırır.
 * 1. Kural motoru (deterministik, hızlı)
 * 2. LLM motoru (yalnızca değişmiş sayfalar için)
 * 3. Tüm issue'ları DB'ye kaydeder
 */
export async function runAnalysis(snapshotId: string): Promise<IssueInput[]> {
  // Idempotency: bu snapshot zaten analiz edildiyse tekrar çalıştırma
  const existingCount = await db.issue.count({ where: { snapshotId } })
  if (existingCount > 0) {
    console.warn(`[runAnalysis] snapshotId=${snapshotId} zaten analiz edildi (${existingCount} issue). Atlanıyor.`)
    return []
  }

  // Snapshot ve önceki snapshot'ı çek
  const snapshot = await db.snapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: { site: true },
  })

  const previousSnapshot = snapshot.previousSnapshotId
    ? await db.snapshot.findUnique({
        where: { id: snapshot.previousSnapshotId },
      })
    : null

  const pages = snapshot.pages as unknown as PageSnapshot[]
  const prevPages = previousSnapshot
    ? (previousSnapshot.pages as unknown as PageSnapshot[])
    : []

  const snapshotData: SnapshotData = {
    id: snapshot.id,
    siteId: snapshot.siteId,
    crawledAt: snapshot.crawledAt,
    hasLlmsTxt: snapshot.hasLlmsTxt,
    llmsTxtContent: snapshot.llmsTxtContent,
    hasRobotsTxt: snapshot.hasRobotsTxt,
    robotsBlocksAI: snapshot.robotsBlocksAI,
    hasSitemap: snapshot.hasSitemap,
    httpsEnabled: snapshot.httpsEnabled,
    pages,
    previousSnapshotId: snapshot.previousSnapshotId,
  }

  const prevSnapshotData: SnapshotData | undefined = previousSnapshot
    ? {
        id: previousSnapshot.id,
        siteId: previousSnapshot.siteId,
        crawledAt: previousSnapshot.crawledAt,
        hasLlmsTxt: previousSnapshot.hasLlmsTxt,
        llmsTxtContent: previousSnapshot.llmsTxtContent,
        hasRobotsTxt: previousSnapshot.hasRobotsTxt,
        robotsBlocksAI: previousSnapshot.robotsBlocksAI,
        hasSitemap: previousSnapshot.hasSitemap,
        httpsEnabled: previousSnapshot.httpsEnabled,
        pages: prevPages,
        previousSnapshotId: previousSnapshot.previousSnapshotId,
      }
    : undefined

  // 1. Kural motoru — deterministik, LLM çağrısı yok
  const ruleIssues = runAllRules(snapshotData, prevSnapshotData)

  // 2. LLM motoru — yalnızca değişmiş veya yeni sayfalar için
  const changedPages = detectChangedPages(pages, prevPages)
  let contentIssues: IssueInput[] = []

  if (changedPages.length > 0) {
    const llmResults = await analyzePagesBatched(changedPages)

    contentIssues = llmResults
      .flatMap(result => {
        const issues: IssueInput[] = []

        // Düşük answer density
        if (result.answerDensity < 5 && result.contentGap) {
          issues.push({
            snapshotId,
            severity: result.answerDensity < 3 ? 'HIGH' : 'MEDIUM',
            category: 'CONTENT',
            title: `Sayfa AI sorularına yetersiz yanıt veriyor`,
            description: `"${result.url}" sayfası, AI arama motorlarının doğrudan alıntılayabileceği net yanıtlar içermiyor. Answer density skoru: ${result.answerDensity}/10.`,
            impact: `Bu sayfa, ilgili arama sorgularında kaynak gösterilme ihtimali düşük. ${result.contentGap ?? ''}`,
            actionType: 'CONTENT_SUGGESTION',
            actionPayload: {
              url: result.url,
              answerDensity: result.answerDensity,
              missingQuestions: result.missingQuestions,
              contentGap: result.contentGap,
            },
          })
        }

        // FAQ önerileri
        if (result.suggestedFaqItems.length > 0) {
          issues.push({
            snapshotId,
            severity: 'LOW',
            category: 'CONTENT',
            title: `FAQ içeriği eklenerek AI görünürlüğü artırılabilir`,
            description: `"${result.url}" sayfasına ${result.suggestedFaqItems.length} soru-cevap bloğu eklenmesi öneriliyor.`,
            impact:
              'FAQ formatındaki içerikler, AI sistemleri tarafından doğrudan alıntılanma olasılığı en yüksek içerik türüdür.',
            actionType: 'CONTENT_SUGGESTION',
            actionPayload: {
              url: result.url,
              suggestedFaqItems: result.suggestedFaqItems,
            },
          })
        }

        // Schema önerisi (rules motoru zaten yakalamadıysa)
        if (result.schemaRecommendation) {
          issues.push({
            snapshotId,
            severity: 'MEDIUM',
            category: 'SCHEMA',
            title: `${result.schemaRecommendation.type} schema eklenebilir`,
            description: result.schemaRecommendation.reason,
            impact:
              'Eksik schema, AI sistemlerinin sayfanın içeriğini ve amacını yapılandırılmış veri olarak okumasını engeller.',
            actionType: 'AUTO_FIX',
            actionPayload: {
              url: result.url,
              schemaType: result.schemaRecommendation.type,
            },
          })
        }

        return issues
      })
  }

  const allIssues = [...ruleIssues, ...contentIssues]

  // 3. Issue'ları DB'ye kaydet
  if (allIssues.length > 0) {
    await db.issue.createMany({
      data: allIssues.map(i => ({
        snapshotId: i.snapshotId,
        severity: i.severity,
        category: i.category,
        title: i.title,
        description: i.description,
        impact: i.impact,
        actionType: i.actionType,
        actionPayload: i.actionPayload !== undefined
          ? (i.actionPayload as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        status: 'PENDING',
      })),
    })
  }

  return allIssues
}

/**
 * Önceki snapshot'a kıyasla değişmiş veya yeni sayfaları döndürür.
 * Değişmemiş sayfaları LLM analizinden atlayarak maliyet optimize edilir.
 */
function detectChangedPages(
  currentPages: PageSnapshot[],
  previousPages: PageSnapshot[]
): PageSnapshot[] {
  if (previousPages.length === 0) return currentPages

  const prevHashByUrl = new Map(previousPages.map(p => [p.url, p.contentHash]))

  return currentPages.filter(page => {
    const prevHash = prevHashByUrl.get(page.url)
    // Yeni sayfa veya içeriği değişmiş sayfa
    return !prevHash || prevHash !== page.contentHash
  })
}
