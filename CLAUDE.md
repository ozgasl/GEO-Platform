# Obsey — Claude Code Memory

## Proje Özeti
Obsey — GEO (Generative Engine Optimization) SaaS platformu. ChatGPT, Claude, Perplexity gibi AI arama motorlarında site görünürlüğünü analiz eder ve otomatik iyileştirir.

**Branch:** `main`
**Repo:** `ozgasl/GEO-Platform`
**Versiyon:** v1.0.2

---

## Stack
- **Framework:** Next.js 14.2 (App Router, Server Components)
- **DB:** PostgreSQL 16 + Prisma 5.22
- **Auth:** NextAuth v5 beta (Google + Credentials)
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`), `@anthropic-ai/sdk`
- **Crawl:** Playwright (server-side, GPTBot UA)
- **Jobs:** Inngest (background, cron)
- **Email:** Resend
- **UI:** Tailwind CSS
- **Language:** TypeScript strict

---

## Yerel Kurulum (Docker PostgreSQL)

### PostgreSQL başlatma (Docker)
```powershell
docker start geo-postgres
# İlk kurulumda:
docker run -d --name geo-postgres `
  -e POSTGRES_USER=geo_user `
  -e POSTGRES_PASSWORD=geo_pass `
  -e POSTGRES_DB=geo_platform `
  -p 5432:5432 `
  postgres:16
```

### .env
```env
DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
ANTHROPIC_API_KEY="..."
NEXTAUTH_SECRET="geo-platform-local-secret-2026"
NEXTAUTH_URL="http://localhost:3000"
MONITORING_SECRET="geo-platform-monitoring-key-12345"
INNGEST_EVENT_KEY="test"
INNGEST_SIGNING_KEY="test"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Migration + test kullanıcısı
```powershell
npx prisma migrate deploy

