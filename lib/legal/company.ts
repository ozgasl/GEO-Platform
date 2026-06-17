/**
 * Satıcı / şirket kimlik bilgileri — tek kaynak.
 * Yasal sayfalar (gizlilik, teslimat-iade, mesafeli satış sözleşmesi, iletişim)
 * ve Footer bu sabitleri kullanır. Bilgi değişirse yalnızca burası güncellenir.
 */
export const COMPANY = {
  name: 'Akıllı Fabrikalar Teknoloji Danışmanlık A.Ş.',
  brand: 'Obsey',
  taxOffice: 'Kozyatağı',
  taxNumber: '0251004219',
  mersisNo: '0025100421900001',
  tradeRegistryNo: '358039-5',
  address: 'Küçükbakkalköy Mh. Defne Sk. Flora Ap. No:1/365 Ataşehir / İSTANBUL',
  email: 'info@obsey.io',
  phone: '', // verilmedi — iyzico için e-posta yeterli
  siteUrl: 'https://obsey.io',
  siteDomain: 'obsey.io',
} as const

/** Yasal metinlerde "son güncelleme" tarihi olarak gösterilir. */
export const LEGAL_LAST_UPDATED = '17 Haziran 2026'
