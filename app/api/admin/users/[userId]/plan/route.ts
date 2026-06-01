import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { ok, err, unauthorized, forbidden } from '@/lib/api-utils'
import { Plan } from '@prisma/client'

const VALID_PLANS = new Set<string>(['STARTER', 'AGENCY_5', 'AGENCY_20'])

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const session = await auth()
  if (!session?.user?.email) return unauthorized()

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || session.user.email !== adminEmail) return forbidden()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return err('Geçersiz istek gövdesi.', 400)
  }

  const plan = (body as Record<string, unknown>)?.plan
  if (typeof plan !== 'string' || !VALID_PLANS.has(plan)) {
    return err('Geçersiz plan değeri. STARTER, AGENCY_5 veya AGENCY_20 olmalıdır.', 400)
  }

  const user = await db.user.findUnique({ where: { id: params.userId } })
  if (!user) return err('Kullanıcı bulunamadı.', 404)

  await db.user.update({
    where: { id: params.userId },
    data: { plan: plan as Plan },
  })

  return ok({ success: true })
}
