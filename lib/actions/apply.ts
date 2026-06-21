import { db } from '@/lib/db'
import { generateLlmsTxt, generateSchemaMarkup, generateFindingCopy } from '@/lib/analyzer/llm'
import { getCheckMetadata } from '@/lib/check-metadata'
import { buildAgentPrompt } from '@/lib/fixes/agent-prompt'
import type { PageSnapshot, SnapshotData } from '@/lib/types'

const FETCH_TIMEOUT = 10_000

export interface ApplyResult {
  success: boolean
  actionId: string
  changeType: string
  before: string | null
  after: string
  instructions: string
  isReversible: boolean
}

export interface PreviewResult {
  changeType: string
  before: string | null
  after: string
  instructions: string
  isReversible: boolean
}

export interface FixOutputResult {
  // agent_prompt = deterministik ajan prompt'u (LLM yok)
  // ready_copy   = LLM ile üretilmiş yayınlanabilir metin (review-only)
  fixDelivery: 'agent_prompt' | 'ready_copy'
  // Kopyalanacak/gösterilecek ana çıktı (prompt veya hazır metin)
  output: string
  // Kısa açıklama / kullanım talimatı
  instructions: string
  // ready_copy için true → "yayınlamadan önce gözden geçir" etiketi
  reviewRequired: boolean
}

// ----- Yardımcılar -----

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
    return res.ok ? res.text() : null
  } catch {
    return null
  }
}

function dbSnapshotToData(
  s: Awaited<ReturnType<typeof db.snapshot.findUniqueOrThrow>>
): SnapshotData {
  return {
    id: s.id,
    siteId: s.siteId,
    crawledAt: s.crawledAt,
    hasLlmsTxt: s.hasLlmsTxt,
    llmsTxtContent: s.llmsTxtContent,
    hasRobotsTxt: s.hasRobotsTxt,
    robotsBlocksAI: s.robotsBlocksAI,
    hasSitemap: s.hasSitemap,
    httpsEnabled: s.httpsEnabled,
    pages: s.pages as unknown as PageSnapshot[],
    previousSnapshotId: s.previousSnapshotId,
  }
}

/** Robots.txt'e AI botlara Allow kuralları ekler; mevcut blokları korur. */
function addAiBotAllowRules(current: string): string {
  const bots = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot']
  let result = current.trimEnd()

  for (const bot of bots) {
    if (!new RegExp(`User-agent:\\s*${bot}`, 'i').test(result)) {
      result += `\n\nUser-agent: ${bot}\nAllow: /`
    }
  }

  return result
}

// ----- Aksiyon handler'ları -----

async function applyLlmsTxtUpdate(
  snapshotData: SnapshotData,
  siteUrl: string
): Promise<{ changeType: string; before: string | null; after: string; instructions: string; isReversible: boolean }> {
  const before = snapshotData.llmsTxtContent
  const after = await generateLlmsTxt(snapshotData)

  if (!after) throw new Error('llms.txt içeriği üretilemedi.')

  return {
    changeType: 'llms_txt_updated',
    before,
    after,
    instructions: `Bu içeriği sitenizin kök dizinine llms.txt olarak yükleyin: ${new URL(siteUrl).origin}/llms.txt`,
    isReversible: !!before,
  }
}

async function applyRobotsFix(
  siteUrl: string
): Promise<{ changeType: string; before: string | null; after: string; instructions: string; isReversible: boolean }> {
  const origin = new URL(siteUrl).origin
  const before = await fetchText(`${origin}/robots.txt`)
  const after = addAiBotAllowRules(before ?? 'User-agent: *\nAllow: /')

  return {
    changeType: 'robots_txt_updated',
    before,
    after,
    instructions: `Mevcut robots.txt dosyanızı aşağıdaki içerikle değiştirin: ${origin}/robots.txt`,
    isReversible: true,
  }
}

