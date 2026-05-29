import { db } from '@/lib/db'

export interface RevertResult {
  success: boolean
  actionId: string
  restoredContent: string
  instructions: string
}

/**
 * Daha önce uygulanmış bir aksiyonu geri alır.
 * isReversible=false olan aksiyonlar geri alınamaz (FAQ önerileri vb.).
 * Action.reversedAt alanı güncellenir; Issue status → PENDING'e döner.
 */
export async function revertAction(actionId: string): Promise<RevertResult> {
  const action = await db.action.findUniqueOrThrow({
    where: { id: actionId },
    include: { issue: true },
  })

  if (!action.isReversible) {
    throw new Error('Bu aksiyon geri alınamaz.')
  }

  if (action.reversedAt) {
    throw new Error('Bu aksiyon zaten geri alınmış.')
  }

  const restoredContent = action.before ?? ''

  let instructions: string
  switch (action.changeType) {
    case 'llms_txt_updated':
      instructions = action.before
        ? 'Sitenizin kök dizinindeki llms.txt dosyasını önceki içerikle değiştirin.'
        : 'Sitenizin kök dizininden llms.txt dosyasını silin.'
      break
    case 'robots_txt_updated':
      instructions = action.before
        ? 'robots.txt dosyanızı önceki içerikle geri yükleyin.'
        : 'robots.txt dosyanızdan eklenen AI bot kurallarını kaldırın.'
      break
    case 'schema_added':
      instructions =
        'İlgili sayfanın <head> bölümünden eklenen JSON-LD script bloğunu kaldırın.'
      break
    default:
      instructions = 'Değişikliği elle geri alın.'
  }

  // DB transaction: Action'ı geri alındı olarak işaretle + Issue → PENDING
  await db.$transaction([
    db.action.update({
      where: { id: actionId },
      data: { reversedAt: new Date() },
    }),
    db.issue.update({
      where: { id: action.issueId },
      data: { status: 'PENDING' },
    }),
  ])

  return {
    success: true,
    actionId,
    restoredContent,
    instructions,
  }
}
