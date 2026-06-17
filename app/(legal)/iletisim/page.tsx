import type { Metadata } from 'next'
import { COMPANY } from '@/lib/legal/company'

export const metadata: Metadata = {
  title: 'İletişim — Obsey',
  description: 'Obsey iletişim bilgileri: firma unvanı, adres ve e-posta.',
}

export default function IletisimPage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold mb-2">İletişim</h1>
      <p className="text-gray-700 leading-relaxed mb-8">
        Sorularınız, destek talepleriniz ve KVKK başvurularınız için bize aşağıdaki kanallardan
        ulaşabilirsiniz.
      </p>

      <div className="rounded-2xl border border-gray-200 p-6 space-y-4">
        <Row label="Firma Unvanı" value={COMPANY.name} />
        <Row label="Adres" value={COMPANY.address} />
        <Row
          label="E-posta"
          value={
            <a href={`mailto:${COMPANY.email}`} className="text-blue-600 underline">
              {COMPANY.email}
            </a>
          }
        />
        {COMPANY.phone && <Row label="Telefon" value={COMPANY.phone} />}
        <Row label="Vergi Dairesi / No" value={`${COMPANY.taxOffice} / ${COMPANY.taxNumber}`} />
        <Row label="MERSIS No" value={COMPANY.mersisNo} />
        <Row label="Ticaret Sicil No" value={COMPANY.tradeRegistryNo} />
      </div>

      <p className="text-sm text-gray-500 mt-6">
        Destek taleplerine genellikle 1-2 iş günü içinde yanıt veriyoruz.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <span className="w-44 shrink-0 text-sm font-medium text-gray-500">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}
