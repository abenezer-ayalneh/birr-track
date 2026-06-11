/** Shared loading / error / empty placeholders for consistent view states. */

export function LoadingState() {
  return (
    <div className="state-block">
      <div className="spinner"></div>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state-block text-center">
      <p className="text-muted">Something went wrong</p>
      {message && (
        <p className="text-muted mt-1" style={{ wordBreak: 'break-word' }}>
          {message}
        </p>
      )}
      {onRetry && (
        <button className="button-secondary mt-2" style={{ maxWidth: 160 }} onClick={onRetry}>
          Retry
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
