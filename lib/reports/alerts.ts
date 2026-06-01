import { t } from '@/lib/i18n'

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#ca8a04',
  LOW: '#4b5563',
}

export interface AlertData {
  siteName: string
  siteUrl: string
  currentScore: number
  previousScore: number | null
  newCriticalCount: number
  newHighCount: number
  totalNewIssues: number
  topNewIssues: { severity: string; title: string }[]
  dashboardUrl: string
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildAlertHtml(data: AlertData, locale: string): string {
  const { currentScore, previousScore, newCriticalCount, newHighCount, totalNewIssues, topNewIssues } = data

  const scoreLine = previousScore == null
    ? t('alert.scoreFirst', locale, { curr: String(currentScore) })
    : previousScore > currentScore
      ? t('alert.scoreDrop', locale, {
          prev: String(previousScore),
          curr: String(currentScore),
          delta: String(previousScore - currentScore),
        })
      : t('alert.scoreNoChange', locale, { curr: String(currentScore) })

  const scoreColor = previousScore != null && previousScore > currentScore ? '#dc2626' : '#111827'

  const summaryItems: string[] = []
  if (newCriticalCount > 0) summaryItems.push(t('alert.newIssues.critical', locale, { count: String(newCriticalCount) }))
  if (newHighCount > 0) summaryItems.push(t('alert.newIssues.high', locale, { count: String(newHighCount) }))
  if (totalNewIssues > 0) summaryItems.push(t('alert.newIssues.total', locale, { count: String(totalNewIssues) }))

  const issueRows = topNewIssues
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
        <span style="font-size:12px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:.05em;">
          ${t('alert.eyebrow', locale)}
        </span>
        <h1 style="margin:8px 0 4px;font-size:22px;color:#111827;">${t('alert.heading', locale)}</h1>
        <p style="margin:0;font-size:14px;color:#6b7280;">${escapeHtml(data.siteName)}</p>
      </div>

      <!-- Skor -->
      <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;">
          ${t('alert.scoreLabel', locale)}
        </p>
        <p style="margin:0;font-size:24px;font-weight:700;color:${scoreColor};">${scoreLine}</p>
      </div>

      <!-- Özet -->
      ${summaryItems.length > 0 ? `
      <ul style="margin:0 0 24px;padding:0 0 0 20px;font-size:15px;color:#374151;line-height:1.8;">
        ${summaryItems.map(s => `<li>${s}</li>`).join('')}
      </ul>` : ''}

      <!-- Sorunlar -->
      ${topNewIssues.length > 0 ? `
      <h2 style="font-size:16px;font-weight:600;color:#111827;margin:0 0 12px;">
        ${t('alert.topIssues.heading', locale)}
      </h2>
      <table width="100%" style="border-collapse:collapse;margin-bottom:24px;border:1px solid #f3f4f6;border-radius:8px;overflow:hidden;">
        ${issueRows}
      </table>` : ''}

      <!-- CTA -->
      <div style="text-align:center;margin-top:32px;">
        <a href="${data.dashboardUrl}"
          style="background:#dc2626;color:#fff;text-decoration:none;
            padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;">
          ${t('alert.cta', locale)}
        </a>
      </div>

      <!-- Footer -->
      <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:32px;">
        ${t('alert.footer', locale)}
      </p>

    </td></tr>
  </table>
</body>
</html>`
}

/**
 * Resend ile tarama uyarısı e-postası gönderir.
 * RESEND_API_KEY yoksa konsola yazar (geliştirme modu).
 */
export async function sendAlertEmail(
  data: AlertData,
  recipientEmail: string,
  locale: string = 'tr'
): Promise<{ sent: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.REPORT_FROM_EMAIL ?? 'reports@obsey.io'

  const html = buildAlertHtml(data, locale)
  const subject = t('alert.subject', locale, {
    siteName: data.siteName,
    count: String(data.totalNewIssues || data.newCriticalCount),
  })

  if (!apiKey) {
    console.log(`[sendAlertEmail] RESEND_API_KEY eksik — e-posta gönderilmedi. Alıcı: ${recipientEmail}, Konu: ${subject}`)
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

  const resData = (await res.json()) as { id: string }
  return { sent: true, id: resData.id }
}
