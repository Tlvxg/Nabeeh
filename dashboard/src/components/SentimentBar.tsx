/**
 * SentimentBar — horizontal stacked bar showing positive/neutral/negative proportions.
 * Uses SentimentSummary data and design token colors.
 */

import type { SentimentSummary } from '../types/stock.ts'
import './SentimentBar.css'

interface SentimentBarProps {
  data: SentimentSummary
}

/** Compute a dynamic sentiment verdict from the summary. */
function getSentimentVerdict(data: SentimentSummary): { label: string; color: string; text: string } {
  const { positive_pct, negative_pct, total_articles } = data
  if (total_articles === 0) return { label: '', color: '', text: '' }

  if (positive_pct >= 60) return {
    label: 'مشاعر إيجابية',
    color: 'var(--color-positive)',
    text: `غالبية الأخبار (${positive_pct.toLocaleString('ar-SA', { maximumFractionDigits: 0 })}٪) إيجابية — الرأي العام متفائل تجاه السهم. هذا عامل إيجابي يقلل من درجة المخاطرة.`,
  }
  if (negative_pct >= 40) return {
    label: 'مشاعر سلبية',
    color: 'var(--color-negative)',
    text: `نسبة كبيرة من الأخبار (${negative_pct.toLocaleString('ar-SA', { maximumFractionDigits: 0 })}٪) سلبية — الرأي العام متشائم حالياً. هذا عامل خطر يرفع درجة المخاطرة.`,
  }
  return {
    label: 'مشاعر متباينة',
    color: 'var(--color-text-muted)',
    text: 'الأخبار متوزعة بين إيجابية وسلبية — لا اتجاه واضح في مشاعر السوق. تأثير محدود على درجة المخاطرة.',
  }
}

export function SentimentBar({ data }: SentimentBarProps) {
  const { total_articles, positive_pct, neutral_pct, negative_pct } = data
  const verdict = getSentimentVerdict(data)

  return (
    <div className="sentbar">
      <div className="sentbar__header">
        <div className="sentbar__title-area">
          <span className="sentbar__title">تحليل المشاعر</span>

        </div>
        <div className="sentbar__header-end">
          {verdict.label && (
            <span className="sentbar__verdict" style={{ color: verdict.color, borderColor: verdict.color }}>{verdict.label}</span>
          )}
          <span className="sentbar__count">
            {total_articles.toLocaleString('ar-SA')} مقال
          </span>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="sentbar__track">
        {positive_pct > 0 && (
          <div
            className="sentbar__seg sentbar__seg--positive"
            style={{ width: `${positive_pct}%` }}
          />
        )}
        {neutral_pct > 0 && (
          <div
            className="sentbar__seg sentbar__seg--neutral"
            style={{ width: `${neutral_pct}%` }}
          />
        )}
        {negative_pct > 0 && (
          <div
            className="sentbar__seg sentbar__seg--negative"
            style={{ width: `${negative_pct}%` }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="sentbar__legend">
        <div className="sentbar__legend-item">
          <span className="sentbar__dot sentbar__dot--positive" />
          <span className="sentbar__legend-lbl">إيجابي</span>
          <span className="sentbar__legend-pct">
            {positive_pct.toLocaleString('ar-SA', { maximumFractionDigits: 0 })}%
          </span>
        </div>
        <div className="sentbar__legend-item">
          <span className="sentbar__dot sentbar__dot--neutral" />
          <span className="sentbar__legend-lbl">محايد</span>
          <span className="sentbar__legend-pct">
            {neutral_pct.toLocaleString('ar-SA', { maximumFractionDigits: 0 })}%
          </span>
        </div>
        <div className="sentbar__legend-item">
          <span className="sentbar__dot sentbar__dot--negative" />
          <span className="sentbar__legend-lbl">سلبي</span>
          <span className="sentbar__legend-pct">
            {negative_pct.toLocaleString('ar-SA', { maximumFractionDigits: 0 })}%
          </span>
        </div>
      </div>

      {/* Verdict explanation */}
      {verdict.text && (
        <p className="sentbar__explain">{verdict.text}</p>
      )}
    </div>
  )
}
