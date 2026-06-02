import type { IssueInput, SnapshotData, PageSnapshot } from '@/lib/types'
import { t } from '@/lib/i18n'
import { scoreAiBotAccess, isSitemapIncomplete, isThrottledOrUnknownStatus } from './quality'

// ----- Yardımcı -----

function issue(
  snapshotId: string,
  fields: Omit<IssueInput, 'snapshotId'>
): IssueInput {
  return { snapshotId, ...fields }
}

// ----- Kural kontrolleri -----

/**
 * robots.txt AI bot engelleme kontrolü.
 * GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended için Disallow varsa CRITICAL issue.
 */
export function checkRobotsTxt(snapshot: SnapshotData, locale: string = 'tr'): IssueInput | null {
  const crawl = snapshot.technicalDetails?.crawl
  if (!snapshot.hasRobotsTxt) {
    // Probe 429/5xx ile başarısız olduysa "yok" deme — bu bilinmiyor, sahte negatif üretme.
    if (crawl && isThrottledOrUnknownStatus(crawl.robotsStatus)) return null
    return issue(snapshot.id, {
      severity: 'LOW',
      category: 'ROBOTS',
      title: t('issue.robots.missing.title', locale),
      description: t('issue.robots.missing.description', locale),
      impact: t('issue.robots.missing.impact', locale),
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        suggestedContent: t('issue.robots.missing.suggestedContent', locale),
      },
    })
  }

  // robots.txt var ve AI botları engelliyor → CRITICAL
  if (snapshot.robotsBlocksAI) {
    return issue(snapshot.id, {
      severity: 'CRITICAL',
      category: 'ROBOTS',
      title: t('issue.robots.blocked.title', locale),
      description: t('issue.robots.blocked.description', locale),
      impact: t('issue.robots.blocked.impact', locale),
      actionType: 'AUTO_FIX',
      actionPayload: {
        fixType: 'robots_allow_ai_bots',
        instruction: t('issue.robots.blocked.instruction', locale),
      },
    })
  }

  // robots.txt var, engellemiyor ama YZ botlarına açık (explicit) izin zayıf → MEDIUM iyileştirme.
  // Tek kaynak: panelin kullandığı scoreAiBotAccess ile aynı hesap. Veri yoksa (legacy snapshot) cezalandırma.
  if (snapshot.technicalDetails != null) {
    const aiBotScore = scoreAiBotAccess(snapshot.robotsBlocksAI, snapshot.hasRobotsTxt, snapshot.technicalDetails.allowedBots, locale)
    if (aiBotScore.score < 75) {
      return issue(snapshot.id, {
        severity: 'MEDIUM',
        category: 'ROBOTS',
        title: t('issue.robots.weak.title', locale),
        description: t('issue.robots.weak.description', locale),
        impact: t('issue.robots.weak.impact', locale),
        actionType: 'AUTO_FIX',
        actionPayload: {
          fixType: 'robots_allow_ai_bots',
          instruction: t('issue.robots.weak.instruction', locale),
        },
      })
    }
  }

  return null
}

/**
 * llms.txt varlık ve format kontrolü.
 * Yoksa HIGH, format bozuksa MEDIUM, güncel değilse LOW.
 */
