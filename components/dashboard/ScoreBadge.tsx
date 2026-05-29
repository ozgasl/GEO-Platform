const GRADE_CONFIG = {
  A: { bg: 'bg-green-100', text: 'text-green-800', ring: 'ring-green-200' },
  B: { bg: 'bg-lime-100',  text: 'text-lime-800',  ring: 'ring-lime-200'  },
  C: { bg: 'bg-yellow-100',text: 'text-yellow-800',ring: 'ring-yellow-200'},
  D: { bg: 'bg-orange-100',text: 'text-orange-800',ring: 'ring-orange-200'},
  F: { bg: 'bg-red-100',   text: 'text-red-800',   ring: 'ring-red-200'  },
} as const

type Grade = keyof typeof GRADE_CONFIG

function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}

interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

export default function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const grade = scoreToGrade(score)
  const cfg = GRADE_CONFIG[grade]

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5 font-bold',
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring} ${sizeClasses[size]}`}>
      <span className="tabular-nums">{score}</span>
      <span className="opacity-60">/100</span>
      <span className={`ml-0.5 inline-flex w-5 h-5 items-center justify-center rounded-full text-xs font-bold bg-current/10`}>
        {grade}
      </span>
    </span>
  )
}
