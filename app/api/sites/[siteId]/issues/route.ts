import { ok, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import type { Severity, IssueStatus } from '@prisma/client'

export async function GET(
  request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  const { searchParams } = new URL(request.url)
  const severity = searchParams.get('severity') as Severity | null
  const status = (searchParams.get('status') as IssueStatus | null) ?? 'PENDING'

  const issues = await db.issue.findMany({
    where: {
      snapshot: { siteId: params.siteId },
      ...(severity ? { severity } : {}),
      status,
    },
    orderBy: [
      { severity: 'asc' }, // CRITICAL → HIGH → MEDIUM → LOW
    ],
    include: {
      action: {
        select: { id: true, changeType: true, appliedAt: true, reversedAt: true, isReversible: true },
      },
    },
  })

  return ok(issues)
}
