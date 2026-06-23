import { ok, err, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { PLAN_ACTIVE_SITE_LIMITS } from '@/lib/plans'
import { z } from 'zod'

const ActiveSchema = z.object({
  active: z.boolean(),
})

export async function PATCH(
  request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  // Aktif/pasif yönetimi yalnızca ücretli planlara özeldir.
  if (user.plan === 'FREE') {
    return err('Site aktif/pasif yönetimi ücretli planlara özeldir. Planınızı yükseltin.', 403)
  }

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  const body = await request.json().catch(() => null)
  const parsed = ActiveSchema.safeParse(body)
  if (!parsed.success) return err('active alanı boolean olmalı.', 400)

  const { active } = parsed.data

  // Aktifleştirme: aktif limiti kontrolü (zaten aktifse atla)
  if (active && !site.isActive) {
    const limit = PLAN_ACTIVE_SITE_LIMITS[user.plan]
    const activeCount = await db.site.count({ where: { userId: user.id, isActive: true } })
    if (activeCount >= limit) {
      return err('Aktif site limitine ulaştınız. Önce bir siteyi pasif yapın.', 403)
    }
  }

  const updated = await db.site.update({
    where: { id: params.siteId },
    data: { isActive: active },
    select: { id: true, isActive: true },
  })

  return ok(updated)
}
