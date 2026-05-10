/**
 * StockTable — sortable data table for all active stocks on the dashboard.
 * No external table library — custom sort on 50 rows is trivial.
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import type { StockSummaryRow } from '../services/supabase-queries.ts'
import { StockLogo } from './StockLogo.tsx'
import './StockTable.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey = 'symbol' | 'sector' | 'price' | 'change' | 'risk' | 'marketcap'
type SortDir = 'asc' | 'desc'

interface StockTableProps {
  data: StockSummaryRow[]
  isLoading: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRiskLevel(score: number | null): 'low' | 'medium' | 'high' | null {
  if (score == null) return null
  if (score <= 33) return 'low'
  if (score <= 66) return 'medium'
  return 'high'
}

/** Compare two nullable numbers. Nulls sort last regardless of direction. */
function compareNum(a: number | null, b: number | null, dir: SortDir): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir === 'asc' ? a - b : b - a
}

function compareStr(a: string, b: string, dir: SortDir): number {
  const cmp = a.localeCompare(b, 'ar')
  return dir === 'asc' ? cmp : -cmp
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

interface Column {
  key: SortKey
  label: string
  className: string
}

const COLUMNS: Column[] = [
  { key: 'symbol',    label: 'السهم',         className: 'stock-table__cell--stock' },
  { key: 'sector',    label: 'القطاع',         className: 'stock-table__cell--sector' },
  { key: 'price',     label: 'السعر',          className: 'stock-table__cell--price' },
  { key: 'change',    label: 'التغيير',        className: 'stock-table__cell--change' },
  { key: 'marketcap', label: 'القيمة السوقية', className: 'stock-table__cell--marketcap' },
  { key: 'risk',      label: 'المخاطر',        className: 'stock-table__cell--risk' },
]

/** Format SAR market cap in Arabic: تريليون / مليار */
function formatMarketCap(sar: number | null): string {
  if (sar == null) return '—'
  if (sar >= 1_000_000_000_000) {
    return `${(sar / 1_000_000_000_000).toLocaleString('ar-SA', { maximumFractionDigits: 1 })} تريليون`
  }
  return `${(sar / 1_000_000_000).toLocaleString('ar-SA', { maximumFractionDigits: 0 })} مليار`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StockTable({ data, isLoading }: StockTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>('symbol')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Handle column header click: cycle none -> asc -> desc -> none
  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
    }
  }

  // Sort the data
  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      switch (sortKey) {
        case 'symbol':
          return compareStr(a.symbol, b.symbol, sortDir)
        case 'sector':
          return compareStr(a.sector, b.sector, sortDir)
        case 'price':
          return compareNum(a.price, b.price, sortDir)
        case 'change':
          return compareNum(a.change_percent, b.change_percent, sortDir)
        case 'marketcap':
          return compareNum(a.market_cap, b.market_cap, sortDir)
        case 'risk':
          return compareNum(a.risk_score, b.risk_score, sortDir)
        default:
          return 0
      }
    })
  }, [data, sortKey, sortDir])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="stock-table__container">
        <table className="stock-table">
          <colgroup>
            <col className="stock-table__col--stock" />
            <col className="stock-table__col--sector" />
            <col className="stock-table__col--price" />
            <col className="stock-table__col--change" />
            <col className="stock-table__col--marketcap" />
            <col className="stock-table__col--risk" />
          </colgroup>
          <thead>
            <tr className="stock-table__header-row">
              {COLUMNS.map(col => (
                <th key={col.key} className="stock-table__th">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }, (_, i) => (
              <tr key={i} className="stock-table__row stock-table__row--skeleton">
                <td className="stock-table__td stock-table__cell--stock">
                  <div className="stock-table__skeleton-wrap">
                    <div className="stock-table__skeleton-logo" />
                    <div className="stock-table__skeleton-text">
                      <div className="stock-table__skeleton-line" style={{ width: '90px' }} />
                      <div className="stock-table__skeleton-line stock-table__skeleton-line--sm" style={{ width: '50px' }} />
                    </div>
                  </div>
                </td>
                <td className="stock-table__td stock-table__cell--sector">
                  <div className="stock-table__skeleton-line" style={{ width: '70px' }} />
                </td>
                <td className="stock-table__td stock-table__cell--price">
                  <div className="stock-table__skeleton-line" style={{ width: '65px' }} />
                </td>
                <td className="stock-table__td stock-table__cell--change">
                  <div className="stock-table__skeleton-line" style={{ width: '55px' }} />
                </td>
                <td className="stock-table__td stock-table__cell--marketcap">
                  <div className="stock-table__skeleton-line" style={{ width: '80px' }} />
                </td>
                <td className="stock-table__td stock-table__cell--risk">
                  <div className="stock-table__skeleton-line" style={{ width: '80px' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div className="stock-table__empty">
        <p>لا توجد أسهم متاحة</p>
      </div>
    )
  }

  return (
    <div className="stock-table__container">
      <table className="stock-table">
        <colgroup>
          <col className="stock-table__col--stock" />
          <col className="stock-table__col--sector" />
          <col className="stock-table__col--price" />
          <col className="stock-table__col--change" />
          <col className="stock-table__col--risk" />
        </colgroup>
        <thead>
          <tr className="stock-table__header-row">
            {COLUMNS.map(col => {
              const isActive = sortKey === col.key
              const arrow = isActive ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''
              return (
                <th
                  key={col.key}
                  className={`stock-table__th${isActive ? ' stock-table__th--active' : ''}`}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}{arrow}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const riskLevel = getRiskLevel(row.risk_score)
            const changePositive = row.change_percent != null && row.change_percent > 0
            const changeNegative = row.change_percent != null && row.change_percent < 0
            const changeClass = changePositive
              ? 'stock-table__change--positive'
              : changeNegative
                ? 'stock-table__change--negative'
                : ''

            return (
              <tr key={row.symbol} className="stock-table__row">
                <td className="stock-table__td stock-table__cell--stock">
                  <Link to={`/stock/${row.symbol}`} className="stock-table__row-link">
                    <StockLogo symbol={row.symbol} size={36} />
                    <div className="stock-table__stock-info">
                      <span className="stock-table__stock-name">{row.name_ar}</span>
                      <span className="stock-table__stock-ticker">{row.symbol}.SR</span>
                    </div>
                  </Link>
                </td>
                <td className="stock-table__td stock-table__cell--sector">
                  {row.sector || '\u2014'}
                </td>
                <td className="stock-table__td stock-table__cell--price">
                  {row.price != null
                    ? `${row.price.toLocaleString('ar-SA')} \u0631.\u0633`
                    : '\u2014'}
                </td>
                <td className={`stock-table__td stock-table__cell--change ${changeClass}`}>
                  {row.change_percent != null
                    ? `${row.change_percent >= 0 ? '+' : ''}${row.change_percent.toFixed(2)}%`
                    : '\u2014'}
                </td>
                <td className="stock-table__td stock-table__cell--marketcap">
                  {formatMarketCap(row.market_cap)}
                </td>
                <td className="stock-table__td stock-table__cell--risk">
                  {row.risk_score != null ? (
                    <span className="stock-table__risk-info">
                      <span className={`stock-table__risk-dot stock-table__risk-dot--${riskLevel}`} />
                      <span className="stock-table__risk-score">{Math.round(row.risk_score)}</span>
                      {row.risk_label_ar && (
                        <span className="stock-table__risk-label">{row.risk_label_ar}</span>
                      )}
                    </span>
                  ) : (
                    '\u2014'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