export function checkLlmsTxt(
  snapshot: SnapshotData,
  previousSnapshot?: SnapshotData,
  locale: string = 'tr'
): IssueInput | null {
  const crawl = snapshot.technicalDetails?.crawl
  if (!snapshot.hasLlmsTxt) {
    // Probe 429/5xx ile başarısız olduysa "yok" deme.
    if (crawl && isThrottledOrUnknownStatus(crawl.llmsStatus)) return null
    return issue(snapshot.id, {
      severity: 'HIGH',
      category: 'LLMS_TXT',
      title: t('issue.llms.missing.title', locale),
      description: t('issue.llms.missing.description', locale),
      impact: t('issue.llms.missing.impact', locale),
      actionType: 'AUTO_FIX',
      actionPayload: { fixType: 'generate_llms_txt' },
    })
  }

  const content = snapshot.llmsTxtContent ?? ''

  if (!content.trim()) {
    return issue(snapshot.id, {
      severity: 'MEDIUM',
      category: 'LLMS_TXT',
      title: t('issue.llms.empty.title', locale),
      description: t('issue.llms.empty.description', locale),
      impact: t('issue.llms.empty.impact', locale),
      actionType: 'AUTO_FIX',
      actionPayload: { fixType: 'generate_llms_txt' },
    })
  }

  // Format kontrolü: başlık (#), açıklama (>) ve bölüm (## veya ## Pages) olmalı
  const hasTitle = /^#\s+\S/m.test(content)
  const hasDescription = /^>\s+\S/m.test(content)
  const hasPages = /^##\s+/m.test(content)

  if (!hasTitle || !hasDescription || !hasPages) {
    return issue(snapshot.id, {
      severity: 'MEDIUM',
      category: 'LLMS_TXT',
      title: t('issue.llms.format.title', locale),
      description: t('issue.llms.format.description', locale),
      impact: t('issue.llms.format.impact', locale),
      actionType: 'AUTO_FIX',
      actionPayload: { fixType: 'regenerate_llms_txt', currentContent: content },
    })
  }

  // Yeni sayfa eklendiyse ve llms.txt güncellenmemişse LOW uyarı
  if (previousSnapshot) {
    const prevPageUrls = new Set(previousSnapshot.pages.map(p => p.url))
    const newPages = snapshot.pages.filter(p => !prevPageUrls.has(p.url))
    if (newPages.length > 0) {
      const pagesList = `${newPages.slice(0, 3).map(p => p.url).join(', ')}${newPages.length > 3 ? ' ...' : ''}`
      return issue(snapshot.id, {
        severity: 'LOW',
        category: 'LLMS_TXT',
        title: t('issue.llms.newPages.title', locale, { count: newPages.length }),
        description: t('issue.llms.newPages.description', locale, { count: newPages.length, pages: pagesList }),
        impact: t('issue.llms.newPages.impact', locale),
        actionType: 'AUTO_FIX',
        actionPayload: { fixType: 'update_llms_txt', newPageUrls: newPages.map(p => p.url) },
      })
    }
  }

  return null
}

/**
 * HTTPS ve mixed content kontrolü.
 */
export function checkHttps(snapshot: SnapshotData, locale: string = 'tr'): IssueInput | null {
  if (!snapshot.httpsEnabled) {
    return issue(snapshot.id, {
      severity: 'HIGH',
      category: 'TECHNICAL',
      title: t('issue.https.title', locale),
      description: t('issue.https.description', locale),
      impact: t('issue.https.impact', locale),
      actionType: 'MANUAL_REQUIRED',
      actionPayload: { instruction: t('issue.https.instruction', locale) },
    })
  }

  // JSON-LD @context HTTP namespace kontrolü.
  // "http://schema.org" kullanan sayfaları tespit eder — güvenlik sorunu değil, basit bir namespace güncellemesi.
  const schemaHttpPages = snapshot.pages.filter(page => {
    try {
      const schemaContent = JSON.stringify(page.jsonLdSchemas)
      return schemaContent.includes('http://schema.org') || schemaContent.includes('http://schema.org/')
    } catch {
      return false
    }
  })

  if (schemaHttpPages.length > 0) {
    return issue(snapshot.id, {
      severity: 'LOW',
      category: 'TECHNICAL',
      title: t('issue.schemaHttp.title', locale),
      description: t('issue.schemaHttp.description', locale),
      impact: t('issue.schemaHttp.impact', locale),
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        recommendation: t('issue.schemaHttp.recommendation', locale),
        affectedPages: schemaHttpPages.slice(0, 10).map(p => p.url),
      },
    })
  }

  return null
}

/**
 * Sitemap varlık kontrolü.
 */
