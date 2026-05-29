import { ok, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { generateSnippet } from '@/lib/monitoring/snippet'

export async function GET(
  request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  const baseUrl = new URL(request.url).origin
  const snippet = generateSnippet(params.siteId, baseUrl)

  return ok({ snippet })
}
