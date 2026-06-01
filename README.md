# Obsey

GEO (Generative Engine Optimization) SaaS platform. Analyzes and automatically improves site visibility on AI search engines like ChatGPT, Claude, and Perplexity.

**Version:** v1.0.0 · **Live:** [obsey.io](https://obsey.io)

---

## What it does

- Crawls your site (Playwright, GPTBot user-agent)
- Detects GEO issues: missing llms.txt, robots.txt blocking AI bots, missing schema markup, thin content
- Auto-fixes issues in PILOT mode (llms.txt generation, schema injection, robots.txt repair)
- Generates a report after every crawl + weekly — downloadable as Action Plan and Report markdown files
- Monitors real AI bot visits (GPTBot, ClaudeBot, PerplexityBot)

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
| GET | `/api/sites/[siteId]/reports/[id]/download?type=action-plan\|report` | Download .md |
| GET | `/api/sites/[siteId]/snippet` | Monitoring JS snippet |

---

## Report Downloads

After every crawl a report is auto-generated. From the Reports page each report offers two downloads:

**Action Plan** (`Action_Plan_sitename_MMDDYYYY.md`) — all pending issues with severity labels, descriptions, and ready-to-use fix content (llms.txt draft, robots.txt patches, schema type details). Paste directly into Cursor, Lovable, or any AI coding tool.

**Report** (`Report_sitename_MMDDYYYY.md`) — GEO score summary, technical status (HTTPS / llms.txt / robots.txt / sitemap), all findings grouped by severity with full descriptions, previous period comparison.

---

## Production Deployment Notes

- **Vercel `DATABASE_URL`** must use the Neon pooler hostname and include `&pgbouncer=true` — required to avoid prepared statement conflicts with PgBouncer transaction mode.
- **Railway `DATABASE_URL`** uses the direct Neon URL (no pooler, no pgbouncer flag).
- Never add Inngest `serve()` to Vercel — causes duplicate cron runs and issue duplication.
- Run `prisma migrate deploy` with the direct URL only.

---

## Changelog

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