export function checkSitemap(snapshot: SnapshotData, locale: string = 'tr'): IssueInput | null {
  const crawl = snapshot.technicalDetails?.crawl
  if (!snapshot.hasSitemap) {
    // Probe 429/5xx ile başarısız olduysa "yok" deme.
    if (crawl && isThrottledOrUnknownStatus(crawl.sitemapStatus)) return null
    return issue(snapshot.id, {
      severity: 'HIGH',
      category: 'TECHNICAL',
      title: t('issue.sitemap.title', locale),
      description: t('issue.sitemap.description', locale),
      impact: t('issue.sitemap.impact', locale),
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        instruction: t('issue.sitemap.instruction', locale),
      },
    })
  }

  // Sitemap var ama taranan sayfalardan az URL içeriyor → eksik (MEDIUM).
  // Tek kaynak: panelin scoreSitemap'i ile aynı isSitemapIncomplete kontrolü.
  const urlCount = snapshot.technicalDetails?.sitemapUrlCount
  const crawledPageCount = snapshot.pages.length
  if (isSitemapIncomplete(urlCount, crawledPageCount)) {
    return issue(snapshot.id, {
      severity: 'MEDIUM',
      category: 'TECHNICAL',
      title: t('issue.sitemap.incomplete.title', locale),
      description: t('issue.sitemap.incomplete.description', locale, { count: urlCount!, pages: crawledPageCount }),
      impact: t('issue.sitemap.incomplete.impact', locale),
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        recommendation: t('issue.sitemap.incomplete.recommendation', locale, { count: urlCount!, pages: crawledPageCount }),
        currentUrlCount: urlCount,
        crawledPageCount,
      },
    })
  }

  return null
}

/**
 * Temel schema markup kontrolü.
 * Homepage'de Organization, ürün sayfalarında Product, blog'da Article schema aranır.
 */
