import Link from 'next/link'
import { getSessionUser } from '@/lib/api-utils'
import { db } from '@/lib/db'
import AddSiteForm from '@/components/dashboard/AddSiteForm'

async function getSites(userId: string) {
  return db.site.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      snapshots: {
        orderBy: { crawledAt: 'desc' },
        take: 1,
        include: {
          issues: { where: { status: 'PENDING' }, select: { id: true, severity: true } },
        },
      },
      reports: {
        orderBy: { generatedAt: 'desc' },
        take: 1,
        select: { id: true, issuesFixed: true, issuesFound: true },
      },
    },
  })
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    CRITICAL: 'bg-red-500',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-yellow-500',
    LOW: 'bg-gray-400',
  }
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[severity] ?? 'bg-gray-400'}`} />
}

export default async function DashboardPage() {
  const user = await getSessionUser()
  if (!user) return null

  const sites = await getSites(user.id)

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sitelerim</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI motorlarındaki görünürlüğünüzü yönetin</p>
        </div>
      </div>

      {/* Add site */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-sm font-medium text-gray-700 mb-3">Yeni site ekle</p>
        <AddSiteForm />
      </div>

      {/* Site list */}
      {sites.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <p className="text-gray-400 text-sm">Henüz site eklemediniz.</p>
          <p className="text-gray-400 text-sm mt-1">Yukarıdaki formu kullanarak ilk sitenizi ekleyin.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map(site => {
            const snapshot = site.snapshots[0]
            const pendingIssues = snapshot?.issues ?? []
            const criticals = pendingIssues.filter(i => i.severity === 'CRITICAL').length
            const highs = pendingIssues.filter(i => i.severity === 'HIGH').length

            return (
              <Link
                key={site.id}
                href={`/dashboard/${site.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-gray-900 group-hover:text-blue-600 truncate">
                        {site.name}
                      </h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        site.mode === 'PILOT'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {site.mode}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5 truncate">{site.url}</p>
                  </div>

                  <div className="flex items-center gap-4 ml-4">
                    {/* Issue badges */}
                    {pendingIssues.length > 0 ? (
                      <div className="flex items-center gap-2">
                        {criticals > 0 && (
                          <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                            <SeverityDot severity="CRITICAL" />
                            {criticals} kritik
                          </span>
                        )}
                        {highs > 0 && (
                          <span className="flex items-center gap-1 text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                            <SeverityDot severity="HIGH" />
                            {highs} yüksek
                          </span>
                        )}
                        {criticals === 0 && highs === 0 && (
                          <span className="text-xs text-gray-500">
                            {pendingIssues.length} bekleyen
                          </span>
                        )}
                      </div>
                    ) : (
                      snapshot && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                          Sorun yok
                        </span>
                      )
                    )}

                    {/* Status dots */}
                    {snapshot && (
                      <div className="flex items-center gap-1.5">
                        <StatusDot ok={snapshot.hasLlmsTxt} label="llms.txt" />
                        <StatusDot ok={!snapshot.robotsBlocksAI} label="robots" />
                        <StatusDot ok={snapshot.hasSitemap} label="sitemap" />
                        <StatusDot ok={snapshot.httpsEnabled} label="https" />
                      </div>
                    )}

                    <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {site.lastCrawledAt && (
                  <p className="text-xs text-gray-400 mt-3">
                    Son tarama: {new Date(site.lastCrawledAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span title={label} className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />
  )
}
