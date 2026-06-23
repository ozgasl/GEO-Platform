import { Plan } from '@prisma/client'

/**
 * Plan başına aynı anda AKTİF olabilecek maksimum site sayısı.
 * Toplam kayıtlı site sayısı sınırsızdır (FREE hariç); limit yalnızca aktif siteleri kısıtlar.
 */
export const PLAN_ACTIVE_SITE_LIMITS: Record<Plan, number> = {
  [Plan.FREE]:      1,
  [Plan.STARTER]:   1,
  [Plan.AGENCY_5]:  5,
  [Plan.AGENCY_20]: 20,
}
