import { useCallback, useEffect, useRef, useState } from 'react'
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
  const objectUrlRef = useRef<string | null>(null)
  const mountedRef = useRef(false)
  const requestRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
  }, [])

  const refetchImage = useCallback(async () => {
    if (!transactionId) return

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setLoading(true)
    setError(null)
    try {
      const blob = await api.getTransactionImage(transactionId)
      if (!mountedRef.current || requestRef.current !== requestId) return
      clearObjectUrl()
      const nextUrl = URL.createObjectURL(blob)
      objectUrlRef.current = nextUrl
      setUrl(nextUrl)
    } catch (e: unknown) {
      if (!mountedRef.current || requestRef.current !== requestId) return
      setError(e instanceof Error ? e : new Error('Failed to load image'))
    } finally {
      if (mountedRef.current && requestRef.current === requestId) setLoading(false)
    }
  }, [api, clearObjectUrl, transactionId])

  useEffect(() => {
    if (transactionId) {
      setUrl(null)
      void refetchImage()
    }

    return () => {
      clearObjectUrl()
    }
  }, [clearObjectUrl, refetchImage, transactionId])

  return { url, error, loading, refetchImage }
}
