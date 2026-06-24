import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import type { User } from '@prisma/client'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export const unauthorized = () => err('Giriş yapmanız gerekiyor.', 401)
export const forbidden = () => err('Bu kaynağa erişim yetkiniz yok.', 403)
export const notFound = () => err('Bulunamadı.', 404)

/**
 * Session'dan kullanıcıyı alır. Giriş yoksa null döner.
 */
export async function getSessionUser(): Promise<User | null> {
  const session = await auth()
  if (!session?.user?.email) return null
  return db.user.findUnique({ where: { email: session.user.email } })
}

/**
 * Site'nin belirtilen kullanıcıya ait olduğunu doğrular.
 * Farklı kullanıcının sitesine erişim 404 döndürür (403 değil — varlığı ifşa etme).
 */
export async function requireSiteOwner(siteId: string, userId: string) {
  const site = await db.site.findFirst({
    where: { id: siteId, userId },
  })
  return site
}

/**
 * ADMIN_EMAIL listesindeki admin e-postalarını döner.
 * Virgülle ayrılmış birden fazla e-posta destekler (case-insensitive).
 */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Verilen e-postanın admin olup olmadığını kontrol eder.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return getAdminEmails().includes(email.toLowerCase())
}

/**
 * Kullanıcının ADMIN_EMAIL ile eşleşip eşleşmediğini kontrol eder.
 */
export function isAdminUser(user: User): boolean {
  return isAdminEmail(user.email)
}
