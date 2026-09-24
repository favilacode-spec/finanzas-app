import { useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, CheckSquare, Square, Trash2, Copy, Paperclip, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, moneyCompact } from '../lib/format'
import { monthStart, monthEnd, shiftMonth, monthName, shortDate, todayLocal, addDays, parseLocal } from '../lib/dates'
import { useOnChange, notifyChange } from '../lib/events'
import TransactionModal from '../components/TransactionModal'
import Modal from '../components/Modal'
import Tile from '../components/Tile'

const DOWS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
function dayTitle(iso) {
  const t = todayLocal()
  if (iso === t) return 'Hoy'
  if (iso === addDays(t, -1)) return 'Ayer'
  return `${DOWS[parseLocal(iso).getDay()]} ${shortDate(iso)}`
}

export default function Transactions() {
  const { household } = useAuth()
  const [txns, setTxns] = useState([])
  const [accounts, setAccounts] = useState([])
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [allTime, setAllTime] = useState(false)
  const [fType, setFType] = useState('')
  const [fAccount, setFAccount] = useState('')
  const [fCat, setFCat] = useState('')
  const [fTag, setFTag] = useState('')
  const [month, setMonth] = useState(monthStart())
  const [edit, setEdit] = useState(null)
  const [dup, setDup] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selMode, setSelMode] = useState(false)
  const [sel, setSel] = useState(new Set())
  const [bulk, setBulk] = useState(false)

  const load = async () => {
    setLoading(true)
    let query = supabase.from('transactions').select('*').order('occurred_on', { ascending: false }).order('created_at', { ascending: false })
    if (!(allTime && q)) query = query.gte('occurred_on', month).lte('occurred_on', monthEnd(month))
    else query = query.limit(1000)
    const [tx, acc, cat] = await Promise.all([
      query,
      supabase.from('accounts').select('id,name,color,icon'),
      supabase.from('categories').select('id,name,kind,color,icon,parent_id'),
    ])
    setTxns(tx.data || []); setAccounts(acc.data || []); setCats(cat.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household, month, allTime && !!q]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  const accName = (id) => accounts.find((a) => a.id === id)?.name || '—'
  const cat = (id) => cats.find((c) => c.id === id)
  const tags = useMemo(() => [...new Set(txns.flatMap((t) => t.tags || []))].sort(), [txns])

  const filtered = useMemo(() => txns.filter((t) => {
    if (fType && t.type !== fType) return false
    if (fAccount && t.account_id !== fAccount && t.transfer_account_id !== fAccount) return false
    if (fCat && t.category_id !== fCat && cat(t.category_id)?.parent_id !== fCat) return false
    if (fTag && !(t.tags || []).includes(fTag)) return false
    if (q) {
      const hay = `${t.payee || ''} ${t.note || ''} ${cat(t.category_id)?.name || ''} ${(t.tags || []).join(' ')} ${t.location || ''} ${t.amount}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  }), [txns, fType, fAccount, fCat, fTag, q, cats]) // eslint-disable-line react-hooks/exhaustive-deps

  const totIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const totExpense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const byDay = []
  filtered.forEach((t) => { let g = byDay.find((x) => x.date === t.occurred_on); if (!g) { g = { date: t.occurred_on, list: [] }; byDay.push(g) } g.list.push(t) })

  const toggle = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s) }
  const bulkDelete = async () => {
    if (!sel.size || !confirm(`¿Eliminar ${sel.size} movimiento(s)?`)) return
    await supabase.from('transactions').delete().in('id', [...sel])
    setSel(new Set()); setSelMode(false); notifyChange(); load()
  }
  const activeFilters = [fType, fAccount, fCat, fTag].filter(Boolean).length

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--text-muted)' }} />
          <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Buscar comercio, nota, etiqueta, monto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="icon-btn" style={{ padding: 11, position: 'relative' }} onClick={() => setShowFilters((s) => !s)}>
          <SlidersHorizontal size={18} />{activeFilters > 0 && <span className="bn-dot" style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 9, background: 'var(--accent)' }} />}
        </button>
        <button className={`icon-btn ${selMode ? 'chip-btn on' : ''}`} style={{ padding: 11 }} onClick={() => { setSelMode(!selMode); setSel(new Set()) }} title="Seleccionar varios"><CheckSquare size={18} /></button>
      </div>
      {q && <label className="check" style={{ margin: '-4px 0 0' }}><input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} /> Buscar en todos los meses</label>}

      {!(allTime && q) && (
        <div className="row between">
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={17} /></button>
          <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{monthName(month)}</div>
          <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={17} /></button>
        </div>
      )}

      {showFilters && (
        <div className="card">
          <div className="grid grid-4" style={{ gap: 10 }}>
            <div className="field" style={{ margin: 0 }}><label>Tipo</label>
              <select className="form-select" value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="">Todos</option><option value="income">Ingresos</option><option value="expense">Gastos</option><option value="transfer">Transferencias</option>
              </select></div>
            <div className="field" style={{ margin: 0 }}><label>Cuenta</label>
              <select className="form-select" value={fAccount} onChange={(e) => setFAccount(e.target.value)}><option value="">Todas</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="field" style={{ margin: 0 }}><label>Categoría</label>
              <select className="form-select" value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Todas</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '↳ ' : ''}{c.name}</option>)}</select></div>
            <div className="field" style={{ margin: 0 }}><label>Etiqueta</label>
              <select className="form-select" value={fTag} onChange={(e) => setFTag(e.target.value)}><option value="">Todas</option>{tags.map((t) => <option key={t} value={t}>#{t}</option>)}</select></div>
          </div>
          {activeFilters > 0 && <button className="link" style={{ marginTop: 10 }} onClick={() => { setFType(''); setFAccount(''); setFCat(''); setFTag('') }}>Limpiar filtros</button>}
        </div>
      )}

      <div className="stats-3">
        <div className="card"><div className="stat-label">Ingresos</div><div className="stat-value amount-pos">{moneyCompact(totIncome)}</div></div>
        <div className="card"><div className="stat-label">Gastos</div><div className="stat-value amount-neg">{moneyCompact(totExpense)}</div></div>
        <div className="card"><div className="stat-label">Balance</div><div className="stat-value">{moneyCompact(totIncome - totExpense)}</div></div>
      </div>

      {loading ? <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>
        : byDay.length === 0 ? <div className="card empty-state">No hay movimientos con estos filtros.</div>
        : byDay.map((g) => {
          const dayOut = g.list.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
          return (
            <div key={g.date}>
              <div className="section-label row between" style={{ marginTop: 4 }}><span style={{ textTransform: 'capitalize' }}>{dayTitle(g.date)}</span>{dayOut > 0 && <span>−{money(dayOut)}</span>}</div>
              <div className="card" style={{ paddingTop: 2, paddingBottom: 2 }}>
                <div className="list">
                  {g.list.map((t) => {
                    const c = cat(t.category_id)
                    const title = t.payee || c?.name || (t.type === 'transfer' ? 'Transferencia' : 'Movimiento')
                    const sub = t.type === 'transfer' ? `${accName(t.account_id)} → ${accName(t.transfer_account_id)}` : `${c?.name ? c.name + ' · ' : ''}${accName(t.account_id)}`
                    return (
                      <div className="list-row clickable" key={t.id} onClick={() => selMode ? toggle(t.id) : setEdit(t)}>
                        {selMode && (sel.has(t.id) ? <CheckSquare size={20} color="var(--accent)" /> : <Square size={20} color="var(--text-muted)" />)}
                        <Tile icon={c?.icon || (t.type === 'transfer' ? 'repeat' : 'receipt')} color={c?.color || (t.type === 'transfer' ? '#94a3b8' : '#94a3b8')} />
                        <div className="list-main">
                          <div className="list-title">{title}</div>
                          <div className="list-sub">
                            {sub}
                            {t.source === 'apple_pay' ? ' · Apple Pay' : t.source === 'email' ? ' · Email' : ''}
                            {(t.tags || []).map((x) => ` #${x}`).join('')}
                          </div>
                        </div>
                        {t.attachment_path && <Paperclip size={14} color="var(--text-muted)" />}
                        <span className={`list-amount ${t.type === 'income' ? 'amount-pos' : t.type === 'expense' ? 'amount-neg' : ''}`}>{t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}{money(t.amount)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}

      {selMode && (
        <div style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(92px + env(safe-area-inset-bottom))', zIndex: 47, display: 'flex', justifyContent: 'center' }}>
          <div className="card row" style={{ gap: 8, padding: 10, boxShadow: 'var(--shadow)', background: '#1f2327' }}>
            <span style={{ fontWeight: 700, padding: '0 6px' }}>{sel.size} seleccionados</span>
            <button className="btn btn-secondary btn-sm" disabled={!sel.size} onClick={() => setBulk(true)}>Editar</button>
            <button className="btn btn-danger btn-sm" disabled={!sel.size} onClick={bulkDelete}><Trash2 size={14} /></button>
            <button className="icon-btn" onClick={() => { setSelMode(false); setSel(new Set()) }}><X size={15} /></button>
          </div>
        </div>
      )}

      {edit && (
        <EditWrapper t={edit} onClose={() => setEdit(null)} onDuplicate={() => { setDup(edit); setEdit(null) }} onSaved={load} />
      )}
      {dup && <TransactionModal prefill={{ type: dup.type, amount: Number(dup.amount), accountId: dup.account_id, toAccount: dup.transfer_account_id || '', categoryId: dup.category_id || '', payee: dup.payee || '', note: dup.note || '', tags: dup.tags || [] }} onClose={() => setDup(null)} onSaved={load} />}
      {bulk && <BulkEdit ids={[...sel]} accounts={accounts} cats={cats} onClose={() => setBulk(false)} onDone={() => { setBulk(false); setSel(new Set()); setSelMode(false); notifyChange(); load() }} />}
    </div>
  )
}

function EditWrapper({ t, onClose, onDuplicate, onSaved }) {
  const del = async () => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('transactions').delete().eq('id', t.id)
    notifyChange(); onSaved(); onClose()
  }
  return (
    <TransactionModal edit={t} onClose={onClose} onSaved={onSaved} actions={<>
      <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onDuplicate}><Copy size={14} /> Duplicar</button>
      <button type="button" className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={del}><Trash2 size={14} /> Eliminar</button>
    </>} />
  )
}

function BulkEdit({ ids, accounts, cats, onClose, onDone }) {
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (e) => {
    e.preventDefault()
    const upd = {}
    if (accountId) upd.account_id = accountId
    if (categoryId) upd.category_id = categoryId === 'none' ? null : categoryId
    if (date) upd.occurred_on = date
    setBusy(true)
    if (Object.keys(upd).length) await supabase.from('transactions').update(upd).in('id', ids)
    if (tag.trim()) {
      const { data } = await supabase.from('transactions').select('id,tags').in('id', ids)
      await Promise.all((data || []).map((t) => supabase.from('transactions').update({ tags: [...new Set([...(t.tags || []), tag.trim().replace(/^#/, '')])] }).eq('id', t.id)))
    }
    setBusy(false); onDone()
  }
  return (
    <Modal title={`Editar ${ids.length} movimientos`} onClose={onClose}>
      <form onSubmit={save}>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>Solo se cambia lo que completes.</p>
        <div className="field"><label>Cuenta</label><select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">— sin cambios —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label>Categoría</label><select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">— sin cambios —</option><option value="none">Sin categoría</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '↳ ' : ''}{c.name}</option>)}</select></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Fecha</label><input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>Agregar etiqueta</label><input className="form-input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Ej: viaje" /></div>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Aplicar'}</button>
      </form>
    </Modal>
  )
}
