import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionUser, requireSiteOwner } from '@/lib/api-utils'
import { db } from '@/lib/db'

export default async function ReportsPage({ params }: { params: { siteId: string } }) {
  const user = await getSessionUser()
  if (!user) return null

  const site = await requireSiteOwner(params.siteId, user.id)
  if (!site) notFound()

  const reports = await db.report.findMany({
    where: { siteId: params.siteId },
    orderBy: { generatedAt: 'desc' },
    take: 24,
  })

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/dashboard" className="hover:text-gray-600">Siteler</Link>
        <span>/</span>
        <Link href={`/dashboard/${params.siteId}`} className="hover:text-gray-600">{site.name}</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Raporlar</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Rapor Geçmişi</h1>

      {reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
          <p className="text-gray-400 text-sm">Henüz rapor oluşturulmadı.</p>
          <p className="text-gray-400 text-xs mt-1">Raporlar haftalık otomatik oluşturulur.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {report.period}
                    </span>
                    {report.llmsTxtUpdated && (
                      <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        llms.txt güncellendi
                      </span>
                    )}
                    {report.emailSentAt && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        E-posta gönderildi
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{report.summary}</p>
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>Bulunan:</span>
                    <span className="font-semibold text-gray-900 text-right">{report.issuesFound}</span>
                    <span>Çözülen:</span>
                    <span className="font-semibold text-green-700 text-right">{report.issuesFixed}</span>
                    <span>AI Ziyaret:</span>
                    <span className="font-semibold text-gray-900 text-right">{report.aiCrawlerVisits}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {new Date(report.generatedAt).toLocaleString('tr-TR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
