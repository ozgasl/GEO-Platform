# GEO Platform — Handover Belgesi
**Versiyon:** v0.1.3  
**Tarih:** Mayıs 2026  
**Hazırlayan:** Claude Code (ozgasl/GEO-Platform)

---

## 1. Ürün Nedir?

GEO Platform, web sitelerinin **Generative Engine Optimization** (Üretken Motor Optimizasyonu) durumunu analiz eden ve otomatik iyileştiren bir SaaS aracıdır.

### Problem
Geleneksel SEO araçları Google için optimize eder. Ancak ChatGPT, Claude, Perplexity gibi AI arama motorları siteleri farklı kriterlere göre değerlendirir:
- `llms.txt` dosyası var mı? (AI motorlarına site içeriğini özetleyen standart)
- `robots.txt` AI botlarına izin veriyor mu?
- JSON-LD schema markup var mı?
- İçerik soru-cevap formatında mı? (AI motorları bu içeriği tercih eder)

### Çözüm
GEO Platform bu kriterleri otomatik tarar, puanlar ve düzeltir.

---

## 2. Mevcut Yetenekler (v0.1.3)

### 2.1 Crawl Engine
- Sitemap.xml → sitemap_index → Playwright BFS (3 seviye) ile URL keşfi
- Max 50 URL, 3 eş zamanlı tarama
- **GPTBot user-agent** ile tarama (AI botların gördüğünü görme)
- Robots.txt, llms.txt, llms-full.txt otomatik fetch
- Her sayfa için: title, meta description, H1/H2/H3, JSON-LD schema'lar, FAQ blokları, word count, load time, contentHash
- `contentHash` (SHA-256): değişmeyen sayfalar LLM analizinden atlanır → %60-70 maliyet tasarrufu

### 2.2 Analysis Engine

**Kural Motoru (deterministik, ücretsiz):**
| Kural | Severity | Aksiyon |
|-------|----------|---------|
| AI botu robots.txt'de engellendi | CRITICAL | AUTO_FIX |
| llms.txt eksik | HIGH | AUTO_FIX |
| llms.txt var ama format hatalı | MEDIUM | AUTO_FIX |
| Organization/Product/Article schema eksik | HIGH | AUTO_FIX |
| Sitemap yok | HIGH | CONTENT_SUGGESTION |
| HTTPS yok | HIGH | MANUAL_REQUIRED |
| İçerik çok kısa (< 150 kelime ort.) | HIGH/MEDIUM | CONTENT_SUGGESTION |

**LLM Motoru (Claude API, `claude-sonnet-4-6`):**
- Değişen sayfaları 3'erli batch'te analiz eder
- Her sayfa için: `answerDensity` (0-10), `missingQuestions`, `suggestedFaqItems`, `schemaRecommendation`, `contentGap`
- Üretir: llms.txt dosyası, JSON-LD schema markup

**Kritik Mimari Kural:**
- `runAnalysis()` DB'ye **yazmaz** — sadece `IssueInput[]` döner
- `queueActions()` tek DB yazma noktasıdır
- Bu ayrım bozulursa her issue DISMISSED + PENDING çiftlenir

### 2.3 Action Engine
- `applyAction(issueId, appliedBy)` — **sadece 2 parametre** (3. argüman PrismaValidationError verir)
- `queueActions()`: PILOT modda AUTO_FIX'ler otomatik uygulanır
- `revertAction()`: `before` içeriğini geri yükle, Issue → PENDING
- Her aksiyon DB'de `Action` kaydı oluşturur (audit trail)

### 2.4 İki Çalışma Modu
- **ADVISOR:** Tüm issue'lar kullanıcı onayı bekler
- **PILOT:** AUTO_FIX tipindeki aksiyonlar otomatik uygulanır

### 2.5 Teknik Durum Kartı (v0.1.3 yeni)
- `QualityScore.recommendation` alanı: A'dan düşük her skor için öneri metni
- Dashboard'da `<details>/<summary>` ile inline expand — JS state gerekmez
- A alan maddeler tıklanamaz; B/C/D/F alanlar `▾` ile genişler

