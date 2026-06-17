import type { Metadata } from 'next'
import { COMPANY, LEGAL_LAST_UPDATED } from '@/lib/legal/company'
import Section from '@/components/marketing/LegalSection'

export const metadata: Metadata = {
  title: 'Mesafeli Satış Sözleşmesi — Obsey',
  description: 'Obsey hizmetine ilişkin Mesafeli Satış Sözleşmesi.',
}

export default function MesafeliSatisSozlesmesiPage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">Mesafeli Satış Sözleşmesi</h1>
      <p className="text-sm text-gray-400 mb-8">Son güncelleme: {LEGAL_LAST_UPDATED}</p>

      <Section title="1. Taraflar">
        <p>İşbu Mesafeli Satış Sözleşmesi (“Sözleşme”), aşağıdaki taraflar arasında elektronik ortamda kurulmuştur.</p>
        <p><strong>SATICI</strong></p>
        <ul>
          <li>Unvan: {COMPANY.name}</li>
          <li>Adres: {COMPANY.address}</li>
          <li>Vergi Dairesi / No: {COMPANY.taxOffice} / {COMPANY.taxNumber}</li>
          <li>MERSIS No: {COMPANY.mersisNo}</li>
          <li>Ticaret Sicil No: {COMPANY.tradeRegistryNo}</li>
          <li>E-posta: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></li>
          <li>İnternet sitesi: {COMPANY.siteUrl}</li>
        </ul>
        <p><strong>ALICI</strong></p>
        <p>
          Hizmeti satın alan ve sipariş/üyelik sırasında ad-soyad, e-posta, fatura adresi gibi
          bilgilerini SATICI’ya bildiren gerçek veya tüzel kişidir. ALICI’ya ait bilgiler, sipariş
          aşamasında ALICI tarafından girilen ve ödeme sırasında onaylanan bilgilerden oluşur.
        </p>
      </Section>

      <Section title="2. Konu">
        <p>
          İşbu Sözleşme’nin konusu, ALICI’nın SATICI’ya ait {COMPANY.siteUrl} internet
          sitesinden elektronik ortamda siparişini verdiği, aşağıda nitelikleri ve satış fiyatı
          belirtilen dijital hizmetin satışı ve ifası ile ilgili olarak 6502 sayılı Tüketicinin
          Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca
          tarafların hak ve yükümlülüklerinin belirlenmesidir.
        </p>
      </Section>

      <Section title="3. Sözleşme Konusu Hizmet ve Ödeme Bilgileri">
        <p>
          Sözleşme konusu hizmet, {COMPANY.brand} adlı, AI arama motorlarında (ChatGPT, Claude,
          Perplexity vb.) site görünürlüğünü analiz eden ve iyileştiren abonelik tabanlı bir
          yazılım (SaaS) hizmetidir.
        </p>
        <ul>
          <li>Satın alınan planın adı, kapsamı (site sayısı, tarama ve rapor hakları) ve abonelik süresi, sipariş aşamasında ALICI’ya gösterilir.</li>
          <li>Hizmetin vergiler dâhil toplam satış bedeli, sipariş özetinde ve ödeme ekranında belirtilir.</li>
          <li>Ödeme, SATICI’nın anlaşmalı olduğu ödeme kuruluşu iyzico altyapısı üzerinden kredi/banka kartı ile peşin olarak tahsil edilir. Kart bilgileri SATICI tarafından saklanmaz.</li>
          <li>Abonelik, ALICI tarafından iptal edilmediği sürece, seçilen periyot sonunda aynı koşullarla otomatik olarak yenilenebilir.</li>
        </ul>
      </Section>

      <Section title="4. Genel Hükümler">
        <ul>
          <li>ALICI, Sözleşme konusu hizmetin temel nitelikleri, satış fiyatı, ödeme şekli ve ifaya ilişkin ön bilgileri okuyup bilgi sahibi olduğunu ve elektronik ortamda gerekli teyidi verdiğini kabul eder.</li>
          <li>Hizmet, ödemenin onaylanmasının ardından ALICI’nın hesabı üzerinden elektronik ortamda anında erişime açılarak ifa edilir; ayrıca fiziksel teslimat yapılmaz.</li>
          <li>ALICI’nın siparişi verdiği sırada beyan ettiği bilgilerin doğruluğundan ALICI sorumludur. Yanlış veya eksik bilgi nedeniyle hizmete erişimde yaşanacak aksaklıklardan SATICI sorumlu tutulamaz.</li>
          <li>Mücbir sebep hâllerinde (doğal afet, yangın, altyapı/internet kesintileri, üçüncü taraf servis sağlayıcı arızaları vb.) SATICI’nın yükümlülükleri, mücbir sebep süresince askıya alınır.</li>
        </ul>
      </Section>

      <Section title="5. Cayma Hakkı">
        <p>
          ALICI, Sözleşme’nin kurulmasından itibaren 14 (on dört) gün içinde herhangi bir
          gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir.
          Cayma bildirimi, bu süre içinde{' '}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine yazılı olarak
          iletilebilir.
        </p>
      </Section>

      <Section title="6. Cayma Hakkının Kullanılamayacağı Durumlar">
        <p>
          Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesi uyarınca, elektronik ortamda anında
          ifa edilen hizmetlerde, ALICI’nın onayı ile ifasına başlanan hizmete ilişkin cayma
          hakkı kullanılamaz. {COMPANY.brand} hizmeti ödeme onayının ardından anında ifa
          edilmeye başlandığından, ALICI hizmeti kullanmaya başladığı andan itibaren cayma
          hakkını kaybeder. ALICI bu durumu kabul ettiğini beyan eder.
        </p>
      </Section>

      <Section title="7. Hizmetin İptali ve İade">
        <p>
          ALICI aboneliğini dilediği zaman iptal edebilir; iptal, içinde bulunulan fatura
          döneminin sonunda yürürlüğe girer ve abonelik bir sonraki dönem için yenilenmez. İade
          koşulları, SATICI’nın internet sitesindeki “Teslimat ve İade” politikasında
          düzenlenmiştir ve işbu Sözleşme’nin ayrılmaz parçasıdır.
        </p>
      </Section>

      <Section title="8. Kişisel Verilerin Korunması">
        <p>
          ALICI’ya ait kişisel veriler, SATICI’nın “Gizlilik Politikası” ve 6698 sayılı KVKK
          kapsamında işlenir. Detaylı bilgiye SATICI’nın internet sitesindeki Gizlilik
          Politikası sayfasından ulaşılabilir.
        </p>
      </Section>

      <Section title="9. Uyuşmazlıkların Çözümü">
        <p>
          İşbu Sözleşme’nin uygulanmasında, Ticaret Bakanlığı’nca ilan edilen değere kadar
          ALICI’nın yerleşim yerindeki Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri
          yetkilidir. ALICI, şikâyet ve itirazlarını yukarıda belirtilen kanunlar çerçevesinde
          ilgili merci ve heyetlere yapabilir.
        </p>
      </Section>

      <Section title="10. Yürürlük">
        <p>
          ALICI, işbu Sözleşme’nin tüm koşullarını okuduğunu, anladığını ve elektronik ortamda
          onayladığını kabul eder. Sözleşme, ALICI tarafından elektronik ortamda onaylanıp
          ödemenin gerçekleşmesi ile yürürlüğe girer.
        </p>
      </Section>
    </div>
  )
}
