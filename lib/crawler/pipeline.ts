import { crawlSite } from './index'
import { runAnalysis } from '@/lib/analyzer'
import { queueActions } from '@/lib/actions/queue'
import { isCrawlDegenerate, detectAiBotBlock } from '@/lib/analyzer/quality'

/**
 * Tam crawl akışı: crawl → analiz → aksiyon kuyruğu.
 * API route ve Inngest job tarafından ortak kullanılır.
 */
export async function runCrawlPipeline(siteId: string): Promise<void> {
  try {
    const crawlResult = await crawlSite(siteId)

    // AI bot UA'sı 403 ile engellendiyse, 0 sayfalık başarısız taramada bile bunu
    // CRITICAL bulgu olarak yüzeye çıkar (aşağıda analiz atlansa da).
    const botBlock = detectAiBotBlock(crawlResult.crawlHealth, crawlResult.snapshotId)

    // Tarama başarısızsa (ana sayfa 2xx alınamadı / hiç sayfa yok) analiz YAPMA:
    // hata sayfasından "içerik az / sitemap yok" gibi sahte issue üretmeyi engelle.
    // Rapor katmanı (generateReport) bu snapshot'ı "tarama başarısız" olarak gösterir.
    if (isCrawlDegenerate(crawlResult.crawlHealth.homepageStatus, crawlResult.pages.length)) {
      console.warn(
        `[crawl-pipeline] siteId=${siteId} tarama başarısız (homepageStatus=${crawlResult.crawlHealth.homepageStatus}, pages=${crawlResult.pages.length}, throttled=${crawlResult.crawlHealth.throttled}, blocked=${!!botBlock}). Analiz atlanıyor.`
      )
      if (botBlock) await queueActions(siteId, crawlResult.snapshotId, [botBlock])
      return
    }

    // Önce analiz (idempotency: mevcut issue varsa atlar) — sonra bot-block'u başa ekleyip tek seferde kuyrukla.
    const issues = await runAnalysis(crawlResult.snapshotId)
    await queueActions(siteId, crawlResult.snapshotId, botBlock ? [botBlock, ...issues] : issues)
  } catch (err) {
    console.error(`[crawl-pipeline] siteId=${siteId} başarısız:`, err)
  }
}
