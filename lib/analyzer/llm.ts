import Anthropic from '@anthropic-ai/sdk'
import type { ContentIssue, PageSnapshot, SnapshotData } from '@/lib/types'

// Maliyet/performans dengesi için claude-sonnet-4-5 kullanıyoruz.
// Güncellemek için bu sabiti değiştirin.
const MODEL = 'claude-sonnet-4-6'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ----- İçerik analizi -----

/**
 * Maksimum 5 sayfayı tek bir Claude çağrısında analiz eder.
 * Tam HTML yerine yapılandırılmış özet göndererek token maliyetini düşürür.
 */
export async function analyzePageContent(pages: PageSnapshot[]): Promise<ContentIssue[]> {
  if (pages.length === 0) return []

  const batch = pages.slice(0, 3)

  const pagesSummary = batch.map(p => ({
    url: p.url,
    title: p.title,
    h1: p.h1,
    h2Array: p.h2Array.slice(0, 8),
    wordCount: p.wordCount,
    faqCount: p.faqBlocks.length,
    existingSchemas: p.jsonLdSchemas.map(s => (s as { '@type'?: string })['@type'] ?? 'Unknown'),
    faqSamples: p.faqBlocks.slice(0, 3).map(f => f.question),
  }))

  const prompt = JSON.stringify(pagesSummary, null, 2)

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: `Sen bir GEO (Generative Engine Optimization) uzmanısın.
Görevin: web sayfalarını AI arama motorlarının bakış açısıyla analiz etmek.
Bir AI motoru (ChatGPT, Claude, Perplexity) belirli bir soruya yanıt ararken bu sayfaları kaynak olarak kullanır mı? Kullanmak için ne eksik?

Yanıtını YALNIZCA geçerli JSON olarak ver. Başka hiçbir metin yazma.
JSON yapısı: { "pages": [ { "url": string, "answerDensity": number, "missingQuestions": string[], "suggestedFaqItems": [{"question": string, "answer": string}], "schemaRecommendation": {"type": string, "reason": string} | null, "contentGap": string | null } ] }`,
      messages: [
        {
          role: 'user',
          content: `Şu ${batch.length} sayfayı analiz et:

${prompt}

Her sayfa için:
1. answerDensity (0-10): İlk 200 kelimede net, doğrudan alıntılanabilir bir yanıt var mı? 10 = mükemmel, 0 = hiç yok
2. missingQuestions: Bu sayfada yanıtlanması beklenen ama yanıtsız kalan 2-3 soru
3. suggestedFaqItems: AI görünürlüğü için önerilen soru-cevap çiftleri (maksimum 3)
4. schemaRecommendation: Eklenmesi gereken schema türü ve kısa gerekçe (zaten varsa null)
5. contentGap: Bu sayfada olmayan ama AI görünürlüğü için kritik olan içerik türü (varsa)`,
        },
      ],
    })

    const raw =
      response.content[0].type === 'text' ? response.content[0].text : ''

    // Claude bazen JSON'ı ```json ... ``` içinde dönebilir — fence'leri temizle
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned) as { pages: ContentIssue[] }
    return parsed.pages ?? []
  } catch (err) {
    console.error('[LLM] analyzePageContent başarısız:', err)
    return []
  }
}

// ----- llms.txt üretimi -----

/**
 * Mevcut snapshot verisinden standart formatlı llms.txt içeriği üretir.
 * Çıktı doğrudan dosyaya yazılabilir formattadır.
 */
export async function generateLlmsTxt(snapshot: SnapshotData): Promise<string> {
  // Sayfa özetlerini hazırla — token tasarrufu için özlü tutuyoruz
  const pageSummaries = snapshot.pages
    .slice(0, 30)
    .map(p => `- ${p.url}: ${p.title}${p.h1 && p.h1 !== p.title ? ` (${p.h1})` : ''}`)
    .join('\n')

  const siteUrl = snapshot.pages[0]?.url
    ? new URL(snapshot.pages[0].url).origin
    : 'https://example.com'

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `Sen bir web sitesi optimizasyon asistanısın. Görevin, verilen site verilerine dayanarak llms.txt dosyası oluşturmak.

llms.txt standart formatı:
# Site Adı
> Tek cümlelik site açıklaması

## Pages
- https://example.com/sayfa: Sayfanın amacı ve içeriği

## About
Sitenin 2-3 cümlelik özeti. Ne yapıyor, kime hizmet veriyor.

Sadece llms.txt içeriğini yaz. Başka açıklama ekleme.`,
      messages: [
        {
          role: 'user',
          content: `Bu site için llms.txt dosyası oluştur.

Site URL: ${siteUrl}
Taranan sayfa sayısı: ${snapshot.pages.length}
llms.txt var mı: ${snapshot.hasLlmsTxt ? 'Evet' : 'Hayır'}
${snapshot.llmsTxtContent ? `Mevcut llms.txt:\n${snapshot.llmsTxtContent.slice(0, 500)}\n---\n` : ''}
Sayfalar:
${pageSummaries}`,
        },
      ],
    })

    return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch (err) {
    console.error('[LLM] generateLlmsTxt başarısız:', err)
    return ''
  }
}

// ----- Schema markup üretimi -----

const SCHEMA_SYSTEM_PROMPT = `Sen bir schema.org uzmanısın. Verilen sayfa bilgilerine dayanarak JSON-LD schema markup kodu üretiyorsun.
Kurallar:
1. Sadece <script type="application/ld+json">...</script> bloğunu yaz
2. Schema içindeki tüm değerler gerçekçi ve sayfayla tutarlı olmalı
3. Boş veya bilinmeyen alanları atlayabilirsin — yanlış veri koyma
4. Çıktı geçerli JSON olmalı`

