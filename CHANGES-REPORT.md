# Obsey — Değişiklik Raporu

**Tarih:** 2026-06-22
**Branch:** `claude/friendly-faraday-ikkme6` → `main` (PR #10, squash-merge `56bd053`)
**Durum:** Canlıda (Vercel production, obsey.io) · Build yeşil · Skor anomalisi: kod hatası değil (teyit edildi)

---

## 1. Amaç

Danışman (Advisor) modunun çıktısını **motor-farkındalı** ve **fix-tipine duyarlı** hâle getirmek. Üç eksik kapatıldı:

1. **Motor-dürüstlüğü yoktu** — kullanıcı klasik-bot sinyalleri (robots/sitemap) ile AI'a-özgü sinyalleri (llms.txt) ayırt edemiyor, hangi bulgunun hangi motoru etkilediğini göremiyordu.
2. **Fix çıktısı tek tipti** — kod/config bulguları için "ajana yapıştırılacak prompt", içerik bulguları için "hazır, review-only metin" ayrımı yoktu.
3. **Toplu iyileştirme yoktu** — skoru topluca yükseltecek gruplu bir çıktı yoktu.

**Değişmez kurallar (korundu):** Pilot affordance'ları kaldırılmadı · yeni tarama/kontrol eklenmedi · çıktı yalnızca **doğrulanmış bulgular** (crawl confidence `OK` + `PENDING`) için üretiliyor · kod/config fix = deterministik (LLM yok), içerik fix = LLM + review-only.

---

## 2. Yapılan Değişiklikler

### Görev 1 — Check metadata (`lib/check-metadata.ts`, yeni)
- Her check türü için statik `layer` / `engines` / `fixDelivery` config'i. Issue'lar `category` ile sınıflandığı (ve skorlama da category bazlı olduğu) için metadata category ile anahtarlandı.
- Dürüst motor notları: llms.txt → "Google AI Overviews kullanmaz"; schema → "AI için zorunlu değil, SEO için faydalı".
- `FUTURE_CHECKS`: henüz taranmayan check'ler (markdown negotiation, content signals, frontier MCP/OAuth/DNS-AID) **dokümante + pasif** — bulgu üretmedikleri için UI'da görünmüyor.
- `content_signals` için **miras tuzağı uyarısı**: shipping'den önce ROBOTS/bedrock metadata'sını miras almamalı; `ai_specific` olmalı, `google_ai_overviews` dışlanmalı.

| category | layer | engines | fixDelivery |
|---|---|---|---|
| ROBOTS / TECHNICAL | bedrock | Tüm AI motorları | agent_prompt |
| SCHEMA | bedrock | Tüm AI motorları | agent_prompt (+ "zorunlu değil" notu) |
| CONTENT | bedrock | Tüm AI motorları | **ready_copy** |
| LLMS_TXT | ai_specific | ChatGPT / Claude / Perplexity | agent_prompt (+ Google AIO notu) |

### Görev 2 — Bulgu başına tipli fix çıktısı
- `lib/fixes/agent-prompt.ts` (yeni): kod/config bulguları için **deterministik** ajan prompt template'leri (LLM yok) — ne yapılacağı + tam dosya/directive/snippet + "doğrula" adımı. `buildCombinedAgentPrompt` ile etki sırasına göre birleşik prompt.
- `lib/analyzer/llm.ts`: `generateFindingCopy` — içerik bulguları için **tek bulguya dayalı** LLM hazır metni (review-only).
- `lib/actions/apply.ts`: `previewFix`, `fixDelivery`'ye göre `agent_prompt` (deterministik) veya `ready_copy` döndürür. `applyAction` (Pilot/Tamamlandı + revert) **olduğu gibi korundu**.
- `components/dashboard/IssueList.tsx`: "Prompt'u kopyala" / "Metni kopyala" butonları, `ready_copy`'de "⚠ Yayınlamadan önce gözden geçir" etiketi. Çıktı yalnızca confidence `OK` iken üretiliyor.

### Görev 3 — "Skoru yükselt (+N)" gruplu modal
- `components/dashboard/ImproveScoreModal.tsx` (yeni): Grup A (tüm agent_prompt'lar tek birleşik prompt, etki sıralı) · Grup B (içerik bulguları ayrı ayrı, review-only) · Grup C (frontier, opsiyonel/muted).
- `lib/reports/score.ts`: `estimateImprovement` (+N tahmini); `SEVERITY_PENALTY` export edildi.

### Görev 4 — Görünürlük
- Her bulgu kartında **katman rozeti** + **motor chip'leri** + **dürüst notlar**; tamamlanan kartlara da katman rozeti.

---

## 3. Skor Anomalisi — İnceleme ve Sonuç

**Bildirim:** Teknik Durum panelinde düşük puanlar (AI-bot 50, robots 60) varken GEO Skoru 100 görünüyordu → "hesap hatası mı?"

**Bulgu:** Aritmetik hata **yok**. İki ayrı metrik var:
- **GEO Skoru** = `100 − açık sorun cezaları` (bayraklanmış problemlerin yokluğu).
- **Teknik Durum paneli** = boyut başına mutlak kalite (optimizasyon düzeyi).
İkisi, kural motorunun zayıf boyut için issue üretmesiyle hizalanır (köprü; eşik <75, panelle aynı).

**Kök neden:** O anki snapshot'ta bekleyen issue 0'dı → test sırasında issue'lar dismiss/complete ile kapatılmıştı (**test artığı**). Köprü kopuk değildi.

**Teyit:** Yeniden tarama (`Şimdi Tara`) sonrası GEO **69/100 (C)**, **3 bekleyen issue**, "Skoru yükselt **(+31)**" — robots/llms zayıflıkları issue olarak doğru biçimde üretildi ve panelle hizalandı.

**Sonuç:** Kod değişikliği gerekmedi. Skorlama/köprü/tooltip mantığına **dokunulmadı**.

**Yardımcı:** `scripts/diag-score.ts` (read-only) — bir site için en son snapshot'ın issue'larını (durumlarıyla) ve köprü beklentisini raporlar. Gelecekte aynı şüphe olursa: `npx tsx scripts/diag-score.ts <site>`.

---

## 4. Doğrulama & Dağıtım

- `npx tsc --noEmit`: temiz.
- `npx next build`: başarılı — `/dashboard/[siteId]` dinamik route; server-only `generateFindingCopy`/`@anthropic-ai/sdk` client bundle'a sızmadı (RSC/client-boundary ihlali yok).
- Vercel production: **READY**, obsey.io alias'ına promote edildi (`dpl_AVtHwXdC7V2dErHa1KvMtDq6PTnC`).
- DB şema değişikliği yok → Railway migration gerekmedi.
- Birim test paketi (`scripts/test-local.ts`, 101 test) Postgres gerektirdiğinden bu ortamda koşulmadı; build + tsc yeşil.

---

## 5. Dosya Özeti

**Yeni:** `lib/check-metadata.ts` · `lib/fixes/agent-prompt.ts` · `components/dashboard/ImproveScoreModal.tsx` · `scripts/diag-score.ts`
**Düzenlenen:** `lib/analyzer/llm.ts` · `lib/actions/apply.ts` · `lib/reports/score.ts` · `components/dashboard/IssueList.tsx` · `components/dashboard/IssueTabs.tsx` · `app/dashboard/[siteId]/page.tsx` · `app/api/sites/[siteId]/issues/[issueId]/preview/route.ts`

---

## 6. Açık Not (gelecek)

`content_signals` taraması eklenirken metadata miras tuzağına dikkat (kod içinde uyarı bırakıldı). GEO Skoru ile panelin "tek sayıda buluşması" istenirse (#1 harmanla / #2 köprüyü güçlendir / #3 etiket-UX) ayrı bir karar konusu — şu an gerek yok, ikisi tutarlı çalışıyor.
