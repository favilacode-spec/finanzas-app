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
  const [allTxns, setAllTxns] = useState([])
  const [cats, setCats] = useState({})
  const [accounts, setAccounts] = useState([])
  const [labels, setLabels] = useState([])
  const [fAccount, setFAccount] = useState('')
  const [fLabel, setFLabel] = useState('')
  const [fCat, setFCat] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!household) return
    setLoading(true)
    const d = new Date(); d.setMonth(d.getMonth() - (months - 1)); d.setDate(1)
    const start = d.toISOString().slice(0, 10)
    Promise.all([
      supabase.from('transactions').select('*').gte('occurred_on', start).order('occurred_on'),
      supabase.from('categories').select('id,name,color'),
      supabase.from('accounts').select('id,name,label_id').eq('archived', false).order('name'),
      supabase.from('account_labels').select('*').order('name'),
    ]).then(([tx, c, a, l]) => {
      setAllTxns(tx.data || [])
      const m = {}; (c.data || []).forEach((x) => m[x.id] = x); setCats(m)
      setAccounts(a.data || [])
      setLabels(l.data || [])
      setLoading(false)
    })
  }, [household, months])

  // aplicar filtros (cuenta / etiqueta / categoría)
  const labelAccountIds = fLabel ? accounts.filter((a) => a.label_id === fLabel).map((a) => a.id) : null
  const txns = allTxns.filter((t) => {
    if (fAccount && t.account_id !== fAccount && t.transfer_account_id !== fAccount) return false
    if (labelAccountIds && !labelAccountIds.includes(t.account_id) && !labelAccountIds.includes(t.transfer_account_id)) return false
    if (fCat && t.category_id !== fCat) return false
    return true
  })

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
    return Object.entries(m).map(([k, v]) => ({
      name: k === 'none' ? 'Sin categoría' : (cats[k]?.name || '—'),
      value: v,
      color: k === 'none' ? '#6f6f76' : (cats[k]?.color || '#6f6f76'),
    })).sort((a, b) => b.value - a.value)
  }, [txns, cats])

  const totalIn = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const totalOut = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  const exportCSV = () => {
    const rows = [['Fecha', 'Tipo', 'Monto', 'Categoría', 'Detalle', 'Nota']]
    txns.slice().reverse().forEach((t) => rows.push([
      fmtDateShort(t.occurred_on), t.type, t.amount, cats[t.category_id]?.name || '', (t.payee || '').replace(/[\n,]/g, ' '), (t.note || '').replace(/[\n,]/g, ' '),
    ]))
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `movimientos-${months}m.csv`; a.click()
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  return (
    <div>
      <div className="row between wrap" style={{ marginBottom: 12, gap: 10 }}>
        <div className="segmented" style={{ maxWidth: 360 }}>
          {[3, 6, 12].map((m) => <button key={m} className={months === m ? 'active-blue' : ''} onClick={() => setMonths(m)}>{m} meses</button>)}
        </div>
        <button className="btn btn-secondary" onClick={exportCSV}><Download size={16} /> Exportar CSV</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid grid-3" style={{ gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Cuenta</label>
            <select className="form-select" value={fAccount} onChange={(e) => setFAccount(e.target.value)}>
              <option value="">Todas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Etiqueta</label>
            <select className="form-select" value={fLabel} onChange={(e) => setFLabel(e.target.value)}>
              <option value="">Todas</option>
              {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Categoría</label>
            <select className="form-select" value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="">Todas</option>
              {Object.values(cats).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        {(fAccount || fLabel || fCat) && (
          <button className="btn-ghost btn-sm" style={{ marginTop: 10, color: 'var(--text-2)' }} onClick={() => { setFAccount(''); setFLabel(''); setFCat('') }}>Limpiar filtros</button>
        )}
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card"><div className="stat-label">Ingresos del período</div><div className="stat-value amount-pos" style={{ fontSize: 22 }}>{money(totalIn)}</div></div>
        <div className="card"><div className="stat-label">Gastos del período</div><div className="stat-value amount-neg" style={{ fontSize: 22 }}>{money(totalOut)}</div></div>
        <div className="card"><div className="stat-label">Ahorro del período</div><div className="stat-value" style={{ fontSize: 22, color: totalIn - totalOut >= 0 ? '#f4f4f6' : '#86868c' }}>{money(totalIn - totalOut)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Flujo mensual</div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e7e7ea" stopOpacity={0.45} /><stop offset="100%" stopColor="#e7e7ea" stopOpacity={0} /></linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6b6b72" stopOpacity={0.45} /><stop offset="100%" stopColor="#6b6b72" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#5d6c8c', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={moneyShort} tick={{ fill: '#5d6c8c', fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v) => money(v)} contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Area type="monotone" dataKey="ingreso" name="Ingresos" stroke="#e7e7ea" fill="url(#gIn)" strokeWidth={2} />
              <Area type="monotone" dataKey="gasto" name="Gastos" stroke="#9a9aa1" fill="url(#gOut)" strokeWidth={2} />
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
                    {byCat.slice(0, 10).map((d, i) => <Cell key={i} fill={d.color} />)}
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
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {byCat.slice(0, 8).map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {byCat.length > 0 && (
        <div className="card card-pad-0" style={{ marginTop: 16 }}>
          <div style={{ padding: '14px 18px' }} className="card-title">En qué se va la plata (gastos por categoría)</div>
          <table className="data-table">
            <thead><tr><th>Categoría</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>Prom./mes</th></tr></thead>
            <tbody>
              {byCat.map((d, i) => (
                <tr key={i}>
                  <td><span className="row" style={{ gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />{d.name}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(d.value)}</td>
                  <td style={{ textAlign: 'right' }} className="text-2">{totalOut > 0 ? ((d.value / totalOut) * 100).toFixed(0) : 0}%</td>
                  <td style={{ textAlign: 'right' }} className="text-muted">{money(d.value / months)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
