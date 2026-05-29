import { ok, err, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { z } from 'zod'

const ModeSchema = z.object({
  mode: z.enum(['ADVISOR', 'PILOT']),
})

export async function PATCH(
  request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  const body = await request.json().catch(() => null)
  const parsed = ModeSchema.safeParse(body)
  if (!parsed.success) return err('mode ADVISOR veya PILOT olmalı.', 400)

  const updated = await db.site.update({
    where: { id: params.siteId },
    data: { mode: parsed.data.mode },
    select: { id: true, mode: true },
  })

  return ok(updated)
}
