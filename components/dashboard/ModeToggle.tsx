'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ModeToggleProps {
  siteId: string
  currentMode: 'ADVISOR' | 'PILOT'
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3 h-3 flex-shrink-0"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export default function ModeToggle({ siteId, currentMode }: ModeToggleProps) {
  const router = useRouter()
  const [mode, setMode] = useState<'ADVISOR' | 'PILOT'>(currentMode)
  const [loading, setLoading] = useState(false)
  const [pilotTooltipOpen, setPilotTooltipOpen] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const pilotBtnRef = useRef<HTMLButtonElement>(null)

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!pilotTooltipOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        pilotBtnRef.current &&
        !pilotBtnRef.current.contains(e.target as Node)
      ) {
        setPilotTooltipOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [pilotTooltipOpen])

  async function selectAdvisor() {
    if (mode === 'ADVISOR' || loading) return
    setLoading(true)
    const res = await fetch(`/api/sites/${siteId}/mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'ADVISOR' }),
    })
    setLoading(false)
    if (res.ok) {
      setMode('ADVISOR')
      router.refresh()
    }
  }

  return (
    <div className="relative inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
      {/* Advisor option */}
      <button
        onClick={selectAdvisor}
        disabled={loading}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-50 ${
          mode === 'ADVISOR'
            ? 'bg-white text-gray-800 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            mode === 'ADVISOR' ? 'bg-green-500' : 'bg-gray-400'
          }`}
        />
        Advisor
      </button>

      {/* Pilot option — gated */}
      <div className="relative">
        <button
          ref={pilotBtnRef}
          onClick={() => setPilotTooltipOpen(v => !v)}
          onMouseEnter={() => setPilotTooltipOpen(true)}
          onMouseLeave={() => {
            // Keep open briefly so cursor can reach tooltip
            setTimeout(() => {
              if (
                !tooltipRef.current?.matches(':hover') &&
                !pilotBtnRef.current?.matches(':hover')
              ) {
                setPilotTooltipOpen(false)
              }
            }, 100)
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-gray-400 cursor-default select-none"
          aria-label="Pilot mod — yakında geliyor"
        >
          <LockIcon />
          Pilot
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500 text-[10px] font-semibold leading-none">
            Yakında
          </span>
        </button>

        {/* Tooltip / popover */}
        {pilotTooltipOpen && (
          <div
            ref={tooltipRef}
            onMouseEnter={() => setPilotTooltipOpen(true)}
            onMouseLeave={() => setPilotTooltipOpen(false)}
            role="tooltip"
            className="absolute right-0 top-full mt-2 z-50 w-72 bg-gray-900 text-white text-xs rounded-xl shadow-xl p-4 leading-relaxed"
          >
            <p className="font-semibold text-purple-300 mb-1.5">Pilot Mod yakında geliyor.</p>
            <p className="text-gray-300">
              Advisor Mod&apos;da AI önerilerini gözden geçirip uygulayarak güven oluşturduktan
              sonra, Pilot Mod otomatik olarak değişiklikleri uygular — tıpkı kod editörünüzde
              &ldquo;değişiklikleri kabul et&rdquo;ten &ldquo;otomatik uygula&rdquo;ya geçiş gibi.
            </p>
            {/* Arrow */}
            <div className="absolute -top-1.5 right-6 w-3 h-3 bg-gray-900 rotate-45 rounded-sm" />
          </div>
        )}
      </div>
    </div>
  )
}