### 2.6 Monitoring Engine
- AES-128-CBC ile siteId'yi şifreleyen token
- `<img>` beacon snippet — siteye eklenir
- AI bot UA tespiti: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot
- Ziyaret sayaçları snapshot'ta tutulur

### 2.7 Report Engine
- GEO skoru: 0-100, A-F notu
- 4 kategori: Teknik (30) + llms.txt (25) + Schema (20) + İçerik (25)
- ISO hafta bazlı raporlar (period: "2026-W22")
- Resend ile HTML e-posta (RESEND_API_KEY yoksa konsola log)

### 2.8 Inngest Background Jobs
| Job | Tetikleyici | Açıklama |
|-----|-------------|---------|
| `crawl-site` | `geo/site.crawl.requested` eventi | Crawl + analiz + aksiyon kuyruğu |
| `scheduled-crawl` | Her gün 02:00 UTC cron | Tüm aktif siteleri frekansına göre tara |
| `weekly-report` | Her Pazartesi 09:00 UTC cron | Tüm sitelere rapor + e-posta |
| `generate-report` | `geo/report.requested` eventi | Manuel rapor tetikleme |

### 2.9 Dashboard UI (v0.1.3)
- `/login` — Google OAuth (canlı, test edildi) + e-posta ile giriş
- `/dashboard` — Site listesi, kritik issue özetleri, teknik durum
- `/dashboard/[siteId]` — GEO skoru, issue yönetimi, teknik durum expand önerileri, monitoring snippet
- `/dashboard/[siteId]/reports` — Rapor geçmişi
- **Sidebar:** Collapsible (w-56 ↔ w-14 toggle), site listesi + tıkla-gez navigasyon

---

## 3. Teknik Mimari

### Veritabanı Modelleri
```
User (NextAuth + plan bilgisi)
  └─ Site (url, mode: ADVISOR|PILOT, crawlFrequency: DAILY|WEEKLY)
       ├─ Snapshot (crawl sonucu, pages: Json, aiCrawlerVisits: Json)
       │    └─ Issue (severity, category, actionType, status, actionPayload)
       │         └─ Action (before/after: Text, isReversible, reversedAt)
       └─ Report (period, score, issuesFound/Fixed, aiCrawlerVisits)
```

### Güvenlik
- Tüm DB sorguları `userId` ile izole — bir kullanıcı başkasının verisine erişemez
- Unauthorized erişimde 404 döner (403 değil — varlığı ifşa etmez)
- siteId monitoring snippet'te AES şifreli token olarak gönderilir
- **Önemli:** Layout'ta `getSessionUser()` kullan; `auth()` ile gelen `session.user.id` Google OAuth subject ID'si, DB CUID değil

### API
```
POST   /api/sites                          → site ekle
GET    /api/sites/:id/issues               → issue listesi (?severity=&status=)
POST   /api/sites/:id/crawl                → manuel crawl tetikle
POST   /api/sites/:id/issues/:id/approve   → aksiyon uygula
POST   /api/sites/:id/issues/:id/dismiss   → yoksay
POST   /api/sites/:id/actions/:id/revert   → geri al
PATCH  /api/sites/:id/mode                 → ADVISOR|PILOT
POST   /api/sites/:id/reports              → rapor oluştur
GET    /api/beacon                         → tracking pixel (public)
```

---

## 4. Test Durumu (v0.1.3)

**101/101 birim testi geçiyor**

| Test Bölümü | Test Sayısı |
|-------------|-------------|
| URL önceliklendirme | 10 |
| Rule Engine (6 kural) | 29 |
| DB CRUD | 9 |
| Action Engine | 18 |
| Monitoring Engine | 19 |
| Report Engine | 16 |

**Gerçek site testleri:**
- `www.gstptractor.com` → GEO Skoru 65/100 (8 sayfa, teknik altyapı iyi, içerik zayıf)
- `brandit.tech` → GEO Skoru 92/100 (Google OAuth ile giriş yapılarak test edildi)

