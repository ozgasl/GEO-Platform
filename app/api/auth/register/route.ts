import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 })
  }

  const { email, password, name } = body as Record<string, unknown>

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Geçerli bir e-posta adresi giriniz.' }, { status: 400 })
  }

  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Şifre en az 8 karakter olmalıdır.' }, { status: 400 })
  }

  if (name !== undefined && (typeof name !== 'string' || name.trim().length > 80)) {
    return NextResponse.json({ error: 'İsim en fazla 80 karakter olabilir.' }, { status: 400 })
  }

  const existing = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  })

  if (existing) {
    return NextResponse.json({ error: 'Bu e-posta adresi zaten kullanımda.' }, { status: 409 })
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  await db.user.create({
    data: {
      email: email.toLowerCase(),
      name: typeof name === 'string' ? name.trim() || null : null,
      password: hashedPassword,
    },
    select: { id: true },
  })

  return NextResponse.json({ success: true }, { status: 201 })
}
