import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
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
        if (!credentials?.email || !credentials?.password) return null
        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
          select: { id: true, email: true, name: true, password: true },
        })
        // No user, or user signed up via Google OAuth (no password set)
        if (!user || !user.password) return null
        const valid = await bcrypt.compare(credentials.password as string, user.password)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.name }
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
