import { NextResponse } from 'next/server'
import { recordVisit } from '@/lib/monitoring/tracker'

// 1×1 şeffaf GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

/**
 * Public beacon endpoint — auth gerekmez.
 * AI botlar JS yürütmez; bu endpoint onların doğrudan çağırması için değil,
 * tracking pixel'ı destekleyen botlar ve human analytics içindir.
 * Gerçek AI bot tespiti sunucu tarafı middleware entegrasyonu ile yapılmalıdır.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('t')

  if (token) {
    // TODO(security): [LOW] Public endpoint; rate limit yok. Geçerli bir token'a sahip
    // saldırgan aiCrawlerVisits sayaçlarını sınırsızca şişirebilir (veri bütünlüğü, DoS değil).
    // IP+token başına rate limit eklenebilir.
    const ua = request.headers.get('user-agent') ?? ''
    // Fire-and-forget — beacon hızlı dönmeli, DB hatasını yutabiliriz
    recordVisit(token, ua).catch(() => {})
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
