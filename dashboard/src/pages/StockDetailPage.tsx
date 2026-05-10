import { useState, useCallback, useMemo, useEffect } from 'react'
import { useParams, Link } from 'react-router'
import { useUserProfile } from '../hooks/useUserProfile.ts'
import { useWatchlist } from '../hooks/useWatchlist.ts'
import { UpgradePrompt } from '../components/UpgradePrompt.tsx'
import { useStockPrice } from '../hooks/useStockPrice.ts'
import { useStockHistory } from '../hooks/useStockHistory.ts'
import { useStockStats } from '../hooks/useStockStats.ts'
import { useNewsWithSentiment } from '../hooks/useNewsWithSentiment.ts'
import { useSentimentSummary } from '../hooks/useSentimentSummary.ts'
import { useRiskMetrics } from '../hooks/useRiskMetrics.ts'
import { useServerMonteCarlo } from '../hooks/useServerMonteCarlo.ts'
import { useMonteCarloSimulation } from '../hooks/useMonteCarloSimulation.ts'
import { useRiskScore } from '../hooks/useRiskScore.ts'
import { useAnalysisPrefs } from '../hooks/useAnalysisPrefs.ts'
import { CandlestickChart } from '../components/CandlestickChart.tsx'
import { IndicatorPanel } from '../components/IndicatorPanel.tsx'
import { IndicatorCustomizer } from '../components/IndicatorCustomizer.tsx'
import { IndicatorPeriodSelector } from '../components/IndicatorPeriodSelector.tsx'
import { RiskCustomizer } from '../components/RiskCustomizer.tsx'
import { SentimentBar } from '../components/SentimentBar.tsx'
import { SentimentTrendChart } from '../components/SentimentTrendChart.tsx'
import { NewsCard } from '../components/NewsCard.tsx'
import { RiskMetricsPanel } from '../components/RiskMetricsPanel.tsx'
import { MonteCarloChart } from '../components/MonteCarloChart.tsx'
import { MCHorizonSelector } from '../components/MCHorizonSelector.tsx'
import { RiskScoreGauge } from '../components/RiskScoreGauge.tsx'
import { RiskBreakdown } from '../components/RiskBreakdown.tsx'
import { NabeehNotes } from '../components/NabeehNotes.tsx'
import { CompanyInfoCard } from '../components/CompanyInfoCard.tsx'
import { StockLogo } from '../components/StockLogo.tsx'
import { ChatWidget } from '../components/ChatWidget.tsx'
import type { MentionedSection } from '../components/ChatWidget.tsx'
import { NabeehAILogo } from '../components/NabeehAILogo.tsx'
import { INDICATOR_REGISTRY, type IndicatorCategory } from '../config/indicatorRegistry.ts'
import { SignalSummaryCard } from '../components/SignalSummaryCard.tsx'
import type { MonteCarloResult } from '../types/stock.ts'
import { generateCriticalFactors, generateAIAnalysis } from '../utils/riskScore.ts'
import './StockDetailPage.css'

const TABS = [
  { id: 'info', label: 'معلومات' },
  { id: 'news', label: 'أخبار' },
  { id: 'indicators', label: 'المؤشرات' },
  { id: 'risk', label: 'المخاطر' },
  { id: 'score', label: 'التقييم' },
] as const

type TabId = typeof TABS[number]['id']

/** Section title mapping for the mention badge in chat. */
const SECTION_TITLES: Record<string, string> = {
  chart: 'الرسم البياني',
  stats: 'معلومات السهم',
  news: 'خبر',
  rsi: 'مؤشر RSI',
  macd: 'مؤشر MACD',
  bollinger: 'نطاقات بولنجر',
  var: 'القيمة المعرضة للخطر',
  volatility: 'التقلب',
  drawdown: 'السحب الأقصى',
  score: 'تقييم المخاطر',
  montecarlo: 'محاكاة مونت كارلو',
}

/** Default contexts for sections that use the section-level AskAI button. */
const SECTION_CONTEXTS: Record<string, string> = {
  chart: 'المستخدم يشاهد الرسم البياني للشموع اليابانية ويريد فهم حركة السعر',
  stats: 'المستخدم يشاهد إحصائيات السهم (أعلى/أقل سعر، الإغلاق السابق، نطاق ٥٢ أسبوع، التقلب السنوي)',
  score: 'المستخدم يشاهد مقياس تقييم المخاطر الشامل (المؤشر والعوامل الحرجة والتحليل) ويريد فهم الدرجة',
  montecarlo: 'المستخدم يشاهد نتائج محاكاة مونت كارلو للتنبؤ بالأسعار المستقبلية ويريد فهم السيناريوهات',
}

