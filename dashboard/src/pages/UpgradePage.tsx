import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUserProfile } from '../hooks/useUserProfile.ts'
import './UpgradePage.css'

/**
 * Simulated payment gate page.
 * Shows premium features, a fake price, and upgrades the user on "Pay Now".
 * If already premium, shows confirmation with a link back to dashboard.
 */
export function UpgradePage() {
  const navigate = useNavigate()
  const { isPremium, isLoading, upgradeToPremium } = useUserProfile()

  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpgrade() {
    setProcessing(true)
    setError(null)

    try {
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      await upgradeToPremium()
      setSuccess(true)

      // Brief success display, then navigate to dashboard
      setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 1500)
    } catch {
      setError('حدث خطأ أثناء الترقية. حاول مرة أخرى.')
      setProcessing(false)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="upgrade-page">
        <div className="upgrade-card">
          <div style={{ textAlign: 'center', padding: 'var(--spacing-xl) 0', color: 'var(--color-text-muted)' }}>
            ...جاري التحميل
          </div>
        </div>
      </div>
    )
  }

  // Already premium
  if (isPremium && !success) {
    return (
      <div className="upgrade-page">
        <div className="upgrade-card">
          <div className="upgrade-already">
            <div className="upgrade-already__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="upgrade-already__title">
              انت مشترك بالفعل في بريميوم
            </h2>
            <p className="upgrade-already__subtitle">
              تتمتع بجميع المزايا المتقدمة
            </p>
            <Link to="/dashboard" className="upgrade-back">
              العودة للوحة التحكم
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Success state (after upgrade)
  if (success) {
    return (
      <div className="upgrade-page">
        <div className="upgrade-card">
          <div className="upgrade-success">
            <div className="upgrade-success__icon">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="upgrade-success__title">
              تمت الترقية بنجاح!
            </h2>
            <p className="upgrade-success__subtitle">
              جاري التحويل للوحة التحكم...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Default: upgrade form
  return (
    <div className="upgrade-page">
      <div className="upgrade-card">
        {/* Header */}
        <div className="upgrade-header">
          <div className="upgrade-header__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <h1 className="upgrade-header__title">
            الترقية الى بريميوم
          </h1>
          <p className="upgrade-header__subtitle">
            احصل على تحليلات متقدمة وادوات حصرية
          </p>
        </div>

        {/* Feature list */}
        <ul className="upgrade-features">
          <li className="upgrade-feature">
            <svg className="upgrade-feature__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span className="upgrade-feature__text">
              المساعد الذكي — تحليل مخاطر مدعوم بالذكاء الاصطناعي
            </span>
          </li>
          <li className="upgrade-feature">
            <svg className="upgrade-feature__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span className="upgrade-feature__text">
              قائمة المتابعة — تتبع اسهمك المفضلة
            </span>
          </li>
          <li className="upgrade-feature">
            <svg className="upgrade-feature__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span className="upgrade-feature__text">
              تنبيهات البريد — اشعارات تحديث المخاطر
            </span>
          </li>
        </ul>

        {/* Price */}
        <div className="upgrade-price">
          <div className="upgrade-price__amount">49 ر.س</div>
          <div className="upgrade-price__period">شهريا</div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--color-negative)',
            backgroundColor: 'var(--color-negative-bg)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            borderRadius: 'var(--radius-sm)',
            textAlign: 'center',
            marginBlockEnd: 'var(--spacing-md)',
          }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          className="upgrade-cta"
          onClick={handleUpgrade}
          disabled={processing}
          type="button"
        >
          {processing ? '...جاري المعالجة' : 'ادفع الان'}
        </button>
      </div>
    </div>
  )
}
