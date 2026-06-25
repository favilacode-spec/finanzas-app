import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyShort, fmtDateShort } from '../lib/format'

const PIE = ['#2f6fed', '#ef3e48', '#5b8def', '#ff7a82', '#0b3b8f', '#f0a500', '#7c5cff', '#22b8a6', '#e06bd0', '#9aa0a6']
const tipStyle = { background: '#18223a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#eef2fb', fontSize: 13 }

export default function Reports() {
  const { household } = useAuth()
  const [months, setMonths] = useState(6)
  const [txns, setTxns] = useState([])
  const [cats, setCats] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!household) return
    setLoading(true)
    const d = new Date(); d.setMonth(d.getMonth() - (months - 1)); d.setDate(1)
    const start = d.toISOString().slice(0, 10)
    Promise.all([
      supabase.from('transactions').select('*').gte('occurred_on', start).order('occurred_on'),
      supabase.from('categories').select('id,name'),
    ]).then(([tx, c]) => {
      setTxns(tx.data || [])
      const m = {}; (c.data || []).forEach((x) => m[x.id] = x.name); setCats(m)
      setLoading(false)
    })
  }, [household, months])

  const trend = useMemo(() => {
    const map = {}
    const now = new Date()
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      map[d.toISOString().slice(0, 7)] = { month: d.toLocaleDateString('es', { month: 'short', year: '2-digit' }), ingreso: 0, gasto: 0, balance: 0 }
    }
    txns.forEach((t) => {
      const k = String(t.occurred_on).slice(0, 7)
      if (!map[k]) return
      if (t.type === 'income') map[k].ingreso += Number(t.amount)
      if (t.type === 'expense') map[k].gasto += Number(t.amount)
    })
    Object.values(map).forEach((m) => m.balance = m.ingreso - m.gasto)
    return Object.values(map)
  }, [txns, months])

  const byCat = useMemo(() => {
    const m = {}
    txns.filter((t) => t.type === 'expense').forEach((t) => {
      const k = t.category_id || 'none'
      m[k] = (m[k] || 0) + Number(t.amount)
    })
    return Object.entries(m).map(([k, v]) => ({ name: k === 'none' ? 'Sin categoría' : (cats[k] || '—'), value: v })).sort((a, b) => b.value - a.value)
  }, [txns, cats])

  const totalIn = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const totalOut = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  const exportCSV = () => {
    const rows = [['Fecha', 'Tipo', 'Monto', 'Categoría', 'Detalle', 'Nota']]
    txns.slice().reverse().forEach((t) => rows.push([
      fmtDateShort(t.occurred_on), t.type, t.amount, cats[t.category_id] || '', (t.payee || '').replace(/[\n,]/g, ' '), (t.note || '').replace(/[\n,]/g, ' '),
    ]))
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `movimientos-${months}m.csv`; a.click()
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 16, gap: 10 }}>
        <div className="segmented" style={{ maxWidth: 360 }}>
          {[3, 6, 12].map((m) => <button key={m} className={months === m ? 'active-blue' : ''} onClick={() => setMonths(m)}>{m} meses</button>)}
        </div>
        <button className="btn btn-secondary" onClick={exportCSV}><Download size={16} /> Exportar CSV</button>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card"><div className="stat-label">Ingresos del período</div><div className="stat-value amount-pos" style={{ fontSize: 22 }}>{money(totalIn)}</div></div>
        <div className="card"><div className="stat-label">Gastos del período</div><div className="stat-value amount-neg" style={{ fontSize: 22 }}>{money(totalOut)}</div></div>
        <div className="card"><div className="stat-label">Ahorro del período</div><div className="stat-value" style={{ fontSize: 22, color: totalIn - totalOut >= 0 ? '#7fb0ff' : '#ff8a8f' }}>{money(totalIn - totalOut)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Flujo mensual</div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f6fed" stopOpacity={0.5} /><stop offset="100%" stopColor="#2f6fed" stopOpacity={0} /></linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef3e48" stopOpacity={0.5} /><stop offset="100%" stopColor="#ef3e48" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#5d6c8c', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={moneyShort} tick={{ fill: '#5d6c8c', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Area type="monotone" dataKey="ingreso" name="Ingresos" stroke="#2f6fed" fill="url(#gIn)" strokeWidth={2} />
              <Area type="monotone" dataKey="gasto" name="Gastos" stroke="#ef3e48" fill="url(#gOut)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">Distribución de gastos</div>
          {byCat.length === 0 ? <div className="empty-state">Sin gastos.</div> : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCat.slice(0, 10)} dataKey="value" nameKey="name" outerRadius={95} label={(e) => `${(e.percent * 100).toFixed(0)}%`} labelLine={false}>
                    {byCat.slice(0, 10).map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Top categorías de gasto</div>
          {byCat.length === 0 ? <div className="empty-state">Sin gastos.</div> : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={byCat.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tickFormatter={moneyShort} tick={{ fill: '#5d6c8c', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#a3b2d1', fontSize: 12 }} width={110} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="value" fill="#2f6fed" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
