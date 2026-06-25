import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'
import Categories from './pages/Categories'
import Goals from './pages/Goals'
import Recurring from './pages/Recurring'
import Reports from './pages/Reports'
import Inbox from './pages/Inbox'
import Insights from './pages/Insights'
import Settings from './pages/Settings'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="center-screen"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
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
        <Route path="/presupuestos" element={<Budgets />} />
        <Route path="/categorias" element={<Categories />} />
        <Route path="/metas" element={<Goals />} />
        <Route path="/recurrentes" element={<Recurring />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/bandeja" element={<Inbox />} />
        <Route path="/consejos" element={<Insights />} />
        <Route path="/ajustes" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
