import type { Metadata } from 'next'
import { COMPANY, LEGAL_LAST_UPDATED } from '@/lib/legal/company'
import Section from '@/components/marketing/LegalSection'

export const metadata: Metadata = {
  title: 'Gizlilik Politikası — Obsey',
  description: 'Obsey gizlilik politikası ve kişisel verilerin korunması (KVKK) aydınlatma metni.',
}

export default function GizlilikPage() {
  return (
    <div className="prose-legal">
      <h1 className="text-3xl font-extrabold mb-2">Gizlilik Politikası</h1>
      <p className="text-sm text-gray-400 mb-8">Son güncelleme: {LEGAL_LAST_UPDATED}</p>

      <p className="text-gray-700 leading-relaxed mb-6">
        {COMPANY.name} (“Şirket”, “biz”) olarak, {COMPANY.brand} ({COMPANY.siteDomain}) hizmetini
        kullanırken paylaştığınız kişisel verilerin gizliliğine önem veriyoruz. Bu Gizlilik
        Politikası, hangi verileri topladığımızı, bu verileri hangi amaçlarla işlediğimizi ve
        6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamındaki haklarınızı açıklar.
      </p>

      <Section title="1. Veri Sorumlusu">
        <p>
          Kişisel verileriniz, veri sorumlusu sıfatıyla {COMPANY.name} tarafından işlenmektedir.
        </p>
        <ul>
          <li>Unvan: {COMPANY.name}</li>
          <li>Adres: {COMPANY.address}</li>
          <li>E-posta: {COMPANY.email}</li>
          <li>Vergi Dairesi / No: {COMPANY.taxOffice} / {COMPANY.taxNumber}</li>
        </ul>
      </Section>

      <Section title="2. Topladığımız Veriler">
        <ul>
          <li><strong>Hesap bilgileri:</strong> ad-soyad, e-posta adresi ve giriş bilgileri (Google ile giriş veya e-posta/şifre).</li>
          <li><strong>Site bilgileri:</strong> analiz için eklediğiniz web sitelerinin alan adları ve URL’leri.</li>
          <li><strong>Tarama (crawl) verileri:</strong> analiz ettiğimiz sitelerin herkese açık sayfa içerikleri ve teknik meta verileri.</li>
          <li><strong>İzleme verileri:</strong> izleme snippet’i eklediğiniz sitelerde yapay zekâ botlarının ziyaret kayıtları (bot türü, zaman, sayfa).</li>
          <li><strong>Ödeme bilgileri:</strong> ödemeler ödeme kuruluşu iyzico üzerinden işlenir; kart bilgileriniz tarafımızca saklanmaz.</li>
          <li><strong>Teknik veriler:</strong> IP adresi, tarayıcı bilgisi ve hizmetin çalışması için gerekli log kayıtları.</li>
        </ul>
      </Section>

      <Section title="3. İşleme Amaçları">
        <ul>
          <li>Hizmetin sunulması, hesabınızın oluşturulması ve yönetilmesi,</li>
          <li>GEO analizlerinin yapılması, rapor üretilmesi ve e-posta ile gönderilmesi,</li>
          <li>Abonelik ve ödeme süreçlerinin yürütülmesi,</li>
          <li>Yasal yükümlülüklerin yerine getirilmesi ve hizmet güvenliğinin sağlanması,</li>
          <li>Destek taleplerinizin yanıtlanması.</li>
        </ul>
      </Section>

      <Section title="4. Verilerin Paylaşıldığı Üçüncü Taraflar">
        <p>Hizmetin sağlanması için verileriniz aşağıdaki tedarikçilerle, yalnızca gerekli ölçüde paylaşılır:</p>
        <ul>
          <li><strong>Anthropic (Claude API):</strong> içerik analizinin yapay zekâ ile değerlendirilmesi.</li>
          <li><strong>Resend:</strong> rapor ve bilgilendirme e-postalarının gönderimi.</li>
          <li><strong>iyzico:</strong> ödeme işlemlerinin güvenli şekilde gerçekleştirilmesi.</li>
          <li><strong>Barındırma sağlayıcıları:</strong> uygulamanın ve veritabanının çalıştırılması.</li>
        </ul>
        <p>Veriler, yasal zorunluluklar dışında pazarlama amacıyla üçüncü kişilere satılmaz.</p>
      </Section>

      <Section title="5. Saklama Süresi">
        <p>
          Kişisel verileriniz, işleme amacının gerektirdiği süre ve ilgili mevzuatta öngörülen
          süreler boyunca saklanır. Hesabınızı kapatmanız hâlinde verileriniz, yasal saklama
          yükümlülükleri saklı kalmak kaydıyla silinir veya anonim hâle getirilir.
        </p>
      </Section>

      <Section title="6. KVKK Kapsamındaki Haklarınız">
        <p>KVKK’nın 11. maddesi uyarınca, veri sahibi olarak aşağıdaki haklara sahipsiniz:</p>
        <ul>
          <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme,</li>
          <li>İşlenmişse buna ilişkin bilgi talep etme,</li>
          <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
          <li>Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme,</li>
          <li>Verilerin silinmesini veya yok edilmesini isteme,</li>
          <li>İşlemenin münhasıran otomatik sistemlerle analiz edilmesi nedeniyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme.</li>
        </ul>
        <p>
          Taleplerinizi <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine
          iletebilirsiniz.
        </p>
      </Section>

      <Section title="7. Çerezler">
        <p>
          {COMPANY.brand}, oturum yönetimi ve hizmetin temel işlevleri için gerekli çerezleri
          kullanır. Tarayıcı ayarlarınızdan çerezleri yönetebilirsiniz; ancak bazı çerezlerin
          devre dışı bırakılması hizmetin çalışmasını etkileyebilir.
        </p>
      </Section>

      <Section title="8. Değişiklikler">
        <p>
          Bu politikayı zaman zaman güncelleyebiliriz. Güncel sürüm bu sayfada yayımlanır ve
          “son güncelleme” tarihi değiştirilir.
        </p>
      </Section>
    </div>
  )
}
