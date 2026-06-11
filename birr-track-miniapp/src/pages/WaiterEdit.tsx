import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useRoute } from 'wouter'
import { useState } from 'react'
import type { TransactionUpdate } from '../api/types'
import { useApi } from '../lib/useApi'

export function WaiterEdit() {
  const api = useApi()
  const [, navigate] = useLocation()
  const [, params] = useRoute('/transactions/:id')
  const queryClient = useQueryClient()

  const id = params?.id as string
  const [saved, setSaved] = useState(false)

  const { data: tx, isLoading: loadingTx } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api.getTransaction(id),
    enabled: !!id,
  })

  const [formData, setFormData] = useState<TransactionUpdate>({
    bankName: tx?.bankName || '',
    amount: tx?.amount || undefined,
    transactionId: tx?.transactionId || '',
    timestamp: tx?.timestamp || '',
  })

  const updateMutation = useMutation({
    mutationFn: (patch: TransactionUpdate) => api.updateTransaction(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', id] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setSaved(true)
      setTimeout(() => navigate('/transactions'), 1000)
    },
  })

  if (loadingTx || !tx) {
    return (
      <div className="page text-center">
        <div className="spinner"></div>
      </div>
    )
  }

  const allFieldsPresent =
    formData.bankName && formData.amount && formData.transactionId && formData.timestamp

  return (
    <div className="page edit-screen">
      <button
        style={{
          marginBottom: '16px',
          color: 'var(--tg-color-link)',
          fontSize: '14px',
        }}
        onClick={() => navigate('/transactions')}
      >
        ← Back
      </button>

      <img src={tx.imageUrl} alt="Receipt" className="receipt-image" />

      {tx.editedByUploader && (
        <div className="edited-flag">🏷️ You edited this receipt. Managers will verify against the image.</div>
      )}

      {tx.isDuplicate && (
        <div className="edited-flag" style={{ backgroundColor: '#ffebee', color: '#b71c1c' }}>
          ⚠️ This looks like a duplicate. If it's different, please provide details.
        </div>
      )}

      {saved && (
        <div className="success-message">✓ Saved! Redirecting…</div>
      )}

      <div className="form-group">
        <label className="form-label">Bank</label>
        <input
          type="text"
          className="form-input"
          value={formData.bankName || ''}
          onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
          placeholder="e.g., Commercial Bank of Ethiopia"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Amount (ETB)</label>
        <input
          type="number"
          className="form-input"
          value={formData.amount || ''}
          onChange={(e) =>
            setFormData({ ...formData, amount: e.target.value ? parseFloat(e.target.value) : undefined })
          }
          placeholder="e.g., 2500.00"
          step="0.01"
        />
        <div className="form-hint">Extracted confidence: {Math.round(tx.confidence * 100)}%</div>
      </div>

      <div className="form-group">
        <label className="form-label">Transaction ID</label>
        <input
          type="text"
          className="form-input"
          value={formData.transactionId || ''}
          onChange={(e) => setFormData({ ...formData, transactionId: e.target.value })}
          placeholder="e.g., TXN202606001"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Date & Time</label>
        <input
          type="datetime-local"
          className="form-input"
          value={formData.timestamp ? new Date(formData.timestamp).toISOString().slice(0, 16) : ''}
          onChange={(e) => setFormData({ ...formData, timestamp: new Date(e.target.value).toISOString() })}
        />
      </div>

      <div className="button-group">
        <button
          className="button-secondary"
          onClick={() => navigate('/transactions')}
        >
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
