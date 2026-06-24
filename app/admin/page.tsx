import Link from 'next/link'
import { getSessionUser, isAdminEmail } from '@/lib/api-utils'
import { db } from '@/lib/db'
import ScoreBadge from '@/components/dashboard/ScoreBadge'

async function getAdminStats() {
  const [userCount, siteCount, reportCount] = await Promise.all([
    db.user.count(),
    db.site.count(),
    db.report.count(),
  ])
  return { userCount, siteCount, reportCount }
}

async function getUsers() {
  return db.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { sites: true } },
    },
  })
}

async function getAllSites() {
  return db.site.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, name: true } },
      reports: { orderBy: { generatedAt: 'desc' }, take: 1 },
    },
  })
}

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Free',
  STARTER: 'Starter',
  AGENCY_5: 'Agency 5',
  AGENCY_20: 'Agency 20',
}

const MODE_LABELS: Record<string, string> = {
  ADVISOR: 'Advisor',
  PILOT: 'Pilot',
}

export default async function AdminPage() {
  const user = await getSessionUser()
  if (!user) return <div className="p-8 text-red-600">Giriş yapmanız gerekiyor.</div>

  if (!isAdminEmail(user.email)) {
    return <div className="p-8 text-red-600">Yetkisiz erişim.</div>
  }

  const [stats, users, sites] = await Promise.all([getAdminStats(), getUsers(), getAllSites()])

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Paneli</h1>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.userCount}</p>
          <p className="text-sm text-gray-500 mt-1">Toplam Kullanıcı</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.siteCount}</p>
          <p className="text-sm text-gray-500 mt-1">Toplam Site</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.reportCount}</p>
          <p className="text-sm text-gray-500 mt-1">Toplam Rapor</p>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Kullanıcılar</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Ad</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Plan</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Deneme Kullanıldı</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Site Sayısı</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Kayıt Tarihi</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {PLAN_LABELS[u.plan] ?? u.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.freeReportUsed ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-center">{u._count.sites}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {u.createdAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' })}
                  </td>
                  <td className="px-4 py-3">
                    <form action={`/api/admin/users/${u.id}/plan`} method="POST" className="flex items-center gap-2">
                      <select
                        name="plan"
                        defaultValue={u.plan}
                        className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="FREE">Free</option>
                        <option value="STARTER">Starter</option>
                        <option value="AGENCY_5">Agency 5</option>
                        <option value="AGENCY_20">Agency 20</option>
                      </select>
                      <button
                        type="submit"
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        Kaydet
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sites table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-8">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Siteler</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Kullanıcı</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Site</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Mod</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Son Tarama</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">GEO Skoru</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Sorunlar</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Rapor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.map(site => {
                const latestReport = site.reports[0]
                return (
                  <tr key={site.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{site.user.email}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900 font-medium">{site.name}</p>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {site.url}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {MODE_LABELS[site.mode] ?? site.mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {site.lastCrawledAt
                        ? site.lastCrawledAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {latestReport?.score != null ? (
                        <ScoreBadge score={latestReport.score} size="sm" />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-center">
                      {latestReport ? `${latestReport.issuesFixed}/${latestReport.issuesFound}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {latestReport ? (
                        <Link
                          href={`/api/sites/${site.id}/reports/${latestReport.id}/download?format=pdf`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Rapor PDF
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
