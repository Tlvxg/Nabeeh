import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 'var(--spacing-3xl)' }}>
      <h1 style={{ fontSize: '4rem', color: 'var(--color-primary)' }}>404</h1>
      <h2 style={{ marginTop: 'var(--spacing-md)' }}>الصفحة غير موجودة</h2>
      <p style={{ color: 'var(--color-text-muted)', marginTop: 'var(--spacing-sm)' }}>
        الصفحة التي تبحث عنها غير موجودة
      </p>
      <Link
        to="/"
        className="btn btn-primary"
        style={{ marginTop: 'var(--spacing-xl)', display: 'inline-flex' }}
      >
        العودة للرئيسية
      </Link>
    </div>
  )
}
