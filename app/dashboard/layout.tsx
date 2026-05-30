import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/api-utils'
import Sidebar from '@/components/dashboard/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const sites = await db.site.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, url: true },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar sites={sites} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
