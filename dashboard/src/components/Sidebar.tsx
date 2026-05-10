import { NavLink } from 'react-router'
import { useActiveStocks } from '../hooks/useActiveStocks.ts'
import { useAuth } from '../hooks/useAuth.ts'
import { StockLogo } from './StockLogo.tsx'
import { useTheme } from '../hooks/useTheme.ts'
import './Sidebar.css'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { data: stocks } = useActiveStocks()
  const { signOut } = useAuth()
  const theme = useTheme()
  const aiLogoSrc = theme === 'dark'
    ? `${import.meta.env.BASE_URL}assets/ask-nabeeh-dark.svg`
    : `${import.meta.env.BASE_URL}assets/ask-nabeeh.svg`

  return (
    <>
      <div
        className={`sidebar__backdrop${isOpen ? ' sidebar__backdrop--visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
        <nav className="sidebar__nav">
          <div className="sidebar__group">
            <span className="sidebar__label">التنقل</span>
            <NavLink
              to="/dashboard"
              end
              className={({ isActive }) =>
                `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
              }
              onClick={onClose}
            >
              <svg className="sidebar__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              <span>لوحة التحكم</span>
            </NavLink>
            <NavLink
              to="/search"
              className={({ isActive }) =>
                `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
              }
              onClick={onClose}
            >
              <svg className="sidebar__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>البحث</span>
            </NavLink>
            <NavLink
              to="/news"
              className={({ isActive }) =>
                `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
              }
              onClick={onClose}
            >
              <svg className="sidebar__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="18" rx="2" />
                <line x1="6" y1="8" x2="18" y2="8" />
                <line x1="6" y1="12" x2="14" y2="12" />
                <line x1="6" y1="16" x2="10" y2="16" />
              </svg>
              <span>الأخبار</span>
            </NavLink>
            <NavLink
              to="/chat"
              className={({ isActive }) =>
                `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
              }
              onClick={onClose}
            >
              <img src={aiLogoSrc} alt="المساعد الذكي" width={20} height={20} className="sidebar__item-icon-img" />
              <span>المساعد الذكي</span>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
              }
              onClick={onClose}
            >
              <svg className="sidebar__item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              <span>الإعدادات</span>
            </NavLink>
          </div>

          <div className="sidebar__group">
            <span className="sidebar__label">الأسهم</span>
            {(stocks ?? []).map(stock => (
              <NavLink
                key={stock.symbol}
                to={`/stock/${stock.symbol}`}
                className={({ isActive }) =>
                  `sidebar__item${isActive ? ' sidebar__item--active' : ''}`
                }
                onClick={onClose}
              >
                <StockLogo symbol={stock.symbol} size={20} className="sidebar__item-icon-img" />
                <div className="sidebar__item-text">
                  <span>{stock.name_ar}</span>
                  <span className="sidebar__item-sub">{stock.symbol}.SR</span>
                </div>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="sidebar__footer">
          <button
            className="sidebar__logout"
            onClick={() => signOut()}
            type="button"
          >
            <svg className="sidebar__logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>تسجيل الخروج</span>
          </button>
          <span className="sidebar__version">لا يُعتبر نصيحة استثمارية</span>
        </div>
      </aside>
    </>
  )
}
