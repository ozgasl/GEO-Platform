import { crawlSite } from './index'
import { runAnalysis } from '@/lib/analyzer'
import { queueActions } from '@/lib/actions/queue'
import { isCrawlDegenerate } from '@/lib/analyzer/quality'

/**
 * Tam crawl akışı: crawl → analiz → aksiyon kuyruğu.
 * API route ve Inngest job tarafından ortak kullanılır.
 */
export async function runCrawlPipeline(siteId: string): Promise<void> {
  try {
    const crawlResult = await crawlSite(siteId)

    // Tarama başarısızsa (ana sayfa 2xx alınamadı / hiç sayfa yok) analiz YAPMA:
    // hata sayfasından "içerik az / sitemap yok" gibi sahte issue üretmeyi engelle.
    // Rapor katmanı (generateReport) bu snapshot'ı "tarama başarısız" olarak gösterir.
    if (isCrawlDegenerate(crawlResult.crawlHealth.homepageStatus, crawlResult.pages.length)) {
      console.warn(
        `[crawl-pipeline] siteId=${siteId} tarama başarısız (homepageStatus=${crawlResult.crawlHealth.homepageStatus}, pages=${crawlResult.pages.length}, throttled=${crawlResult.crawlHealth.throttled}). Analiz atlanıyor.`
      )
      return
    }

    const issues = await runAnalysis(crawlResult.snapshotId)
    await queueActions(siteId, crawlResult.snapshotId, issues)
  } catch (err) {
    console.error(`[crawl-pipeline] siteId=${siteId} başarısız:`, err)
  }
}
