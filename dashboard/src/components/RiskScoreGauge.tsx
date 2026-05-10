/**
 * Semi-circular SVG gauge for composite risk score (0-100).
 *
 * Displays a speedometer-style arc with color bands (green/amber/red),
 * the numeric score in the center, and an Arabic risk level label.
 */

import './RiskScoreGauge.css'

interface RiskScoreGaugeProps {
  score: number
  level: 'low' | 'medium' | 'high'
  label_ar: string
}

/** SVG arc path via polar coordinates. */
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 180) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  }
}

/** Build an SVG arc path from startAngle to endAngle (0 = left, 180 = right). */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
}

/** Map risk level to CSS custom property name. */
function levelColor(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'low': return 'var(--color-risk-low)'
    case 'medium': return 'var(--color-risk-medium)'
    case 'high': return 'var(--color-risk-high)'
  }
}


export function RiskScoreGauge({ score, level, label_ar }: RiskScoreGaugeProps) {
  // Gauge geometry — extra width/height for endpoint labels
  const width = 220
  const height = 140
  const cx = 110
  const cy = 108
  const r = 80
  const strokeWidth = 12

  // Score maps to 0-180 degrees
  const scoreAngle = (score / 100) * 180

  // Background track (full 180-degree arc)
  const trackPath = describeArc(cx, cy, r, 0, 180)

  // Color band arcs (green 0-33%, amber 34-66%, red 67-100%)
  const greenEnd = (33 / 100) * 180
  const amberEnd = (66 / 100) * 180

  const greenArc = describeArc(cx, cy, r, 0, greenEnd)
  const amberArc = describeArc(cx, cy, r, greenEnd, amberEnd)
  const redArc = describeArc(cx, cy, r, amberEnd, 180)

  // Progress arc (the active indicator)
  const progressArc = scoreAngle > 0.5 ? describeArc(cx, cy, r, 0, scoreAngle) : ''

  // Range label positions (at arc endpoints)
  const leftEnd = polarToCartesian(cx, cy, r, 0)
  const rightEnd = polarToCartesian(cx, cy, r, 180)

  return (
    <div className="rsg">
      <svg
        className="rsg__svg"
        viewBox={`0 0 ${width} ${height}`}
        aria-label={`مؤشر المخاطر: ${score} - ${label_ar}`}
      >
        {/* Background track */}
        <path
          d={trackPath}
          fill="none"
          stroke="var(--color-bg-input)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Color band segments (subtle) */}
        <path d={greenArc} fill="none" stroke="var(--color-risk-low)" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.2" />
        <path d={amberArc} fill="none" stroke="var(--color-risk-medium)" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.2" />
        <path d={redArc} fill="none" stroke="var(--color-risk-high)" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.2" />

        {/* Active progress arc */}
        {progressArc && (
          <path
            d={progressArc}
            fill="none"
            stroke={levelColor(level)}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="rsg__progress"
          />
        )}

        {/* Score text */}
        <text
          x={cx}
          y={cy - 20}
          textAnchor="middle"
          dominantBaseline="central"
          className="rsg__score-text"
          fill="var(--color-text)"
        >
          {score}
        </text>

        {/* Label text */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="rsg__label-text"
          fill={levelColor(level)}
        >
          {label_ar}
        </text>

        {/* Range labels at arc endpoints */}
        {/* Left side (0 = safe) — anchor start to prevent clipping */}
        <text
          x={leftEnd.x - 4}
          y={leftEnd.y + 16}
          textAnchor="start"
          className="rsg__range-label"
          fill="var(--color-text-faint)"
        >
          آمن
        </text>

        {/* Right side (100 = high risk) — anchor end to prevent clipping */}
        <text
          x={rightEnd.x + 4}
          y={rightEnd.y + 16}
          textAnchor="end"
          className="rsg__range-label"
          fill="var(--color-text-faint)"
        >
          خطر عالي
        </text>
      </svg>
    </div>
  )
}
