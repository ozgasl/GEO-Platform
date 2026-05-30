import { crawlSite } from './index'
import { runAnalysis } from '@/lib/analyzer'
import { queueActions } from '@/lib/actions/queue'

/**
 * Tam crawl akışı: crawl → analiz → aksiyon kuyruğu.
 * API route ve Inngest job tarafından ortak kullanılır.
 */
export async function runCrawlPipeline(siteId: string): Promise<void> {
  try {
    const crawlResult = await crawlSite(siteId)
    const issues = await runAnalysis(crawlResult.snapshotId)
    await queueActions(siteId, crawlResult.snapshotId, issues)
  } catch (err) {
    console.error(`[crawl-pipeline] siteId=${siteId} başarısız:`, err)
  }
}
