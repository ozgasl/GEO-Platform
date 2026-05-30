# GEO Platform

**AI arama motorlarında site görünürlüğünü analiz eden ve otomatik iyileştiren SaaS platformu.**

ChatGPT, Claude, Perplexity gibi AI motorları siteleri farklı değerlendirir. GEO Platform, sitenizin bu motorlara ne kadar "okunabilir" olduğunu ölçer ve eksiklikleri otomatik giderir.

> **Versiyon:** v0.1.3 — Google OAuth canlı, collapsible sidebar, teknik durum önerileri

---

## Özellikler

- **Otomatik Crawl** — Sitemap, robots.txt, llms.txt ve tüm sayfa içeriğini tarar (GPTBot UA)
- **GEO Analizi** — 5 kategoride deterministik kural motoru + Claude AI içerik analizi
- **Aksiyon Motoru** — llms.txt üretimi, robots.txt düzeltmesi, JSON-LD schema ekleme, FAQ önerisi
- **İki Mod** — ADVISOR (kullanıcı onayı) veya PILOT (otomatik uygulama)
- **Teknik Durum Önerileri** — A'dan düşük her madde için inline expand ile adım adım öneri
- **Monitoring** — AI bot ziyaretlerini takip eden embed snippet
- **Haftalık Raporlar** — GEO skoru, trend analizi, e-posta bildirimi
- **Dashboard** — Collapsible sidebar, site listesi, issue yönetimi, aksiyon geçmişi

---

## Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 14.2 (App Router) |
| Veritabanı | PostgreSQL 16 + Prisma 5 |
| Auth | NextAuth v5 (Google OAuth + E-posta) |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| Crawl | Playwright (GPTBot UA) |
| Jobs | Inngest (cron + event-driven) |
| Email | Resend |
| UI | Tailwind CSS |

---

## Kurulum

### Gereksinimler
- Node.js 20+
- PostgreSQL 16 (Docker önerilir)
- Anthropic API key

### 1. Bağımlılıkları kur
```bash
npm install
npx playwright install chromium
```

### 2. Ortam değişkenlerini ayarla
```bash
cp .env.example .env
# .env dosyasını düzenle
```

### 3. Veritabanını hazırla
```bash
npx prisma migrate deploy
```

### 4. Geliştirme sunucusunu başlat
```bash
npm run dev
```

### 5. (Opsiyonel) Inngest Dev Server
```bash
npx inngest-cli dev
```

---

## Ortam Değişkenleri

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/geo_platform

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Auth
NEXTAUTH_SECRET=<rastgele-secret>
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Email
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=reports@geo-platform.com

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Monitoring (16+ karakter)
MONITORING_SECRET=<rastgele-secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Google OAuth kurulumu
1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client ID
2. Application type: **Web application**
3. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Production için: `https://alan-adiniz.com/api/auth/callback/google`

---

## Test

```bash
# Birim testleri (101 test, DB gerektirir)
DATABASE_URL="..." MONITORING_SECRET="..." npx tsx scripts/test-local.ts

# Gerçek site crawl testi
ANTHROPIC_API_KEY="..." npx tsx scripts/test-crawl.ts https://siteniz.com

# TypeScript kontrolü
npx tsc --noEmit

# Production build
npm run build
```

---

## API Referansı

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/sites` | GET | Site listesi |
| `/api/sites` | POST | Yeni site ekle |
| `/api/sites/:id` | GET | Site detayı |
| `/api/sites/:id/crawl` | POST | Manuel crawl tetikle |
| `/api/sites/:id/mode` | PATCH | ADVISOR/PILOT değiştir |
| `/api/sites/:id/issues` | GET | Issue listesi (`?severity=&status=`) |
| `/api/sites/:id/issues/:id/approve` | POST | Issue'yu uygula |
| `/api/sites/:id/issues/:id/dismiss` | POST | Issue'yu reddet |
| `/api/sites/:id/actions/:id/revert` | POST | Aksiyonu geri al |
| `/api/sites/:id/reports` | GET/POST | Rapor listesi / oluştur |
| `/api/sites/:id/snippet` | GET | Monitoring snippet |
| `/api/beacon` | GET | Tracking pixel (public) |
| `/api/inngest` | GET/POST/PUT | Inngest handler |

---

## GEO Skoru

100 üzerinden 4 kategoride hesaplanır:

| Kategori | Max Puan | Kapsam |
|----------|----------|--------|
| Teknik | 30 | HTTPS, sitemap, robots.txt |
| llms.txt | 25 | Varlık, format, güncellik |
| Schema | 20 | Organization, Product, Article, FAQ |
| İçerik | 25 | Soru yoğunluğu, cevap kalitesi |

**Not sistemi:** A (90+) · B (75+) · C (55+) · D (30+) · F (<30)

---

## Mimari

```
lib/
  crawler/       Playwright tabanlı site tarama motoru
  analyzer/
    rules.ts     6 deterministik kural (robots, llms, https, sitemap, schema, content)
    llm.ts       Claude API: içerik analizi, llms.txt/schema üretimi
    index.ts     runAnalysis() — sadece analiz, DB yazmaz; IssueInput[] döner
    quality.ts   Teknik skor hesaplama + öneri metinleri (QualityScore.recommendation)
  actions/
    apply.ts     applyAction(issueId, appliedBy) — 2 parametre
    queue.ts     queueActions() — tek DB yazma noktası, PILOT auto-apply
    revert.ts    revertAction()
  monitoring/    Bot takip snippet ve beacon işleme
  reports/       Skor hesaplama, rapor üretimi, e-posta
  inngest/       Background job tanımları

app/
  dashboard/
    layout.tsx         getSessionUser() ile site listesi → Sidebar'a prop
    [siteId]/page.tsx  Site detay, TechStatusScore expand bileşeni
  api/                 Route handlers

components/dashboard/
  Sidebar.tsx    Collapsible (w-56 ↔ w-14), site listesi + navigasyon
  IssueTabs.tsx  Bekleyen / Tamamlanan sekmeleri
  IssueList.tsx  Pending issue'lar + approve/dismiss
  ScanButton.tsx "Şimdi Tara" + polling
  ModeToggle.tsx ADVISOR ↔ PILOT
```

### Kritik Mimari Kural
`runAnalysis()` DB'ye **yazmaz** — sadece `IssueInput[]` döner.  
`queueActions()` tek yazma noktasıdır. Bu ayrım bozulursa her issue çiftlenir.

---

## Lisans

MIT
