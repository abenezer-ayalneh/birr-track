/** Shared loading / error / empty placeholders for consistent view states. */
import { useTranslation } from 'react-i18next'

export function LoadingState() {
  return (
    <div className="state-block">
      <div className="spinner"></div>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="state-block text-center">
      <p className="text-muted">{t('common.errorTitle')}</p>
      {message && (
        <p className="text-muted mt-1" style={{ wordBreak: 'break-word' }}>
          {message}
        </p>
      )}
      {onRetry && (
        <button className="button-secondary mt-2" style={{ maxWidth: 160 }} onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="state-block text-center">
      <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
      <p style={{ fontWeight: 600 }}>{title}</p>
      {hint && <p className="text-muted mt-1">{hint}</p>}
    </div>
  )
}
