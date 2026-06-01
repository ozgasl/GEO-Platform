import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
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

  if (typeof body !== 'object' || body === null) {
    return err('Geçersiz istek gövdesi.', 400)
  }

  const { currentPassword, newPassword } = body as Record<string, unknown>

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return err('currentPassword ve newPassword alanları gereklidir.', 400)
  }

  if (newPassword.length < 8) {
    return err('Yeni şifre en az 8 karakter olmalıdır.', 400)
  }

  // Fetch hashed password — never expose it in responses
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  })

  if (!dbUser || !dbUser.password) {
    return err('Bu hesap şifre değişikliğini desteklemiyor (Google ile giriş yapılmış).', 400)
  }

  const valid = await bcrypt.compare(currentPassword, dbUser.password)
  if (!valid) {
    return NextResponse.json({ error: 'Mevcut şifre hatalı.' }, { status: 401 })
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12)

  await db.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  })

  return ok({ success: true })
}
