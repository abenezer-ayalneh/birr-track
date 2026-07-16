import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Router, Route, Switch } from 'wouter'
import { useEffect, useState } from 'react'
import { ApiProvider } from './contexts/ApiProvider'
import { RefreshProvider } from './contexts/RefreshProvider'
import { Layout } from './components/Layout'
import { TransactionsRoute } from './pages/TransactionsRoute'
import { WaiterEdit } from './pages/WaiterEdit'
import { Dashboard } from './pages/Dashboard'
import { Staff } from './pages/Staff'
import { Registrations } from './pages/Registrations'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'
import { Account } from './pages/Account'
import { initTelegram } from './lib/telegram'
import { initTheme } from './lib/theme'
import { createApiClient } from './api/factory'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
})

const { client: apiClient } = createApiClient()

function AppRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/transactions/:id" component={WaiterEdit} />
        <Route path="/transactions" component={TransactionsRoute} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/staff" component={Staff} />
        <Route path="/registrations" component={Registrations} />
        <Route path="/account" component={Account} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  )
}

export function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const disposeTheme = initTheme()
    initTelegram().then(() => setReady(true))
    return disposeTheme
  }, [])

  if (!ready) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={apiClient}>
        <RefreshProvider>
          <Router>
            <AppRoutes />
          </Router>
        </RefreshProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
