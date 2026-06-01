'use client'

import { useState } from 'react'

interface EmailPreferencesFormProps {
  initialEmailReports: boolean
  initialEmailAlerts: boolean
}

export default function EmailPreferencesForm({
  initialEmailReports,
  initialEmailAlerts,
}: EmailPreferencesFormProps) {
  const [emailReports, setEmailReports] = useState(initialEmailReports)
  const [emailAlerts, setEmailAlerts] = useState(initialEmailAlerts)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function toggle(field: 'emailReports' | 'emailAlerts') {
    const nextReports = field === 'emailReports' ? !emailReports : emailReports
    const nextAlerts = field === 'emailAlerts' ? !emailAlerts : emailAlerts

    if (field === 'emailReports') setEmailReports(nextReports)
    else setEmailAlerts(nextAlerts)

    setSaving(true)
    setSaved(false)

    await fetch('/api/user/email-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailReports: nextReports, emailAlerts: nextAlerts }),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <ToggleRow
        label="Haftalık Rapor E-postaları"
        description="Her Pazartesi GEO skoru ve iyileştirme önerileri içeren rapor alın."
        checked={emailReports}
        disabled={saving}
        onToggle={() => toggle('emailReports')}
      />
      <ToggleRow
        label="Tarama Uyarıları"
        description="Kritik sorun veya skor düşüşü tespit edildiğinde anında bildirim alın."
        checked={emailAlerts}
        disabled={saving}
        onToggle={() => toggle('emailAlerts')}
      />
      {saved && <p className="text-xs text-green-600">Kaydedildi ✓</p>}
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onToggle,
}: {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow
            ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}
