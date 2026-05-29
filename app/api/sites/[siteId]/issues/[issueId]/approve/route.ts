import { ok, err, unauthorized, notFound, forbidden, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { applyAction } from '@/lib/actions/apply'

export async function POST(
  _request: Request,
  { params }: { params: { siteId: string; issueId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  // Issue'nun bu siteye ait olduğunu doğrula
  const issue = await db.issue.findFirst({
    where: {
      id: params.issueId,
      snapshot: { siteId: params.siteId },
    },
  })
  if (!issue) return notFound()
  if (issue.status === 'DISMISSED') return err('Reddedilmiş issue onaylanamaz.', 400)

  try {
    const result = await applyAction(params.issueId, 'USER_APPROVED')
    return ok(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Aksiyon uygulanamadı.'
    return err(message, 500)
  }
}
