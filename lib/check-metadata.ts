// Check metadata — tek, gözden geçirilebilir statik config.
//
// Her check türünün hangi KATMANA ait olduğu, gerçekte hangi AI motorlarını
// etkilediği ve fix çıktısının nasıl üretileceği (deterministik prompt mu, LLM
// ile hazır metin mi) burada deterministik olarak tanımlanır. Runtime'da LLM
// ile türetilmez — Issue.category'den okunur.
//
// NOT: Obsey'de Issue'lar `category` ile sınıflandırılır (stabil per-check id
// yoktur) ve skorlama da category bazlıdır; bu yüzden aktif metadata category
// ile anahtarlanır. Henüz taranmayan check'ler (markdown negotiation, content
// signals, frontier ajan katmanı) FUTURE_CHECKS altında dokümante edilir ama
// bulgu üretmedikleri için UI'da görünmezler.

export type CheckLayer = 'bedrock' | 'ai_specific' | 'frontier'
export type CheckEngine = 'chatgpt' | 'claude' | 'perplexity' | 'google_ai_overviews'
export type FixDelivery = 'agent_prompt' | 'ready_copy'

export type IssueCategory = 'ROBOTS' | 'LLMS_TXT' | 'SCHEMA' | 'CONTENT' | 'TECHNICAL'

export interface CheckMetadata {
  // bedrock = klasik SEO + AI ortak zemini (her motorda geçerli)
  // ai_specific = klasik botların kullanmadığı, AI/agent motorlarına özgü katman
  // frontier = erken aşama; yalnızca izlenir, skor ağırlığı düşük/sıfır
  layer: CheckLayer
  // Bu check'in gerçekte etkilediği motorlar. 'all' = tüm AI motorları.
  engines: CheckEngine[] | 'all'
  // agent_prompt = kod/config; deterministik template ile prompt üretilir (LLM yok)
  // ready_copy   = içerik; taranan içerikten LLM ile hazır metin üretilir (review-only)
  fixDelivery: FixDelivery
  // Kullanıcıya gösterilecek dürüst not (TR). Motor-farkındalığı için.
  note?: string
}

// Honest notlar — tekrar kullanım için sabit.
const GOOGLE_AIO_NOTE =
  'Google AI Overviews bunu kullanmaz (kendi indeksinde RAG yapar); ChatGPT / Claude / Perplexity için geçerlidir.'
const SCHEMA_NOTE =
  'AI araması için zorunlu değil (Google rehberi); SEO ve zengin sonuçlar için faydalı.'

// ----- Aktif metadata (category ile anahtarlı) -----

export const CATEGORY_METADATA: Record<IssueCategory, CheckMetadata> = {
  // robots.txt taranabilirlik / AI bot kuralları
  ROBOTS: { layer: 'bedrock', engines: 'all', fixDelivery: 'agent_prompt' },
  // HTTPS, sitemap.xml, teknik sağlık, schema namespace
  TECHNICAL: { layer: 'bedrock', engines: 'all', fixDelivery: 'agent_prompt' },
  // JSON-LD schema markup
  SCHEMA: { layer: 'bedrock', engines: 'all', fixDelivery: 'agent_prompt', note: SCHEMA_NOTE },
  // İçerik kalitesi / cite-edilebilirlik / FAQ — hazır metin üretilir
  CONTENT: { layer: 'bedrock', engines: 'all', fixDelivery: 'ready_copy' },
  // llms.txt — klasik botların kullanmadığı AI'a özgü dosya
  LLMS_TXT: {
    layer: 'ai_specific',
    engines: ['chatgpt', 'claude', 'perplexity'],
    fixDelivery: 'agent_prompt',
    note: GOOGLE_AIO_NOTE,
  },
}

const DEFAULT_METADATA: CheckMetadata = {
  layer: 'bedrock',
  engines: 'all',
  fixDelivery: 'agent_prompt',
}

/** Bir bulgunun (category) statik metadata'sını döndürür. Bilinmeyen category → güvenli default. */
export function getCheckMetadata(category: string): CheckMetadata {
  return CATEGORY_METADATA[category as IssueCategory] ?? DEFAULT_METADATA
}

