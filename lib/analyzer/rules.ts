import type { IssueInput, SnapshotData, PageSnapshot } from '@/lib/types'

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
 * GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot için Disallow varsa CRITICAL issue.
 * Tüm siteyi engelleyen global Disallow: / varsa HIGH issue.
 */
export function checkRobotsTxt(snapshot: SnapshotData): IssueInput | null {
  if (!snapshot.hasRobotsTxt) {
    return issue(snapshot.id, {
      severity: 'LOW',
      category: 'ROBOTS',
      title: 'robots.txt dosyası bulunamadı',
      description:
        'Sitenizde robots.txt dosyası yok. Bu dosya arama motorlarına ve AI tarayıcılarına sitenizin hangi bölümlerini okuyabileceğini söyler.',
      impact:
        'robots.txt olmadan AI tarayıcıları sitenizi okuyabilir, ancak varsayılan davranış konusunda belirsizlik kalır.',
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        suggestedContent: 'User-agent: *\nAllow: /\n\nSitemap: https://siteniz.com/sitemap.xml',
      },
    })
  }

  if (!snapshot.robotsBlocksAI) return null

  // Hangi botlar engellenmiş?
  // Bu bilgi crawlSite() tarafından snapshot action payload'a yerleştirilebilir;
  // burada robotsBlocksAI=true ise genel CRITICAL issue üretiyoruz.
  return issue(snapshot.id, {
    severity: 'CRITICAL',
    category: 'ROBOTS',
    title: 'AI arama tarayıcıları engelleniyor',
    description:
      'robots.txt dosyanız ChatGPT, Claude veya Perplexity gibi AI arama motorlarının site tarayıcılarını engelliyor. Bu tarayıcılar sitenizi okuyamadığı için AI arama sonuçlarında görünmeniz mümkün değil.',
    impact:
      'ChatGPT, Perplexity veya Claude kullanıcıları sektörünüzle ilgili sorular sorduğunda siteniz kaynak olarak gösterilmiyor. Bu, ücretsiz AI arama trafiğini tamamen kaybetmek anlamına geliyor.',
    actionType: 'AUTO_FIX',
    actionPayload: {
      fixType: 'robots_allow_ai_bots',
      instruction:
        'Mevcut robots.txt içeriğine şu satırları ekle:\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /',
    },
  })
}

/**
 * llms.txt varlık ve format kontrolü.
 * Yoksa HIGH, format bozuksa MEDIUM, güncel değilse LOW.
 */
