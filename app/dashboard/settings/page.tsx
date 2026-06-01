import Link from 'next/link'
import { getSessionUser } from '@/lib/api-utils'
import { db } from '@/lib/db'
import NameEditForm from '@/components/dashboard/NameEditForm'
import PasswordChangeForm from '@/components/dashboard/PasswordChangeForm'
import DeleteAccountButton from '@/components/dashboard/DeleteAccountButton'
import type { Plan } from '@prisma/client'

function planLabel(plan: Plan): string {
  switch (plan) {
    case 'STARTER':    return 'Ücretsiz Deneme'
    case 'AGENCY_5':   return 'Growth'
    case 'AGENCY_20':  return 'Scale'
    default:           return plan
  }
}

function planBadgeClass(plan: Plan): string {
  switch (plan) {
    case 'STARTER':    return 'bg-gray-100 text-gray-700'
    case 'AGENCY_5':   return 'bg-blue-100 text-blue-700'
    case 'AGENCY_20':  return 'bg-purple-100 text-purple-700'
    default:           return 'bg-gray-100 text-gray-700'
  }
}

export default async function SettingsPage() {
  const user = await getSessionUser()
  if (!user) return null

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { password: true },
  })

  // A credentials user has a bcrypt password; Google OAuth users have password: null
  const hasCredentials = !!dbUser?.password

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ayarlar</h1>
        <p className="text-sm text-gray-500 mt-0.5">Hesap bilgilerinizi yönetin</p>
      </div>

      {/* Profil */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Profil</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">İsim</label>
            <NameEditForm currentName={user.name} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
            <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 w-64">
              {user.email}
            </p>
          </div>
        </div>
      </section>

      {/* Plan */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Plan</h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${planBadgeClass(user.plan)}`}>
            {planLabel(user.plan)}
          </span>
          <Link
            href="/dashboard/upgrade"
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            Planı Yükselt →
          </Link>
        </div>
      </section>

      {/* Şifre */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Şifre</h2>
        {hasCredentials ? (
          <PasswordChangeForm />
        ) : (
          <p className="text-sm text-gray-500">
            Google ile giriş yapıyorsunuz — şifre değişikliği uygulanamaz.
          </p>
        )}
      </section>

      {/* Tehlikeli Alan */}
      <section className="bg-white rounded-xl border border-red-200 p-6">
        <h2 className="text-base font-semibold text-red-700 mb-1">Tehlikeli Alan</h2>
        <p className="text-sm text-gray-500 mb-5">
          Bu işlem geri alınamaz. Tüm siteleriniz, raporlarınız ve verileriniz kalıcı olarak silinecektir.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/account"
            download
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Verilerimi İndir
          </a>
          <DeleteAccountButton />
        </div>
      </section>
    </div>
  )
}