// ----- Dokümante / pasif check'ler -----
// Bunlar henüz taranmıyor (bulgu üretmiyorlar). Tablo eksiksiz olsun ve gelecekte
// aynı mantıkla doldurulabilsin diye burada tutuluyor. UI'da render EDİLMEZ.
// Yeni tarama eklemeden önce buraya bakılmalı.

export interface FutureCheck extends CheckMetadata {
  id: string
  label: string
}

export const FUTURE_CHECKS: FutureCheck[] = [
  {
    id: 'markdown_negotiation',
    label: 'Markdown content negotiation (Accept: text/markdown)',
    layer: 'ai_specific',
    engines: ['chatgpt', 'claude', 'perplexity'],
    fixDelivery: 'agent_prompt',
    note: GOOGLE_AIO_NOTE,
  },
  {
    id: 'content_signals',
    label: 'Content signals (robots.txt Content-Signal)',
    layer: 'ai_specific',
    engines: ['chatgpt', 'claude', 'perplexity'],
    fixDelivery: 'agent_prompt',
    note: GOOGLE_AIO_NOTE,
  },
  // ⚠️ TUZAK — content_signals'i SHIP ETMEDEN ÖNCE OKU:
  // Aktif metadata `category` ile anahtarlı (getCheckMetadata) ve content_signals
  // bir robots.txt directive'i olduğu için doğal olarak ROBOTS kategorisine düşer.
  // ROBOTS şu an `bedrock` + `engines: 'all'` — yani content_signals bunu miras
  // ALIRSA yanlışlıkla "Google AI Overviews için de geçerli" iddiası üretir.
  // OYSA content_signals `ai_specific` olmalı ve google_ai_overviews DIŞLANMALI
  // (yukarıdaki bu girdideki gibi). Bu yüzden taramayı eklerken İKİSİNDEN biri:
  //   (a) content_signals'e KENDİ metadata anahtarını ver (ROBOTS'tan miras alma), VEYA
  //   (b) metadata granülaritesini category-level'dan check-level'a çıkar.
  // ROBOTS/bedrock metadata'sını OLDUĞU GİBİ miras ALMA.
  {
    id: 'mcp_server_card',
    label: 'MCP server card / WebMCP / agent skills index / API catalog',
    layer: 'frontier',
    engines: [],
    fixDelivery: 'agent_prompt',
    note: 'Erken aşama (ajan motorları); şimdilik izleniyor.',
  },
  {
    id: 'oauth_oidc_discovery',
    label: 'OAuth / OIDC discovery, protected resource',
    layer: 'frontier',
    engines: [],
    fixDelivery: 'agent_prompt',
    note: 'Erken aşama (ajan motorları); şimdilik izleniyor.',
  },
  {
    id: 'dns_aid_commerce',
    label: 'DNS-AID, commerce (x402 vb.)',
    layer: 'frontier',
    engines: [],
    fixDelivery: 'agent_prompt',
    note: 'Erken aşama (ajan motorları); şimdilik izleniyor.',
  },
]

// ----- UI sözlükleri (TR) -----

export const LAYER_LABEL: Record<CheckLayer, string> = {
  bedrock: 'Klasik + AI ortak',
  ai_specific: "AI'a özgü",
  frontier: 'İzleniyor',
}

// Rozet renkleri (Tailwind). frontier düşük görsel ağırlık taşır.
export const LAYER_STYLE: Record<CheckLayer, string> = {
  bedrock: 'bg-slate-100 text-slate-700 ring-slate-200',
  ai_specific: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  frontier: 'bg-amber-50 text-amber-700 ring-amber-200',
}

export const ENGINE_LABEL: Record<CheckEngine, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  perplexity: 'Perplexity',
  google_ai_overviews: 'Google AI Overviews',
}

/** engines alanını UI chip etiketlerine çevirir. 'all' → tek "Tüm AI motorları" chip'i. */
export function engineLabels(engines: CheckEngine[] | 'all'): string[] {
  if (engines === 'all') return ['Tüm AI motorları']
  return engines.map(e => ENGINE_LABEL[e])
}
