import { NextResponse } from 'next/server'
import { ok, err, unauthorized, getSessionUser } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { inngest } from '@/lib/inngest/client'
import { checkRateLimit } from '@/lib/rate-limit'
import { PLAN_ACTIVE_SITE_LIMITS } from '@/lib/plans'
import { z } from 'zod'

const CreateSiteSchema = z.object({
  url: z.string().url('Geçerli bir URL giriniz.'),
  name: z.string().min(1).optional(),
})

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const sites = await db.site.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      url: true,
      name: true,
      mode: true,
      crawlFrequency: true,
      createdAt: true,
      lastCrawledAt: true,
      _count: { select: { snapshots: true } },
    },
  })

  return ok(sites)
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  const { allowed, retryAfterMs } = checkRateLimit(`ip:${ip}`, 10, 3_600_000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'rate_limit', message: 'Çok fazla istek. Lütfen bir saat sonra tekrar deneyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  const user = await getSessionUser()
  if (!user) return unauthorized()

  const body = await request.json().catch(() => null)
  const parsed = CreateSiteSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.errors[0].message, 400)
  }

  const { url, name } = parsed.data

  // Aynı kullanıcının aynı URL'yi tekrar eklemesini engelle
  const existing = await db.site.findFirst({ where: { userId: user.id, url } })
  if (existing) return err('Bu URL zaten eklenmiş.', 409)

  // Plan limiti artık AKTİF site sayısına uygulanır.
  // FREE: toplam 1 site (her zaman aktif). Ücretli: sınırsız kayıt, aktif sayısı sınırlı.
  const userWithPlan = await db.user.findUnique({
    where: { id: user.id },
    select: { plan: true },
  })
  if (!userWithPlan) return unauthorized()

  const limit = PLAN_ACTIVE_SITE_LIMITS[userWithPlan.plan]

  if (userWithPlan.plan === 'FREE') {
    const totalSites = await db.site.count({ where: { userId: user.id } })
    if (totalSites >= limit) {
      return new Response(
        JSON.stringify({
          error: 'plan_limit',
          message: 'Plan limitine ulaştınız. Yükseltmek için upgrade sayfasını ziyaret edin.',
          limit,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }

  // Ücretli kullanıcıda aktif limiti doluysa site PASİF kaydedilir (crawl tetiklenmez).
  const activeCount = await db.site.count({ where: { userId: user.id, isActive: true } })
  const savedAsPassive = userWithPlan.plan !== 'FREE' && activeCount >= limit

  const site = await db.site.create({
    data: {
      userId: user.id,
      url,
      name: name ?? new URL(url).hostname,
      isActive: !savedAsPassive,
    },
  })

  // İlk taramayı yalnızca aktif kaydedilen siteler için başlat
  if (!savedAsPassive) {
    try {
      await inngest.send({
        name: 'geo/site.crawl.requested',
        data: { siteId: site.id, triggeredBy: 'MANUAL' },
      })
    } catch {
      // Inngest yoksa (local dev) sessizce devam et — site oluşturma başarılı
    }
  }

  return ok({ ...site, savedAsPassive }, 201)
}
