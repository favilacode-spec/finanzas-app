import { useEffect, useState } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, ACCOUNT_TYPES, accountTypeLabel } from '../lib/format'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

const COLORS = ['#0b3b8f', '#2f6fed', '#d4202a', '#ef3e48', '#f0a500', '#22b8a6', '#7c5cff', '#e06bd0']

export default function Accounts() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [edit, setEdit] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setLoading(true)
    const [acc, bal] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('account_balances').select('*'),
    ])
    setAccounts(acc.data || [])
    setBalances(bal.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household])

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
      <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(120deg, var(--blue-deep), #0a1530)' }}>
        <div className="stat-label" style={{ color: '#bcd3ff' }}>Patrimonio total (cuentas activas)</div>
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
              <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
              <div className="text-muted" style={{ fontSize: 12.5 }}>{accountTypeLabel(a.type)}{a.bank ? ` · ${a.bank}` : ''}</div>
              <div className="stat-value" style={{ fontSize: 24, marginTop: 12, color: balOf(a.id) < 0 ? '#ff8a8f' : 'var(--text)' }}>{money(balOf(a.id))}</div>
              {a.type === 'credit_card' && a.credit_limit ? (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>Límite: {money(a.credit_limit)}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {showForm && <AccountForm account={edit} household={household} user={user} onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  )
}

function AccountForm({ account, household, user, onClose, onSaved }) {
  const [name, setName] = useState(account?.name || '')
  const [type, setType] = useState(account?.type || 'cash')
  const [bank, setBank] = useState(account?.bank || '')
  const [opening, setOpening] = useState(account?.opening_balance ? String(account.opening_balance) : '')
  const [limit, setLimit] = useState(account?.credit_limit ? String(account.credit_limit) : '')
  const [color, setColor] = useState(account?.color || '#0b3b8f')
  const [exclude, setExclude] = useState(account?.exclude_from_total || false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setErr('Poné un nombre')
    setBusy(true)
    const icon = ACCOUNT_TYPES.find((t) => t.value === type)?.icon || 'wallet'
    const payload = {
      household_id: household.id, name: name.trim(), type, bank: bank || null,
      opening_balance: parseInt(String(opening).replace(/[^0-9-]/g, ''), 10) || 0,
      credit_limit: type === 'credit_card' ? (parseInt(String(limit).replace(/[^0-9]/g, ''), 10) || null) : null,
      color, icon, exclude_from_total: exclude, created_by: user.id,
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
          <div className="row wrap" style={{ gap: 8 }}>
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)}
                style={{ width: 30, height: 30, borderRadius: 8, background: c, border: color === c ? '2px solid #fff' : '2px solid transparent' }} />
            ))}
          </div>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 13.5, color: 'var(--text-2)', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} />
          No incluir en el patrimonio total
        </label>
        {err && <div style={{ color: '#ff9aa0', fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
