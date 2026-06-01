import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, ok, err, unauthorized } from '@/lib/api-utils'
import { db } from '@/lib/db'

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return err('Geçersiz istek gövdesi.', 400)
  }

  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return err('name alanı gereklidir.', 400)
  }

  const { name } = body as { name: unknown }

  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 80) {
    return err('name 1–80 karakter arasında olmalıdır.', 400)
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { name: name.trim() },
    select: { name: true },
  })

  return ok({ user: updated })
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const userData = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      image: true,
      plan: true,
      freeReportUsed: true,
      createdAt: true,
      // password deliberately excluded — never expose hash
      sites: {
        include: {
          snapshots: { include: { issues: true } },
          reports: true,
        },
      },
    },
  })

  return new NextResponse(JSON.stringify(userData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="geo-platform-export-${Date.now()}.json"`,
    },
  })
}

export async function DELETE() {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const userId = user.id

  // Get all site IDs for this user
  const sites = await db.site.findMany({
    where: { userId },
    select: { id: true },
  })
  const siteIds = sites.map((s) => s.id)

  // Get all snapshot IDs for this user's sites
  const snapshots = await db.snapshot.findMany({
    where: { siteId: { in: siteIds } },
    select: { id: true },
  })
  const snapshotIds = snapshots.map((s) => s.id)

  // Cascade delete in FK-safe order:
  // 1. Actions (references Issue.id and Site.id)
  await db.action.deleteMany({ where: { siteId: { in: siteIds } } })
  // 2. Issues (references Snapshot.id)
  await db.issue.deleteMany({ where: { snapshotId: { in: snapshotIds } } })
  // 3. Reports (references Site.id)
  await db.report.deleteMany({ where: { siteId: { in: siteIds } } })
  // 4. Snapshots (references Site.id)
  await db.snapshot.deleteMany({ where: { siteId: { in: siteIds } } })
  // 5. Sites (references User.id)
  await db.site.deleteMany({ where: { userId } })
  // 6. NextAuth Sessions and Accounts (onDelete: Cascade on schema, but delete explicitly for safety)
  await db.session.deleteMany({ where: { userId } })
  await db.account.deleteMany({ where: { userId } })
  // 7. User
  await db.user.delete({ where: { id: userId } })

  return ok({ success: true })
}
