import { PrismaClient } from '@prisma/client'

async function main() {
  const db = new PrismaClient()

  // Her iki brandit.tech snapshotundaki sahte DISMISSED duplicate'leri sil
  const deleted = await db.issue.deleteMany({
    where: {
      id: { in: ['cmprznddo0005ww4jo04jtrio'] },
      status: 'DISMISSED',
    },
  })
  console.log('Silinen:', deleted.count)

  // Doğrula
  const remaining = await db.issue.findMany({
    where: { snapshotId: { in: ['cmprjoaox002011zeyh3nmh1b', 'cmprzndci0004ww4j3rgkxwke'] } },
    select: { snapshotId: true, status: true, title: true },
    orderBy: { status: 'asc' },
  })
  console.log('Kalan issue\'lar:')
  remaining.forEach(i => console.log(' ', i.status, '-', i.title.slice(0, 60)))

  await db.$disconnect()
}

main()
