import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Router, Route, Switch } from 'wouter'
import { useEffect, useState } from 'react'
import { ApiProvider } from './contexts/ApiProvider'
import { Layout } from './components/Layout'
import { WaiterTransactions } from './pages/WaiterTransactions'
import { WaiterEdit } from './pages/WaiterEdit'
import { Dashboard } from './pages/Dashboard'
import { Staff } from './pages/Staff'
import { Registrations } from './pages/Registrations'
import { NotFound } from './pages/NotFound'
import { initTelegram } from './lib/telegram'
import { mockApiClient } from './api/mock/client'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

function AppRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/transactions/:id" component={WaiterEdit} />
        <Route path="/transactions" component={WaiterTransactions} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/staff" component={Staff} />
        <Route path="/registrations" component={Registrations} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  )
}

export function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    initTelegram().then(() => setReady(true))
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
      <ApiProvider client={mockApiClient}>
        <Router>
          <AppRoutes />
        </Router>
      </ApiProvider>
    </QueryClientProvider>
  )
}