/**
 * Belirtilen sayfa için JSON-LD schema markup üretir.
 * Çıktı <script type="application/ld+json"> bloğu olarak döner.
 */
export async function generateSchemaMarkup(
  page: PageSnapshot,
  schemaType: 'Organization' | 'Product' | 'Article' | 'FAQPage' | string
): Promise<string> {
  const pageData = {
    url: page.url,
    title: page.title,
    h1: page.h1,
    h2Array: page.h2Array.slice(0, 5),
    metaDescription: page.metaDescription,
    faqItems: page.faqBlocks.slice(0, 10),
    wordCount: page.wordCount,
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SCHEMA_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Şu sayfa için ${schemaType} schema markup oluştur:

${JSON.stringify(pageData, null, 2)}`,
        },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // JSON-LD bloğunu extract et
    const scriptMatch = raw.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
    if (scriptMatch) {
      const jsonContent = scriptMatch[1].trim()
      // Geçerli JSON mi?
      JSON.parse(jsonContent)
      return `<script type="application/ld+json">\n${jsonContent}\n</script>`
    }

    // Script etiketi yoksa direkt JSON dönmüş olabilir
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      JSON.parse(jsonMatch[0]) // Geçerlilik kontrolü
      return `<script type="application/ld+json">\n${jsonMatch[0]}\n</script>`
    }

    console.warn('[LLM] generateSchemaMarkup geçerli JSON-LD döndürmedi:', raw.slice(0, 200))
    return ''
  } catch (err) {
    console.error('[LLM] generateSchemaMarkup başarısız:', err)
    return ''
  }
}

// ----- Hazır içerik metni üretimi (ready_copy) -----

const FINDING_COPY_SYSTEM_PROMPT = `Sen bir Türkçe içerik stratejistisin. Görevin: tek bir doğrulanmış bulguya
dayanarak, web sitesinde DOĞRUDAN yayınlanabilir hazır metin üretmek.
Kurallar:
1. Çıktı, kullanıcının kopyalayıp sayfasına ekleyebileceği gerçek metin olmalı — "şunu yazın" gibi talimat DEĞİL.
2. Yalnızca verilen bulguya ve sayfa içeriğine dayan; uydurma bilgi/istatistik EKLEME.
3. AI motorlarının alıntılayabileceği net, doğrudan, soru-yanıt odaklı bir dil kullan.
4. Markdown formatında yaz. Açıklama/önsöz ekleme, sadece içeriği ver.`

export interface FindingCopyInput {
  title: string
  description: string
  category: string
  actionPayload?: Record<string, unknown> | null
}

/**
 * Tek bir doğrulanmış içerik bulgusu için yayınlanabilir hazır metin üretir.
 * review-only: kullanıcı yayınlamadan önce gözden geçirmeli.
 */
export async function generateFindingCopy(
  issue: FindingCopyInput,
  snapshot: SnapshotData
): Promise<string> {
  const payload = (issue.actionPayload ?? {}) as Record<string, unknown>
  const targetUrl = payload.url as string | undefined
  const normalize = (u: string) => u.replace(/\/$/, '')
  const page = targetUrl
    ? snapshot.pages.find(p => normalize(p.url) === normalize(targetUrl))
    : undefined

  const pageContext = page
    ? {
        url: page.url,
        title: page.title,
        h1: page.h1,
        h2Array: page.h2Array.slice(0, 8),
        wordCount: page.wordCount,
        metaDescription: page.metaDescription,
      }
    : null

  const missingQuestions = (payload.missingQuestions as string[] | undefined) ?? []
  const suggestedFaqItems = (payload.suggestedFaqItems as Array<{ question: string; answer?: string }> | undefined) ?? []
  const contentGap = payload.contentGap as string | undefined
  const recommendation = payload.recommendation as string | undefined

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system: FINDING_COPY_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Bulgu: ${issue.title}
${issue.description}

${pageContext ? `Hedef sayfa:\n${JSON.stringify(pageContext, null, 2)}` : 'Hedef sayfa belirtilmedi — site geneli içerik üret.'}
${contentGap ? `\nEksik içerik: ${contentGap}` : ''}
${recommendation ? `\nÖneri: ${recommendation}` : ''}
${missingQuestions.length > 0 ? `\nYanıtlanması gereken sorular:\n${missingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}
${suggestedFaqItems.length > 0 ? `\nÖnerilen SSS başlıkları:\n${suggestedFaqItems.map(f => `- ${f.question}`).join('\n')}` : ''}

Bu bulguyu gidermek için yayınlanabilir hazır metni üret.`,
        },
      ],
    })

    return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch (err) {
    console.error('[LLM] generateFindingCopy başarısız:', err)
    return ''
  }
}

// ----- Toplu analiz yardımcısı -----

/**
 * Sayfaları 5'erli gruplar halinde analiz eder.
 * Maliyet optimizasyonu: sadece değişmiş sayfalar geçilmeli.
 */
export async function analyzePagesBatched(pages: PageSnapshot[]): Promise<ContentIssue[]> {
  const results: ContentIssue[] = []

  for (let i = 0; i < pages.length; i += 3) {
    const batch = pages.slice(i, i + 3)
    const batchResults = await analyzePageContent(batch)
    results.push(...batchResults)
  }

  return results
}