async function applySchemaInjection(
  payload: Record<string, unknown>,
  snapshotData: SnapshotData
): Promise<{ changeType: string; before: string | null; after: string; instructions: string; isReversible: boolean }> {
  const targetUrl = payload.url as string
  // "TechArticle + FAQPage" gibi bileşik türlerde ilk türü al
  const rawSchemaType = payload.schemaType as string
  const primarySchemaType = rawSchemaType.split('+')[0].trim()

  const normalize = (u: string) => u.replace(/\/$/, '')
  const page = snapshotData.pages.find(p => normalize(p.url) === normalize(targetUrl))
  if (!page) throw new Error(`Sayfa bulunamadı: ${targetUrl}`)

  const existingSchemas = page.jsonLdSchemas
    .map(s => JSON.stringify(s, null, 2))
    .join('\n')

  // LLM ile dene; başarısız olursa temel şablon üret
  let after = await generateSchemaMarkup(page, primarySchemaType)

  if (!after) {
    after = buildFallbackSchema(primarySchemaType, page, snapshotData)
  }

  return {
    changeType: 'schema_added',
    before: existingSchemas || null,
    after,
    instructions: `Bu kodu ${targetUrl} sayfasının <head> bölümüne ekleyin.`,
    isReversible: true,
  }
}

/** LLM başarısız olduğunda temel JSON-LD şablonu üretir. */
function buildFallbackSchema(schemaType: string, page: { url: string; title: string; h1: string | null; metaDescription: string | null }, snapshotData: SnapshotData): string {
  const siteUrl = snapshotData.hasLlmsTxt !== undefined
    ? new URL(page.url).origin
    : page.url

  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    url: page.url,
    name: page.title || page.h1 || siteUrl,
    description: page.metaDescription || '',
  }

  if (schemaType === 'Organization') {
    base['@type'] = 'Organization'
    base.url = siteUrl
    base.contactPoint = { '@type': 'ContactPoint', contactType: 'customer service' }
  } else if (schemaType === 'Product') {
    base['@type'] = 'Product'
  } else if (schemaType === 'Article' || schemaType === 'TechArticle') {
    base['@type'] = schemaType
    base.headline = page.title || page.h1
    base.author = { '@type': 'Organization', name: new URL(page.url).hostname }
    base.datePublished = new Date().toISOString().split('T')[0]
  } else if (schemaType === 'FAQPage') {
    base['@type'] = 'FAQPage'
    base.mainEntity = []
  }

  return `<script type="application/ld+json">\n${JSON.stringify(base, null, 2)}\n</script>`
}

async function applyFaqSuggestion(
  payload: Record<string, unknown>
): Promise<{ changeType: string; before: string | null; after: string; instructions: string; isReversible: boolean }> {
  const items = (payload.suggestedFaqItems ?? []) as Array<{ question: string; answer?: string }>
  const missingQuestions = (payload.missingQuestions ?? []) as string[]
  const contentGap = payload.contentGap as string | undefined

  // suggestedFaqItems yoksa mevcut payload alanlarından içerik önerisi üret
  if (items.length === 0) {
    const recommendation = payload.recommendation as string | undefined
    const sections: string[] = ['## İçerik Önerisi']

    if (recommendation) {
      sections.push('', recommendation)
    }

    if (contentGap) {
      sections.push('', '### Eksik İçerik', contentGap)
    }

    if (missingQuestions.length > 0) {
      sections.push(
        '',
        '### Yanıtlanması Gereken Sorular',
        missingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')
      )

      sections.push('', '---', '', '## HTML Şablonu (Doldurun)', '')
      const html = `<div class="faq-section">\n${missingQuestions
        .map(q => `  <div class="faq-item">\n    <h3>${q}</h3>\n    <p><!-- Yanıtı buraya yazın --></p>\n  </div>`)
        .join('\n')}\n</div>`
      sections.push(html)
    }

    return {
      changeType: 'faq_suggested',
      before: null,
      after: sections.join('\n'),
      instructions: 'Bu içerik önerisine göre sayfanıza içerik ekleyin.',
      isReversible: false,
    }
  }

  // suggestedFaqItems varsa mevcut mantık
  const markdown = items
    .map(i => `**S: ${i.question}**\nC: ${i.answer ?? '(yanıt ekleyin)'}`)
    .join('\n\n')

  const html = `<div class="faq-section">\n${items
    .map(i => `  <div class="faq-item">\n    <h3>${i.question}</h3>\n    <p>${i.answer ?? ''}</p>\n  </div>`)
    .join('\n')}\n</div>`

  return {
    changeType: 'faq_suggested',
    before: null,
    after: `## Markdown\n\n${markdown}\n\n---\n\n## HTML\n\n${html}`,
    instructions: 'Bu içeriği ilgili sayfanın uygun bölümüne ekleyin.',
    isReversible: false,
  }
}

// ----- Ana fonksiyon -----

