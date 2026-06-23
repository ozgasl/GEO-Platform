import { ok, err, unauthorized, notFound, getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { generateReport } from '@/lib/reports/generator'

export async function GET(
  _request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  const reports = await db.report.findMany({
    where: { siteId: params.siteId },
    orderBy: { generatedAt: 'desc' },
    take: 12,
    select: {
      id: true,
      period: true,
      summary: true,
      issuesFound: true,
      issuesFixed: true,
      aiCrawlerVisits: true,
      llmsTxtUpdated: true,
      generatedAt: true,
    },
  })

  return ok(reports)
}

/** Manuel rapor tetikleme (Inngest job'ı beklemeden) */
export async function POST(
  _request: Request,
  { params }: { params: { siteId: string } }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) return notFound()

  // Pasif siteler için rapor oluşturulamaz
  if (!site.isActive) {
    return err('Pasif siteler için rapor oluşturulamaz. Önce siteyi aktif yapın.', 403)
  }

  try {
    const report = await generateReport(params.siteId)
    return ok(report, 201)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Rapor oluşturulamadı.'
    return err(message, 500)
  }
}
