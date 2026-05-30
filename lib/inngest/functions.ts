import { inngest } from './client'
import { db } from '@/lib/db'
import { crawlSite } from '@/lib/crawler'
import { runAnalysis } from '@/lib/analyzer'
import { queueActions } from '@/lib/actions/queue'
import { generateReport } from '@/lib/reports/generator'
import { sendReportEmail } from '@/lib/reports/email'

const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

/**
 * Tek bir site için crawl + analiz + aksiyon kuyruğu.
 * geo/site.crawl.requested eventi ile tetiklenir.
 * Başarıyla tamamlanınca geo/site.crawled eventi yayınlar.
 */
export const crawlSiteJob = inngest.createFunction(
  {
    id: 'crawl-site',
    name: 'Site Crawl',
    retries: 2,
    // Playwright ağır — aynı anda max 5 crawl
    concurrency: { limit: 5 },
  },
  { event: 'geo/site.crawl.requested' },
  async ({ event, step }) => {
    const { siteId } = event.data

    // Adım 1: Crawl
    const crawlResult = await step.run('crawl', async () => {
      return crawlSite(siteId)
    })

    // Adım 2: Analiz
    const issues = await step.run('analyse', async () => {
      return runAnalysis(crawlResult.snapshotId)
    })

    // Adım 3: Issue kuyruğu (PILOT modunda otomatik uygulama dahil)
    await step.run('queue-actions', async () => {
      return queueActions(siteId, crawlResult.snapshotId, issues)
    })

    // Adım 4: lastCrawledAt güncelle
    await step.run('update-site', async () => {
      await db.site.update({
        where: { id: siteId },
        data: { lastCrawledAt: new Date() },
      })
    })

    // Downstream event
    await step.sendEvent('site-crawled', {
      name: 'geo/site.crawled',
      data: { siteId, snapshotId: crawlResult.snapshotId },
    })

    return { siteId, snapshotId: crawlResult.snapshotId, issueCount: issues.length }
  }
)

/**
 * Tüm aktif siteleri haftalık/günlük olarak tara.
 * Cron: Her gün 02:00 UTC — siteler crawlFrequency'e göre filtrelenir.
 */
export const scheduledCrawlJob = inngest.createFunction(
  { id: 'scheduled-crawl', name: 'Scheduled Crawl' },
  { cron: '0 2 * * *' },
  async ({ step }) => {
    const sites = await step.run('list-sites', async () => {
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      return db.site.findMany({
        where: {
          isActive: true,
          OR: [
            // DAILY: son 24 saatte taranmamış
            {
              crawlFrequency: 'DAILY',
              OR: [{ lastCrawledAt: null }, { lastCrawledAt: { lt: oneDayAgo } }],
            },
            // WEEKLY: son 7 günde taranmamış
            {
              crawlFrequency: 'WEEKLY',
              OR: [{ lastCrawledAt: null }, { lastCrawledAt: { lt: sevenDaysAgo } }],
            },
          ],
        },
        select: { id: true, crawlFrequency: true },
      })
    })

    // Her site için crawl eventi gönder (fan-out)
    await step.sendEvent(
      'trigger-crawls',
      sites.map(s => ({
        name: 'geo/site.crawl.requested' as const,
        data: { siteId: s.id, triggeredBy: 'SCHEDULED' as const },
      }))
    )

    return { triggered: sites.length }
  }
)

/**
 * Her Pazartesi 09:00 UTC — aktif sitelere haftalık rapor gönder.
 */
export const weeklyReportJob = inngest.createFunction(
  { id: 'weekly-report', name: 'Weekly Report Email' },
  { cron: '0 9 * * 1' },
  async ({ step }) => {
    const sites = await step.run('list-sites', async () => {
      return db.site.findMany({
        where: { isActive: true },
        include: { user: { select: { email: true, name: true } } },
      })
    })

    let sent = 0

    for (const site of sites) {
      if (!site.user.email) continue

      const result = await step.run(`report-${site.id}`, async () => {
        const report = await generateReport(site.id, 'WEEKLY')
        const emailResult = await sendReportEmail(
          report,
          site.user.email!,
          site.name,
          APP_URL
        )

        if (emailResult.sent) {
          // emailSentAt kaydı için son report'u güncelle
          await db.report.update({
            where: { id: report.reportId },
            data: { emailSentAt: new Date() },
          })
        }

        return emailResult
      })

      if (result.sent) sent++
    }

    return { processed: sites.length, sent }
  }
)

/**
 * Manuel rapor tetikleme eventi (API'den veya dashboard'dan).
 */
export const generateReportJob = inngest.createFunction(
  { id: 'generate-report', name: 'Generate Report' },
  { event: 'geo/report.requested' },
  async ({ event, step }) => {
    const { siteId } = event.data

    const report = await step.run('generate', async () => {
      return generateReport(siteId)
    })

    const site = await step.run('get-site', async () => {
      return db.site.findUniqueOrThrow({
        where: { id: siteId },
        include: { user: { select: { email: true } } },
      })
    })

    if (site.user.email) {
      await step.run('send-email', async () => {
        const emailResult = await sendReportEmail(report, site.user.email!, site.name, APP_URL)
        if (emailResult.sent) {
          await db.report.update({
            where: { id: report.reportId },
            data: { emailSentAt: new Date() },
          })
        }
        return emailResult
      })
    }

    return { reportId: report.reportId, score: report.score }
  }
)

export const functions = [crawlSiteJob, scheduledCrawlJob, weeklyReportJob, generateReportJob]
