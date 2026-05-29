import { ok, err, unauthorized, getSessionUser } from '@/lib/api-utils'
import { db } from '@/lib/db'
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

  const site = await db.site.create({
    data: {
      userId: user.id,
      url,
      name: name ?? new URL(url).hostname,
    },
  })

  return ok(site, 201)
}
