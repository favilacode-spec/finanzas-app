import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Wallet, ArrowLeftRight, PieChart, Tags, Target,
  Repeat, BarChart3, Inbox as InboxIcon, Sparkles, Settings as Cog, Menu, LogOut,
  CreditCard, Plane,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const NAV = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/cuentas', label: 'Cuentas', icon: Wallet },
  { to: '/movimientos', label: 'Movimientos', icon: ArrowLeftRight },
  { to: '/presupuestos', label: 'Presupuestos', icon: PieChart },
  { to: '/metas', label: 'Metas de ahorro', icon: Target },
  { to: '/deudas', label: 'Deudas', icon: CreditCard },
  { to: '/recurrentes', label: 'Recurrentes', icon: Repeat },
  { to: '/viaje', label: 'Viaje', icon: Plane },
  { to: '/categorias', label: 'Categorías', icon: Tags },
  { to: '/reportes', label: 'Reportes', icon: BarChart3 },
  { to: '/bandeja', label: 'Bandeja', icon: InboxIcon, badge: true },
  { to: '/consejos', label: 'Consejos IA', icon: Sparkles },
  { to: '/ajustes', label: 'Ajustes', icon: Cog },
]

export default function Layout() {
  const { profile, household, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(0)
  const loc = useLocation()

  useEffect(() => { setOpen(false) }, [loc.pathname])

  useEffect(() => {
    if (!household) return
    let active = true
    const load = async () => {
      const { count } = await supabase
        .from('pending_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (active) setPending(count || 0)
    }
    load()
    const ch = supabase.channel('pending-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_transactions' }, load)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [household, loc.pathname])

  const title = NAV.find((n) => n.to === loc.pathname)?.label || 'Mi Billetera CR'

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" style={{ background: 'linear-gradient(135deg, #33333a 0%, #0c0c0f 100%)', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center' }}>
            <Wallet size={20} color="#fff" strokeWidth={2.4} />
          </div>
          <div>
            <div className="brand-name">Mi Billetera</div>
            <div className="brand-sub">{household?.name || 'Finanzas CR'}</div>
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

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
          <div className="row" style={{ padding: '6px 10px' }}>
            <div className="icon-chip" style={{ background: profile?.avatar_color || '#0b3b8f', color: '#fff', fontWeight: 700 }}>
              {(profile?.name || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.name || 'Usuario'}</div>
              <button className="btn-ghost" style={{ fontSize: 12, padding: 0, color: 'var(--text-muted)', display: 'inline-flex', gap: 5, alignItems: 'center' }} onClick={signOut}>
                <LogOut size={12} /> Salir
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen(true)} aria-label="Menú"><Menu size={20} /></button>
          <h1>{title}</h1>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
