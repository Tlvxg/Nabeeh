import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.ts'
import { useTheme } from '../hooks/useTheme.ts'
import { toggleTheme } from '../providers/ThemeProvider.tsx'
import './LoginPage.css'

/**
 * Branded Arabic login page.
 * Standalone layout (no sidebar/header) with centered card.
 * Redirects to dashboard if already authenticated.
 */
export function LoginPage() {
  const { session, loading: authLoading, signIn } = useAuth()
  const navigate = useNavigate()
  const theme = useTheme()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // If already authenticated, redirect to dashboard
  if (!authLoading && session) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const logoSrc = theme === 'dark'
    ? `${import.meta.env.BASE_URL}assets/logo-dark.svg`
    : `${import.meta.env.BASE_URL}assets/logo.svg`

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }

    setSubmitting(true)
    try {
      const { error: authError } = await signIn(email.trim(), password)
      if (authError) {
        // Map common Supabase error messages to Arabic
        if (authError.message.includes('Invalid login credentials')) {
          setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
        } else if (authError.message.includes('Email not confirmed')) {
          setError('لم يتم تأكيد البريد الإلكتروني بعد')
        } else {
          setError('حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.')
        }
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch {
      setError('حدث خطأ غير متوقع. حاول مرة أخرى.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      {/* Theme toggle */}
      <button
        className="login-theme-toggle"
        onClick={toggleTheme}
        aria-label="تبديل الوضع"
        type="button"
      >
        {theme === 'dark' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>

      <div className="login-card">
        {/* Branding */}
        <div className="login-brand">
          <img
            src={logoSrc}
            alt="Nabeeh"
            width={48}
            height={48}
            className="login-brand__logo"
          />
          <span className="login-brand__name">نبيه</span>
        </div>
        <p className="login-subtitle">تسجيل الدخول</p>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-field__label" htmlFor="login-email">
              البريد الإلكتروني
            </label>
            <input
              id="login-email"
              className="login-field__input"
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              dir="ltr"
              disabled={submitting}
            />
          </div>

          <div className="login-field">
            <label className="login-field__label" htmlFor="login-password">
              كلمة المرور
            </label>
            <input
              id="login-password"
              className="login-field__input"
              type="password"
              placeholder="********"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              dir="ltr"
              disabled={submitting}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="login-submit"
            disabled={submitting}
          >
            {submitting ? '...جاري الدخول' : 'دخول'}
          </button>
        </form>

        {/* Footer link */}
        <div className="login-footer">
          ليس لديك حساب؟{' '}
          <Link to="/register">إنشاء حساب جديد</Link>
        </div>
      </div>
    </div>
  )
}
