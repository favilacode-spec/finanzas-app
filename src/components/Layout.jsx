import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  LayoutDashboard, Wallet, ArrowLeftRight, PieChart, Tags, Target, Repeat, BarChart3,
  Inbox as InboxIcon, Sparkles, Settings as Cog, CreditCard, Eye, EyeOff, Plus, CalendarDays,
  Grid2x2, Rocket, Receipt,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import TransactionModal from './TransactionModal'
import Modal from './Modal'

export const NAV = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/pagos', label: 'Pagos y suscripciones', short: 'Pagos', icon: Receipt },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/presupuestos', label: 'Presupuestos', icon: PieChart },
  { to: '/metas', label: 'Metas', icon: Target },
  { to: '/viaje', label: 'Proyectos', icon: Rocket },
  { to: '/deudas', label: 'Deudas', icon: CreditCard },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/bandeja', label: 'Bandeja', icon: InboxIcon, badge: true },
  { to: '/categorias', label: 'Categorías', icon: Tags },
  { to: '/consejos', label: 'Consejos IA', icon: Sparkles },
  { to: '/ajustes', label: 'Ajustes', icon: Cog },
]

const TABS = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/pagos', label: 'Pagos', icon: Receipt },
  { to: '/movimientos', label: 'Movim.', icon: ArrowLeftRight },
]

const TYPE_MAP = { gasto: 'expense', ingreso: 'income', transferencia: 'transfer', transfer: 'transfer', expense: 'expense', income: 'income' }

export default function Layout() {
  const { household, hideBalances, toggleHide } = useAuth()
  const [pending, setPending] = useState(0)
  const [more, setMore] = useState(false)
  const [add, setAdd] = useState(null) // null | {} prefill
  const loc = useLocation()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()

  useEffect(() => { setMore(false) }, [loc.pathname])

  // Link directo para Atajos / doble toque atrás:  /?nuevo=gasto&monto=15000&texto=cafe
  useEffect(() => {
    const n = params.get('nuevo')
    if (n === null) return
    const pre = {}
    if (TYPE_MAP[n]) pre.type = TYPE_MAP[n]
    const m = parseInt(String(params.get('monto') || '').replace(/[^\d]/g, ''), 10)
    if (m) pre.amount = m
    if (params.get('texto')) pre.payee = params.get('texto')
    if (params.get('cuenta')) pre.accountName = params.get('cuenta')
    setAdd(pre)
    params.delete('nuevo'); params.delete('monto'); params.delete('texto'); params.delete('cuenta')
    setParams(params, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (!household) return
    let active = true
    const load = async () => {
      const { count } = await supabase.from('pending_transactions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      if (active) setPending(count || 0)
    }
    load()
    const ch = supabase.channel('pending-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_transactions' }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [household, loc.pathname])

  const current = NAV.find((n) => n.to === loc.pathname)
  const title = current?.label || 'Mi Billetera'
  const inTabs = TABS.some((t) => t.to === loc.pathname)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Wallet size={20} strokeWidth={2.4} /></div>
          <div>
            <div className="brand-name">Mi Billetera</div>
            <div className="brand-sub">{household?.name || 'Finanzas'}</div>
          </div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.badge && pending > 0 && <span className="count">{pending}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1 style={{ flex: 1 }}>{title}</h1>
          <button className="icon-btn plain" onClick={toggleHide} title={hideBalances ? 'Mostrar montos' : 'Ocultar montos'} aria-label="Ocultar montos">
            {hideBalances ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
          <button className="icon-btn plain hide-desktop" onClick={() => nav('/ajustes')} aria-label="Ajustes"><Cog size={19} /></button>
        </header>
        <main className="content">
          <Outlet />
        </main>

        <button className="fab" onClick={() => setAdd({})} aria-label="Nuevo movimiento"><Plus size={26} strokeWidth={2.6} /></button>

        <nav className="bottom-nav">
          {TABS.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="bn-item">
              <n.icon size={21} />
              <span>{n.label}</span>
            </NavLink>
          ))}
          <button className={`bn-item ${!inTabs ? 'active' : ''}`} onClick={() => setMore(true)}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Grid2x2 size={21} />
              {pending > 0 && <span className="bn-dot" />}
            </span>
            <span>Más</span>
          </button>
        </nav>
      </div>

      {more && (
        <Modal title="Más" onClose={() => setMore(false)}>
          <div className="more-grid">
            {NAV.filter((n) => !TABS.some((t) => t.to === n.to)).map((n) => (
              <NavLink key={n.to} to={n.to} className="more-item">
                <n.icon size={22} color="var(--accent)" />
                <span>{n.short || n.label}</span>
                {n.badge && pending > 0 && <span className="dot">{pending}</span>}
              </NavLink>
            ))}
          </div>
        </Modal>
      )}

      {add && <TransactionModal prefill={Object.keys(add).length ? add : undefined} onClose={() => setAdd(null)} />}
    </div>
  )
}