export function checkLlmsTxt(
  snapshot: SnapshotData,
  previousSnapshot?: SnapshotData
): IssueInput | null {
  if (!snapshot.hasLlmsTxt) {
    return issue(snapshot.id, {
      severity: 'HIGH',
      category: 'LLMS_TXT',
      title: 'llms.txt dosyası eksik',
      description:
        'Sitenizde llms.txt dosyası yok. Bu dosya, ChatGPT ve Claude gibi AI sistemlerine sitenizin ne hakkında olduğunu ve hangi sayfalarının önemli olduğunu açıklar.',
      impact:
        'llms.txt olmadan AI sistemleri sitenizi doğru anlayamaz ve ilgili sorularda sizi kaynak göstermez. Bu dosya, AI görünürlüğü için en kritik adımdır.',
      actionType: 'AUTO_FIX',
      actionPayload: { fixType: 'generate_llms_txt' },
    })
  }

  const content = snapshot.llmsTxtContent ?? ''

  if (!content.trim()) {
    return issue(snapshot.id, {
      severity: 'MEDIUM',
      category: 'LLMS_TXT',
      title: 'llms.txt dosyası boş',
      description:
        'llms.txt dosyanız mevcut ama içeriği boş. Boş bir dosya AI sistemlerine hiçbir bilgi vermez.',
      impact:
        'AI sistemleri boş dosyaları yok sayar. İçerik eklenmediği sürece bu dosyanın hiçbir faydası olmaz.',
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
      title: 'llms.txt formatı eksik bölümler içeriyor',
      description:
        'llms.txt dosyanız standart formatı tam olarak karşılamıyor. AI sistemleri bu dosyayı daha iyi anlayabilmek için # başlık, > açıklama ve ## Sayfalar bölümlerine ihtiyaç duyar.',
      impact:
        'Eksik format, AI sistemlerinin sitenizi yanlış yorumlamasına ya da dosyayı göz ardı etmesine yol açabilir.',
      actionType: 'AUTO_FIX',
      actionPayload: { fixType: 'regenerate_llms_txt', currentContent: content },
    })
  }

  // Yeni sayfa eklendiyse ve llms.txt güncellenmemişse LOW uyarı
  if (previousSnapshot) {
    const prevPageUrls = new Set(previousSnapshot.pages.map(p => p.url))
    const newPages = snapshot.pages.filter(p => !prevPageUrls.has(p.url))
    if (newPages.length > 0) {
      return issue(snapshot.id, {
        severity: 'LOW',
        category: 'LLMS_TXT',
        title: `${newPages.length} yeni sayfa llms.txt'e eklenmemiş`,
        description: `Son taramadan bu yana ${newPages.length} yeni sayfa bulundu ancak llms.txt güncellenmemiş: ${newPages
          .slice(0, 3)
          .map(p => p.url)
          .join(', ')}${newPages.length > 3 ? ' ...' : ''}`,
        impact:
          'Yeni sayfalar llms.txt içinde listelenmediği sürece AI sistemleri bu sayfaların varlığından haberdar olmayabilir.',
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
export function checkHttps(snapshot: SnapshotData): IssueInput | null {
  if (!snapshot.httpsEnabled) {
    return issue(snapshot.id, {
      severity: 'HIGH',
      category: 'TECHNICAL',
      title: 'Site HTTPS kullanmıyor',
      description:
        'Siteniz güvenli HTTPS bağlantısı yerine HTTP kullanıyor. Bu, hem kullanıcılar hem de arama motorları için ciddi bir güven sorunu oluşturur.',
      impact:
        'HTTPS olmayan siteler tarayıcılarda "Güvenli Değil" uyarısı gösterir ve Google sıralamalarında dezavantaj yaşar. AI sistemleri de güvenli olmayan kaynaklara daha az güvenir.',
      actionType: 'MANUAL_REQUIRED',
      actionPayload: { instruction: 'SSL sertifikası edinin ve tüm HTTP trafiğini HTTPS\'e yönlendirin.' },
    })
  }

  // İç linklerde HTTP var mı? (mixed content)
  const mixedContentPages = snapshot.pages.filter(page => {
    const allLinks = [...page.h2Array, ...page.h3Array]
    // jsonLdSchemas içinde http:// URL kontrolü
    const schemaContent = JSON.stringify(page.jsonLdSchemas)
    return schemaContent.includes('http://') && schemaContent.includes(new URL(snapshot.siteId).host ?? '')
  })

  if (mixedContentPages.length > 0) {
    return issue(snapshot.id, {
      severity: 'MEDIUM',
      category: 'TECHNICAL',
      title: 'Mixed content sorunu tespit edildi',
      description:
        'Bazı sayfalarda HTTPS üzerinden yüklenen içerikle HTTP bağlantıları karışık kullanılıyor.',
      impact:
        'Tarayıcılar mixed content içeren sayfaları tam güvenli saymaz. Bu, kullanıcı deneyimini ve güven skorunu olumsuz etkiler.',
      actionType: 'MANUAL_REQUIRED',
      actionPayload: {
        affectedPages: mixedContentPages.slice(0, 10).map(p => p.url),
      },
    })
  }

  return null
}

/**
 * Sitemap varlık kontrolü.
 */
export function checkSitemap(snapshot: SnapshotData): IssueInput | null {
  if (!snapshot.hasSitemap) {
    return issue(snapshot.id, {
      severity: 'HIGH',
      category: 'TECHNICAL',
      title: 'Sitemap bulunamadı',
      description:
        'Sitenizde sitemap.xml dosyası yok. Sitemap, arama motorlarına ve AI tarayıcılarına site yapınızı anlamanın en kolay yolunu gösterir.',
      impact:
        'Sitemap olmadan AI tarayıcıları tüm sayfalarınızı keşfedemez. Özellikle yeni içerikler daha yavaş indexlenir.',
      actionType: 'CONTENT_SUGGESTION',
      actionPayload: {
        instruction:
          'Site altyapınıza göre (WordPress, Next.js, vb.) otomatik sitemap oluşturun ve robots.txt dosyanıza ekleyin.',
      },
    })
  }
  return null
}

/**
 * Temel schema markup kontrolü.
 * Homepage'de Organization, ürün sayfalarında Product, blog'da Article schema aranır.
 */
export function checkBasicSchema(snapshot: SnapshotData): IssueInput[] {
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
          title: 'Ana sayfada Organization schema eksik',
          description:
            'Ana sayfanızda işletme bilgilerinizi (ad, adres, iletişim) tanımlayan bir schema markup yok.',
          impact:
            'AI sistemleri, Organization schema olmadan işletmenizin ne olduğunu, nerede bulunduğunu ve nasıl iletişime geçileceğini açıkça göremez. Bu, yerel ve marka aramalarında görünürlüğü azaltır.',
          actionType: 'AUTO_FIX',
          actionPayload: { fixType: 'add_schema', schemaType: 'Organization', url: homepage.url },
        })
      )
    }
  }

  // Ürün sayfaları
  const productPages = snapshot.pages.filter(p => {
    try {
      const path = new URL(p.url).pathname.toLowerCase()
      return /\/(products?|urunler?|shop|magaza)\//.test(path)
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
          title: `Ürün sayfasında Product schema eksik`,
          description: `"${page.url}" sayfasında ürün bilgilerini (fiyat, stok, açıklama) tanımlayan schema yok.`,
          impact:
            'Product schema olmadan AI sistemleri ürün bilgilerinizi yapılandırılmış veri olarak alamaz. Bu, ürün karşılaştırma sorgularında rakiplerinizin gerisinde kalmanıza neden olur.',
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
          title: `Blog yazısında Article schema eksik`,
          description: `"${page.url}" blog yazısında yazar, tarih ve başlık bilgilerini içeren schema yok.`,
          impact:
            'Article schema olmadan AI sistemleri içeriğinizin ne zaman yazıldığını, kim tarafından yazıldığını ve ne kadar güvenilir olduğunu değerlendiremez.',
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
 * Tüm kural kontrollerini çalıştırır.
 * previousSnapshot geçilirse llms.txt güncelleme kontrolü de yapılır.
 */
export function runAllRules(
  snapshot: SnapshotData,
  previousSnapshot?: SnapshotData
): IssueInput[] {
  const results: (IssueInput | null)[] = [
    checkRobotsTxt(snapshot),
    checkLlmsTxt(snapshot, previousSnapshot),
    checkHttps(snapshot),
    checkSitemap(snapshot),
  ]

  const schemaIssues = checkBasicSchema(snapshot)

  return [
    ...results.filter((r): r is IssueInput => r !== null),
    ...schemaIssues,
  ]
}
