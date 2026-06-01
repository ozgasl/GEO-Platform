import tr from '../../messages/tr.json'

const messages: Record<string, Record<string, string>> = { tr }

export const DEFAULT_LOCALE = 'tr'

/**
 * Looks up a translation key for the given locale.
 * Falls back to Turkish, then to the key itself.
 *
 * Optionally interpolates `{placeholder}` tokens from `params`.
 * Pure sync — safe in server components, API routes, and client components.
 */
export function t(
  key: string,
  locale: string = DEFAULT_LOCALE,
  params?: Record<string, string | number>
): string {
  let str = messages[locale]?.[key] ?? messages[DEFAULT_LOCALE]?.[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return str
}
