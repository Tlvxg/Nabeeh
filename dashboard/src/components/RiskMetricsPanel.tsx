/**
 * RiskMetricsPanel — displays risk metrics in a clean, scannable Arabic layout.
 *
 * Simplified to 3 groups: VaR, Volatility (annual only), Drawdown (max % only).
 * GARCH, Beta, Sharpe/Sortino removed — too technical for beginner investors.
 */

import type { RiskMetrics } from '../types/stock.ts'
import { NabeehAILogo } from './NabeehAILogo.tsx'
import './RiskMetricsPanel.css'

interface Verdict { label: string; color: string; text: string }

/** Compute a dynamic VaR verdict from current metric values. */
function getVarVerdict(m: RiskMetrics): Verdict {
  const absVal = Math.abs(m.var.confidence_levels['95']?.historical ?? 0)
  const pct = absVal * 100
  const loss = Math.round(pct * 10)
  if (pct > 3) return {
    label: 'مخاطرة مرتفعة',
    color: 'var(--color-risk-high)',
    text: `الخسارة اليومية المتوقعة تصل إلى ${fmtPct(absVal)} — مستوى مرتفع. كل ١٬٠٠٠ ر.س مستثمرة قد تخسر حتى ${loss} ر.س في يوم سيء.`,
  }
  if (pct > 1.5) return {
    label: 'مخاطرة متوسطة',
    color: 'var(--color-risk-medium)',
    text: `الخسارة اليومية المتوقعة ${fmtPct(absVal)} — مستوى معتدل. كل ١٬٠٠٠ ر.س مستثمرة قد تخسر حتى ${loss} ر.س في يوم سيء.`,
  }
  return {
    label: 'مخاطرة منخفضة',
    color: 'var(--color-risk-low)',
    text: `الخسارة اليومية المتوقعة ${fmtPct(absVal)} فقط — مستوى منخفض. السهم يتميز بمخاطرة يومية محدودة.`,
  }
}

/** Compute a dynamic volatility verdict. */
function getVolVerdict(m: RiskMetrics): Verdict {
  const vol = m.volatility.vol_252d
  const pct = vol * 100
  if (pct > 25) return {
    label: 'تقلب مرتفع',
    color: 'var(--color-risk-high)',
    text: `التقلب السنوي ${fmtPct(vol)} — مرتفع. السهم يتذبذب بقوة ما يزيد فرص الربح والخسارة معاً.`,
  }
  if (pct > 15) return {
    label: 'تقلب متوسط',
    color: 'var(--color-risk-medium)',
    text: `التقلب السنوي ${fmtPct(vol)} — معتدل. السهم يتحرك ضمن نطاق مقبول مع بعض التذبذب.`,
  }
  return {
    label: 'تقلب منخفض',
    color: 'var(--color-risk-low)',
    text: `التقلب السنوي ${fmtPct(vol)} فقط — منخفض. السهم مستقر نسبياً مع تحركات سعرية محدودة.`,
  }
}

/** Compute a dynamic drawdown verdict. */
function getDrawdownVerdict(m: RiskMetrics): Verdict {
  const dd = Math.abs(m.drawdown.max_drawdown)
  const pct = dd * 100
  if (pct > 20) return {
    label: 'انخفاض حاد',
    color: 'var(--color-risk-high)',
    text: `أكبر انخفاض تاريخي ${fmtPct(dd)} — حاد. السهم شهد هبوطاً كبيراً من قمته مما يدل على مخاطر عالية.`,
  }
  if (pct > 10) return {
    label: 'انخفاض معتدل',
    color: 'var(--color-risk-medium)',
    text: `أكبر انخفاض تاريخي ${fmtPct(dd)} — معتدل. السهم تعرض لتصحيح متوسط وهو أمر طبيعي في الأسواق.`,
  }
  return {
    label: 'انخفاض محدود',
    color: 'var(--color-risk-low)',
    text: `أكبر انخفاض تاريخي ${fmtPct(dd)} فقط — محدود. السهم حافظ على استقراره النسبي تاريخياً.`,
  }
}

interface RiskMetricsPanelProps {
  metrics: RiskMetrics
  currentPrice?: number | null
  visibleMetrics?: Record<string, boolean>
  onAskAI?: (metricType: string) => void
}

