import { ok, err, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { runCrawlPipeline } from '@/lib/crawler/pipeline'

const COOLDOWN_MS = 5 * 60 * 1000 // 5 dakika

export async function POST(
  _request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  // Soğuma süresi: son crawl 5 dk içindeyse reddet
  if (site.lastCrawledAt) {
    const elapsed = Date.now() - new Date(site.lastCrawledAt).getTime()
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000)
      return err(`Crawl az önce başlatıldı. ${remaining} dakika sonra tekrar deneyin.`, 429)
    }
  }

  // lastCrawledAt'ı hemen güncelle (cooldown guard için)
  await db.site.update({
    where: { id: params.siteId },
    data: { lastCrawledAt: new Date() },
  })

  // Fire-and-forget: pipeline yanıt beklemeden arka planda çalışır
  void runCrawlPipeline(params.siteId)

  return ok({ started: true, message: 'Tarama başlatıldı. 3-5 dakika sürebilir.' }, 202)
}
