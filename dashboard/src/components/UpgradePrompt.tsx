import { Link } from 'react-router'
import './UpgradePrompt.css'

interface UpgradePromptProps {
  /** Arabic name of the gated feature (e.g., "المساعد الذكي") */
  feature: string
  /** Arabic description of what premium unlocks for this feature */
  description: string
  /** 'page' fills content area; 'inline' shows as modal overlay */
  variant: 'page' | 'inline'
  /** Close handler for inline variant */
  onClose?: () => void
}

/** Lock icon SVG (padlock). */
function LockIcon() {
  return (
    <svg
      className="upgrade-prompt__icon"
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <circle cx="12" cy="16" r="1" />
    </svg>
  )
}

/**
 * Reusable Arabic upgrade prompt for gated premium features.
 *
 * - `variant="page"`: centered in the content area (e.g., ChatbotPage)
 * - `variant="inline"`: modal overlay with backdrop and close button
 */
export function UpgradePrompt({ feature, description, variant, onClose }: UpgradePromptProps) {
  const content = (
    <div className={`upgrade-prompt__card ${variant === 'page' ? 'upgrade-prompt__card--page' : 'upgrade-prompt__card--inline'}`}>
      {variant === 'inline' && onClose && (
        <button className="upgrade-prompt__close" onClick={onClose} aria-label="إغلاق">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
      <LockIcon />
      <h2 className="upgrade-prompt__title">{feature}</h2>
      <p className="upgrade-prompt__desc">{description}</p>
      <Link to="/upgrade" className="upgrade-prompt__cta">
        الترقية إلى بريميوم
      </Link>
      <span className="upgrade-prompt__sub">استمتع بجميع المزايا المتقدمة</span>
    </div>
  )

  if (variant === 'inline') {
    return (
      <div className="upgrade-prompt upgrade-prompt--inline" onClick={onClose}>
        <div onClick={e => e.stopPropagation()}>
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="upgrade-prompt upgrade-prompt--page">
      {content}
    </div>
  )
}
