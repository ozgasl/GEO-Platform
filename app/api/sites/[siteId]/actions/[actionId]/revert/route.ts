import { ok, err, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { revertAction } from '@/lib/actions/revert'

export async function POST(
  _request: Request,
  { params }: { params: { siteId: string; actionId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  // Action'ın bu siteye ait olduğunu doğrula
  const action = await db.action.findFirst({
    where: { id: params.actionId, siteId: params.siteId },
  })
  if (!action) return notFound()

  try {
    const result = await revertAction(params.actionId)
    return ok(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Geri alma başarısız.'
    return err(message, 400)
  }
}
