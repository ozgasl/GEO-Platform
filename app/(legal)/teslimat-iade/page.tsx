import type { Metadata } from 'next'
import { COMPANY, LEGAL_LAST_UPDATED } from '@/lib/legal/company'
import Section from '@/components/marketing/LegalSection'

export const metadata: Metadata = {
  title: 'Teslimat ve İade — Obsey',
  description: 'Obsey dijital hizmet teslimatı, abonelik iptali, cayma hakkı ve iade koşulları.',
}

export default function TeslimatIadePage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">Teslimat ve İade</h1>
      <p className="text-sm text-gray-400 mb-8">Son güncelleme: {LEGAL_LAST_UPDATED}</p>

      <p className="text-gray-700 leading-relaxed mb-6">
        {COMPANY.brand} ({COMPANY.siteDomain}), {COMPANY.name} tarafından sunulan, internet
        üzerinden erişilen dijital bir abonelik hizmetidir. Fiziksel bir ürün teslimatı
        yapılmaz. Aşağıdaki koşullar hizmetin teslimatı, abonelik iptali ve iade süreçlerini
        düzenler.
      </p>

      <Section title="1. Hizmetin Teslimatı">
        <p>
          {COMPANY.brand} bir yazılım (SaaS) hizmetidir. Ödemenin onaylanmasının ardından
          hizmet, hesabınız üzerinden <strong>anında ve elektronik ortamda</strong> erişime
          açılır. Seçtiğiniz plana ait özellikler (site sayısı, tarama ve rapor hakları)
          ödeme onayı ile birlikte aktif hâle gelir.
        </p>
        <p>
          Teslimat için ayrıca bir kargo veya fiziksel gönderim süreci bulunmamaktadır.
          Hizmete erişimle ilgili herhangi bir sorun yaşamanız hâlinde{' '}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresinden bizimle iletişime
          geçebilirsiniz.
        </p>
      </Section>

      <Section title="2. Ücretsiz Deneme">
        <p>
          Ücretli bir abonelik satın almadan önce ücretsiz plan kapsamında hizmeti
          deneyebilirsiniz. Böylece hizmetin ihtiyaçlarınızı karşılayıp karşılamadığını ödeme
          yapmadan değerlendirebilirsiniz.
        </p>
      </Section>

      <Section title="3. Cayma Hakkı">
        <p>
          Mesafeli Sözleşmeler Yönetmeliği uyarınca tüketici, kural olarak sözleşmenin
          kurulduğu tarihten itibaren 14 (on dört) gün içinde herhangi bir gerekçe göstermeksizin
          cayma hakkına sahiptir.
        </p>
        <p>
          Ancak aynı Yönetmeliğin istisnaları gereği, <strong>tüketicinin onayı ile ifasına
          başlanan ve elektronik ortamda anında ifa edilen hizmetlerde</strong> cayma hakkı
          kullanılamaz. {COMPANY.brand} hizmeti, ödeme onayının ardından anında sunulmaya
          başlandığından, hizmet kullanılmaya başlandıktan sonra cayma hakkı sona erer.
        </p>
        <p>
          Cayma hakkınızı kullanmak istemeniz hâlinde, hizmeti kullanmaya başlamadan önce{' '}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine talebinizi
          iletmeniz yeterlidir.
        </p>
      </Section>

      <Section title="4. Abonelik İptali">
        <p>
          Aboneliğinizi dilediğiniz zaman iptal edebilirsiniz. İptal talebinizi hesap
          ayarlarınız üzerinden veya <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>{' '}
          adresine e-posta göndererek iletebilirsiniz. İptal işlemi, içinde bulunduğunuz fatura
          döneminin sonunda yürürlüğe girer; bu tarihe kadar hizmete erişiminiz devam eder ve
          aboneliğiniz bir sonraki dönem için yenilenmez.
        </p>
      </Section>

      <Section title="5. İade Koşulları">
        <p>
          Dijital hizmetin niteliği gereği, hizmet kullanılmaya başlandıktan sonra ilgili dönem
          için ücret iadesi yapılmaz. Bununla birlikte aşağıdaki durumlarda iade
          değerlendirilir:
        </p>
        <ul>
          <li>Ödemenin yanlışlıkla mükerrer (çift) alınması,</li>
          <li>Hizmetin tarafımızdan kaynaklanan teknik bir nedenle uzun süre sunulamaması,</li>
          <li>Yürürlükteki mevzuatın iadeyi zorunlu kıldığı diğer hâller.</li>
        </ul>
        <p>
          Onaylanan iadeler, ödemenin yapıldığı yöntem üzerinden (iyzico aracılığıyla, ilgili
          kredi/banka kartına) gerçekleştirilir. İade tutarının kartınıza yansıma süresi
          bankanıza bağlı olarak değişebilir.
        </p>
      </Section>

      <Section title="6. İletişim">
        <p>
          Teslimat ve iade süreçlerine ilişkin tüm sorularınız için:
        </p>
        <ul>
          <li>Unvan: {COMPANY.name}</li>
          <li>Adres: {COMPANY.address}</li>
          <li>E-posta: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></li>
        </ul>
      </Section>
    </div>
  )
}
