import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/api-utils'
import { db } from '@/lib/db'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { emailReports: true, emailAlerts: true },
  })

  return NextResponse.json(dbUser)
}

export async function PUT(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { emailReports?: unknown; emailAlerts?: unknown }
  const { emailReports, emailAlerts } = body

  if (typeof emailReports !== 'boolean' || typeof emailAlerts !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailReports, emailAlerts },
  })

  return NextResponse.json({ ok: true })
}
