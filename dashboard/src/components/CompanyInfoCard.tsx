/**
 * CompanyInfoCard — presentational card for the StockDetailPage Info tab.
 *
 * Renders company metadata (Arabic + English name, ticker, sector) and the
 * Arabic description stored in `stocks.description_ar`. Purely presentational:
 * the parent (StockDetailPage) owns the price query and passes the result in.
 *
 * Falls back to a graceful "لا يتوفر وصف" message when description_ar is null.
 */

import type { StockPrice } from '../types/stock.ts'
import './CompanyInfoCard.css'

interface CompanyInfoCardProps {
  price: StockPrice | null | undefined
  loading?: boolean
}

export function CompanyInfoCard({ price, loading }: CompanyInfoCardProps) {
  if (loading) {
    return (
      <div className="company-info" aria-busy="true">
        <div className="company-info__skeleton company-info__skeleton--title" />
        <div className="company-info__skeleton company-info__skeleton--short" />
        <div className="company-info__skeleton" />
        <div className="company-info__skeleton" />
      </div>
    )
  }

  if (!price) {
    return null
  }

  return (
    <div className="company-info">
      <div className="company-info__header">
        <div className="company-info__names">
          <h3 className="company-info__name-ar">{price.name_ar}</h3>
          <span className="company-info__name-en">{price.name_en}</span>
        </div>
        <div className="company-info__meta">
          <span className="company-info__ticker">{price.symbol}</span>
          {price.sector_ar && (
            <span className="company-info__sector">{price.sector_ar}</span>
          )}
        </div>
      </div>

      {price.description_ar ? (
        <p className="company-info__description">{price.description_ar}</p>
      ) : (
        <p className="company-info__description company-info__description--empty">
          لا يتوفر وصف لهذه الشركة حالياً.
        </p>
      )}

      {/* Market Cap + educational note */}
      {price.market_cap != null && price.market_cap > 0 && (
        <div className="company-info__stat">
          <div className="company-info__stat-row">
            <span className="company-info__stat-label">القيمة السوقية</span>
            <span className="company-info__stat-value">
              {(price.market_cap / 1_000_000_000).toLocaleString('ar-SA', { maximumFractionDigits: 1 })} مليار ر.س
            </span>
          </div>
          <p className="company-info__stat-note">
            القيمة السوقية تعكس حجم الشركة في السوق. الشركات ذات القيمة العالية تكون أكثر استقراراً وأقل تقلباً عادةً، بينما الشركات الأصغر قد توفر فرص نمو أكبر مع مخاطر أعلى.
          </p>
        </div>
      )}
    </div>
  )
}
