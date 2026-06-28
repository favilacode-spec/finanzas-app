import { useEffect, useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { todayISO } from '../lib/format'

export default function TransactionModal({ onClose, onSaved, edit, defaultAccount }) {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [type, setType] = useState(edit?.type || 'expense')
  const [amount, setAmount] = useState(edit?.amount ? String(edit.amount) : '')
  const [accountId, setAccountId] = useState(edit?.account_id || defaultAccount || '')
  const [toAccount, setToAccount] = useState(edit?.transfer_account_id || '')
  const [categoryId, setCategoryId] = useState(edit?.category_id || '')
  const [date, setDate] = useState(edit?.occurred_on || todayISO())
  const [payee, setPayee] = useState(edit?.payee || '')
  const [note, setNote] = useState(edit?.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!household) return
    supabase.from('accounts').select('*').eq('archived', false).order('name')
      .then(({ data }) => { setAccounts(data || []); if (!accountId && data?.[0]) setAccountId(data[0].id) })
    supabase.from('categories').select('*').order('name')
      .then(({ data }) => setCategories(data || []))
  }, [household])

  const cats = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'))

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    const amt = parseInt(String(amount).replace(/[^0-9]/g, ''), 10)
    if (!amt || amt <= 0) return setErr('Ingresá un monto válido')
    if (!accountId) return setErr('Elegí una cuenta')
    if (type === 'transfer' && (!toAccount || toAccount === accountId)) return setErr('Elegí una cuenta destino distinta')
    setBusy(true)
    const payload = {
      household_id: household.id,
      account_id: accountId,
      transfer_account_id: type === 'transfer' ? toAccount : null,
      type,
      amount: amt,
      currency: 'PYG',
      category_id: type === 'transfer' ? null : (categoryId || null),
      occurred_on: date,
      payee: payee || null,
      note: note || null,
      created_by: user.id,
    }
    let error
    if (edit) {
      ({ error } = await supabase.from('transactions').update(payload).eq('id', edit.id))
    } else {
      ({ error } = await supabase.from('transactions').insert(payload))
    }
    setBusy(false)
    if (error) return setErr(error.message)
    onSaved?.()
    onClose()
  }

  return (
    <Modal title={edit ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={onClose}>
      <form onSubmit={save}>
        <div className="segmented" style={{ marginBottom: 18 }}>
          <button type="button" className={type === 'income' ? 'active-blue' : ''} onClick={() => setType('income')}>Ingreso</button>
          <button type="button" className={type === 'expense' ? 'active-red' : ''} onClick={() => setType('expense')}>Gasto</button>
          <button type="button" className={type === 'transfer' ? 'active-gray' : ''} onClick={() => setType('transfer')}>Transfer.</button>
        </div>

        <div className="field">
          <label>Monto (₲)</label>
          <input className="form-input" inputMode="numeric" value={amount}
            onChange={(e) => setAmount(e.target.value)} placeholder="150.000" autoFocus style={{ fontSize: 22, fontWeight: 700 }} />
        </div>

        <div className="field">
          <label>{type === 'transfer' ? 'Desde la cuenta' : 'Cuenta'}</label>
          <select className="form-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {type === 'transfer' && (
          <div className="field">
            <label>Hacia la cuenta</label>
            <select className="form-select" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
              <option value="">Elegir…</option>
              {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {type !== 'transfer' && (
          <div className="field">
            <label>Categoría</label>
            <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sin categoría</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field">
            <label>Fecha</label>
            <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{type === 'income' ? 'Origen' : 'Comercio'}</label>
            <input className="form-input" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <div className="field">
          <label>Nota</label>
          <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </div>

        {err && <div style={{ color: '#c9c9cf', fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
