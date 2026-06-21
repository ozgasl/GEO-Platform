// Deterministik ajan-prompt template'leri.
//
// Kod/config bulguları (`fixDelivery: 'agent_prompt'`) için, bir coding agent'a
// (Claude Code vb.) tek seferde yapıştırılabilen paste-ready prompt üretir.
// LLM KULLANMAZ — tamamen deterministik string template. Client'ta da çalışır
// (sadece URL/string işlemleri; node-only import yok).
//
// Her prompt: (1) ne yapılacağı, (2) tam dosya/dizin/directive/snippet,
// (3) sonradan "şunu doğrula" adımı içerir.

import { SEVERITY_PENALTY } from '@/lib/reports/score'

export interface PromptIssue {
  category: string
  severity: string
  title: string
  description: string
  actionPayload?: Record<string, unknown> | null
}

function originOf(siteUrl: string): string {
  try {
    return new URL(siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`).origin
  } catch {
    return siteUrl.replace(/\/+$/, '')
  }
}

function payloadOf(issue: PromptIssue): Record<string, unknown> {
  return (issue.actionPayload ?? {}) as Record<string, unknown>
}

// ----- Kategori/fixType bazlı template'ler -----

function robotsPrompt(issue: PromptIssue, origin: string): string {
  const payload = payloadOf(issue)
  const fixType = payload.fixType as string | undefined

  if (fixType === 'robots_allow_ai_bots') {
    return [
      `Görev: ${origin} sitesindeki robots.txt dosyasının AI arama botlarını engellemesini düzelt.`,
      ``,
      `1. Kök dizindeki robots.txt dosyasını aç (${origin}/robots.txt).`,
      `2. Aşağıdaki user-agent'lar için var olan tüm "Disallow: /" kurallarını kaldır ve bunun yerine`,
      `   açıkça erişime izin ver. Bu botlar AI arama motorlarının tarayıcılarıdır:`,
      `   GPTBot, OAI-SearchBot, ChatGPT-User (ChatGPT) · ClaudeBot, Claude-Web (Claude) ·`,
      `   PerplexityBot (Perplexity) · Google-Extended (Google AI).`,
      `3. Dosyanın sonuna şu blokları ekle (zaten varsa Disallow satırlarını temizle):`,
      ``,
      '```',
      `User-agent: GPTBot`,
      `Allow: /`,
      ``,
      `User-agent: OAI-SearchBot`,
      `Allow: /`,
      ``,
      `User-agent: ClaudeBot`,
      `Allow: /`,
      ``,
      `User-agent: PerplexityBot`,
      `Allow: /`,
      ``,
      `User-agent: Google-Extended`,
      `Allow: /`,
      '```',
      ``,
      `Doğrula: \`curl -A "GPTBot" ${origin}/robots.txt\` çıktısında bu botlar için Disallow OLMADIĞINI,`,
      `ve ana sayfanın GPTBot user-agent'ı ile 200 döndüğünü teyit et.`,
    ].join('\n')
  }

  // robots.txt yok (LOW)
  return [
    `Görev: ${origin} için temel bir robots.txt dosyası oluştur (şu an eksik).`,
    ``,
    `1. Kök dizine robots.txt dosyası ekle (${origin}/robots.txt adresinden erişilebilir olmalı).`,
    `2. AI botlarına erişim ver ve sitemap'i referansla:`,
    ``,
    '```',
    `User-agent: *`,
    `Allow: /`,
    ``,
    `Sitemap: ${origin}/sitemap.xml`,
    '```',
    ``,
    `Doğrula: \`curl ${origin}/robots.txt\` 200 ve yukarıdaki içeriği döndürmeli.`,
  ].join('\n')
}

