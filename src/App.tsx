import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './data/AuthContext'
import { AppProvider, useApp } from './data/AppContext'
import { Shell } from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import PropertyDetail from './pages/PropertyDetail'
import CalendarPage from './pages/CalendarPage'
import Reservations from './pages/Reservations'
import Revenues from './pages/Revenues'
import Expenses from './pages/Expenses'
import Analytics from './pages/Analytics'
import Insights from './pages/Insights'
import Imports from './pages/Imports'
import Settings from './pages/Settings'
import Onboarding from './pages/Onboarding'

function Theme() {
  const { ds } = useApp()
  const theme = ds.profile.settings.theme ?? 'system'
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
  return null
}

function Routed() {
  const { ds } = useApp()
  if (ds.properties.length === 0) {
    return (
      <>
        <Theme />
        <Routes>
          <Route element={<Shell />}>
            <Route path="/parametres" element={<Settings />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="*" element={<Onboarding />} />
          </Route>
        </Routes>
      </>
    )
  }
  return (
    <>
      <Theme />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="portfolio/:id" element={<PropertyDetail />} />
          <Route path="calendrier" element={<CalendarPage />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="revenus" element={<Revenues />} />
          <Route path="depenses" element={<Expenses />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="insights" element={<Insights />} />
          <Route path="imports" element={<Imports />} />
          <Route path="parametres" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash"><div className="spinner" /></div>
  if (!user) return <Login />
  return (
    <AppProvider>
      <Routed />
    </AppProvider>
  )
}
