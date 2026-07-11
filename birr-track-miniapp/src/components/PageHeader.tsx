import { useRefresh } from '../lib/useRefresh'

interface PageHeaderProps {
  title: string
  subtitle?: string
}

export function RefreshButton() {
  const { canRefresh, isRefreshing, refresh } = useRefresh()

  return (
    <button
      className={`refresh-button ${isRefreshing ? 'refresh-button--spinning' : ''}`}
      aria-label="Refresh"
      title="Refresh"
      disabled={!canRefresh || isRefreshing}
      onClick={() => void refresh()}
    >
      ↻
    </button>
  )
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <div className="page-header page-header--with-action">
      <div className="page-header-copy">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      <RefreshButton />
    </div>
  )
}
