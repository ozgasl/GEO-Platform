import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'geo-platform',
  name: 'GEO Platform',
})

// Tip güvenli event tanımları
export type GeoEvents = {
  'geo/site.crawl.requested': {
    data: { siteId: string; triggeredBy: 'SCHEDULED' | 'MANUAL' }
  }
  'geo/site.crawled': {
    data: { siteId: string; snapshotId: string }
  }
  'geo/site.analysed': {
    data: { siteId: string; snapshotId: string; issueCount: number }
  }
  'geo/report.requested': {
    data: { siteId: string }
  }
}
