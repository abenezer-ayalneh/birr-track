import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useRoute } from 'wouter'
import { useEffect, useState } from 'react'
import type { TransactionUpdate } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { useApi } from '../lib/useApi'
import { useAuthImage } from '../lib/useAuthImage'
import { fromEatDatetimeLocal, toEatDatetimeLocal } from '../lib/format'
import { usePageRefresh } from '../lib/useRefresh'
import { ErrorState, LoadingState } from '../components/States'
import '../styles/waiter.css'

/**
 * Receipt detail + edit. Shared by Waiters (own receipts) and Managers/Owners
 * (any business receipt). The receipt image is fetched through the authenticated
 * API as a blob and shown via an object URL (a plain <img src> can't carry the JWT).
 */
export function WaiterEdit() {
  const api = useApi()
  const [, navigate] = useLocation()
  const [, params] = useRoute('/transactions/:id')
  const queryClient = useQueryClient()

  const id = params?.id as string
  const [saved, setSaved] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  const { data: tx, isLoading: loadingTx, isError, error, refetch } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api.getTransaction(id),
    enabled: !!id,
  })

  const { url: imageUrl, loading: imageLoading, error: imageError, refetchImage } = useAuthImage(id)
  usePageRefresh(() => Promise.all([refetch(), refetchImage()]))

  const [formData, setFormData] = useState<TransactionUpdate>({
    bankName: '',
    amount: undefined,
    transactionId: '',
    timestamp: '',
  })

  // Seed the form from the server until the user starts editing.
  useEffect(() => {
    if (tx && !isDirty) {
      setFormData({
        bankName: tx.bankName ?? '',
        amount: tx.amount ?? undefined,
        transactionId: tx.transactionId ?? '',
        timestamp: tx.timestamp ?? '',
      })
    }
  }, [isDirty, tx])

  function updateField(patch: TransactionUpdate) {
    setIsDirty(true)
    setFormData((current) => ({ ...current, ...patch }))
  }

  const updateMutation = useMutation({
    mutationFn: (patch: TransactionUpdate) => api.updateTransaction(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', id] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      setSaved(true)
      setIsDirty(false)
      setTimeout(() => navigate('/transactions'), 1000)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', id] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['summary'] })
      navigate('/transactions')
    },
  })

  function onDelete() {
    if (!window.confirm('Delete this Needs Review transaction? This cannot be undone.')) {
      return
    }
    deleteMutation.mutate()
  }

  if (loadingTx) return <LoadingState />
  if (isError || !tx) {
    return <ErrorState message={error instanceof Error ? error.message : 'Transaction not found'} />
  }

  const allFieldsPresent =
    formData.bankName && formData.amount && formData.transactionId && formData.timestamp

  return (
    <div className="page edit-screen">
      <button
        style={{ marginBottom: '16px', color: 'var(--tg-color-link)', fontSize: '14px' }}
        onClick={() => navigate('/transactions')}
      >
        ← Back
      </button>

      <PageHeader title="Transaction" subtitle={tx.status === 'needs_review' ? 'Needs review' : 'Recorded'} />

      {imageLoading ? (
        <div className="receipt-image flex-center" style={{ minHeight: 200 }}>
          <div className="spinner"></div>
        </div>
      ) : imageError ? (
        <div className="receipt-image flex-center text-muted" style={{ minHeight: 120 }}>
          Image unavailable
        </div>
      ) : imageUrl ? (
        <img src={imageUrl} alt="Receipt" className="receipt-image" />
      ) : null}

      {tx.editedByUploader && (
        <div className="edited-flag">🏷️ This receipt was edited by the uploader. Verify against the image.</div>
      )}

      {tx.isDuplicate && (
        <div className="edited-flag" style={{ backgroundColor: '#ffebee', color: '#b71c1c' }}>
          ⚠️ This looks like a duplicate. If it's different, please provide details.
        </div>
      )}

      {updateMutation.isError && (
        <div className="inline-error">
          {updateMutation.error instanceof Error ? updateMutation.error.message : 'Failed to save'}
        </div>
      )}

      {deleteMutation.isError && (
        <div className="inline-error">
          {deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Failed to delete'}
        </div>
      )}

      {saved && <div className="success-message">✓ Saved! Redirecting…</div>}

      <div className="form-group">
        <label className="form-label">Bank</label>
        <input
          type="text"
          className="form-input"
          value={formData.bankName || ''}
          onChange={(e) => updateField({ bankName: e.target.value })}
          placeholder="e.g., Commercial Bank of Ethiopia"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Amount (ETB)</label>
        <input
          type="number"
          className="form-input"
          value={formData.amount ?? ''}
          onChange={(e) =>
            updateField({ amount: e.target.value ? parseFloat(e.target.value) : undefined })
          }
          placeholder="e.g., 2500.00"
          step="0.01"
          min="0"
        />
        <div className="form-hint">Extraction confidence: {Math.round(tx.confidence * 100)}%</div>
      </div>

      <div className="form-group">
        <label className="form-label">Transaction ID</label>
        <input
          type="text"
          className="form-input"
          value={formData.transactionId || ''}
          onChange={(e) => updateField({ transactionId: e.target.value })}
          placeholder="e.g., TXN202606001"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Date & Time (EAT)</label>
        <input
          type="datetime-local"
          className="form-input"
          value={toEatDatetimeLocal(formData.timestamp)}
          onChange={(e) =>
            updateField({ timestamp: e.target.value ? fromEatDatetimeLocal(e.target.value) : '' })
          }
        />
      </div>

      <div className="button-group">
        {tx.status === 'needs_review' && (
          <button className="button-secondary button-danger" disabled={deleteMutation.isPending} onClick={onDelete}>
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        )}
        <button className="button-secondary" onClick={() => navigate('/transactions')}>
          Cancel
        </button>
        <button
          className="button-primary"
          disabled={!allFieldsPresent || updateMutation.isPending}
          onClick={() => updateMutation.mutate(formData)}
        >
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
