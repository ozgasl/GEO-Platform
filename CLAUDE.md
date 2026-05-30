# GEO Platform — Claude Code Memory

## Proje Özeti
GEO (Generative Engine Optimization) SaaS platformu. ChatGPT, Claude, Perplexity gibi AI arama motorlarında site görünürlüğünü analiz eder ve otomatik iyileştirir.

**Branch:** `claude/geo-platform-crawl-analysis-BXaUw`
**Repo:** `ozgasl/GEO-Platform`
**Versiyon:** v0.1.1

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
  reports/generator.ts   — generateReport(siteId, snapshotId)
  inngest/functions.ts   — crawl-site, scheduled-crawl, weekly-report, generate-report

app/api/sites/[siteId]/
  crawl/route.ts         — POST: "Şimdi Tara" tetikleme (fire-and-forget)
  issues/[id]/approve    — POST: applyAction
  issues/[id]/dismiss    — POST: DISMISSED
  actions/[id]/revert    — POST: revertAction

components/dashboard/
  ScanButton.tsx   — "Şimdi Tara" + polling
  IssueTabs.tsx    — Bekleyen / Tamamlanan sekmeleri
  IssueList.tsx    — Pending issue'lar + approve/dismiss
  ModeToggle.tsx   — ADVISOR ↔ PILOT
  SnippetPanel.tsx — Monitoring snippet
```

---

## Bilinen Kısıtlamalar (v0.1.1)

1. **Playwright + Vercel:** Serverless'ta çalışmaz; ayrı worker gerektirir
2. **"Şimdi Tara" fire-and-forget:** Yerel dev için yeterli; production'da Inngest eventi kullanılmalı
3. **applyAction imzası:** `applyAction(issueId, appliedBy)` — sadece 2 parametre
4. **Google OAuth:** Henüz test edilmedi (GOOGLE_CLIENT_ID boş bırakılabilir)

## Sonraki Adımlar (v0.2)
- Google OAuth canlı testi
- Vercel deploy + Playwright worker (Railway/Fly.io)
- Plan limiti kontrolleri (STARTER: 1 site)
- Stripe entegrasyonu