function llmsTxtPrompt(issue: PromptIssue, origin: string): string {
  const payload = payloadOf(issue)
  const isUpdate = payload.fixType === 'update_llms_txt' || payload.fixType === 'regenerate_llms_txt'
  const newPageUrls = (payload.newPageUrls as string[] | undefined) ?? []

  return [
    `Görev: ${origin} için ${isUpdate ? 'mevcut /llms.txt dosyasını standart formata göre güncelle' : 'kök dizine /llms.txt dosyası oluştur'}.`,
    `(llms.txt, AI motorlarının siteyi anlaması için kullanılır — ChatGPT/Claude/Perplexity için geçerlidir.)`,
    ``,
    `1. ${origin}/llms.txt adresinde sunulacak dosyayı şu standart formatta hazırla:`,
    ``,
    '```',
    `# Site Adı`,
    `> Sitenin ne yaptığını anlatan tek cümlelik açıklama.`,
    ``,
    `## Pages`,
    `- ${origin}/onemli-sayfa: Sayfanın amacı ve içeriği`,
    `- ${origin}/diger-sayfa: Sayfanın amacı ve içeriği`,
    ``,
    `## About`,
    `Sitenin 2-3 cümlelik özeti: ne yapıyor, kime hizmet veriyor.`,
    '```',
    ``,
    `2. "## Pages" altına sitenin gerçek, önemli sayfalarını gerçek başlık/açıklamalarıyla doldur.`,
    newPageUrls.length > 0
      ? `3. Şu yeni sayfaların listede yer aldığından emin ol:\n${newPageUrls.slice(0, 10).map(u => `   - ${u}`).join('\n')}`
      : `3. Başlık (#), açıklama (>) ve en az bir bölüm (##) bulunduğundan emin ol.`,
    ``,
    `Doğrula: \`curl ${origin}/llms.txt\` 200 dönmeli ve içerik # / > / ## satırlarını içermeli.`,
  ].join('\n')
}

function schemaPrompt(issue: PromptIssue, origin: string): string {
  const payload = payloadOf(issue)
  const url = (payload.url as string | undefined) ?? origin
  const rawType = (payload.schemaType as string | undefined) ?? 'Organization'
  const schemaType = rawType.split('+')[0].trim()

  return [
    `Görev: ${url} sayfasına ${schemaType} JSON-LD schema markup ekle.`,
    ``,
    `1. ${url} sayfasının <head> bölümüne aşağıdaki <script> bloğunu ekle.`,
    `2. Alanları sayfanın gerçek içeriğiyle doldur; bilmediğin/uygun olmayan alanları SİL (yanlış veri koyma).`,
    ``,
    '```html',
    `<script type="application/ld+json">`,
    JSON.stringify(schemaSkeleton(schemaType, url, origin), null, 2),
    `</script>`,
    '```',
    ``,
    `Doğrula: Google Rich Results Test (https://search.google.com/test/rich-results) ile ${url} adresini`,
    `kontrol et; ${schemaType} hatasız algılanmalı.`,
  ].join('\n')
}

function schemaSkeleton(schemaType: string, url: string, origin: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
  }
  if (schemaType === 'Organization') {
    base.name = 'Şirket Adı'
    base.url = origin
    base.logo = `${origin}/logo.png`
    base.contactPoint = { '@type': 'ContactPoint', contactType: 'customer service' }
  } else if (schemaType === 'Product') {
    base.name = 'Ürün Adı'
    base.url = url
    base.description = 'Ürün açıklaması'
    base.offers = { '@type': 'Offer', priceCurrency: 'TRY', price: '0.00', availability: 'https://schema.org/InStock' }
  } else if (schemaType === 'Article' || schemaType === 'BlogPosting' || schemaType === 'NewsArticle' || schemaType === 'TechArticle') {
    base.headline = 'Makale Başlığı'
    base.url = url
    base.author = { '@type': 'Organization', name: 'Yayıncı' }
    base.datePublished = 'YYYY-MM-DD'
  } else if (schemaType === 'FAQPage') {
    base.mainEntity = [
      { '@type': 'Question', name: 'Soru?', acceptedAnswer: { '@type': 'Answer', text: 'Yanıt.' } },
    ]
  } else {
    base.name = 'Ad'
    base.url = url
  }
  return base
}

