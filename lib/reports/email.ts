import type { ReportSummary } from './generator'
import { t } from '@/lib/i18n'

const GRADE_COLOR: Record<string, string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#ca8a04',
  D: '#ea580c',
  F: '#dc2626',
}

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#4b5563',
}

function buildEmailHtml(report: ReportSummary, appUrl: string, locale: string): string {
  const gradeColor = GRADE_COLOR[report.grade ?? ''] ?? '#6b7280'
  const issueRows = report.topIssues
    .map(i => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
          <span style="background:${SEVERITY_BADGE[i.severity] ?? '#6b7280'};color:#fff;
            font-size:11px;font-weight:600;padding:2px 6px;border-radius:4px;">
            ${i.severity}
          </span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">
          ${escapeHtml(i.title)}
        </td>
      </tr>`)
    .join('')

  return `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;">
    <tr><td style="background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.1);">

      <!-- Başlık -->
      <div style="margin-bottom:24px;">
        <span style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">
          ${t('email.eyebrow', locale)}
        </span>
        <h1 style="margin:8px 0 4px;font-size:22px;color:#111827;">${t('email.heading', locale)}</h1>
        <p style="margin:0;font-size:14px;color:#6b7280;">${new Date(report.crawledAt as string).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric', timeZone: 'Europe/Istanbul' })}</p>
      </div>

      <!-- Skor -->
      <div style="text-align:center;background:#f9fafb;border-radius:12px;padding:32px;margin-bottom:24px;">
        <div style="font-size:72px;font-weight:800;color:${gradeColor};line-height:1;">${report.score ?? '—'}</div>
        <div style="font-size:14px;color:#6b7280;margin-top:4px;">${t('email.scoreUnit', locale)}</div>
        <div style="display:inline-block;background:${gradeColor};color:#fff;font-size:18px;font-weight:700;
          padding:4px 16px;border-radius:20px;margin-top:12px;">${t('email.gradeLabel', locale)}${report.grade}</div>
      </div>

      <!-- Özet -->
      <p style="font-size:15px;line-height:1.6;color:#374151;margin-bottom:24px;">
        ${escapeHtml(report.summary)}
      </p>

      <!-- İstatistikler -->
      <table width="100%" style="margin-bottom:24px;">
        <tr>
          ${buildStatCell(t('email.stat.pagesAnalyzed', locale), report.pagesAnalyzed)}
          ${buildStatCell(t('email.stat.issuesFound', locale), report.issuesFound)}
          ${buildStatCell(t('email.stat.issuesFixed', locale), report.issuesFixed)}
        </tr>
      </table>

      <!-- Top Issues -->
      ${report.topIssues.length > 0 ? `
      <h2 style="font-size:16px;font-weight:600;color:#111827;margin:0 0 12px;">${t('email.topIssues.heading', locale)}</h2>
      <table width="100%" style="border-collapse:collapse;margin-bottom:24px;border:1px solid #f3f4f6;border-radius:8px;overflow:hidden;">
        ${issueRows}
      </table>` : ''}

      <!-- CTA -->
      <div style="text-align:center;margin-top:32px;">
        <a href="${appUrl}/dashboard" style="background:#2563eb;color:#fff;text-decoration:none;
          padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">
          ${t('email.cta', locale)}
        </a>
      </div>

      <!-- Footer -->
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;">
        ${t('email.footer', locale)}
      </p>

    </td></tr>
  </table>
</body>
</html>`
}

function buildStatCell(label: string, value: number): string {
  return `<td style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px;margin:4px;">
    <div style="font-size:28px;font-weight:700;color:#111827;">${value}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px;">${label}</div>
  </td>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Resend ile rapor e-postası gönderir.
 * RESEND_API_KEY ortam değişkeni yoksa konsola yazar (geliştirme modu).
 */
export async function sendReportEmail(
  report: ReportSummary,
  recipientEmail: string,
  siteName: string,
  appUrl: string,
  locale: string = 'tr'
): Promise<{ sent: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.REPORT_FROM_EMAIL ?? 'reports@obsey.io'

  const html = buildEmailHtml(report, appUrl, locale)
  const subject = t('email.subject', locale, { siteName, score: report.score ?? 0, grade: report.grade ?? '—' })

  if (!apiKey) {
    console.log(`[sendReportEmail] RESEND_API_KEY eksik — e-posta gönderilmedi. Alıcı: ${recipientEmail}, Konu: ${subject}`)
    return { sent: false }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend API hatası: ${res.status} ${body}`)
  }

  const data = (await res.json()) as { id: string }
  return { sent: true, id: data.id }
}
