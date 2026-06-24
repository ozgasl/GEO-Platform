# Obsey — Claude Code Memory

## Proje Özeti
Obsey — GEO (Generative Engine Optimization) SaaS platformu. ChatGPT, Claude, Perplexity gibi AI arama motorlarında site görünürlüğünü analiz eder ve otomatik iyileştirir.

**Branch:** `main`
**Repo:** `ozgasl/GEO-Platform`
**Versiyon:** v1.0.4

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
- **AI-bot 403 tespiti DOĞRULANDI (2026-06-03):** puntodijital.com, roipublic.com, pindrinks.com — üçü de "GPTBot engellendi (HTTP 403)" raporladı; gerçek pozitif, Obsey hatası değil. Sadece UA değişince `GPTBot`→403 / tarayıcı→200 (UA-bazlı WAF engeli, rate-limit değil). Çözüm site sahibinde: Cloudflare/WAF'ta AI UA'larını allow-list'e ekleme. **Açık nüans (ertelendi):** probe'lara (robots/sitemap/llms) gelen 403, `isThrottledOrUnknownStatus` yalnız 429/5xx'e baktığından "yok" sanılıyor — PARTIAL taramada panelde yanıltıcı olabilir.

## Plan Sistemi (v1.0.3)

### Plan enum (prisma/schema.prisma)
```
FREE      → yeni kullanıcı default; 1 site, 1 crawl, 1 rapor, 1 e-posta
STARTER   → ücretli; 1 site, sınırsız crawl + haftalık rapor
AGENCY_5  → ücretli (Growth); 5 site
AGENCY_20 → ücretli (Scale); 20 site
```

### Kritik Plan Kuralları
- **Crawl gating:** `isPaid = plan !== 'FREE'` — sadece FREE kullanıcılar `freeReportUsed` sınırına tabi
- **scheduledCrawlJob + weeklyReportJob:** `user.plan: { not: 'FREE' }` filtresi — FREE kullanıcıların siteleri otomatik taranmaz, haftalık rapor almaz

### Aktif/Pasif Site (v1.0.4)
- **Plan limiti artık AKTİF site sayısı:** `PLAN_ACTIVE_SITE_LIMITS` (`lib/plans.ts`) tek kaynak — FREE=1, STARTER=1, AGENCY_5=5, AGENCY_20=20. Ücretli kullanıcılarda toplam kayıtlı site **sınırsız**, yalnızca aynı anda aktif olan site sayısı sınırlı. FREE dokunulmadı: toplam 1 site, her zaman aktif, toggle yok.
- **`Site.isActive`** zaten şemada mevcuttu — migration gerekmez.
- **Yeni site + limit dolu (ücretli):** site `isActive: false` kaydedilir, crawl tetiklenmez; API yanıtı `savedAsPassive: true` döner (UI uyarısı için).
- **Aktif/pasif toggle:** `PATCH /api/sites/[siteId]/active` `{ active: boolean }` — FREE'ye kapalı (403). Pasifleştirme her zaman serbest; aktifleştirme aktif sayısı `< limit` ise serbest, değilse 403. UI: `components/dashboard/ActiveToggle.tsx` (dashboard site listesi kartlarında).
- **Pasif siteler tarama/rapor ALAMAZ:** manuel crawl (`crawl/route.ts`) ve manuel rapor (`reports/route.ts` POST) artık `!site.isActive` ise 403 döner. Otomatik joblar (`scheduledCrawlJob`/`weeklyReportJob`) zaten `isActive: true` filtreliydi.

- **Admin API (`/api/admin/users/[userId]/plan`):** form POST alır (`application/x-www-form-urlencoded`), başarıda `/admin`'e redirect döner
- **Admin form:** native HTML form, `method="POST"`, JSON değil form-encoded gönderir

### PostgreSQL Enum Migration Kritik Notu
`ALTER TYPE ... ADD VALUE` **Prisma 5.22'de transaction içinde kullanamazsın**:
- `-- This migration does not run in a transaction.` pragma'sı Prisma 5.x'te **çalışmaz** (Prisma 6+ özelliği)
- Çözüm: Migration'ı **iki ayrı dosyaya böl** — ilki sadece `ALTER TYPE` (kendi transaction'ında commit olur), ikincisi `UPDATE` + `ALTER DEFAULT`
- Örnek: `20260618000000_add_free_plan` (sadece ALTER TYPE) + `20260618000100_migrate_free_plan_data` (UPDATE + ALTER DEFAULT)
- Gelecekte enum değeri eklerken aynı pattern'i uygula

### Neon Production Migration Prosedürü
Railway shell'de (container yeniden başlatılmış olmalı):
```bash
npx prisma migrate deploy
```
Başarısız migration varsa önce:
```bash
npx prisma migrate resolve --rolled-back <migration_name>
npx prisma migrate deploy
```

---

## Sonraki Adımlar (v1.1)
- Pilot Mode (automated apply to customer sites) — Opus design pass required first
- Payment provider integration (iyzico/PayTR — agreements pending)
- Stripe entegrasyonu
- Dashboard'da "Rapor Oluştur" butonu (isteğe bağlı, crawl sonrası zaten otomatik)
