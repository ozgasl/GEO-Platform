import { ok, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  const fullSite = await db.site.findUniqueOrThrow({
    where: { id: params.siteId },
    include: {
      snapshots: {
        orderBy: { crawledAt: 'desc' },
        take: 1,
        select: {
          id: true,
          crawledAt: true,
          hasLlmsTxt: true,
          hasRobotsTxt: true,
          robotsBlocksAI: true,
          hasSitemap: true,
          httpsEnabled: true,
          _count: { select: { issues: true } },
        },
      },
      _count: {
        select: { snapshots: true, actions: true },
      },
    },
  })

  return ok(fullSite)
}