$env:DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
npx tsx -e "
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
await db.user.upsert({ where: { email: 'test@test.com' }, update: {}, create: { email: 'test@test.com', name: 'Test Kullanici' } })
console.log('OK')
await db.\$disconnect()
"
```

---

## Test Komutları

### Birim testleri (101 test, DB gerektirir)
```powershell
$env:DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
$env:MONITORING_SECRET="geo-platform-monitoring-key-12345"
npx tsx scripts/test-local.ts
```

### Gerçek site crawl (Playwright + API key)
```powershell
$env:DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
$env:ANTHROPIC_API_KEY="sk-ant-..."
npx tsx scripts/test-crawl.ts https://example.com
```

### TypeScript kontrolü
```powershell
npx tsc --noEmit
```

---

## Manuel Crawl (DB'ye kaydeden)
`test-crawl.ts` DB'ye YAZMAZ. DB'ye kaydetmek için `lib/crawler/pipeline.ts`:
```powershell
$env:DATABASE_URL="..."
$env:ANTHROPIC_API_KEY="sk-ant-..."
npx tsx -e "
import { runCrawlPipeline } from './lib/crawler/pipeline.js'
await runCrawlPipeline('SITE_ID')
console.log('Tamamlandi')
"
```

---

## Mimari Özeti

```
lib/
  crawler/index.ts       — discoverUrls, prioritizeUrls, crawlSite (DB'ye kaydeder)
  crawler/pipeline.ts    — runCrawlPipeline(): crawl+analiz+kuyruk (tam akış)
  analyzer/rules.ts      — 6 deterministik kural
  analyzer/llm.ts        — Claude API: analyzePageContent, generateLlmsTxt, generateSchemaMarkup
  analyzer/index.ts      — runAnalysis(): kural + LLM, idempotent
  actions/apply.ts       — applyAction(issueId, appliedBy) — 2 parametre!
  actions/queue.ts       — queueActions(siteId, snapshotId, issues)
  actions/revert.ts      — revertAction(actionId)
  monitoring/snippet.ts  — encryptSiteId, generateSnippet
  monitoring/tracker.ts  — detectBot, recordVisit
  reports/score.ts       — calculateGeoScore(snapshot, issues): GeoScore
  reports/generator.ts   — generateReport(siteId, triggerType?) — 'MANUAL' | 'WEEKLY', snapshotId kaydeder
  inngest/functions.ts   — crawl-site, scheduled-crawl, weekly-report, generate-report

app/api/sites/[siteId]/
  crawl/route.ts                          — POST: "Şimdi Tara" (inngest.send → geo/site.crawl.requested)
  issues/[id]/approve                     — POST: applyAction
  issues/[id]/dismiss                     — POST: DISMISSED
  actions/[id]/revert                     — POST: revertAction
  reports/route.ts                        — GET: rapor listesi, POST: manuel rapor tetikleme
  reports/[reportId]/download/route.ts    — GET: ?type=action-plan|report → .md indir

components/dashboard/
  ScanButton.tsx   — "Şimdi Tara" + polling
  IssueTabs.tsx    — Bekleyen / Tamamlanan sekmeleri
  IssueList.tsx    — Pending issue'lar + approve/dismiss
  ModeToggle.tsx   — ADVISOR ↔ PILOT
  SnippetPanel.tsx — Monitoring snippet
  Sidebar.tsx      — Collapsible sidebar; sites prop (layout'tan), site listesi + navigasyon
```

---

## Kritik Mimari Notlar

- `runAnalysis()` SADECE analiz yapar, DB'ye yazmaz — IssueInput[] döner
- `queueActions()` DB'ye yazar (create) ve PILOT modda auto-apply yapar
- Bu ayrımı bozma: aksi hâlde her issue çiftlenir (DISMISSED + PENDING)
- `applyAction(issueId, appliedBy)` — sadece 2 parametre
- **Google OAuth session.user.id:** `getSessionUser()` kullan; `auth()` ile gelen `session.user.id` Google OAuth subject ID'si, DB CUID değil
- **Crawl sonrası rapor:** `crawlSiteJob` bitince `geo/report.requested` eventi gönderir → `generateReportJob` çalışır (triggerType: MANUAL)
- **Weekly rapor:** `weeklyReportJob` → `generateReport(siteId, 'WEEKLY')` — triggerType WEEKLY olarak kaydedilir

---

## Deployment Mimarisi (v0.2)

- **Railway = Inngest worker:** Tüm Inngest fonksiyonları (crawl, cron, report) Railway'de serve edilir. Playwright burada çalışır.
- **Vercel'i Inngest'e ASLA sync etme:** `serve()` sadece Railway'de. Vercel'de olursa çift cron + issue çiftlenmesi yaşanır.
- **Dockerfile tag = package.json sürümü:** `mcr.microsoft.com/playwright:v1.60.0-noble` (şu an). Sürüm uyuşmazsa Playwright yanlış tarayıcıyı arar ve patlar. playwright package.json'da caret olmadan pin'li tutulmalı.
- **"Şimdi Tara" artık Inngest eventi:** `/api/sites/[siteId]/crawl` `inngest.send({ name: "geo/site.crawl.requested" })` gönderir, `runCrawlPipeline` doğrudan çağrılmaz.
- **RESEND_API_KEY Railway'de gerekli:** `weekly-report` ve `generate-report` jobları email gönderir; Railway env'e eklenmelidir.
- **Neon pooled/direct ayrımı zorunlu:**
  - Vercel `DATABASE_URL` = `postgresql://...@ep-...-pooler.../neondb?sslmode=require&pgbouncer=true` ← `pgbouncer=true` ŞART
  - Railway/migration `DATABASE_URL` = direct URL (pooler yok, pgbouncer yok)
  - `DIRECT_URL` = her iki ortamda da direct URL
  - `pgbouncer=true` olmadan Vercel'de hazırlanan ifade çakışması (prepared statement conflict) nedeniyle 500 hatası alınır

---

## Önemli Notlar (v1.0.1)
- **PDF font:** `@expo-google-fonts/noto-sans@0.2.3` jsDelivr CDN — complete TTF (split subset kullanma!)
- **Brand assets:** `public/brand/` — "light" SVG = dark text (beyaz bg için), "dark" SVG = light text (koyu bg için)
- **DB admin scripts:** `scripts/` klasöründe `.ts` dosyası + `npx tsx scripts/dosya.ts` kullan; `npx tsx -e "..."` CJS top-level await hatası verir
- **Bing Webmaster:** doğrulandı; sitemap gönderildi
- **Google Search Console:** henüz yapılmadı — DNS TXT kaydı gerekiyor
- **`/admin` paneli:** mevcut sitenin arkasında gizli (ana domain + login + `ADMIN_EMAIL` kontrolü, sidebar'da link yok). `ADMIN_EMAIL` env değişkeni ayarlanmazsa `/admin` herkese "Yetkisiz erişim" döner — Vercel production env'de set edilmeli. Kullanıcı listesi/plan yönetiminin yanında tüm sitelerin listesi, GEO skoru ve rapor indirme linkleri de gösterilir (admin için `requireSiteOwner` bypass'ı `isAdminUser()` ile sağlanır).

## Sonraki Adımlar (v1.1)
- Pilot Mode (automated apply to customer sites) — Opus design pass required first
- Payment provider integration (iyzico/PayTR — agreements pending)
- Stripe entegrasyonu
- Dashboard'da "Rapor Oluştur" butonu (isteğe bağlı, crawl sonrası zaten otomatik)
