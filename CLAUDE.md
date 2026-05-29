# GEO Platform — Claude Code Memory

## Proje Özeti
GEO (Generative Engine Optimization) SaaS platformu. ChatGPT, Claude, Perplexity gibi AI arama motorlarında site görünürlüğünü analiz eder ve otomatik iyileştirir.

**Branch:** `claude/geo-platform-crawl-analysis-BXaUw`
**Repo:** `ozgasl/GEO-Platform`
**Versiyon:** v0.1.0 (MVP)

---

## Stack
- **Framework:** Next.js 14.2 (App Router, Server Components)
- **DB:** PostgreSQL 16 + Prisma 5.22
- **Auth:** NextAuth v5 beta (Google + Credentials)
- **AI:** Anthropic Claude API (`claude-sonnet-4-5`), `@anthropic-ai/sdk`
- **Crawl:** Playwright (server-side, GPTBot UA)
- **Jobs:** Inngest (background, cron)
- **Email:** Resend
- **UI:** Tailwind CSS
- **Language:** TypeScript strict

---

## Veritabanı
```
postgresql://geo_user:geo_pass@localhost:5432/geo_platform_test
```
PostgreSQL 16 başlatma: `pg_ctlcluster 16 main start`

Migrations:
```bash
DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform_test" npx prisma migrate dev
DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform_test" npx prisma migrate deploy
```

---

## Test Komutları

### Tüm birim testleri (101 test, DB gerektirir)
```bash
pg_ctlcluster 16 main start
DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform_test" \
MONITORING_SECRET="geo-platform-monitoring-key-12345" \
npx tsx scripts/test-local.ts
```

### Gerçek site crawl testi (Playwright + API key, yerel makinede)
```bash
ANTHROPIC_API_KEY="sk-ant-..." npx tsx scripts/test-crawl.ts https://example.com
```

### TypeScript kontrolü
```bash
npx tsc --noEmit
```

### Next.js build
```bash
npx next build
```

---

## Ortam Değişkenleri (.env)
```
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RESEND_API_KEY=re_...
REPORT_FROM_EMAIL=reports@geo-platform.com
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
MONITORING_SECRET=<16+ karakter rastgele string>
```

---

## Mimari — Dosya Haritası

```
lib/
  crawler/index.ts       ← Crawl Engine: discoverUrls, crawlPage, crawlSite
  analyzer/
    rules.ts             ← Deterministik kural motoru (6 kural, DB gerektirmez)
    llm.ts               ← Claude API: analyzePageContent, generateLlmsTxt, generateSchemaMarkup
    index.ts             ← runAnalysis(): kurallar + LLM, contentHash optimizasyonu
  actions/
    apply.ts             ← applyAction(): llms_txt, robots, schema, FAQ
    queue.ts             ← queueActions(): PILOT=otomatik, ADVISOR=bekle
    revert.ts            ← revertAction(): before→geri yükle, Issue→PENDING
  monitoring/
    snippet.ts           ← AES-128-CBC token, JS beacon snippet
    tracker.ts           ← detectBot(), recordVisit()
  reports/
    score.ts             ← calculateGeoScore(): 0-100, A-F
    generator.ts         ← generateReport(): ISO hafta period, DB kaydı
    email.ts             ← sendReportEmail(): Resend HTML
  inngest/
    client.ts            ← Inngest client + GeoEvents tip tanımları
    functions.ts         ← 4 job: crawl-site, scheduled-crawl, weekly-report, generate-report
  db.ts                  ← Prisma singleton
  types.ts               ← PageSnapshot, CrawlResult, ContentIssue, SnapshotData, IssueInput
  api-utils.ts           ← ok/err/unauthorized/forbidden/notFound, getSessionUser, requireSiteOwner

app/
  (auth)/login/          ← Giriş sayfası
  dashboard/             ← Site listesi
  dashboard/[siteId]/    ← Site detay + issue yönetimi
  dashboard/[siteId]/reports/  ← Rapor geçmişi
  api/
    auth/[...nextauth]/  ← NextAuth handler
    beacon/              ← Public tracking pixel (GET)
    inngest/             ← Inngest serve handler
    sites/               ← CRUD + mode + issues + approve/dismiss/revert + snippet + reports

components/dashboard/
  Sidebar, ScoreBadge, IssueList, ModeToggle, SnippetPanel, AddSiteForm
```

---

## Prisma Şeması — Temel Modeller
- **User** — NextAuth ile entegre, `plan: Plan`
- **Site** — `userId`, `url`, `mode: ADVISOR|PILOT`, `crawlFrequency: DAILY|WEEKLY`
- **Snapshot** — `pages: Json` (PageSnapshot[]), `aiCrawlerVisits: Json?`
- **Issue** — `severity`, `category`, `actionType: AUTO_FIX|CONTENT_SUGGESTION|MANUAL_REQUIRED`, `status: PENDING|APPLIED|DISMISSED`
- **Action** — `before/after: Text`, `isReversible`, `reversedAt?`
- **Report** — `period: String` (ISO hafta), `issuesFound/Fixed`, `aiCrawlerVisits`, `llmsTxtUpdated`

---

## Bilinen Kısıtlamalar (v0.1)

1. **Playwright + Remote Container:** Playwright tarayıcıları remote container'da indirilemiyor. Gerçek crawl testleri yerel makinede çalıştırılmalı.
2. **Crawl tetikleme UI'da yok:** Dashboard'da "Şimdi Tara" butonu implement edilmedi. Crawl yalnızca `crawlSite(siteId)` direkt çağrısı veya Inngest `geo/site.crawl.requested` eventi ile tetiklenebilir.
3. **Inngest Dev Server:** Cron ve background job'ların test edilmesi için `npx inngest-cli dev` gerekiyor.
4. **GEO skoru Dashboard'da hesaplanıyor:** `calculateGeoScore()` site detay sayfasında her render'da çağrılıyor. Report Engine'den score DB'ye kaydedilmiyor (Report modeli score alanı yok — v0.2'de eklenebilir).
5. **Login sayfası route:** NextAuth `pages.signIn: '/login'` ayarlandı ama route `app/(auth)/login/` altında — NextAuth redirect'i doğru çalışıyor, test edilmeli.

---

## Sonraki Oturum: Canlı Test ve Bugfix

Öncelik sırası:
1. PostgreSQL başlat, `npx next dev` ile geliştirme sunucusu aç
2. Google OAuth veya Credentials ile giriş
3. Site ekle → crawl tetikle → issue'ları gör → approve/dismiss
4. Monitoring snippet embed et, beacon endpoint'i test et
5. Manuel rapor oluştur (`POST /api/sites/[id]/reports`)
6. Inngest Dev Server ile job'ları test et

Muhtemel bug alanları:
- NextAuth Credentials callback URL
- `crawlSite()` çağrısını Dashboard'a bağlama (şimdi sadece script'ten çalışıyor)
- Inngest event tiplerinin `GeoEvents` ile match'lenmesi