function technicalPrompt(issue: PromptIssue, origin: string): string {
  const payload = payloadOf(issue)

  // schema.org http:// namespace düzeltmesi
  const affectedPages = payload.affectedPages as string[] | undefined
  if (affectedPages && affectedPages.length > 0) {
    return [
      `Görev: ${origin} sitesindeki JSON-LD schema'larda "http://schema.org" yerine "https://schema.org" kullan.`,
      ``,
      `1. Aşağıdaki sayfalardaki JSON-LD bloklarında "@context" değerini "https://schema.org" yap:`,
      affectedPages.slice(0, 10).map(u => `   - ${u}`).join('\n'),
      `2. Tüm "http://schema.org" geçişlerini "https://schema.org" ile değiştir.`,
      ``,
      `Doğrula: İlgili sayfaların kaynağında "http://schema.org" KALMADIĞINI teyit et.`,
    ].join('\n')
  }

  // sitemap eksik / eksik URL
  const isSitemap = /sitemap/i.test(issue.title) || payload.currentUrlCount !== undefined
  if (isSitemap) {
    const incomplete = payload.currentUrlCount !== undefined
    return [
      `Görev: ${origin} için sitemap.xml'i ${incomplete ? 'tüm sayfaları içerecek şekilde tamamla' : 'oluştur'}.`,
      ``,
      `1. ${origin}/sitemap.xml adresinde geçerli bir XML sitemap üret.`,
      `2. Sitenin TÜM indekslenebilir sayfalarını <url><loc>...</loc></url> olarak ekle.`,
      incomplete
        ? `   (Şu an ${payload.currentUrlCount} URL var, taranan ${payload.crawledPageCount} sayfa — eksikleri ekle.)`
        : `3. robots.txt içine "Sitemap: ${origin}/sitemap.xml" satırını ekle.`,
      ``,
      '```xml',
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      `  <url><loc>${origin}/</loc></url>`,
      `  <!-- diğer tüm sayfalar -->`,
      `</urlset>`,
      '```',
      ``,
      `Doğrula: \`curl ${origin}/sitemap.xml\` 200 ve geçerli XML dönmeli; Google Search Console'a gönder.`,
    ].join('\n')
  }

  // HTTPS
  return [
    `Görev: ${origin} sitesinde HTTPS'i zorunlu kıl.`,
    ``,
    `1. Sunucu/host yapılandırmanda tüm HTTP (port 80) isteklerini 301 ile HTTPS'e yönlendir.`,
    `2. Geçerli bir TLS sertifikası kullan (ör. Let's Encrypt).`,
    `3. HSTS header'ı ekle: \`Strict-Transport-Security: max-age=31536000; includeSubDomains\`.`,
    ``,
    `Doğrula: \`curl -I http://${new URL(origin).host}\` 301 → https döndürmeli; \`curl -I ${origin}\` 200.`,
  ].join('\n')
}

function genericPrompt(issue: PromptIssue, origin: string): string {
  const payload = payloadOf(issue)
  const instruction = (payload.instruction as string | undefined) ?? (payload.recommendation as string | undefined)
  return [
    `Görev: ${origin} — ${issue.title}`,
    ``,
    issue.description,
    instruction ? `\n${instruction}` : '',
    ``,
    `Doğrula: Yukarıdaki değişikliğin canlı sitede uygulandığını teyit et.`,
  ].filter(Boolean).join('\n')
}

/** Tek bir bulgu için deterministik ajan prompt'u üretir (LLM yok). */
export function buildAgentPrompt(issue: PromptIssue, siteUrl: string): string {
  const origin = originOf(siteUrl)
  switch (issue.category) {
    case 'ROBOTS':
      return robotsPrompt(issue, origin)
    case 'LLMS_TXT':
      return llmsTxtPrompt(issue, origin)
    case 'SCHEMA':
      return schemaPrompt(issue, origin)
    case 'TECHNICAL':
      return technicalPrompt(issue, origin)
    default:
      return genericPrompt(issue, origin)
  }
}

/**
 * Birden çok agent_prompt bulgusunu TEK birleşik ajan prompt'unda toplar.
 * Etki sırasına göre (severity penalty desc) sıralanır; başına preamble eklenir.
 * (Görev 3 — "Skoru yükselt" modalı Grup A için.)
 */
export function buildCombinedAgentPrompt(issues: PromptIssue[], siteUrl: string): string {
  const origin = originOf(siteUrl)
  const sorted = [...issues].sort(
    (a, b) => (SEVERITY_PENALTY[b.severity] ?? 0) - (SEVERITY_PENALTY[a.severity] ?? 0)
  )

  const preamble = [
    `Sen bir web geliştirme ajanısın. Aşağıdaki ${sorted.length} iyileştirmeyi ${origin} sitesi için`,
    `sırayla (en yüksek etkiden başlayarak) uygula. Her maddenin sonundaki "Doğrula" adımını çalıştır`,
    `ve bir sonrakine geçmeden önce başarılı olduğunu teyit et.`,
    ``,
    `============================================================`,
  ].join('\n')

  const body = sorted
    .map((issue, i) => `\n## ${i + 1}. ${issue.title}\n\n${buildAgentPrompt(issue, siteUrl)}`)
    .join('\n\n============================================================')

  return `${preamble}${body}`
}
