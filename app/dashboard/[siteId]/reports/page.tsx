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
          {reports.map(report => {
            const base = `/api/sites/${params.siteId}/reports/${report.id}/download`
            return (
              <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {report.period}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        report.triggerType === 'WEEKLY'
                          ? 'text-purple-700 bg-purple-50'
                          : 'text-orange-700 bg-orange-50'
                      }`}>
                        {report.triggerType === 'WEEKLY' ? 'Haftalık' : 'Manuel'}
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
                  <div className="ml-4 flex-shrink-0 flex flex-col items-end gap-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      <span>Bulunan:</span>
                      <span className="font-semibold text-gray-900 text-right">{report.issuesFound}</span>
                      <span>Çözülen:</span>
                      <span className="font-semibold text-green-700 text-right">{report.issuesFixed}</span>
                      <span>AI Ziyaret:</span>
                      <span className="font-semibold text-gray-900 text-right">{report.aiCrawlerVisits}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 mt-1">
                      <div className="flex gap-1.5">
                        <a href={`${base}?type=action-plan&format=pdf`} download
                          className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium transition-colors whitespace-nowrap">
                          📄 Aksiyon Planı PDF
                        </a>
                        <a href={`${base}?type=action-plan&format=md`} download
                          className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50/60 text-indigo-500 hover:bg-indigo-100 font-medium transition-colors whitespace-nowrap">
                          Aksiyon Planı MD
                        </a>
                      </div>
                      <div className="flex gap-1.5">
                        <a href={`${base}?type=report&format=pdf`} download
                          className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium transition-colors whitespace-nowrap">
                          📄 Rapor PDF
                        </a>
                        <a href={`${base}?type=report&format=md`} download
                          className="text-xs px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100 font-medium transition-colors whitespace-nowrap">
                          Rapor MD
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(report.generatedAt).toLocaleString('tr-TR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
                  })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
