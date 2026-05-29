import { db } from '@/lib/db'
import { generateLlmsTxt, generateSchemaMarkup } from '@/lib/analyzer/llm'
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
  const schemaType = payload.schemaType as string

  const page = snapshotData.pages.find(p => p.url === targetUrl)
  if (!page) throw new Error(`Sayfa bulunamadı: ${targetUrl}`)

  const existingSchemas = page.jsonLdSchemas
    .map(s => JSON.stringify(s, null, 2))
    .join('\n')

  const after = await generateSchemaMarkup(page, schemaType)
  if (!after) throw new Error(`${schemaType} schema üretilemedi.`)

  return {
    changeType: 'schema_added',
    before: existingSchemas || null,
    after,
    instructions: `Bu kodu ${targetUrl} sayfasının <head> bölümüne ekleyin.`,
    isReversible: true,
  }
}

async function applyFaqSuggestion(
  payload: Record<string, unknown>
): Promise<{ changeType: string; before: string | null; after: string; instructions: string; isReversible: boolean }> {
  const items = (payload.suggestedFaqItems ?? []) as Array<{ question: string; answer?: string }>

  const markdown = items
    .map(i => `**S: ${i.question}**\nC: ${i.answer ?? '(yanıt ekleyin)'}`)
    .join('\n\n')

  const html = `<div class="faq-section">\n${items
    .map(
      i =>
        `  <div class="faq-item">\n    <h3>${i.question}</h3>\n    <p>${i.answer ?? ''}</p>\n  </div>`
    )
    .join('\n')}\n</div>`

  const after = `## Markdown\n\n${markdown}\n\n---\n\n## HTML\n\n${html}`

  return {
    changeType: 'faq_suggested',
    before: null,
    after,
    instructions: 'Bu içeriği ilgili sayfanın uygun bölümüne ekleyin.',
    isReversible: false,
  }
}

// ----- Ana fonksiyon -----

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

  const snapshotData = dbSnapshotToData(issue.snapshot)
  const siteUrl = issue.snapshot.site.url
  const payload = (issue.actionPayload ?? {}) as Record<string, unknown>
  const fixType = (payload.fixType as string) ?? issue.actionType

  let result: Awaited<ReturnType<typeof applyLlmsTxtUpdate>>

  switch (fixType) {
    case 'generate_llms_txt':
    case 'update_llms_txt':
    case 'regenerate_llms_txt':
      result = await applyLlmsTxtUpdate(snapshotData, siteUrl)
      break

    case 'robots_allow_ai_bots':
      result = await applyRobotsFix(siteUrl)
      break

    case 'add_schema':
      result = await applySchemaInjection(payload, snapshotData)
      break

    default:
      // CONTENT_SUGGESTION / FAQ / diğerleri
      result = await applyFaqSuggestion(payload)
  }

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
