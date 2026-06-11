import { useLocation } from 'wouter'

export function NotFound() {
  const [, navigate] = useLocation()

  return (
    <div className="page text-center py-2">
      <h2 className="page-title">404</h2>
      <p className="page-subtitle">Page not found</p>
      <button
        className="button-primary"
        style={{ marginTop: '16px', maxWidth: '200px', marginLeft: 'auto', marginRight: 'auto' }}
        onClick={() => navigate('/transactions')}
      >
        Go Home
      </button>
    </div>
  )
}
