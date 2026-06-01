import { NextRequest } from 'next/server'
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
  return err('Henüz uygulanmadı.', 501)
}

export async function DELETE() {
  return err('Henüz uygulanmadı.', 501)
}
