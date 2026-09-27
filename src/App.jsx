import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Transactions from './pages/Transactions'
import Categories from './pages/Categories'
import Goals from './pages/Goals'
import Bills from './pages/Bills'
import CalendarPage from './pages/Calendar'
import Budgets from './pages/Budgets'
import Debts from './pages/Debts'
import Trip from './pages/Trip'
import Reports from './pages/Reports'
import Inbox from './pages/Inbox'
import Insights from './pages/Insights'
import Settings from './pages/Settings'

// Pantalla de carga: si tarda demasiado, ofrece reintentar en vez de quedarse girando
function Cargando({ lento, onRetry }) {
  return (
    <div className="center-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 24 }}>
      <div className="spinner" />
      {lento && (
        <>
          <div className="text-muted" style={{ fontSize: 14 }}>Está tardando más de lo normal…</div>
          <button className="btn btn-primary" onClick={onRetry}>Reintentar</button>
        </>
      )}
    </div>
  )
}

function Protected({ children }) {
  const { user, loading, household, loadError, refresh } = useAuth()
  const [lento, setLento] = useState(false)
  const esperando = loading || (user && !household && loadError)
  useEffect(() => {
    if (!esperando) { setLento(false); return }
    const t = setTimeout(() => setLento(true), 7000)
    return () => clearTimeout(t)
  }, [esperando])
  const reintentar = () => { if (loading) window.location.reload(); else { setLento(false); refresh() } }
  if (loading) return <Cargando lento={lento} onRetry={reintentar} />
  if (!user) return <Navigate to="/login" replace />
  if (!household && loadError) return <Cargando lento onRetry={reintentar} />
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cuentas" element={<Accounts />} />
        <Route path="/movimientos" element={<Transactions />} />
        <Route path="/categorias" element={<Categories />} />
        <Route path="/metas" element={<Goals />} />
        <Route path="/pagos" element={<Bills />} />
        <Route path="/recurrentes" element={<Navigate to="/pagos" replace />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/presupuestos" element={<Budgets />} />
        <Route path="/deudas" element={<Debts />} />
        <Route path="/viaje" element={<Trip />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/bandeja" element={<Inbox />} />
        <Route path="/consejos" element={<Insights />} />
        <Route path="/ajustes" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
