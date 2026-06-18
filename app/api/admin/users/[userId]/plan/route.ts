import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { ok, err, unauthorized, forbidden } from '@/lib/api-utils'
import { Plan } from '@prisma/client'

const VALID_PLANS = new Set<string>(['FREE', 'STARTER', 'AGENCY_5', 'AGENCY_20'])

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await auth()
  if (!session?.user?.email) return unauthorized()

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || session.user.email !== adminEmail) return forbidden()

  const contentType = req.headers.get('content-type') ?? ''
  let plan: unknown
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json()
      plan = (body as Record<string, unknown>)?.plan
    } else {
      const form = await req.formData()
      plan = form.get('plan')
    }
  } catch {
    return err('Geçersiz istek gövdesi.', 400)
  }
  if (typeof plan !== 'string' || !VALID_PLANS.has(plan)) {
    return err('Geçersiz plan değeri. FREE, STARTER, AGENCY_5 veya AGENCY_20 olmalıdır.', 400)
  }

  try {
    const user = await db.user.findUnique({ where: { id: params.userId } })
    if (!user) return err('Kullanıcı bulunamadı.', 404)

    await db.user.update({
      where: { id: params.userId },
      data: { plan: plan as Plan },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(`Plan güncellenemedi: ${msg}`, 500)
  }

  return NextResponse.redirect(new URL('/admin', req.url), { status: 302 })
}