/** İçerik üretimi — DB yazma olmadan. applyAction ve previewAction tarafından paylaşılır. */
async function generateContent(issueId: string): Promise<PreviewResult> {
  const issue = await db.issue.findUniqueOrThrow({
    where: { id: issueId },
    include: {
      snapshot: {
        include: { site: true },
      },
    },
  })

  const snapshotData = dbSnapshotToData(issue.snapshot)
  const siteUrl = issue.snapshot.site.url
  const payload = (issue.actionPayload ?? {}) as Record<string, unknown>
  const fixType = (payload.fixType as string) ??
    (payload.schemaType ? 'add_schema' : issue.actionType)

  switch (fixType) {
    case 'generate_llms_txt':
    case 'update_llms_txt':
    case 'regenerate_llms_txt':
      return applyLlmsTxtUpdate(snapshotData, siteUrl)

    case 'robots_allow_ai_bots':
      return applyRobotsFix(siteUrl)

    case 'add_schema':
      return applySchemaInjection(payload, snapshotData)

    default:
      return applyFaqSuggestion(payload)
  }
}

/**
 * Bir issue için uygun aksiyonu uygular, Action kaydı oluşturur.
 * Issue status → APPLIED güncellenir.
 */
export async function applyAction(
  issueId: string,
  appliedBy: 'USER_APPROVED' | 'AUTO_PILOT'
): Promise<ApplyResult> {
  const issue = await db.issue.findUniqueOrThrow({
    where: { id: issueId },
    include: {
      snapshot: {
        include: { site: true },
      },
    },
  })

  if (issue.status === 'APPLIED') {
    const existing = await db.action.findUnique({ where: { issueId } })
    if (existing) {
      return {
        success: true,
        actionId: existing.id,
        changeType: existing.changeType,
        before: existing.before,
        after: existing.after,
        instructions: 'Bu aksiyon zaten uygulandı.',
        isReversible: existing.isReversible,
      }
    }
  }

  const result = await generateContent(issueId)

  // DB transaction: Action oluştur + Issue status güncelle
  const [action] = await db.$transaction([
    db.action.create({
      data: {
        siteId: issue.snapshot.site.id,
        issueId,
        appliedBy,
        changeType: result.changeType,
        before: result.before,
        after: result.after,
        isReversible: result.isReversible,
      },
    }),
    db.issue.update({
      where: { id: issueId },
      data: { status: 'APPLIED' },
    }),
  ])

  return {
    success: true,
    actionId: action.id,
    changeType: result.changeType,
    before: result.before,
    after: result.after,
    instructions: result.instructions,
    isReversible: result.isReversible,
  }
}

/**
 * ADVISOR modu Danışman çıktısı — DB'ye yazmaz.
 * fixDelivery'ye göre:
 *  - agent_prompt → deterministik ajan prompt'u (LLM çağrısı YOK)
 *  - ready_copy   → tek bulguya dayalı LLM hazır metni (review-only)
 */
export async function previewFix(issueId: string): Promise<FixOutputResult> {
  const issue = await db.issue.findUniqueOrThrow({
    where: { id: issueId },
    include: { snapshot: { include: { site: true } } },
  })

  const metadata = getCheckMetadata(issue.category)
  const payload = (issue.actionPayload ?? null) as Record<string, unknown> | null

  if (metadata.fixDelivery === 'ready_copy') {
    const snapshotData = dbSnapshotToData(issue.snapshot)
    const output = await generateFindingCopy(
      { title: issue.title, description: issue.description, category: issue.category, actionPayload: payload },
      snapshotData
    )
    if (!output) throw new Error('İçerik metni üretilemedi. Lütfen tekrar deneyin.')
    return {
      fixDelivery: 'ready_copy',
      output,
      instructions: 'Aşağıdaki hazır metni sayfanıza ekleyebilirsiniz.',
      reviewRequired: true,
    }
  }

  // agent_prompt — deterministik, LLM yok
  const output = buildAgentPrompt(
    { category: issue.category, severity: issue.severity, title: issue.title, description: issue.description, actionPayload: payload },
    issue.snapshot.site.url
  )
  return {
    fixDelivery: 'agent_prompt',
    output,
    instructions: "Bu prompt'u coding agent'ınıza (ör. Claude Code) yapıştırın.",
    reviewRequired: false,
  }
}

/**
 * Geriye dönük uyumluluk: eski içerik üretimi (DB yazmaz).
 * @deprecated previewFix kullanın.
 */
export async function previewAction(issueId: string): Promise<PreviewResult> {
  return generateContent(issueId)
}
