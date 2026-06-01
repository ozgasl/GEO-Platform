'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState } from 'react'

interface Site {
  id: string
  name: string
  url: string
}

function ObseyIcon({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <img src="/icon.svg" alt="Obsey" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
    )
  }
  return (
    <img src="/brand/obsey-wordmark-light.svg" alt="Obsey" style={{ height: '40px' }} />
  )
}

function ChevronLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function brandName(nameOrUrl: string): string {
  try {
    const host = new URL(nameOrUrl.startsWith('http') ? nameOrUrl : `https://${nameOrUrl}`).hostname
    const bare = host.replace(/^www\./, '')
    const brand = bare.split('.')[0]
    return brand.charAt(0).toUpperCase() + brand.slice(1)
  } catch {
    const bare = nameOrUrl.replace(/^www\./, '')
    const brand = bare.split('.')[0]
    return brand.charAt(0).toUpperCase() + brand.slice(1)
  }
}

function SiteFavicon({ label }: { label: string }) {
  return (
    <div className="w-5 h-5 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
      <span className="text-gray-600 text-xs font-semibold leading-none">
        {label[0]?.toUpperCase() ?? '?'}
      </span>
    </div>
  )
}

export default function Sidebar({ sites }: { sites: Site[] }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [collapsed, setCollapsed] = useState(false)

  const isSiteActive = (siteId: string) => pathname.startsWith(`/dashboard/${siteId}`)
  const isSitesActive = pathname === '/dashboard'
  const isSettingsActive = pathname === '/dashboard/settings'

  return (
    <aside className={`relative flex flex-col min-h-screen bg-white border-r border-gray-200 transition-all duration-200 ${collapsed ? 'w-14' : 'w-56'}`}>

      {/* Toggle button */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-5 z-10 w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-300 shadow-sm transition-colors"
        title={collapsed ? 'Genişlet' : 'Daralt'}
      >
        {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </button>

      <div className="flex flex-col flex-1 px-2 py-4 overflow-hidden">
        {/* Logo */}
        <div className={`flex items-center gap-2 px-2 mb-6 ${collapsed ? 'justify-center' : ''}`}>
          <ObseyIcon collapsed={collapsed} />
        </div>

        {/* Siteler nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {/* "Siteler" ana link */}
          <Link
            href="/dashboard"
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
              isSitesActive
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            } ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Siteler' : undefined}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            {!collapsed && <span>Siteler</span>}
          </Link>

          {/* Site listesi */}
          {sites.length > 0 && !collapsed && (
            <div className="mt-1 space-y-0.5">
              {sites.map(site => {
                const active = isSiteActive(site.id)
                return (
                  <Link
                    key={site.id}
                    href={`/dashboard/${site.id}`}
                    className={`flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <SiteFavicon label={brandName(site.url || site.name)} />
                    <span className="truncate">{brandName(site.url || site.name)}</span>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Collapsed hâlde site ikonları */}
          {sites.length > 0 && collapsed && (
            <div className="mt-1 space-y-0.5">
              {sites.map(site => {
                const active = isSiteActive(site.id)
                return (
                  <Link
                    key={site.id}
                    href={`/dashboard/${site.id}`}
                    className={`flex items-center justify-center px-2 py-1.5 rounded-lg transition-colors ${
                      active ? 'bg-blue-50' : 'hover:bg-gray-100'
                    }`}
                    title={brandName(site.url || site.name)}
                  >
                    <SiteFavicon label={brandName(site.url || site.name)} />
                  </Link>
                )
              })}
            </div>
          )}

          {/* Ayarlar — same level as Siteler, below site list */}
          <div className="mt-2">
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                isSettingsActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              } ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? 'Ayarlar' : undefined}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {!collapsed && <span>Ayarlar</span>}
            </Link>
          </div>
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 pt-3 mt-3">
          {!collapsed ? (
            <>
              <div className="flex items-center gap-2 px-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-700 text-xs font-semibold">
                    {session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{session?.user?.name ?? 'Kullanıcı'}</p>
                  <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full text-left px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Çıkış yap
              </button>
            </>
          ) : (
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="w-full flex items-center justify-center px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              title="Çıkış yap"
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-blue-700 text-xs font-semibold">
                  {session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
