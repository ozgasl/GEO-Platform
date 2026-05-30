import { PrismaClient } from '@prisma/client'

async function main() {
  const db = new PrismaClient()

  const sites = await db.site.findMany({
    where: { url: { contains: 'brandit' } },
    select: { id: true, url: true },
  })
  console.log('Brandit sites:', sites)

  for (const site of sites) {
    const snaps = await db.snapshot.findMany({
      where: { siteId: site.id },
      orderBy: { crawledAt: 'desc' },
      take: 3,
      include: {
        issues: {
          select: { id: true, status: true, title: true },
          orderBy: { status: 'asc' },
        },
      },
    })
    for (const s of snaps) {
      console.log(`\nSite: ${site.id}  Snapshot: ${s.id}  ${s.crawledAt.toISOString()}`)
      for (const i of s.issues) {
        console.log(`  [${i.status}] ${i.title.slice(0, 70)}  (${i.id})`)
      }
    }
  }

  await db.$disconnect()
}

main()
