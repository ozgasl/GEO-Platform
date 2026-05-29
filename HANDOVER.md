# GEO Platform — Handover Belgesi
**Versiyon:** v0.1.0 MVP  
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

## 2. Mevcut Yetenekler (v0.1.0)

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

**LLM Motoru (Claude API):**
- Değişen sayfaları 3'erli batch'te analiz eder
- Her sayfa için: `answerDensity` (0-10), `missingQuestions`, `suggestedFaqItems`, `schemaRecommendation`, `contentGap`
- Üretir: llms.txt dosyası, JSON-LD schema markup

### 2.3 Action Engine
- `applyAction()`: llms.txt üret, robots.txt düzelt, schema ekle, FAQ öner
- `queueActions()`: PILOT modda AUTO_FIX'ler otomatik uygulanır
- `revertAction()`: `before` içeriğini geri yükle, Issue → PENDING
- Her aksiyon DB'de `Action` kaydı oluşturur (audit trail)

### 2.4 İki Çalışma Modu
- **ADVISOR:** Tüm issue'lar kullanıcı onayı bekler
- **PILOT:** AUTO_FIX tipindeki aksiyonlar otomatik uygulanır

### 2.5 Monitoring Engine
- AES-128-CBC ile siteId'yi şifreleyen token
- `<img>` beacon snippet — siteye eklenir
- AI bot UA tespiti: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot
- Ziyaret sayaçları snapshot'ta tutulur

### 2.6 Report Engine
- GEO skoru: 0-100, A-F notu
- 4 kategori: Teknik (30) + llms.txt (25) + Schema (20) + İçerik (25)
- ISO hafta bazlı raporlar (period: "2026-W22")
- Resend ile HTML e-posta (RESEND_API_KEY yoksa konsola log)

### 2.7 Inngest Background Jobs
| Job | Tetikleyici | Açıklama |
|-----|-------------|---------|
| `crawl-site` | `geo/site.crawl.requested` eventi | Crawl + analiz + aksiyon kuyruğu |
| `scheduled-crawl` | Her gün 02:00 UTC cron | Tüm aktif siteleri frekansına göre tara |
| `weekly-report` | Her Pazartesi 09:00 UTC cron | Tüm sitelere rapor + e-posta |
| `generate-report` | `geo/report.requested` eventi | Manuel rapor tetikleme |

### 2.8 Dashboard UI
- `/login` — Google + e-posta ile giriş
- `/dashboard` — Site listesi, kritik issue özetleri, teknik durum
- `/dashboard/[siteId]` — GEO skoru, issue yönetimi, bot ziyaret sayaçları, monitoring snippet
- `/dashboard/[siteId]/reports` — Rapor geçmişi

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

### API
```
POST   /api/sites                          → site ekle
GET    /api/sites/:id/issues               → issue listesi (?severity=&status=)
POST   /api/sites/:id/issues/:id/approve   → aksiyon uygula
POST   /api/sites/:id/issues/:id/dismiss   → yoksay
POST   /api/sites/:id/actions/:id/revert   → geri al
PATCH  /api/sites/:id/mode                 → ADVISOR|PILOT
POST   /api/sites/:id/reports              → rapor oluştur
GET    /api/beacon                         → tracking pixel (public)
```

---

## 4. Test Durumu

**101/101 birim testi geçiyor** (12 Mayıs 2026)

| Test Bölümü | Test Sayısı |
|-------------|-------------|
| URL önceliklendirme | 10 |
| Rule Engine (6 kural) | 29 |
| DB CRUD | 9 |
| Action Engine | 18 |
| Monitoring Engine | 19 |
| Report Engine | 16 |

**Gerçek site testi:** `www.gstptractor.com` → GEO Skoru 65/100
- Teknik altyapı iyi (llms.txt, robots.txt, sitemap, HTTPS var)
- Zayıf nokta: ortalama 97 kelime/sayfa, answerDensity 1-3/10

---

## 5. Eksikler / v0.2 Roadmap

### Kritik (canlıya almak için):
1. **"Şimdi Tara" butonu** — Dashboard'da manuel crawl tetikleme yok; şu an sadece Inngest eventi ile çalışıyor
2. **Crawler deployment** — Playwright Vercel serverless'ta çalışmaz; Inngest job'larının ayrı compute'da çalışması gerekiyor (Vercel Fluid Compute veya Railway worker)
3. **Google OAuth test** — NextAuth v5 beta callback URL'leri production'da test edilmeli

### v0.2 Özellikleri:
- Site detay sayfasında "Şimdi Tara" butonu
- Crawl durumu real-time gösterimi (Inngest webhook)
- Report modeline skor alanı ekleme
- Üyelik planı kontrolleri (STARTER: 1 site, AGENCY_5: 5 site)
- Stripe ödeme entegrasyonu

### v0.3 Özellikleri:
- Birden fazla dil desteği
- Rakip karşılaştırma analizi
- API key tabanlı headless erişim
- White-label rapor

---

## 6. Deployment Notları

### Vercel (önerilen)
```bash
# Environment variables → Vercel dashboard'a ekle
# Playwright için: Inngest job'ları ayrı worker'da çalışmalı
# DB: Neon, Supabase veya Railway PostgreSQL
```

### Local development
```bash
pg_ctlcluster 16 main start
npm run dev
npx inngest-cli dev   # background job'lar için
```

---

## 7. Pazara Giriş Notları (GTM Session için)

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

## 8. Kod Kalitesi

- TypeScript strict mode, `tsc --noEmit` temiz
- `next build` temiz (18 route, 0 error)
- Tüm DB sorguları `userId` izolasyonlu
- Prisma transaction kullanımı (Action + Issue atomik güncelleme)
- Error boundary'ler API route'larında
- No `any` types (test scripti dışında)
