import { db } from '@/lib/db'
import { decryptToken } from './snippet'

/** Bilinen AI bot UA pattern'ları → canonical bot adı */
const BOT_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // OpenAI
  { pattern: /GPTBot/i,            name: 'gptbot' },
  { pattern: /OAI-SearchBot/i,     name: 'oai_searchbot' },
  { pattern: /ChatGPT-User/i,      name: 'chatgpt_user' },
  // Anthropic
  { pattern: /ClaudeBot/i,         name: 'claudebot' },
  { pattern: /anthropic-ai/i,      name: 'claudebot' },
  // Perplexity
  { pattern: /PerplexityBot/i,     name: 'perplexitybot' },
  // Google
  { pattern: /Google-Extended/i,   name: 'google_extended' },
  { pattern: /Googlebot/i,         name: 'googlebot' },
  // Meta
  { pattern: /meta-externalagent/i, name: 'meta_ai' },
  // Apple
  { pattern: /Applebot-Extended/i, name: 'applebot_extended' },
  // You.com
  { pattern: /YouBot/i,            name: 'youbot' },
  // Amazon
  { pattern: /Amazonbot/i,         name: 'amazonbot' },
  // DuckDuckGo
  { pattern: /DuckAssistBot/i,     name: 'duckassistbot' },
  // ByteDance / TikTok
  { pattern: /Bytespider/i,        name: 'bytespider' },
  // Cohere
  { pattern: /cohere-ai/i,         name: 'cohere_ai' },
  // Bing
  { pattern: /bingbot/i,           name: 'bingbot' },
]

/**
 * User-Agent string'inden bot adını tespit eder.
 * Bilinmeyen UA → null.
 */
export function detectBot(userAgent: string): string | null {
  for (const { pattern, name } of BOT_PATTERNS) {
    if (pattern.test(userAgent)) return name
  }
  return null
}

type VisitCounts = Record<string, number>

/**
 * Beacon token'ını çözer, siteId'yi bulur ve en son snapshot'taki
 * aiCrawlerVisits sayacını artırır.
 */
export async function recordVisit(
  token: string,
  userAgent: string
): Promise<{ ok: boolean; reason?: string }> {
  const siteId = decryptToken(token)
  if (!siteId) return { ok: false, reason: 'invalid_token' }

  const snapshot = await db.snapshot.findFirst({
    where: { siteId },
    orderBy: { crawledAt: 'desc' },
    select: { id: true, aiCrawlerVisits: true },
  })

  if (!snapshot) return { ok: false, reason: 'no_snapshot' }

  const bot = detectBot(userAgent)
  // Botu bilinmeyen ziyaretçileri de kaydet — boş UA bile sayılır
  const key = bot ?? 'human'

  const current = (snapshot.aiCrawlerVisits ?? {}) as VisitCounts
  current[key] = (current[key] ?? 0) + 1

  await db.snapshot.update({
    where: { id: snapshot.id },
    data: { aiCrawlerVisits: current },
  })

  return { ok: true }
}
