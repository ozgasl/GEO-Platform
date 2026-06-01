import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { db } from '@/lib/db'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: 'E-posta', type: 'email' },
        password: { label: 'Şifre', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null
        // TODO(security): [CRITICAL] Bu provider parola DOĞRULAMASI YAPMAZ — yalnızca
        // e-posta ile herhangi bir kullanıcı hesabına giriş yapılabilir (auth bypass).
        // Tüm route ownership guard'ları bu nedenle aşılabilir. Düzeltme: User modeline
        // hashlenmiş `password` alanı ekle (schema migration) + bcrypt.compare ile doğrula.
        // MVP: şifre doğrulaması sonraki aşamada (bcrypt) — şimdi e-posta ile giriş
        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
          select: { id: true, email: true, name: true },
        })
        return user ?? null
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        await db.user.upsert({
          where: { email: user.email },
          create: { email: user.email, name: user.name ?? null },
          update: { name: user.name ?? undefined },
        })
      }
      return true
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub
      return session
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
})
