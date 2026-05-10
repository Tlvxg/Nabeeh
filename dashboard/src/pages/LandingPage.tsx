import { Link } from 'react-router'
import { toggleTheme, getTheme } from '../providers/ThemeProvider.tsx'
import { useState, useEffect, useRef } from 'react'
import { Sun, Moon, Check, ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.ts'
import './LandingPage.css'

export function LandingPage() {
  const { session, loading: authLoading } = useAuth()
  const isLoggedIn = !authLoading && !!session
  const ctaTarget = isLoggedIn ? '/dashboard' : '/register'
  const [theme, setTheme] = useState<'light' | 'dark'>(getTheme)

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getTheme())
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  const landingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sections = landingRef.current?.querySelectorAll('.landing__reveal')
    if (!sections) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('landing__revealed')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    sections.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [])

  const logoSrc = theme === 'dark'
    ? `${import.meta.env.BASE_URL}assets/logo-dark.svg`
    : `${import.meta.env.BASE_URL}assets/logo.svg`

  return (
    <div className="landing" ref={landingRef}>
      {/* Sticky Header */}
      <header className="landing__header">
        <div className="landing__header-inner">
          <a href="/" className="landing__brand">
            <img src={logoSrc} alt="Nabeeh" width={38} height={38} />
            <span className="landing__brand-text">نبيه</span>
          </a>

          <nav className="landing__nav">
            <a href="#features" className="landing__nav-link">المميزات</a>
            <a href="#how-it-works" className="landing__nav-link">كيف يعمل</a>
            <a href="#pricing" className="landing__nav-link">الأسعار</a>
          </nav>

          <div className="landing__header-actions">
            <button
              className="landing__theme-toggle"
              onClick={toggleTheme}
              aria-label="تبديل الوضع"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link to={ctaTarget} className="landing__btn landing__btn--primary landing__btn--sm">
              {isLoggedIn ? 'لوحة التحكم' : 'ابدأ الآن'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="landing__hero landing__reveal">
        <div className="landing__hero-content">
          <h1 className="landing__hero-heading">
            لا تستثمر قبل ما<br />تعرف المخاطر
          </h1>
          <p className="landing__hero-sub">
            نبيه يحلل لك أسهم السوق السعودي ويعطيك تقييم مخاطر واضح عشان تاخذ قرار استثماري أفضل
          </p>
          <div className="landing__hero-actions">
            <Link to={ctaTarget} className="landing__btn landing__btn--primary landing__btn--lg">
              ابدأ مجاناً
              <ArrowLeft size={18} />
            </Link>
            <a href="#features" className="landing__btn landing__btn--outline landing__btn--lg">
              شاهد كيف يعمل
            </a>
          </div>
        </div>

        <div className="landing__hero-visual">
          <div className="landing__hero-visual-inner">
            <div className="landing__hero-visual-mockup">
              {/* Window bar */}
              <div className="landing__mockup-bar">
                <span className="landing__mockup-dot landing__mockup-dot--red" />
                <span className="landing__mockup-dot landing__mockup-dot--yellow" />
                <span className="landing__mockup-dot landing__mockup-dot--green" />
                <span className="landing__mockup-bar-title">نبيه — لوحة التحليل</span>
              </div>

              <div className="landing__mockup-content">
                {/* Abstract risk visualization */}
                <div className="landing__mockup-risk-viz">
                  <div className="landing__mockup-risk-header">
                    <span className="landing__mockup-risk-title">تحليل المخاطر</span>
                  </div>

                  {/* Animated risk bars */}
                  <div className="landing__mockup-bars">
                    <div className="landing__mockup-bar-row">
                      <span className="landing__mockup-bar-label">تقلّب السعر</span>
                      <div className="landing__mockup-bar-track">
                        <div className="landing__mockup-bar-value landing__mockup-bar-value--low" />
                      </div>
                    </div>
                    <div className="landing__mockup-bar-row">
                      <span className="landing__mockup-bar-label">مشاعر السوق</span>
                      <div className="landing__mockup-bar-track">
                        <div className="landing__mockup-bar-value landing__mockup-bar-value--med" />
                      </div>
                    </div>
                    <div className="landing__mockup-bar-row">
                      <span className="landing__mockup-bar-label">حجم التداول</span>
                      <div className="landing__mockup-bar-track">
                        <div className="landing__mockup-bar-value landing__mockup-bar-value--high" />
                      </div>
                    </div>
                    <div className="landing__mockup-bar-row">
                      <span className="landing__mockup-bar-label">الاتجاه العام</span>
                      <div className="landing__mockup-bar-track">
                        <div className="landing__mockup-bar-value landing__mockup-bar-value--low2" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom: risk score circle + signal */}
                <div className="landing__mockup-bottom">
                  <div className="landing__mockup-score">
                    <svg className="landing__mockup-score-svg" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-border)" strokeWidth="5" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#1a7f5a" strokeWidth="5"
                        strokeDasharray="214" strokeDashoffset="214"
                        strokeLinecap="square" transform="rotate(-90 40 40)"
                        className="landing__mockup-score-ring" />
                    </svg>
                    <div className="landing__mockup-score-text">
                      <span className="landing__mockup-score-num">٢٨</span>
                      <span className="landing__mockup-score-label">درجة المخاطر</span>
                    </div>
                  </div>

                  <div className="landing__mockup-signal">
                    <div className="landing__mockup-signal-dot" />
                    <div className="landing__mockup-signal-info">
                      <span className="landing__mockup-signal-status">مخاطر منخفضة</span>
                      <span className="landing__mockup-signal-desc">مناسب للاستثمار طويل المدى</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="landing__features landing__reveal">
        <div className="landing__section-header">
          <h2 className="landing__section-title">
            المنصة الوحيدة اللي تعطيك الصورة الكاملة
          </h2>
          <p className="landing__section-sub">
            كل اللي تحتاجه عشان تفهم السوق السعودي وتستثمر بثقة
          </p>
        </div>

        <div className="landing__features-grid">
          <div className="landing__fcard">
            <div className="landing__fcard-accent" />
            <h3 className="landing__fcard-title">اعرف مستقبل سهمك</h3>
            <p className="landing__fcard-desc">شوف سيناريوهات السعر المتوقعة لكل سهم عشان تقرر تشتري أو تبيع بثقة</p>
          </div>
          <div className="landing__fcard">
            <div className="landing__fcard-accent" />
            <h3 className="landing__fcard-title">افهم السوق من الأخبار</h3>
            <p className="landing__fcard-desc">نبيه يحلل لك الأخبار ويعطيك نبض السوق — هل السوق متفائل أو متخوف من كل سهم</p>
          </div>
          <div className="landing__fcard">
            <div className="landing__fcard-accent" />
            <h3 className="landing__fcard-title">تقييم شامل لكل سهم</h3>
            <p className="landing__fcard-desc">درجة مخاطر واضحة لكل سهم مع تفصيل الأسباب عشان تعرف بالضبط وين المخاطر</p>
          </div>
          <div className="landing__fcard">
            <div className="landing__fcard-accent" />
            <h3 className="landing__fcard-title">تابع أسهمك بقائمة مراقبة</h3>
            <p className="landing__fcard-desc">أضف الأسهم اللي تهمك في قائمتك الخاصة وتابع تحديثاتها كلها من مكان واحد</p>
          </div>
          <div className="landing__fcard">
            <div className="landing__fcard-accent" />
            <h3 className="landing__fcard-title">مساعد ذكي يجاوب أسئلتك</h3>
            <p className="landing__fcard-desc">اسأل نبيه عن أي سهم وراح يعطيك تحليل سريع ومبسط</p>
          </div>
          <Link to={ctaTarget} className="landing__fcard landing__fcard--cta">
            <h3 className="landing__fcard-cta-title">جاهز تجرب؟</h3>
            <span className="landing__fcard-cta-link">ابدأ مجاناً ←</span>
          </Link>
        </div>
      </section>

      {/* How It Works — compact horizontal strip */}
      <section id="how-it-works" className="landing__how landing__reveal">
        <div className="landing__how-inner">
          <h2 className="landing__how-title">كيف يعمل نبيه؟</h2>
          <div className="landing__how-steps">
            <div className="landing__how-step">
              <span className="landing__how-num">١</span>
              <div className="landing__how-text">
                <h3 className="landing__how-step-title">سجّل مجاناً</h3>
                <p className="landing__how-step-desc">بس إيميلك وكلمة مرور</p>
              </div>
            </div>
            <div className="landing__how-arrow">›</div>
            <div className="landing__how-step">
              <span className="landing__how-num">٢</span>
              <div className="landing__how-text">
                <h3 className="landing__how-step-title">أضف أسهمك</h3>
                <p className="landing__how-step-desc">اختار الأسهم وأضفها لقائمتك</p>
              </div>
            </div>
            <div className="landing__how-arrow">›</div>
            <div className="landing__how-step">
              <span className="landing__how-num">٣</span>
              <div className="landing__how-text">
                <h3 className="landing__how-step-title">شوف التحليل</h3>
                <p className="landing__how-step-desc">مخاطر، سيناريوهات، وأخبار</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Backtest Comparison — full-width banner */}
      <section className="landing__backtest landing__reveal">
        <div className="landing__backtest-inner">
          <div className="landing__backtest-header">
            <span className="landing__backtest-label">محاكاة</span>
            <h2 className="landing__backtest-title">شغّلنا وكيلين ذكيين على السوق السعودي</h2>
            <p className="landing__backtest-sub">
              وكيل يستخدم تحليلات نبيه ضد وكيل يتداول بدون — ١٠ أسهم لمدة ٦ أشهر برأس مال ١٠٠,٠٠٠ ريال
            </p>
          </div>

          <div className="landing__versus">
            <div className="landing__versus-card landing__versus-card--winner">
              <span className="landing__versus-badge">الفائز</span>
              <h3 className="landing__versus-name">وكيل نبيه</h3>
              <p className="landing__versus-desc">يستخدم تحليلات المخاطر والمشاعر</p>
              <div className="landing__versus-return landing__versus-return--green">+٢٣.٧٪</div>
              <div className="landing__versus-metrics">
                <div className="landing__versus-metric">
                  <span className="landing__versus-metric-label">نسبة الفوز</span>
                  <span className="landing__versus-metric-value">٧١٪</span>
                  <div className="landing__bar"><div className="landing__bar-fill landing__bar-fill--green" style={{ width: '71%' }} /></div>
                </div>
                <div className="landing__versus-metric">
                  <span className="landing__versus-metric-label">نسبة شارب</span>
                  <span className="landing__versus-metric-value">١.٨٧</span>
                  <div className="landing__bar"><div className="landing__bar-fill landing__bar-fill--green" style={{ width: '87%' }} /></div>
                </div>
                <div className="landing__versus-metric">
                  <span className="landing__versus-metric-label">أقصى انخفاض</span>
                  <span className="landing__versus-metric-value">-٦.٣٪</span>
                  <div className="landing__bar"><div className="landing__bar-fill landing__bar-fill--green" style={{ width: '25%' }} /></div>
                </div>
              </div>
            </div>

            <div className="landing__versus-divider">
              <span className="landing__versus-vs">VS</span>
            </div>

            <div className="landing__versus-card">
              <h3 className="landing__versus-name">وكيل تقليدي</h3>
              <p className="landing__versus-desc">يتداول بدون تحليل مخاطر</p>
              <div className="landing__versus-return landing__versus-return--red">-٨.٢٪</div>
              <div className="landing__versus-metrics">
                <div className="landing__versus-metric">
                  <span className="landing__versus-metric-label">نسبة الفوز</span>
                  <span className="landing__versus-metric-value">٤٢٪</span>
                  <div className="landing__bar"><div className="landing__bar-fill landing__bar-fill--gray" style={{ width: '42%' }} /></div>
                </div>
                <div className="landing__versus-metric">
                  <span className="landing__versus-metric-label">نسبة شارب</span>
                  <span className="landing__versus-metric-value">٠.٣٢</span>
                  <div className="landing__bar"><div className="landing__bar-fill landing__bar-fill--gray" style={{ width: '16%' }} /></div>
                </div>
                <div className="landing__versus-metric">
                  <span className="landing__versus-metric-label">أقصى انخفاض</span>
                  <span className="landing__versus-metric-value">-١٨.٤٪</span>
                  <div className="landing__bar"><div className="landing__bar-fill landing__bar-fill--red" style={{ width: '72%' }} /></div>
                </div>
              </div>
            </div>
          </div>

          <p className="landing__backtest-disclaimer">
            * محاكاة افتراضية لأغراض توضيحية — لا تمثل نتائج فعلية أو ضمان أرباح مستقبلية
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="landing__pricing landing__reveal">
        <div className="landing__section-header">
          <h2 className="landing__section-title">اختار الباقة المناسبة لك</h2>
          <p className="landing__section-sub">ابدأ مجاناً وترقّ متى ما احتجت</p>
        </div>

        <div className="landing__pricing-grid">
          {/* Free */}
          <div className="landing__pricing-card">
            <div className="landing__pricing-card-header">
              <h3 className="landing__pricing-name">مجاني</h3>
              <div className="landing__pricing-price">
                ٠ <span className="landing__pricing-currency">ريال</span>
                <span className="landing__pricing-period">/ شهرياً</span>
              </div>
            </div>
            <ul className="landing__pricing-list">
              <li><Check size={16} strokeWidth={2.5} /> تحليل الأسهم</li>
              <li><Check size={16} strokeWidth={2.5} /> تقييم المخاطر</li>
              <li><Check size={16} strokeWidth={2.5} /> سيناريوهات مستقبلية</li>
              <li><Check size={16} strokeWidth={2.5} /> أخبار وتحليل مشاعر</li>
              <li><Check size={16} strokeWidth={2.5} /> قائمة مراقبة</li>
            </ul>
            <Link to={ctaTarget} className="landing__btn landing__btn--outline landing__btn--full">
              ابدأ مجاناً
            </Link>
          </div>

          {/* Premium */}
          <div className="landing__pricing-card landing__pricing-card--popular">
            <span className="landing__pricing-badge">شائع</span>
            <div className="landing__pricing-card-header">
              <h3 className="landing__pricing-name">بريميوم</h3>
              <div className="landing__pricing-price landing__pricing-price--accent">
                ٤٩ <span className="landing__pricing-currency">ريال</span>
                <span className="landing__pricing-period">/ شهرياً</span>
              </div>
            </div>
            <ul className="landing__pricing-list">
              <li><Check size={16} strokeWidth={2.5} /> تحليل الأسهم</li>
              <li><Check size={16} strokeWidth={2.5} /> تقييم المخاطر</li>
              <li><Check size={16} strokeWidth={2.5} /> سيناريوهات مستقبلية</li>
              <li><Check size={16} strokeWidth={2.5} /> أخبار وتحليل مشاعر</li>
              <li><Check size={16} strokeWidth={2.5} /> قائمة مراقبة</li>
              <li className="landing__pricing-list-highlight"><Check size={16} strokeWidth={2.5} /> تنبيهات بريد إلكتروني</li>
              <li className="landing__pricing-list-highlight"><Check size={16} strokeWidth={2.5} /> مساعد ذكي</li>
            </ul>
            <Link to={ctaTarget} className="landing__btn landing__btn--primary landing__btn--full">
              ابدأ الآن
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing__cta">
        <div className="landing__cta-inner">
          <h2 className="landing__cta-heading">
            جاهز تبدأ تحلل السوق السعودي بذكاء؟
          </h2>
          <p className="landing__cta-sub">
            انضم لمنصة نبيه واحصل على تحليلات ما تلقاها في أي مكان ثاني
          </p>
          <Link to={ctaTarget} className="landing__btn landing__btn--white landing__btn--lg">
            سجّل مجاناً
            <ArrowLeft size={18} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing__footer">
        <p className="landing__footer-text">نبيه - لا يُعتبر نصيحة استثمارية</p>
      </footer>
    </div>
  )
}