export function checkBasicSchema(snapshot: SnapshotData, locale: string = 'tr'): IssueInput[] {
  const issues: IssueInput[] = []

  const homepage = snapshot.pages.find(p => {
    try {
      return new URL(p.url).pathname === '/'
    } catch {
      return false
    }
  })

  if (homepage) {
    const hasOrganization = hasSchemaType(homepage, ['Organization', 'LocalBusiness', 'Corporation'])
    if (!hasOrganization) {
      issues.push(
        issue(snapshot.id, {
          severity: 'HIGH',
          category: 'SCHEMA',
          title: t('issue.schema.organization.title', locale),
          description: t('issue.schema.organization.description', locale),
          impact: t('issue.schema.organization.impact', locale),
          actionType: 'AUTO_FIX',
          actionPayload: { fixType: 'add_schema', schemaType: 'Organization', url: homepage.url },
        })
      )
    }
  }

  // Ürün sayfaları — iki yöntemle tespit:
  // 1. Bilinen URL pattern'ları (/products/, /shop/ altı)
  // 2. Mevcut JSON-LD'de Product/Offer tipi VAR ama eksik olan sayfalar hariç,
  //    OR: tek-segment slug + düşük kelime sayısı + schema yok (e-ticaret katalog pattern'ı)
  const productPages = snapshot.pages.filter(p => {
    try {
      const path = new URL(p.url).pathname.toLowerCase()
      if (path === '/') return false

      // Bilinen alt-dizin pattern'ları
      if (/\/(products?|urunler?|shop|magaza|catalog|katalog)\//.test(path)) return true

      // E-ticaret root-level slug: tek segment, schema yok, kısa içerik
      // Örn: /dipstick, /clutch-link, /heater-plug-fordson (product detail sayfaları)
      const segments = path.split('/').filter(Boolean)
      const hasNoSchema = p.jsonLdSchemas.length === 0
      const isShortContent = p.wordCount < 200
      if (segments.length === 1 && hasNoSchema && isShortContent) return true

      return false
    } catch {
      return false
    }
  })

  for (const page of productPages.slice(0, 5)) {
    const hasProduct = hasSchemaType(page, ['Product', 'Offer'])
    if (!hasProduct) {
      issues.push(
        issue(snapshot.id, {
          severity: 'HIGH',
          category: 'SCHEMA',
          title: t('issue.schema.product.title', locale),
          description: t('issue.schema.product.description', locale, { url: page.url }),
          impact: t('issue.schema.product.impact', locale),
          actionType: 'AUTO_FIX',
          actionPayload: { fixType: 'add_schema', schemaType: 'Product', url: page.url },
        })
      )
    }
  }

  // Blog sayfaları
  const blogPages = snapshot.pages.filter(p => {
    try {
      const path = new URL(p.url).pathname.toLowerCase()
      return /\/(blog|yazi|makale|news)\//.test(path)
    } catch {
      return false
    }
  })

  for (const page of blogPages.slice(0, 5)) {
    const hasArticle = hasSchemaType(page, ['Article', 'BlogPosting', 'NewsArticle'])
    if (!hasArticle) {
      issues.push(
        issue(snapshot.id, {
          severity: 'MEDIUM',
          category: 'SCHEMA',
          title: t('issue.schema.article.title', locale),
          description: t('issue.schema.article.description', locale, { url: page.url }),
          impact: t('issue.schema.article.impact', locale),
          actionType: 'AUTO_FIX',
          actionPayload: { fixType: 'add_schema', schemaType: 'Article', url: page.url },
        })
      )
    }
  }

  return issues
}

function hasSchemaType(page: PageSnapshot, types: string[]): boolean {
  return page.jsonLdSchemas.some(schema => {
    const type = (schema as { '@type'?: string | string[] })['@type']
    if (!type) return false
    const typeArray = Array.isArray(type) ? type : [type]
    return typeArray.some(t => types.some(target => t.includes(target)))
  })
}

/**
 * Sayfaların AI görünürlüğü için yeterli içerik içerip içermediğini kontrol eder.
 * Ortalama kelime sayısı 150'nin altındaysa HIGH, 300'ün altındaysa MEDIUM issue.
 */
export function checkContentDepth(snapshot: SnapshotData, locale: string = 'tr'): IssueInput | null {
  const contentPages = snapshot.pages.filter(p => {
    try {
      const path = new URL(p.url).pathname
      return path !== '/robots.txt' && path !== '/llms.txt' && path !== '/llms-full.txt'
    } catch {
      return false
    }
  })

  if (contentPages.length === 0) return null

  const avgWordCount = Math.round(
    contentPages.reduce((sum, p) => sum + p.wordCount, 0) / contentPages.length
  )

  if (avgWordCount < 150) {
    return issue(snapshot.id, {
      severity: 'HIGH',
      category: 'CONTENT',
      title: t('issue.content.veryLow.title', locale, { avg: avgWordCount }),
      description: t('issue.content.veryLow.description', locale, { count: contentPages.length, avg: avgWordCount }),
      impact: t('issue.content.veryLow.impact', locale),
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        avgWordCount,
        pageCount: contentPages.length,
        recommendation: t('issue.content.veryLow.recommendation', locale),
      },
    })
  }

  if (avgWordCount < 300) {
    return issue(snapshot.id, {
      severity: 'MEDIUM',
      category: 'CONTENT',
      title: t('issue.content.low.title', locale, { avg: avgWordCount }),
      description: t('issue.content.low.description', locale, { avg: avgWordCount }),
      impact: t('issue.content.low.impact', locale),
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: { avgWordCount, recommendation: t('issue.content.low.recommendation', locale) },
    })
  }

  return null
}

/**
 * Tüm kural kontrollerini çalıştırır.
 * previousSnapshot geçilirse llms.txt güncelleme kontrolü de yapılır.
 */
export function runAllRules(
  snapshot: SnapshotData,
  previousSnapshot?: SnapshotData,
  locale: string = 'tr'
): IssueInput[] {
  const results: (IssueInput | null)[] = [
    checkRobotsTxt(snapshot, locale),
    checkLlmsTxt(snapshot, previousSnapshot, locale),
    checkHttps(snapshot, locale),
    checkSitemap(snapshot, locale),
    checkContentDepth(snapshot, locale),
  ]

  const schemaIssues = checkBasicSchema(snapshot, locale)

  return [
    ...results.filter((r): r is IssueInput => r !== null),
    ...schemaIssues,
  ]
}
