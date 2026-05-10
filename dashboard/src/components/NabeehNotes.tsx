/**
 * NabeehNotes — automatic Arabic narrative analysis comparing current vs previous risk.
 *
 * Fetches the 2 most recent risk_metrics records from Supabase to compare
 * old-vs-new and generate flowing Arabic analyst-style sentences explaining
 * WHY the risk score changed.
 *
 * Works on first visit (no localStorage dependency).
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchLatestRiskNote,
  fetchRiskScorePair,
  type RiskScoreRecord,
} from '../services/supabase-queries.ts'
import './NabeehNotes.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NabeehNotesProps {
  symbol: string
  stockName: string
  sentimentNegPct: number
  currentPrice: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 1): string {
  return n.toLocaleString('ar-SA', { maximumFractionDigits: dec })
}

// ─── Narrative generation ─────────────────────────────────────────────────────

function buildNarrative(
  curr: RiskScoreRecord,
  prev: RiskScoreRecord | null,
  stockName: string,
  sentimentNegPct: number,
  _currentPrice: number | null,
): { paragraphs: string[]; watchPoints: string[] } {
  const score    = Math.round(curr.overall_score)
  const level    = score <= 33 ? 'low' : score <= 66 ? 'medium' : 'high'
  const levelAr  = level === 'high' ? 'مرتفع' : level === 'medium' ? 'متوسط' : 'منخفض'
  const volPct   = curr.vol_252d * 100
  const varPct   = Math.abs(curr.var_95_hist) * 100

  const paragraphs: string[] = []
  const watchPoints: string[] = []

  // ── No previous record: describe current state ───────────────────────────
  if (!prev) {
    let p = `${stockName} يُسجّل درجة مخاطرة ${levelAr} عند ${fmt(score, 0)} من 100.`

    if (volPct > 25) {
      p += ` التقلب السنوي مرتفع (${fmt(volPct)}%)، مما يعني أن السهم يشهد تذبذبات سعرية أكبر من المعتاد.`
    } else if (volPct < 15) {
      p += ` التقلب السنوي منخفض (${fmt(volPct)}%)، وهو مؤشر على استقرار سعري نسبي.`
    } else {
      p += ` التقلب السنوي عند مستوى معتدل (${fmt(volPct)}%).`
    }

    if (sentimentNegPct > 50) {
      p += ` الأخبار المحيطة بالسهم تميل نحو السلبية (${fmt(sentimentNegPct, 0)}% أخبار سلبية)، مما قد يضغط على الأداء.`
    } else if (sentimentNegPct < 25) {
      p += ` المشاعر الإعلامية تبدو إيجابية عموماً (${fmt(sentimentNegPct, 0)}% أخبار سلبية فقط).`
    }

    paragraphs.push(p)

    if (level === 'high') {
      watchPoints.push('راقب أي تصاعد إضافي في درجة المخاطرة مع تراكم البيانات')
    }
    if (sentimentNegPct > 40) {
      watchPoints.push('تابع التغييرات في توجه الأخبار — تحسن المشاعر قد يخفف الضغط')
    }
    if (watchPoints.length === 0) {
      watchPoints.push('تابع درجة المخاطرة والأخبار بشكل منتظم')
    }

    return { paragraphs, watchPoints }
  }

  // ── Comparison: narrate what changed ─────────────────────────────────────
  const prevScore = Math.round(prev.overall_score)
  const riskDiff  = score - prevScore
  const prevVolPct = prev.vol_252d * 100
  const prevVarPct = Math.abs(prev.var_95_hist) * 100
  const volDiff   = volPct - prevVolPct
  const varDiff   = varPct - prevVarPct

  // Opening: overall score change
  let opening = ''
  if (Math.abs(riskDiff) < 2) {
    opening = `درجة مخاطرة ${stockName} مستقرة عند ${fmt(score, 0)} نقطة (${levelAr}) مقارنة بالقراءة السابقة.`
    if (score >= 60) {
      opening += ' المستوى لا يزال مرتفعاً ويتطلب متابعة مستمرة.'
    } else if (score <= 33) {
      opening += ' الوضع العام مريح نسبياً.'
    }
  } else if (riskDiff > 0) {
    opening = `ارتفعت درجة مخاطرة ${stockName} من ${fmt(prevScore, 0)} إلى ${fmt(score, 0)} نقطة (+${fmt(riskDiff, 0)} نقطة).`
    if (score > 66) {
      opening += ' المستوى الحالي مرتفع ويستدعي الحذر.'
    }
  } else {
    opening = `تراجعت درجة مخاطرة ${stockName} من ${fmt(prevScore, 0)} إلى ${fmt(score, 0)} نقطة (${fmt(riskDiff, 0)} نقطة) — تحسن مقارنة بالقراءة السابقة.`
  }
  paragraphs.push(opening)

  // Drivers: explain WHY the score changed
  const drivers: string[] = []

  if (Math.abs(volDiff) >= 0.5) {
    const volDir = volDiff > 0 ? 'ارتفع' : 'انخفض'
    drivers.push(
      `التقلب السنوي ${volDir} من ${fmt(prevVolPct)}% إلى ${fmt(volPct)}%` +
      (volDiff > 0 ? '، مما يُشير إلى تذبذب سعري متزايد' : '، مما يعكس استقراراً أكبر')
    )
  } else if (volPct > 25) {
    drivers.push(`التقلب السنوي مرتفع عند ${fmt(volPct)}%`)
  }

  if (Math.abs(varDiff) >= 0.2) {
    const varDir = varDiff > 0 ? 'ارتفعت' : 'انخفضت'
    drivers.push(
      `الخسارة المتوقعة (VaR) ${varDir} من ${fmt(prevVarPct, 2)}% إلى ${fmt(varPct, 2)}%` +
      (varDiff > 0 ? '، احتمالية خسارة أكبر في يوم واحد' : '، احتمالية خسارة أقل')
    )
  } else if (varPct > 3) {
    drivers.push(`الخسارة المتوقعة اليومية مرتفعة عند ${fmt(varPct, 2)}%`)
  }

  if (sentimentNegPct > 50) {
    drivers.push(`الأخبار السلبية سائدة (${fmt(sentimentNegPct, 0)}%) — ضغط إعلامي على السهم`)
  } else if (sentimentNegPct < 25) {
    drivers.push(`المشاعر الإعلامية إيجابية (${fmt(sentimentNegPct, 0)}% أخبار سلبية فقط)`)
  }

  if (curr.sr_break_detected && curr.sr_break_level) {
    drivers.push(`تم اختراق مستوى دعم/مقاومة عند ${curr.sr_break_level} ريال`)
  }

  if (drivers.length > 0 && Math.abs(riskDiff) >= 2) {
    paragraphs.push('سبب التغيير: ' + drivers.slice(0, 2).join('. ') + '.')
  } else if (drivers.length > 0) {
    paragraphs.push('أبرز العوامل: ' + drivers.slice(0, 2).join('. ') + '.')
  }

  // Watch points
  if (level === 'high' || riskDiff > 5) {
    watchPoints.push('راقب استمرار ارتفاع المخاطرة — تراكم الإشارات السلبية يزيد من الخطر')
  }
  if (sentimentNegPct > 40) {
    watchPoints.push('تابع تحولات الأخبار — تحسن المشاعر قد يخفف الضغط')
  }
  if (curr.sr_break_detected) {
    watchPoints.push('انتبه للمستوى المخترق — قد يتحول إلى مقاومة جديدة')
  }
  if (volPct > 25) {
    watchPoints.push('تذبذب مرتفع — توقع تحركات سعرية أكبر في الأيام القادمة')
  }
  if (riskDiff < -5) {
    watchPoints.push('استمر في متابعة البيانات — التحسن قد يكون مؤقتاً إذا تراجعت العوامل الداعمة')
  }
  if (watchPoints.length === 0) {
    watchPoints.push('تابع درجة المخاطرة والأخبار بشكل منتظم')
  }

  return { paragraphs, watchPoints }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function NabeehNotes({
  symbol,
  stockName,
  sentimentNegPct,
  currentPrice,
}: NabeehNotesProps) {
  const { data: pair, isLoading, error } = useQuery({
    queryKey: ['risk', 'pair', symbol],
    queryFn: () => fetchRiskScorePair(symbol),
    staleTime: 5 * 60_000,
    enabled: symbol.length > 0,
  })

  const { data: aiNote, isLoading: aiLoading } = useQuery({
    queryKey: ['risk', 'note', symbol],
    queryFn: () => fetchLatestRiskNote(symbol),
    staleTime: 5 * 60_000,
    enabled: symbol.length > 0,
  })

  if (isLoading || aiLoading) {
    return (
      <div className="nn">
        <div className="nn__body">
          <p className="nn__para" style={{ color: 'var(--color-text-muted)' }}>جاري تحميل التحليل...</p>
        </div>
      </div>
    )
  }

  if (error || !pair) {
    return (
      <div className="nn">
        <div className="nn__body">
          <p className="nn__para" style={{ color: 'var(--color-text-muted)' }}>لا تتوفر بيانات كافية للتحليل حالياً</p>
        </div>
      </div>
    )
  }

  const { current, previous } = pair
  const score = Math.round(current.overall_score)
  const riskLevel = score <= 33 ? 'low' : score <= 66 ? 'medium' : 'high'
  const levelLabel = riskLevel === 'high' ? 'مرتفع' : riskLevel === 'medium' ? 'متوسط' : 'منخفض'
  const riskDiff = previous ? score - Math.round(previous.overall_score) : 0

  const fallback = buildNarrative(current, previous, stockName, sentimentNegPct, currentPrice)
  const useAi = aiNote != null && aiNote.paragraphs_ar.length > 0
  const paragraphs = useAi ? aiNote.paragraphs_ar : fallback.paragraphs
  const watchPoints = useAi ? aiNote.watch_points_ar : fallback.watchPoints
  const headline = useAi ? aiNote.headline_ar : null
  const isAiSourced = useAi && aiNote.source === 'ai'

  const snapDate = previous
    ? new Date(previous.computed_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="nn">
      {/* Header */}
      <div className="nn__head">
        <span className={`nn__level nn__level--${riskLevel}`}>{levelLabel}</span>
        {riskDiff !== 0 && previous && (
          <span className={`nn__badge ${riskDiff > 0 ? 'nn__badge--up' : 'nn__badge--down'}`}>
            {riskDiff > 0 ? '+' : ''}{riskDiff.toLocaleString('ar-SA', { maximumFractionDigits: 0 })} نقطة
          </span>
        )}
        {isAiSourced && (
          <span className="nn__ai-badge">تم توليده بالذكاء الاصطناعي</span>
        )}
        {snapDate && <span className="nn__since">مقارنة بـ {snapDate}</span>}
      </div>

      {/* Headline (AI only) */}
      {headline && <p className="nn__headline">{headline}</p>}

      {/* Narrative paragraphs */}
      <div className="nn__body">
        {paragraphs.map((p, i) => (
          <p key={i} className="nn__para">{p}</p>
        ))}
      </div>

      {/* Watch points */}
      {watchPoints.length > 0 && (
        <div className="nn__watch">
          <span className="nn__watch-label">نقاط المتابعة</span>
          <ul className="nn__watch-list">
            {watchPoints.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
