import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { applyAction } from './apply'
import type { IssueInput } from '@/lib/types'

/**
 * Bir siteye ait yeni Issue'ları DB'ye kaydeder.
 * PILOT modunda AUTO_FIX tipindeki issue'ları otomatik uygular.
 * ADVISOR modunda tüm issue'lar PENDING kalır — kullanıcı onayı bekler.
 */
export async function queueActions(
  siteId: string,
  snapshotId: string,
  issues: IssueInput[]
): Promise<{ queued: number; autoApplied: number }> {
  if (issues.length === 0) return { queued: 0, autoApplied: 0 }

  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } })

  // Mevcut açık issue'ları kapat (PENDING olanları) — yeniden çekildiğinde eski sorunların üstüne yazma
  await db.issue.updateMany({
    where: { snapshotId, status: 'PENDING' },
    data: { status: 'DISMISSED' },
  })

  // Tüm issue'ları PENDING olarak kaydet
  const created = await db.$transaction(
    issues.map(i =>
      db.issue.create({
        data: {
          snapshotId,
          severity: i.severity,
          category: i.category,
          title: i.title,
          description: i.description,
          impact: i.impact,
          actionType: i.actionType,
          actionPayload: i.actionPayload !== undefined
            ? (i.actionPayload as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          status: 'PENDING',
        },
      })
    )
  )

  let autoApplied = 0

  // PILOT modunda AUTO_FIX issue'ları otomatik uygula
  if (site.mode === 'PILOT') {
    const autoFixIssues = created.filter(i => i.actionType === 'AUTO_FIX')

    for (const issue of autoFixIssues) {
      try {
        await applyAction(issue.id, 'AUTO_PILOT')
        autoApplied++
      } catch (err) {
        console.error(`[queueActions] AUTO_FIX başarısız — issueId: ${issue.id}`, err)
        // Hata durumunda issue PENDING kalır, sonraki turda yeniden denenebilir
      }
    }
  }

  return { queued: created.length, autoApplied }
}
