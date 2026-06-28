import { useEffect, useState } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, ACCOUNT_TYPES, accountTypeLabel } from '../lib/format'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import LabelChip from '../components/LabelChip'

const COLORS = ['#0b3b8f', '#2f6fed', '#d4202a', '#ef3e48', '#f0a500', '#22b8a6', '#7c5cff', '#e06bd0']

export default function Accounts() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [edit, setEdit] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setLoading(true)
    const [acc, bal, lab] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('account_balances').select('*'),
      supabase.from('account_labels').select('*').order('name'),
    ])
    setAccounts(acc.data || [])
    setBalances(bal.data || [])
    setLabels(lab.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

  const labelOf = (id) => labels.find((l) => l.id === id)
  const balOf = (id) => balances.find((b) => b.account_id === id)?.balance || 0
  const visible = accounts.filter((a) => showArchived ? a.archived : !a.archived)
  const total = accounts.filter((a) => !a.archived && !a.exclude_from_total).reduce((s, a) => s + balOf(a.id), 0)

  const toggleArchive = async (a) => {
    await supabase.from('accounts').update({ archived: !a.archived }).eq('id', a.id)
    load()
  }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(120deg, #1a1a1f, #0c0c0f)' }}>
        <div className="stat-label" style={{ color: '#ededf2' }}>Patrimonio total (cuentas activas)</div>
        <div className="stat-value" style={{ fontSize: 32 }}>{money(total)}</div>
      </div>

      <div className="row between wrap" style={{ marginBottom: 16 }}>
        <button className="btn-ghost btn-sm" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? 'Ver activas' : 'Ver archivadas'}
        </button>
        <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true) }}><Plus size={18} /> Nueva cuenta</button>
      </div>

      {visible.length === 0 ? (
        <div className="card empty-state">
          <Icon name="wallet" size={40} />
          <p>{showArchived ? 'No hay cuentas archivadas.' : 'Creá tu primera cuenta para empezar.'}</p>
        </div>
      ) : (
        <div className="grid grid-3">
          {visible.map((a) => (
            <div className="card" key={a.id}>
              <div className="row between" style={{ marginBottom: 14 }}>
                <span className="icon-chip" style={{ background: (a.color || '#0b3b8f') + '26', color: a.color || '#2f6fed' }}>
                  <Icon name={a.icon || 'wallet'} size={20} />
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="icon-btn" onClick={() => { setEdit(a); setShowForm(true) }}><Pencil size={15} /></button>
                  <button className="icon-btn" onClick={() => toggleArchive(a)} title={a.archived ? 'Restaurar' : 'Archivar'}>
                    {a.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                  </button>
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
                {labelOf(a.label_id) && <LabelChip label={labelOf(a.label_id)} />}
              </div>
              <div className="text-muted" style={{ fontSize: 12.5 }}>{accountTypeLabel(a.type)}{a.bank ? ` · ${a.bank}` : ''}</div>
              <div className="stat-value" style={{ fontSize: 24, marginTop: 12, color: balOf(a.id) < 0 ? '#86868c' : 'var(--text)' }}>{money(balOf(a.id))}</div>
              {a.type === 'credit_card' && a.credit_limit ? (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Límite: {money(a.credit_limit)}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {showForm && <AccountForm account={edit} household={household} user={user} labels={labels} onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  )
}

function AccountForm({ account, household, user, labels: initialLabels = [], onClose, onSaved }) {
  const [name, setName] = useState(account?.name || '')
  const [type, setType] = useState(account?.type || 'cash')
  const [bank, setBank] = useState(account?.bank || '')
  const [opening, setOpening] = useState(account?.opening_balance ? String(account.opening_balance) : '')
  const [limit, setLimit] = useState(account?.credit_limit ? String(account.credit_limit) : '')
  const [color, setColor] = useState(account?.color || '#0b3b8f')
  const [exclude, setExclude] = useState(account?.exclude_from_total || false)
  const [labels, setLabels] = useState(initialLabels)
  const [labelId, setLabelId] = useState(account?.label_id || '')
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#2f6fed')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const createLabel = async () => {
    if (!newName.trim()) return
    const { data, error } = await supabase.from('account_labels')
      .insert({ household_id: household.id, name: newName.trim(), color: newColor })
      .select().single()
    if (error) return setErr(error.message)
    setLabels((l) => [...l, data]); setLabelId(data.id)
    setNewOpen(false); setNewName(''); setNewColor('#2f6fed')
  }

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setErr('Poné un nombre')
    setBusy(true)
    const icon = ACCOUNT_TYPES.find((t) => t.value === type)?.icon || 'wallet'
    const payload = {
      household_id: household.id, name: name.trim(), type, bank: bank || null,
      opening_balance: parseInt(String(opening).replace(/[^0-9-]/g, ''), 10) || 0,
      credit_limit: type === 'credit_card' ? (parseInt(String(limit).replace(/[^0-9]/g, ''), 10) || null) : null,
      color, icon, exclude_from_total: exclude, label_id: labelId || null, created_by: user.id,
    }
    let error
    if (account) ({ error } = await supabase.from('accounts').update(payload).eq('id', account.id))
    else ({ error } = await supabase.from('accounts').insert(payload))
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved(); onClose()
  }

  return (
    <Modal title={account ? 'Editar cuenta' : 'Nueva cuenta'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label>Nombre</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Ueno, Itaú, Efectivo" autoFocus />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Banco / entidad (opcional)</label>
          <input className="form-input" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Ej: Banco Itaú" />
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Saldo inicial (₲)</label>
            <input className="form-input" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
          </div>
          {type === 'credit_card' && (
            <div className="field">
              <label>Límite (₲)</label>
              <input className="form-input" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0" />
            </div>
          )}
        </div>
        <div className="field">
          <label>Color</label>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)}
                style={{ width: 30, height: 30, borderRadius: 8, background: c, border: color === c ? '2px solid #fff' : '2px solid transparent' }} />
            ))}
            <label title="Elegir cualquier color" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', border: !COLORS.includes(color) ? '2px solid #fff' : '2px solid transparent', background: 'conic-gradient(#ff0000,#ff9900,#ffee00,#33dd00,#00ddcc,#0066ff,#cc00ff,#ff0066,#ff0000)' }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: color, boxShadow: '0 0 0 2px rgba(0,0,0,.35)' }} />
              </span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'auto' }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>Más colores</span>
            </label>
          </div>
        </div>
        <div className="field">
          <label>Etiqueta (para qué usás esta cuenta)</label>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" onClick={() => setLabelId('')}
              className="badge" style={{ cursor: 'pointer', borderColor: !labelId ? 'var(--blue)' : 'var(--border)', color: !labelId ? '#ededf2' : 'var(--text-2)' }}>
              Sin etiqueta
            </button>
            {labels.map((l) => (
              <button type="button" key={l.id} onClick={() => setLabelId(l.id)}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, color: l.color, background: l.color + (labelId === l.id ? '33' : '18'), border: `1.5px solid ${labelId === l.id ? l.color : 'transparent'}` }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: l.color }} />{l.name}
              </button>
            ))}
            <button type="button" onClick={() => setNewOpen((o) => !o)} className="badge" style={{ cursor: 'pointer' }}>+ Nueva</button>
          </div>
          {newOpen && (
            <div className="row wrap" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input className="form-input" style={{ flex: 1, minWidth: 140, padding: '8px 11px' }} placeholder="Ej: Hogar, Negocio, Ahorros"
                value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createLabel())} />
              {COLORS.map((c) => (
                <button type="button" key={c} onClick={() => setNewColor(c)} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: newColor === c ? '2px solid #fff' : '2px solid transparent' }} />
              ))}
              <button type="button" className="btn btn-primary btn-sm" onClick={createLabel}>Crear</button>
            </div>
          )}
        </div>

        <label className="row" style={{ gap: 8, fontSize: 13.5, color: 'var(--text-2)', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} />
          No incluir en el patrimonio total
        </label>
        {err && <div style={{ color: '#c9c9cf', fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
