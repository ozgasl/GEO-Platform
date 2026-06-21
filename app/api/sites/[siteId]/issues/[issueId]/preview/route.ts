import { ok, err, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { previewFix } from '@/lib/actions/apply'

export async function POST(
  _request: Request,
  { params }: { params: { siteId: string; issueId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  const issue = await db.issue.findFirst({
    where: {
      id: params.issueId,
      snapshot: { siteId: params.siteId },
    },
  })
  if (!issue) return notFound()

  try {
    const result = await previewFix(params.issueId)
    return ok(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Önizleme oluşturulamadı.'
    return err(message, 500)
  }
}
