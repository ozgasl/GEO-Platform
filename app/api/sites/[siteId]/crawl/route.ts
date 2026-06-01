import { NextResponse } from 'next/server'
import { ok, err, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { inngest } from '@/lib/inngest/client'
import { checkRateLimit } from '@/lib/rate-limit'

const COOLDOWN_MS = 5 * 60 * 1000 // 5 dakika

export async function POST(
  _request: Request,
  { params }: { params: { siteId: string } }
) {
  const { siteId } = params
  const { allowed, retryAfterMs } = checkRateLimit(`crawl:${siteId}`, 3, 3_600_000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'rate_limit', message: 'Çok fazla istek. Lütfen bir saat sonra tekrar deneyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(siteId, user.id)
  if (!site) return notFound()

  // Trial gate: STARTER users who have used their free report cannot crawl again
  const dbUser = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { plan: true, freeReportUsed: true } })
  const isPaid = dbUser.plan === 'AGENCY_5' || dbUser.plan === 'AGENCY_20'
  if (!isPaid && dbUser.freeReportUsed) {
    return NextResponse.json(
      { error: 'trial_limit', message: 'Deneme raporunuzu kullandınız. Sınırsız tarama için planınızı yükseltin.', upgradeUrl: '/dashboard/upgrade' },
      { status: 403 }
    )
  }

  // Soğuma süresi: son crawl 5 dk içindeyse reddet
  if (site.lastCrawledAt) {
    const elapsed = Date.now() - new Date(site.lastCrawledAt).getTime()
    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 60000)
      return err(`Crawl az önce başlatıldı. ${remaining} dakika sonra tekrar deneyin.`, 429)
    }
  }

  await inngest.send({
    name: 'geo/site.crawl.requested',
    data: { siteId, triggeredBy: 'MANUAL' as const },
  })

  return ok({ started: true, message: 'Tarama başlatıldı. 3-5 dakika sürebilir.' }, 202)
}
