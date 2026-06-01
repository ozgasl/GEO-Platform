import { createCipheriv, createDecipheriv } from 'crypto'

const ALGO = 'aes-128-cbc'
const IV = Buffer.alloc(16, 0) // fixed IV — bu obfuscation, şifreleme değil

function getKey(): Buffer {
  const raw = process.env.MONITORING_SECRET
  // Güvenlik: production'da hardcoded fallback secret kullanma — token'lar
  // forge edilebilir hâle gelir. Yalnızca dev/test'te varsayılana izin ver.
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONITORING_SECRET environment variable is required in production.')
    }
    return Buffer.from('geo-platform-monitoring-key-12345', 'utf-8').subarray(0, 16)
  }
  return Buffer.from(raw, 'utf-8').subarray(0, 16)
}

/** siteId → URL-safe token (gizli değil, sadece düz metin olarak görünmemeli) */
export function encryptSiteId(siteId: string): string {
  const cipher = createCipheriv(ALGO, getKey(), IV)
  return Buffer.concat([cipher.update(siteId, 'utf8'), cipher.final()]).toString('base64url')
}

/** Token → siteId. Geçersiz token için null döner. */
export function decryptToken(token: string): string | null {
  try {
    const decipher = createDecipheriv(ALGO, getKey(), IV)
    return Buffer.concat([
      decipher.update(Buffer.from(token, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Kullanıcının sayfasına ekleneceği <script> snippet'i döndürür.
 * Beacon, AI botlar tarafından yürütülmez — bu human analytics içindir.
 * AI bot tespiti beacon API'de User-Agent header'ı üzerinden yapılır.
 * Kullanıcının site sunucusuna eklenmesi önerilen alternatif: middleware ile /api/beacon endpoint'ini çağırmak.
 */
export function generateSnippet(siteId: string, baseUrl: string): string {
  const token = encryptSiteId(siteId)
  const beaconUrl = `${baseUrl}/api/beacon`

  return `<!-- GEO Platform Monitoring -->
<script>
(function(){
  var t="${token}";
  var i=new Image();
  i.src="${beaconUrl}?t="+t+"&r="+encodeURIComponent(document.referrer);
  i.width=1;i.height=1;i.style.position="absolute";i.style.left="-9999px";
  document.body && document.body.appendChild(i);
})();
</script>
<!-- /GEO Platform Monitoring -->`
}
