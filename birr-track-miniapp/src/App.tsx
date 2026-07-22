import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useApi } from './lib/useApi'
import { ErrorState, LoadingState } from './components/States'
import { PreRegistration } from './pages/PreRegistration'
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

function EntryGate() {
	const api = useApi()
	const queryClient = useQueryClient()
	const entryQuery = useQuery({
		queryKey: ['entry-state'],
		queryFn: () => api.getEntryState(),
		staleTime: 30 * 1000,
	})

	if (entryQuery.isLoading) return <LoadingState />
	if (entryQuery.isError || !entryQuery.data) {
		return <ErrorState message={entryQuery.error instanceof Error ? entryQuery.error.message : undefined} onRetry={() => entryQuery.refetch()} />
	}

	const state = entryQuery.data
	if (state.status === 'active' || state.status === 'platform_owner') {
		return (
			<Router>
				<AppRoutes />
			</Router>
		)
	}

	return <PreRegistration state={state} onStateChange={(nextState) => queryClient.setQueryData(['entry-state'], nextState)} />
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
          <EntryGate />
        </RefreshProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