**v0.1.3 yeni test edilen:**
- Google OAuth: `ozgasl@gmail.com` ile canlı giriş ✅
- Issue çiftlenme fix: tek snapshot'ta DISMISSED + PENDING çakışması giderildi ✅
- Teknik Durum expand: AI botlara izin D/50 ve Sitemap C/70 önerisi görünüyor ✅
- Sidebar collapse: 56px daraltılmış, 224px genişletilmiş, navigasyon çalışıyor ✅

---

## 5. Bilinen Teknik Dikkat Noktaları

1. **runAnalysis / queueActions ayrımı** — `runAnalysis` DB'ye yazmamalı, sadece `IssueInput[]` döndürmeli. Bunu değiştirirsen her issue çiftlenir.
2. **applyAction imzası** — `applyAction(issueId, appliedBy)` yalnızca 2 parametre. 3. argüman olarak siteId geçmek PrismaValidationError verir.
3. **getSessionUser() zorunluluğu** — Server component'lerde kullanıcı kimliği için `auth()` yerine `getSessionUser()` kullan. `auth()` ile gelen `session.user.id` Google OAuth'ta DB ID'si değil.
4. **Playwright + Vercel** — Serverless'ta çalışmaz; Inngest job'ları ayrı worker'da çalışmalı (Railway/Fly.io).
5. **"Şimdi Tara" fire-and-forget** — Yerel dev için yeterli; production'da `geo/site.crawl.requested` Inngest eventi kullanılmalı.

---

## 6. Roadmap

### v0.2 (Sonraki Sprint)
- **Vercel deploy** — Playwright worker için Railway/Fly.io ayrı servis
- **Plan limiti kontrolleri** — STARTER: 1 site, AGENCY_5: 5 site
- **Stripe entegrasyonu** — Ödeme planları
- **Crawl durum takibi** — Real-time ilerleme gösterimi

### v0.3
- Birden fazla dil desteği
- Rakip karşılaştırma analizi
- API key tabanlı headless erişim
- White-label rapor

---

## 7. Deployment Notları

### Vercel (önerilen)
```bash
# Environment variables → Vercel dashboard'a ekle
# Google OAuth için:
#   NEXTAUTH_URL=https://alan-adiniz.com
#   Authorized redirect URI: https://alan-adiniz.com/api/auth/callback/google
# Playwright için: Inngest job'ları Railway/Fly.io worker'da çalışmalı
# DB: Neon, Supabase veya Railway PostgreSQL
```

### Local Development (Docker)
```powershell
docker start geo-postgres
npm run dev
# Opsiyonel:
npx inngest-cli dev
```

---

## 8. Pazara Giriş Notları

### Hedef Kullanıcılar
- SEO ajansları (AGENCY_5, AGENCY_20 plan)
- E-ticaret site sahipleri (AI aramalarda ürün görünürlüğü)
- İçerik odaklı siteler (blog, medya)
- Kurumsal markalar (AI'da marka yönetimi)

### Rekabet Avantajı
- **Otomatik aksiyon:** Rakipler sadece rapor verir, GEO Platform düzeltir
- **PILOT mod:** "Set and forget" otomasyonu
- **Türkçe + İngilizce:** Türk pazarında ilk konumlanma fırsatı
- **llms.txt standardı:** Henüz çok az araç destekliyor

### Fiyatlandırma (önerilen)
| Plan | Fiyat | Limit |
|------|-------|-------|
| STARTER | Ücretsiz | 1 site, haftalık crawl |
| AGENCY_5 | $49/ay | 5 site, günlük crawl |
| AGENCY_20 | $149/ay | 20 site, öncelikli support |

### İlk 90 Gün Hedefi
1. ProductHunt lansmanı
2. SEO Twitter/X topluluklarında içerik
3. 3 referans müşteri (ücretsiz) → case study
4. Agency partnerlık programı

---

## 9. Kod Kalitesi

- TypeScript strict mode, `tsc --noEmit` temiz
- `next build` temiz (0 error)
- Tüm DB sorguları `userId` izolasyonlu
- Prisma transaction kullanımı (Action + Issue atomik güncelleme)
- Error boundary'ler API route'larında
