import { crawlSite } from './index'
import { runAnalysis } from '@/lib/analyzer'
import { queueActions } from '@/lib/actions/queue'

export interface PipelineResult {
  siteId: string
  snapshotId: string
  issuesFound: number
  queued: number
  autoApplied: number
}

export async function runCrawlPipeline(siteId: string): Promise<PipelineResult> {
  const crawlResult = await crawlSite(siteId)
  const issues = await runAnalysis(crawlResult.snapshotId)
  const { queued, autoApplied } = await queueActions(siteId, crawlResult.snapshotId, issues)

  return {
    siteId,
    snapshotId: crawlResult.snapshotId,
    issuesFound: issues.length,
    queued,
    autoApplied,
  }
}
