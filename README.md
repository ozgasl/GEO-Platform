# Obsey

GEO (Generative Engine Optimization) SaaS platform. Analyzes and automatically improves site visibility on AI search engines like ChatGPT, Claude, and Perplexity.

**Version:** v1.0.4 · **Live:** [obsey.io](https://obsey.io)

---

## What it does

- Crawls your site (Playwright, GPTBot user-agent)
- Detects GEO issues: missing llms.txt, robots.txt blocking AI bots, missing schema markup, thin content
- Generates deployable artifacts per issue (llms.txt, JSON-LD schema, robots.txt snippets) in Advisor mode
- Generates a report after every crawl + weekly — downloadable as PDF or Markdown (Action Plan + Report)
- Monitors AI bot visits (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and 9 more)
- Tracks 16 AI bots total including ChatGPT-User, meta-externalagent, YouBot, DuckAssistBot, Applebot-Extended

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14.2 (App Router) |
| Database | PostgreSQL 16 + Prisma 5.22 |
| Auth | NextAuth v5 (Google OAuth + Credentials) |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| Crawl | Playwright (Railway worker) |
| Jobs | Inngest |
| Email | Resend |
| UI | Tailwind CSS |
| Language | TypeScript strict |

---

## Architecture

```
Vercel (web app)          Railway (Inngest worker)       Neon (PostgreSQL)
─────────────────         ──────────────────────         ─────────────────
Next.js pages/API   →     crawl-site                →    snapshots, issues
inngest.send()      →     scheduled-crawl                actions, reports
                          weekly-report
                          generate-report (Playwright lives here)
```

- **Vercel** serves the web app and API routes. Never sync Inngest here.
- **Railway** runs all Inngest functions including Playwright crawls.
- **Neon** uses pooled connection on Vercel (`?pgbouncer=true` required) and direct connection on Railway.

---

## Local Development

### Prerequisites
- Node.js 20+
- Docker (for local PostgreSQL)

### Setup

```powershell
# 1. Start local PostgreSQL
docker run -d --name geo-postgres `
  -e POSTGRES_USER=geo_user `
  -e POSTGRES_PASSWORD=geo_pass `
  -e POSTGRES_DB=geo_platform `
  -p 5432:5432 `
  postgres:16

# 2. Install dependencies
npm ci

# 3. Run migrations
$env:DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
$env:DIRECT_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
npx prisma migrate deploy

# 4. Start dev server
npm run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
DIRECT_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
ANTHROPIC_API_KEY="sk-ant-..."
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
MONITORING_SECRET="..."
INNGEST_EVENT_KEY="test"
INNGEST_SIGNING_KEY="test"
RESEND_API_KEY="..."
```

---

## Testing

```powershell
# Unit tests (101 tests, requires local DB)
$env:DATABASE_URL="postgresql://geo_user:geo_pass@localhost:5432/geo_platform"
$env:MONITORING_SECRET="geo-platform-monitoring-key-12345"
npx tsx scripts/test-local.ts

# TypeScript check
npx tsc --noEmit

# Real crawl (no DB write)
$env:ANTHROPIC_API_KEY="sk-ant-..."
npx tsx scripts/test-crawl.ts https://example.com
```

---

## Key API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sites` | Add a site |
| POST | `/api/sites/[siteId]/crawl` | Trigger crawl (Inngest event) |
| GET | `/api/sites/[siteId]/issues` | List issues |
| POST | `/api/sites/[siteId]/issues/[id]/approve` | Apply fix |
| POST | `/api/sites/[siteId]/issues/[id]/dismiss` | Dismiss issue |
| POST | `/api/sites/[siteId]/actions/[id]/revert` | Revert applied action |
| GET/POST | `/api/sites/[siteId]/reports` | List / manually trigger report |
| GET | `/api/sites/[siteId]/reports/[id]/download?type=action-plan\|report&format=pdf\|md` | Download PDF or .md |
| GET | `/api/sites/[siteId]/snippet` | Monitoring JS snippet |
| POST | `/api/auth/register` | Register with email + password |
| PATCH | `/api/account` | Update name |
| PATCH | `/api/account/password` | Change password |
| GET/DELETE | `/api/account` | Export data / delete account |
| POST | `/api/admin/users/[id]/plan` | Override user plan (admin only) |
| POST | `/api/payments/checkout` | Payment checkout (stub — pending provider) |
| POST | `/api/payments/webhook` | Payment webhook (stub) |

---

## Report Downloads

After every crawl a report is auto-generated. From the Reports page each report offers four downloads:

| Button | Format | Contents |
|--------|--------|----------|
| **Aksiyon Planı PDF** | PDF | Pending issues with severity badges, deploy instructions, tech status table |
| **Aksiyon Planı MD** | Markdown | Same content — paste into Cursor, Lovable, or any AI tool |
| **Rapor PDF** | PDF | GEO score, tech status, stats, all findings, period comparison |
| **Rapor MD** | Markdown | Same content — machine-readable |

Font: NotoSans (full Turkish glyph support) via `@expo-google-fonts/noto-sans` CDN.

---

## Production Deployment Notes

- **Vercel `DATABASE_URL`** must use the Neon pooler hostname and include `&pgbouncer=true` — required to avoid prepared statement conflicts with PgBouncer transaction mode.
- **Railway `DATABASE_URL`** uses the direct Neon URL (no pooler, no pgbouncer flag).
- Never add Inngest `serve()` to Vercel — causes duplicate cron runs and issue duplication.
- Run `prisma migrate deploy` with the direct URL only.
- **DB admin scripts**: use `scripts/upgrade-account.ts` pattern (a proper `.ts` file) — `npx tsx -e "..."` inline doesn't work due to CJS top-level await restrictions.
- **`ADMIN_EMAIL`** env var must be set in Vercel for `/admin` to be accessible.
- **`MONITORING_SECRET`** env var required in production — `snippet.ts` throws if unset.

## Key Files

| File | Purpose |
|------|---------|
| `lib/reports/pdf.tsx` | PDF generation components (ActionPlanPdf, ReportPdf) |
| `lib/reports/font-data.ts` | *(deleted)* |
| `lib/i18n/index.ts` | t(key, locale) helper, defaults to TR |
| `messages/tr.json` | ~280 Turkish translation keys |
| `lib/payments/provider.ts` | Payment provider interface (StubPaymentProvider until iyzico/PayTR) |
| `lib/rate-limit.ts` | In-memory sliding-window rate limiter |
| `public/brand/` | Obsey wordmark SVGs and PNGs (light + dark) |
| `public/llms.txt` | Obsey product description for AI systems |
| `app/robots.ts` | Allows all AI bots + Googlebot; references sitemap |
| `app/sitemap.ts` | 3-URL sitemap for obsey.io |

---

## Changelog

### v1.0.2 (2026-06-01)
- **IssueList cleanup** — removed generic client-side "Deploy Talimatı" template; single "↗ Öneriyi Göster" button now calls Claude API to generate site-specific recommendations; button becomes "✓ Tamamlandı" after content loads

### v1.0.1 (2026-06-01)
- **Rebrand** — GEO Platform → Obsey; brand assets in `public/brand/`; favicon (`app/icon.svg`) with two-circle eye mark
- **PDF reports** — downloadable Action Plan and Report PDFs with Obsey branding, color-coded severity badges, full Turkish support (NotoSans via jsDelivr CDN)
- **4 download buttons** — Aksiyon Planı PDF/MD + Rapor PDF/MD replacing the old 2-button + tiny .md links
- **16 AI bot tracking** — added Google-Extended, ChatGPT-User, meta-externalagent, Applebot-Extended, YouBot, Amazonbot, DuckAssistBot, Bytespider, cohere-ai
- **Teknik Durum scoring** — robots.txt now achieves 100/100 with explicit AI bot rules; recommendations shown for A-grade items below 100; sitemap shows recommendations for <50 URLs
- **Deploy Talimatı** — Advisor issue cards show AI-generated content when available (merged "Gösterilen Aksiyon" into unified Deploy Talimatı section)
- **obsey.io GEO setup** — `public/llms.txt`, `app/robots.ts`, `app/sitemap.ts`, Organization + SoftwareApplication JSON-LD schema on homepage
- **Bing Webmaster Tools** verified; Google Search Console submission instructions provided
- **UI fixes** — sidebar brand name extracts clean name (Cedrix not www.cedrix.io); Ayarlar below site list; name save refreshes sidebar

### v1.0.0 (2026-06-01)
- **Onboarding flow** — new users guided through first crawl with optimistic UX
- **Landing page** — value prop, how it works, pricing table (TR)
- **Advisor Mode artifacts** — every issue card shows a copy-ready deployable artifact (llms.txt, JSON-LD, robots.txt snippet)
- **Trial gate** — FREE tier: 1 site + 1 free report; scan blocked after trial with upgrade prompt
- **Upgrade page** — `/dashboard/upgrade` pricing table; payment integration placeholder (iyzico/PayTR pending agreement)
- **Account settings** — name edit, plan badge, password change, data export, account deletion (cascade)
- **Admin panel** — `/admin` user list + plan override, protected by `ADMIN_EMAIL` env var
- **i18n infrastructure** — `next-intl` + `messages/tr.json` (~280 keys); locale threaded through all backend functions; EN/DE ready as file additions
- **Rate limiting** — site creation (10/IP/hr) and crawl trigger (3/site/hr)
- **Error pages** — custom 404 and error boundary at root, `/dashboard`, and site-detail level
- **Security hardening** — bcrypt password verification on credentials auth, register endpoint, MONITORING_SECRET now required in production, ownership audit passed

### v0.2.1 (2026-05-31)
- Report trigger type labels: "Haftalık" / "Manuel" badges on reports page
- Auto-generate report after every crawl (no longer weekly-only)
- Download API: `Action_Plan_sitename_MMDDYYYY.md` and `Report_sitename_MMDDYYYY.md`
  - Action Plan: all pending issues with human-readable fix instructions and proposed content
  - Report: technical status table, current llms.txt content, all findings by severity, previous period diff
- Fixed Vercel `DATABASE_URL` PgBouncer prepared statement issue (`&pgbouncer=true`)

### v0.2.0 (2026-05-30)
- Production deployment: Vercel + Railway + Neon + Inngest Cloud
- Playwright crawler on Railway worker
- next@14.2.35 security patch (CVE-2025-55184, CVE-2025-67779)

### v0.1.3
- Full crawl + analyze + action pipeline
- ADVISOR / PILOT mode toggle
- Monitoring snippet + AI bot visit tracking
- Weekly report email via Resend
