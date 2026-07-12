import { useRefresh } from '../lib/useRefresh'
import { useTranslation } from 'react-i18next'
import { LanguageSelector } from './LanguageSelector'

interface PageHeaderProps {
  title: string
  subtitle?: string
}

export function RefreshButton() {
  const { canRefresh, isRefreshing, refresh } = useRefresh()
  const { t } = useTranslation()

  return (
    <button
      className={`refresh-button ${isRefreshing ? 'refresh-button--spinning' : ''}`}
      aria-label={t('common.refresh')}
      title={t('common.refresh')}
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
      <div className="page-header-actions">
        <LanguageSelector />
        <RefreshButton />
      </div>
    </div>
  )
}