/** Format a number in Arabic-SA locale with 2 decimals. */
function fmtNum(v: number): string {
  return v.toLocaleString('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Format a decimal as percentage (e.g. 0.16 -> "١٦٫٠٠٪"). */
function fmtPct(v: number): string {
  return (v * 100).toLocaleString('ar-SA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + '%'
}

/** Clamp a number between min and max. */
function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** Get VaR severity bar percentage and CSS variable name.
 * VaR values are decimals (e.g. 0.02 = 2%). Map abs value [0, 0.05] to [0%, 100%]. */
function varSeverity(absVal: number): { pct: number; colorVar: string } {
  const pct = clamp((absVal / 0.05) * 100, 0, 100)
  const pctVal = absVal * 100 // convert to percentage points for threshold
  const colorVar = pctVal > 3 ? '--color-risk-high' : pctVal > 1.5 ? '--color-risk-medium' : '--color-risk-low'
  return { pct, colorVar }
}

/** Get Volatility severity bar percentage and CSS variable name.
 * Vol values are decimals (e.g. 0.15 = 15%). Map [0.05, 0.40] to [0%, 100%]. */
function volSeverity(val: number): { pct: number; colorVar: string } {
  const pct = clamp(((val - 0.05) / 0.35) * 100, 0, 100)
  const pctVal = val * 100
  const colorVar = pctVal > 25 ? '--color-risk-high' : pctVal > 15 ? '--color-risk-medium' : '--color-risk-low'
  return { pct, colorVar }
}

/** Severity bar component. */
function SeverityBar({ pct, colorVar }: { pct: number; colorVar: string }) {
  return (
    <div className="rmp__bar-track">
      <div className="rmp__bar-fill" style={{ width: `${pct}%`, background: `var(${colorVar})` }} />
    </div>
  )
}

export function RiskMetricsPanel({ metrics, currentPrice, visibleMetrics, onAskAI }: RiskMetricsPanelProps) {
  const showVar = visibleMetrics?.var ?? true
  const showVol = visibleMetrics?.volatility ?? true
  const showDd = visibleMetrics?.drawdown ?? true

  const var95 = metrics.var.confidence_levels['95']

  // Compute 3 VaR timeframes from Historical 95%
  const hist95 = Math.abs(var95?.historical ?? 0)
  const var1d = hist95
  const var7d = hist95 * Math.sqrt(7)
  const var30d = hist95 * Math.sqrt(30)

  // SAR amounts (if currentPrice available)
  const sar1d = currentPrice ? currentPrice * var1d : null
  const sar7d = currentPrice ? currentPrice * var7d : null
  const sar30d = currentPrice ? currentPrice * var30d : null

  const varRows = [
    { label: 'يوم واحد', pct: var1d, sar: sar1d },
    { label: '٧ أيام', pct: var7d, sar: sar7d },
    { label: '٣٠ يوم', pct: var30d, sar: sar30d },
  ] as const

  const varV = getVarVerdict(metrics)
  const volV = getVolVerdict(metrics)
  const ddV = getDrawdownVerdict(metrics)

  return (
    <div className="rmp">
      {/* Empty state when all metrics toggled off */}
      {!showVar && !showVol && !showDd && (
        <div className="rmp__empty">لم يتم اختيار أي مقياس مخاطرة — فعّل مقياساً من الأعلى</div>
      )}

      {/* VaR Section */}
      {showVar && (
      <div className="rmp__group">
        <h3 className="rmp__group-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          القيمة المعرضة للخطر (VaR)
          {onAskAI && (
            <button className="rmp__ask-ai" onClick={() => onAskAI('var')} title="اسأل نبيه">
              <NabeehAILogo size={14} />
            </button>
          )}
          <span className="rmp__verdict" style={{ color: varV.color, borderColor: varV.color }}>{varV.label}</span>
        </h3>
        <p className="rmp__explain">{varV.text}</p>
        <div className="rmp__var-rows">
          {varRows.map(row => {
            const sev = varSeverity(row.pct)
            return (
              <div className="rmp__var-row" key={row.label}>
                <span className="rmp__var-label">{row.label}</span>
                <div className="rmp__var-values">
                  {row.sar != null && (
                    <span className="rmp__var-sar" style={{ color: `var(${sev.colorVar})` }}>
                      -{fmtNum(row.sar)} ر.س
                    </span>
                  )}
                  <span className="rmp__var-pct">({fmtPct(row.pct)})</span>
                </div>
                <SeverityBar pct={sev.pct} colorVar={sev.colorVar} />
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* Volatility Section — single annual value */}
      {showVol && (
      <div className="rmp__group">
        <h3 className="rmp__group-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          التقلب
          {onAskAI && (
            <button className="rmp__ask-ai" onClick={() => onAskAI('volatility')} title="اسأل نبيه">
              <NabeehAILogo size={14} />
            </button>
          )}
          <span className="rmp__verdict" style={{ color: volV.color, borderColor: volV.color }}>{volV.label}</span>
        </h3>
        <p className="rmp__explain">{volV.text}</p>
        <div className="rmp__single-metric">
          <span className="rmp__single-label">التقلب السنوي</span>
          <span className="rmp__single-value">{fmtPct(metrics.volatility.vol_252d)}</span>
          <SeverityBar pct={volSeverity(metrics.volatility.vol_252d).pct} colorVar={volSeverity(metrics.volatility.vol_252d).colorVar} />
        </div>
      </div>
      )}

      {/* Drawdown Section — max % only */}
      {showDd && (
      <div className="rmp__group">
        <h3 className="rmp__group-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          السحب الأقصى
          {onAskAI && (
            <button className="rmp__ask-ai" onClick={() => onAskAI('drawdown')} title="اسأل نبيه">
              <NabeehAILogo size={14} />
            </button>
          )}
          <span className="rmp__verdict" style={{ color: ddV.color, borderColor: ddV.color }}>{ddV.label}</span>
        </h3>
        <p className="rmp__explain">{ddV.text}</p>
        <div className="rmp__single-metric">
          <span className="rmp__single-label">أقصى انخفاض من القمة</span>
          <span className="rmp__single-value rmp__single-value--risk">{fmtPct(Math.abs(metrics.drawdown.max_drawdown))}</span>
        </div>
      </div>
      )}
    </div>
  )
}
