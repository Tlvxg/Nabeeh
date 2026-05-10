import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth.ts'
import { useTheme } from '../hooks/useTheme.ts'
import { toggleTheme } from '../providers/ThemeProvider.tsx'
import './RegisterPage.css'
import './LoginPage.css' // reuse shared login styling (brand, fields, button, footer, etc.)

/**
 * Branded Arabic registration page.
 * Standalone layout (no sidebar/header) with centered card.
 * Redirects to dashboard if already authenticated.
 */
export function RegisterPage() {
  const { session, loading: authLoading, signUp } = useAuth()
  const navigate = useNavigate()
  const theme = useTheme()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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

    // Client-side validation
    if (!displayName.trim()) {
      setError('يرجى إدخال اسم المستخدم')
      return
    }

    if (!email.trim()) {
      setError('يرجى إدخال البريد الإلكتروني')
      return
    }

    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }

    if (password !== confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }

    setSubmitting(true)
    try {
      const { error: authError } = await signUp(email.trim(), password, displayName.trim())
      if (authError) {
        // Map common Supabase error messages to Arabic
        if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
          setError('هذا البريد الإلكتروني مسجل بالفعل')
        } else if (authError.message.includes('valid email')) {
          setError('يرجى إدخال بريد إلكتروني صحيح')
        } else if (authError.message.includes('password')) {
          setError('كلمة المرور ضعيفة جداً. حاول استخدام كلمة مرور أقوى.')
        } else {
          setError('حدث خطأ أثناء إنشاء الحساب. حاول مرة أخرى.')
        }
      } else {
        // Supabase auto-signs-in after registration by default
        navigate('/dashboard', { replace: true })
      }
    } catch {
      setError('حدث خطأ غير متوقع. حاول مرة أخرى.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="register-page">
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

      <div className="register-card">
        {/* Branding — reuses login-brand class */}
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
        <p className="login-subtitle">إنشاء حساب جديد</p>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-field__label" htmlFor="register-name">
              اسم المستخدم
            </label>
            <input
              id="register-name"
              className="login-field__input"
              type="text"
              placeholder="أدخل اسمك"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              autoComplete="name"
              disabled={submitting}
            />
          </div>

          <div className="login-field">
            <label className="login-field__label" htmlFor="register-email">
              البريد الإلكتروني
            </label>
            <input
              id="register-email"
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
            <label className="login-field__label" htmlFor="register-password">
              كلمة المرور
            </label>
            <input
              id="register-password"
              className="login-field__input"
              type="password"
              placeholder="********"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              dir="ltr"
              disabled={submitting}
            />
            <span className="register-hint">6 أحرف على الأقل</span>
          </div>

          <div className="login-field">
            <label className="login-field__label" htmlFor="register-confirm">
              تأكيد كلمة المرور
            </label>
            <input
              id="register-confirm"
              className="login-field__input"
              type="password"
              placeholder="********"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
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
            {submitting ? '...جاري الإنشاء' : 'إنشاء حساب'}
          </button>
        </form>

        {/* Footer link */}
        <div className="login-footer">
          لديك حساب بالفعل؟{' '}
          <Link to="/login">تسجيل الدخول</Link>
        </div>
      </div>
    </div>
  )
}
