import { useEffect, useState } from 'react'
import { useApi } from './useApi'

/**
 * Fetches a transaction's receipt image through the authenticated API (Bearer
 * header) and exposes it as an object URL, because a plain <img src> to the
 * protected `/transactions/:id/image` endpoint can't carry the JWT.
 * Revokes the object URL on cleanup to avoid leaks.
 */
export function useAuthImage(transactionId: string | undefined) {
  const api = useApi()
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!transactionId) return
    let active = true
    let objectUrl: string | null = null

    setLoading(true)
    setError(null)
    api
      .getTransactionImage(transactionId)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e : new Error('Failed to load image'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [api, transactionId])

  return { url, error, loading }
}
