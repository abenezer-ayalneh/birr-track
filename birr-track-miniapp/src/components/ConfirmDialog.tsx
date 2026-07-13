import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="confirm-dialog-title" className="confirm-title">{title}</h2>
        <div className="confirm-content">{children}</div>
        <div className="confirm-actions">
          <button className="button-secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button className="button-primary button-danger" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