/** Format a number with Arabic-SA locale. */
function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '\u063A\u064A\u0631 \u0645\u062A\u0627\u062D'
  return n.toLocaleString('ar-SA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Format volume with Arabic-SA locale (no decimals). */
function fmtVol(n: number | null | undefined): string {
  if (n == null) return '\u063A\u064A\u0631 \u0645\u062A\u0627\u062D'
  return n.toLocaleString('ar-SA', { maximumFractionDigits: 0 })
}

/** Format percentage with sign prefix. */
function fmtPct(n: number | null | undefined): string {
  if (n == null) return '\u063A\u064A\u0631 \u0645\u062A\u0627\u062D'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/** Format last-updated timestamp in Arabic locale. */
function fmtTimestamp(): string {
  return new Date().toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Inline "Ask AI" icon button using the Nabeeh AI logo (lighthouse + chat). */
function AskAIButton({ onClick, size = 16, className = 'sd__ask-ai' }: { onClick: (e: React.MouseEvent) => void; size?: number; className?: string }) {
  return (
    <button className={className} onClick={onClick} title="اسأل نبيه">
      <NabeehAILogo size={size} />
    </button>
  )
}

export function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>()
  const [period, setPeriod] = useState('2w')
  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [visibleNewsCount, setVisibleNewsCount] = useState(6)

  // Subscription + watchlist state
  const { isPremium, isPremiumKnown } = useUserProfile()
  const { isInWatchlist, toggleStock } = useWatchlist()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const isWatched = symbol ? isInWatchlist(symbol) : false

  // Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [mentionedSection, setMentionedSection] = useState<MentionedSection | null>(null)
  const [showChatUpgrade, setShowChatUpgrade] = useState(false)

  const handleAskAI = useCallback((sectionId: string, context?: string) => {
    // Don't gate while the profile is still resolving — prevents flash of
    // upgrade modal to premium users during the initial ~500ms fetch.
    if (!isPremiumKnown) return
    if (!isPremium) {
      setShowChatUpgrade(true)
      return
    }
    setMentionedSection({
      id: sectionId,
      title: SECTION_TITLES[sectionId] || sectionId,
      context: context || SECTION_CONTEXTS[sectionId] || '',
    })
    setChatOpen(true)
  }, [isPremium, isPremiumKnown])

  const handleCloseChat = useCallback(() => {
    setChatOpen(false)
  }, [])

  const handleWatchlistClick = useCallback(() => {
    // Don't gate while the profile is still resolving — same reasoning as handleAskAI.
    if (!isPremiumKnown) return
    if (!isPremium) {
      setShowUpgradeModal(true)
    } else if (symbol) {
      toggleStock(symbol)
    }
  }, [isPremium, isPremiumKnown, symbol, toggleStock])

  // Map UI period to valid API period (backend accepts: 1mo, 3mo, 6mo, 1y, 2y, 5y, max)
  const apiPeriod = period === '1w' || period === '2w' ? '1mo' : period

  const { data: price, isLoading: priceLoading, error: priceError } = useStockPrice(symbol ?? '')
  const { data: history, isLoading: historyLoading, error: historyError } = useStockHistory(symbol ?? '', apiPeriod)
  // Full year history for indicators (always 252 days regardless of price chart period)
  const { data: fullHistory } = useStockHistory(symbol ?? '', '1y')
  const { data: stats, isLoading: statsLoading } = useStockStats(symbol ?? '')
  const { data: news, isLoading: newsLoading, error: newsError } = useNewsWithSentiment(symbol ?? '', 50)
  const { data: sentiment, isLoading: sentimentLoading } = useSentimentSummary(symbol ?? '')
  const { data: riskData, isLoading: riskLoading, error: riskError } = useRiskMetrics(symbol ?? '')
  const { data: serverMcData, isLoading: serverMcLoading, error: mcError } = useServerMonteCarlo(symbol ?? '')
  const { result: workerMcResult, isRunning: mcSimulating, run: runMcSim } = useMonteCarloSimulation()
  const { score: riskScore, level: riskLevel, label_ar: riskLabel, components: riskComponents, isLoading: scoreLoading, error: scoreError } = useRiskScore(symbol ?? '')

  // Analysis preferences (indicator visibility)
  const { prefs, updatePrefs } = useAnalysisPrefs()

  function handleIndicatorToggle(ind: string) {
    updatePrefs({
      indicators: { ...prefs.indicators, [ind]: !prefs.indicators[ind] }
    })
  }

  function handleRiskToggle(metric: string) {
    updatePrefs({
      risk: { ...prefs.risk, [metric]: !prefs.risk[metric] }
    })
  }

  function handleIndicatorPeriod(period: '1d' | '3d' | '7d' | '30d' | '90d' | '252d') {
    updatePrefs({ indicatorPeriod: period })
  }

  // MC horizon constants and handler
  const MC_HORIZON_DAYS: Record<string, number> = { '90d': 90, '252d': 252 }

  // Compute mu/sigma from price history as fallback when stats not loaded
  const mcParams = useMemo(() => {
    if (stats) return { mu: stats.daily_return_mean, sigma: stats.daily_return_std }
    // Fallback: calculate from fullHistory price data
    if (fullHistory?.data && fullHistory.data.length > 30) {
      const closes = fullHistory.data.map(d => d.close)
      const returns: number[] = []
      for (let i = 1; i < closes.length; i++) {
        returns.push(Math.log(closes[i] / closes[i - 1]))
      }
      const mu = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((a, r) => a + (r - mu) ** 2, 0) / (returns.length - 1)
      return { mu, sigma: Math.sqrt(variance) }
    }
    return null
  }, [stats, fullHistory?.data])

  function handleMcHorizon(horizon: '90d' | '252d') {
    updatePrefs({ mcHorizon: horizon })
    // Worker simulation is triggered by useEffect below when horizon/price/params change.
    // No direct runMcSim call here — avoids double-fire with the useEffect.
  }

  // Compute active MC data: server for 252d, worker for 90d
  // NEVER fall back to server data for 90d — show loading instead
  const activeMcData = useMemo((): MonteCarloResult | undefined => {
    if (prefs.mcHorizon === '252d') return serverMcData
    if (!workerMcResult) return undefined // show loading, NOT stale 252d data
    return {
      symbol: symbol ?? '',
      percentiles: workerMcResult.percentiles,
      mc_var_95: workerMcResult.mc_var_95,
      mc_var_99: workerMcResult.mc_var_99,
      mc_cvar_95: workerMcResult.mc_cvar_95,
      days: MC_HORIZON_DAYS[prefs.mcHorizon],
      paths: 10000,
      elapsed_ms: workerMcResult.elapsed_ms,
      annual_volatility: mcParams ? mcParams.sigma * Math.sqrt(252) : undefined,
    } as MonteCarloResult
  }, [prefs.mcHorizon, serverMcData, workerMcResult, symbol, mcParams])

  // Trigger worker simulation when score tab is active with 90d horizon
  // (252d uses server data)
  // price?.price must be a dependency — data loads async, effect must re-fire when price arrives
  useEffect(() => {
    if (activeTab === 'score' && prefs.mcHorizon === '90d' && price?.price && mcParams) {
      runMcSim({
        price: price.price,
        mu: mcParams.mu,
        sigma: mcParams.sigma,
        days: MC_HORIZON_DAYS[prefs.mcHorizon],
        paths: 10000,
      })
    }
  }, [activeTab, prefs.mcHorizon, mcParams, price?.price, runMcSim])

  // MC loading state: server loading for 252d, worker simulating for 90d
  const mcLoading = prefs.mcHorizon === '252d'
    ? serverMcLoading
    : (mcSimulating && !workerMcResult)

  // Convert indicator period to display days for chart zoom
  const PERIOD_DAYS: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7, '30d': 30, '90d': 90, '252d': 252 }
  const indicatorViewDays = PERIOD_DAYS[prefs.indicatorPeriod] ?? 252

  const stockName = price?.name_ar ?? '...'

  // ---------------------------------------------------------------------
  // Determine change color class
  const changeClass =
    price && price.change_percent > 0
      ? 'sd__hero-num-val--pos'
      : price && price.change_percent < 0
        ? 'sd__hero-num-val--neg'
        : ''

  // Dynamic price change verdict
  const changeVerdict = (() => {
    if (!price) return null
    const pct = price.change_percent
    if (pct > 2) return { label: 'ارتفاع قوي', color: 'var(--color-positive)' }
    if (pct > 0) return { label: 'ارتفاع طفيف', color: 'var(--color-positive)' }
    if (pct < -2) return { label: 'انخفاض حاد', color: 'var(--color-negative)' }
    if (pct < 0) return { label: 'انخفاض طفيف', color: 'var(--color-negative)' }
    return { label: 'لا تغيير', color: 'var(--color-text-muted)' }
  })()

  return (
    <div className="sd">
      {/* Breadcrumb */}
      <nav className="sd__crumb animate-in animate-in-1">
        <Link to="/dashboard" className="sd__crumb-link">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          لوحة التحكم
        </Link>
        <svg className="sd__crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span className="sd__crumb-current">{stockName}</span>
      </nav>

      {/* Hero */}
      <div className="sd__hero animate-in animate-in-2">
        <div className="sd__hero-start">
          <StockLogo symbol={symbol ?? ''} size={44} />
          <div>
            <h1 className="sd__hero-name">{stockName}</h1>
            <span className="sd__hero-sym">{symbol}.SR</span>
          </div>
          <div className="sd__watchlist-wrap">
            <button
              className={`sd__watchlist-btn${isWatched ? ' sd__watchlist-btn--active' : ''}`}
              onClick={handleWatchlistClick}
            >
              {isWatched ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              )}
              {isWatched ? 'في المتابعة' : 'إضافة للمتابعة'}
            </button>
          </div>
        </div>
        <div className="sd__hero-nums">
          <div className="sd__hero-num">
            <span className="sd__hero-num-lbl">السعر الحالي</span>
            <span className="sd__hero-num-val sd__hero-num-val--big">
              {priceLoading ? '...' : priceError ? 'غير متاح' : `${fmtNum(price?.price)} ر.س`}
            </span>
          </div>
          <span className="sd__hero-div" />
          <div className="sd__hero-num">
            <span className="sd__hero-num-lbl">التغير اليومي</span>
            <span className={`sd__hero-num-val ${changeClass}`}>
              {priceLoading ? '...' : priceError ? 'غير متاح' : fmtPct(price?.change_percent)}
            </span>
            {changeVerdict && !priceLoading && !priceError && (
              <span className="sd__hero-verdict" style={{ color: changeVerdict.color, borderColor: changeVerdict.color }}>
                {changeVerdict.label}
              </span>
            )}
          </div>
          <span className="sd__hero-div" />
          <div className="sd__hero-num">
            <span className="sd__hero-num-lbl">حجم التداول</span>
            <span className="sd__hero-num-val">
              {priceLoading ? '...' : priceError ? 'غير متاح' : fmtVol(price?.volume)}
            </span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <nav className="sd__tab-bar animate-in animate-in-3" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`sd__tab ${activeTab === tab.id ? 'sd__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab panels */}
      <div className="sd__tab-content">

        {activeTab === 'info' && (
          <div className="sd__tab-panel animate-in animate-in-1" role="tabpanel">
            {/* Company info section */}
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">عن الشركة</h2>
              </div>
              <div className="sd__panel">
                <CompanyInfoCard price={price} loading={priceLoading} />
              </div>
            </section>

            {/* Chart section */}
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">الرسم البياني</h2>
                <AskAIButton onClick={() => handleAskAI('chart')} />
              </div>
              <div className="sd__panel">
                {historyError ? (
                  <div className="sd__chart-box">
                    <div className="sd__chart-msg">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3v18h18" />
                        <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                      </svg>
                      <span>حدث خطأ في تحميل البيانات</span>
                    </div>
                  </div>
                ) : historyLoading || !history ? (
                  <div className="sd__chart-box">
                    <div className="sd__chart-shimmer" />
                    <div className="sd__chart-msg">
                      <span>جاري تحميل الرسم البياني...</span>
                    </div>
                  </div>
                ) : (
                  <CandlestickChart
                    data={history.data}
                    period={period}
                    onPeriodChange={setPeriod}
                  />
                )}
              </div>
            </section>

            {/* Stats section */}
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">معلومات السهم</h2>
                <AskAIButton onClick={() => handleAskAI('stats')} />
              </div>
              <div className="sd__panel">
                <div className="sd__stats">
                  <div className="sd__stat">
                    <span className="sd__stat-lbl">أعلى سعر</span>
                    <span className="sd__stat-val">
                      {priceLoading ? '...' : fmtNum(price?.day_high)}
                    </span>
                  </div>
                  <div className="sd__stat">
                    <span className="sd__stat-lbl">أقل سعر</span>
                    <span className="sd__stat-val">
                      {priceLoading ? '...' : fmtNum(price?.day_low)}
                    </span>
                  </div>
                  <div className="sd__stat">
                    <span className="sd__stat-lbl">الإغلاق السابق</span>
                    <span className="sd__stat-val">
                      {priceLoading ? '...' : fmtNum(price?.prev_close)}
                    </span>
                  </div>
                  <div className="sd__stat sd__stat--highlight">
                    <span className="sd__stat-lbl">أعلى ٥٢ أسبوع</span>
                    <span className="sd__stat-val">
                      {priceLoading ? '...' : fmtNum(price?.week_52_high)}
                    </span>
                  </div>
                  <div className="sd__stat sd__stat--highlight">
                    <span className="sd__stat-lbl">أقل ٥٢ أسبوع</span>
                    <span className="sd__stat-val">
                      {priceLoading ? '...' : fmtNum(price?.week_52_low)}
                    </span>
                  </div>
                  <div className="sd__stat sd__stat--highlight">
                    <span className="sd__stat-lbl">التقلب السنوي</span>
                    <span className="sd__stat-val">
                      {statsLoading
                        ? '...'
                        : stats
                          ? `${fmtNum(stats.annual_volatility * 100)}%`
                          : 'غير متاح'}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'news' && (
          <div className="sd__tab-panel animate-in animate-in-1" role="tabpanel">
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">الأخبار والمشاعر</h2>
              </div>
              <div className="sd__panel">
                {/* Sentiment aggregate bar */}
                {sentimentLoading ? (
                  <div className="sd__news-shimmer" />
                ) : sentiment && sentiment.total_articles > 0 ? (
                  <SentimentBar data={sentiment} />
                ) : null}

                {/* Sentiment trend chart */}
                {news && news.length > 0 && (
                  <SentimentTrendChart articles={news} />
                )}

                {/* News articles list */}
                {newsLoading ? (
                  <div className="sd__news-list">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="sd__news-shimmer-card" />
                    ))}
                  </div>
                ) : newsError ? (
                  <div className="sd__empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>حدث خطأ في تحميل البيانات. يرجى المحاولة مرة أخرى.</span>
                  </div>
                ) : news && news.length > 0 ? (
                  <div className="sd__news-list">
                    {news.slice(0, visibleNewsCount).map((article) => (
                      <NewsCard
                        key={article.id}
                        article={article}
                        onAskAI={() => handleAskAI('news', `المستخدم يسأل عن خبر: "${article.headline_ar}" — المشاعر: ${article.sentiment ?? 'غير محلل'}`)}
                      />
                    ))}
                    {visibleNewsCount < news.length && (
                      <button
                        className="sd__show-more"
                        onClick={() => setVisibleNewsCount((c) => c + 6)}
                      >
                        <span>عرض المزيد</span>
                        <span className="sd__show-more-count">
                          {`${Math.min(visibleNewsCount, news.length)} من ${news.length}`}
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="sd__empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                      <path d="M18 14h-8" />
                      <path d="M15 18h-5" />
                      <path d="M10 6h8v4h-8V6Z" />
                    </svg>
                    <span>لا توجد أخبار حالياً</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'indicators' && (
          <div className="sd__tab-panel animate-in animate-in-1" role="tabpanel">
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">المؤشرات الفنية</h2>
              </div>

              {/* Indicator toggle chips */}
              <IndicatorCustomizer prefs={prefs} onToggle={handleIndicatorToggle} />

              {/* Period selector */}
              <IndicatorPeriodSelector
                selected={prefs.indicatorPeriod}
                onSelect={handleIndicatorPeriod}
              />

              <div className="sd__panel">
                {historyLoading || !history ? (
                  <div className="sd__chart-box">
                    <div className="sd__chart-shimmer" />
                    <div className="sd__chart-msg">
                      <span>جاري تحميل المؤشرات...</span>
                    </div>
                  </div>
                ) : historyError ? (
                  <div className="sd__empty">
                    <span>حدث خطأ في تحميل البيانات</span>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const activeKeys = INDICATOR_REGISTRY
                        .filter(ind => prefs.indicators[ind.key])
                        .map(ind => ind.key)

                      const CATEGORY_ORDER: IndicatorCategory[] = ['momentum', 'trend', 'volatility', 'volume']

                      return (
                        <>
                          {activeKeys.length > 0 && fullHistory?.data && (
                            <SignalSummaryCard
                              data={fullHistory.data}
                              activeKeys={activeKeys}
                              windowDays={indicatorViewDays}
                              period={prefs.indicatorPeriod}
                            />
                          )}

                          {activeKeys.length > 0 && fullHistory?.data ? (
                            CATEGORY_ORDER.map(cat => {
                              const catIndicators = INDICATOR_REGISTRY.filter(
                                ind => ind.category === cat && prefs.indicators[ind.key]
                              )
                              if (catIndicators.length === 0) return null
                              const catLabel = catIndicators[0].categoryArabicLabel
                              return (
                                <details key={cat} className="sd__indicator-group">
                                  <summary className="sd__indicator-group-title">
                                    {catLabel}
                                    <span className="sd__indicator-group-badge">
                                      {catIndicators.length.toLocaleString('ar-SA')}
                                    </span>
                                  </summary>
                                  <div className="sd__indicator-group-content">
                                    {catIndicators.map(ind => (
                                      <IndicatorPanel
                                        key={ind.key}
                                        type={ind.key}
                                        data={fullHistory.data!}
                                        viewDays={indicatorViewDays}
                                        onAskAI={() => handleAskAI(ind.key, `المستخدم يسأل عن ${ind.arabicLabel}`)}
                                      />
                                    ))}
                                  </div>
                                </details>
                              )
                            })
                          ) : (
                            <div className="sd__empty">
                              <span>لم يتم اختيار أي مؤشر — فعّل مؤشراً من الأعلى</span>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="sd__tab-panel animate-in animate-in-1" role="tabpanel">
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">تحليل المخاطر</h2>
              </div>
              <div className="sd__panel">
                <RiskCustomizer prefs={prefs} onToggle={handleRiskToggle} />
                {riskError ? (
                  <div className="sd__empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>حدث خطأ في تحميل تحليل المخاطر</span>
                  </div>
                ) : riskLoading || !riskData ? (
                  <div className="sd__risk-skeleton">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="sd__risk-skeleton-item" />
                    ))}
                  </div>
                ) : (
                  <>
                    <RiskMetricsPanel
                      metrics={riskData}
                      currentPrice={price?.price}
                      visibleMetrics={prefs.risk}
                      onAskAI={(metricType) => {
                        const contexts: Record<string, string> = {
                          var: 'المستخدم يسأل عن القيمة المعرضة للخطر VaR وماذا تعني',
                          volatility: 'المستخدم يسأل عن التقلب وماذا يعني',
                          drawdown: 'المستخدم يسأل عن السحب الأقصى وماذا يعني',
                        }
                        handleAskAI(metricType, contexts[metricType] || '')
                      }}
                    />
                    <span className="sd__updated">{`آخر تحديث: ${fmtTimestamp()}`}</span>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'score' && (
          <div className="sd__tab-panel animate-in animate-in-1" role="tabpanel">
            {/* Risk Score section */}
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">تقييم المخاطر</h2>
                <AskAIButton onClick={() => handleAskAI('score')} />
              </div>
              <div className="sd__panel">
                {scoreError ? (
                  <div className="sd__empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>حدث خطأ في تحميل تقييم المخاطر</span>
                  </div>
                ) : scoreLoading || riskScore == null || !riskLevel || !riskLabel || !riskComponents ? (
                  <div className="sd__score-skeleton">
                    <div className="sd__score-skeleton-gauge" />
                    <div className="sd__score-skeleton-bars">
                      <div className="sd__score-skeleton-bar" />
                      <div className="sd__score-skeleton-bar" />
                      <div className="sd__score-skeleton-bar" />
                    </div>
                  </div>
                ) : (() => {
                  const criticalFactors = generateCriticalFactors(riskComponents)
                  const aiAnalysis = generateAIAnalysis(riskScore, riskLevel, riskComponents, stockName)
                  return (
                    <>
                      <div className="sd__score-live">
                        <RiskScoreGauge score={riskScore} level={riskLevel} label_ar={riskLabel} />

                        {/* Critical Factors */}
                        {criticalFactors.length > 0 && (
                          <div className="sd__critical">
                            <h3 className="sd__critical-title">عوامل المخاطرة الرئيسية</h3>
                            <ul className="sd__critical-list">
                              {criticalFactors.map((f, i) => (
                                <li key={i} className="sd__critical-item">{f}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* AI Analysis */}
                        {aiAnalysis && (
                          <div className="sd__analysis">
                            <h3 className="sd__analysis-title">التحليل الشامل</h3>
                            <p className="sd__analysis-text">{aiAnalysis.text}</p>
                            {(aiAnalysis.strengths.length > 0 || aiAnalysis.weaknesses.length > 0) && (
                              <div className="sd__tags">
                                {aiAnalysis.strengths.map((s, i) => (
                                  <span key={`s-${i}`} className="sd__tag sd__tag--pos">{s}</span>
                                ))}
                                {aiAnalysis.weaknesses.map((w, i) => (
                                  <span key={`w-${i}`} className="sd__tag sd__tag--neg">{w}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <RiskBreakdown components={riskComponents} />
                      </div>
                      <span className="sd__updated">{`آخر تحديث: ${fmtTimestamp()}`}</span>
                    </>
                  )
                })()}
              </div>
            </section>

            {/* NabeehNotes — automatic delta comparison from Supabase, no button, no LLM */}
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">ملاحظات نبيه</h2>
              </div>
              <div className="sd__panel">
                <NabeehNotes
                  symbol={symbol ?? '2222'}
                  stockName={stockName}
                  sentimentNegPct={sentiment?.negative_pct ?? 0}
                  currentPrice={price?.price ?? null}
                />
              </div>
            </section>

            {/* Monte Carlo section */}
            <section className="sd__sec">
              <div className="sd__sec-header">
                <h2 className="sd__sec-title">محاكاة مونت كارلو</h2>
                <AskAIButton onClick={() => handleAskAI('montecarlo')} />
              </div>

              {/* Horizon selector */}
              <MCHorizonSelector
                selected={prefs.mcHorizon}
                onSelect={handleMcHorizon}
                isSimulating={mcSimulating}
              />

              <div className="sd__panel">
                {mcError && prefs.mcHorizon === '252d' ? (
                  <div className="sd__empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    <span>حدث خطأ في تحميل محاكاة مونت كارلو</span>
                  </div>
                ) : mcLoading || !activeMcData ? (
                  <div className="sd__chart-box">
                    <div className="sd__chart-shimmer" />
                    <div className="sd__chart-msg">
                      <span>جاري تشغيل محاكاة مونت كارلو...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <MonteCarloChart result={activeMcData} currentPrice={price?.price} stockName={stockName} days={MC_HORIZON_DAYS[prefs.mcHorizon]} />
                    <span className="sd__updated">{`آخر تحديث: ${fmtTimestamp()}`}</span>
                  </>
                )}
              </div>
            </section>
          </div>
        )}

      </div>

      {/* AI Chat Panel — premium only */}
      {isPremium && (
        <ChatWidget
          isOpen={chatOpen}
          onClose={handleCloseChat}
          symbol={symbol ?? '2222'}
          mentionedSection={mentionedSection}
        />
      )}

      {/* Upgrade modal for watchlist */}
      {showUpgradeModal && (
        <UpgradePrompt
          variant="inline"
          feature="قائمة المتابعة"
          description="تابع أسهمك المفضلة واحصل على تنبيهات فورية عند تغير مستوى المخاطر"
          onClose={() => setShowUpgradeModal(false)}
        />
      )}

      {/* Upgrade modal for AI chatbot */}
      {showChatUpgrade && (
        <UpgradePrompt
          variant="inline"
          feature="المساعد الذكي"
          description="احصل على تحليل مخاطر مدعوم بالذكاء الاصطناعي لكل سهم"
          onClose={() => setShowChatUpgrade(false)}
        />
      )}
    </div>
  )
}
