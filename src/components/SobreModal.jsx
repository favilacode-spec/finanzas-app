import { useEffect, useState } from 'react'
import Modal from './Modal'
import MoneyInput from './MoneyInput'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import { todayLocal } from '../lib/dates'
import { notifyChange } from '../lib/events'
import { loadSobres, moverSobre } from '../lib/sobres'

// Poner o sacar plata de un sobre (meta o proyecto vinculado a una cuenta).
// sobre: { kind, id, name, accountId } · mode: 'add' | 'remove'
export default function SobreModal({ sobre, mode, onClose, onDone }) {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [info, setInfo] = useState(null) // { balance, libre, saldo, otros }
  const [amount, setAmount] = useState(0)
  const [via, setVia] = useState('libre')
  const [date, setDate] = useState(todayLocal())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const add = mode !== 'remove'

  useEffect(() => {
    (async () => {
      const [acc, bal, s] = await Promise.all([
        supabase.from('accounts').select('id,name').eq('archived', false).order('sort').order('name'),
        supabase.from('account_balances').select('*').eq('account_id', sobre.accountId).maybeSingle(),
        loadSobres(),
      ])
      const balance = Number(bal.data?.balance || 0)
      setAccounts((acc.data || []).filter((a) => a.id !== sobre.accountId))
      setInfo({
        balance,
        libre: balance - s.asignado(sobre.accountId),
        saldo: s.saldo(sobre.kind, sobre.id),
        otros: s.deCuenta(sobre.accountId).filter((x) => !(x.kind === sobre.kind && x.id === sobre.id)),
      })
    })()
  }, [sobre.accountId, sobre.kind, sobre.id])

  const cuenta = sobre.accountName || 'la cuenta'

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    const amt = Math.round(Number(amount) || 0)
    if (!amt || amt <= 0) return setErr('Ingresá un monto')
    if (!add && info && amt > info.saldo) return setErr(`Este sobre tiene ${money(info.saldo)}`)
    if (add && via === 'libre' && info && amt > info.libre) return setErr(`En ${cuenta} hay ${money(Math.max(0, info.libre))} sin asignar. Elegí otra cuenta para traer la plata.`)
    setBusy(true)
    let txId = null
    const base = { householdId: household.id, userId: user.id, date, note }
    if (via.startsWith('acc:')) {
      // mover plata de verdad entre cuentas
      const other = via.slice(4)
      const { data, error } = await supabase.from('transactions').insert({
        household_id: household.id, type: 'transfer', amount: amt, currency: 'PYG', occurred_on: date,
        account_id: add ? other : sobre.accountId, transfer_account_id: add ? sobre.accountId : other,
        payee: `${add ? 'Aporte a' : 'Retiro de'} ${sobre.name}`, note: note || null, created_by: user.id, source: 'manual',
      }).select('id').single()
      if (error) { setBusy(false); return setErr(error.message) }
      txId = data.id
    }
    if (via.startsWith('sob:')) {
      const dest = info.otros.find((x) => x.key === via.slice(4))
      await moverSobre({ ...base, sobre, amount: -amt, kind: 'mover', note: note || `A ${dest.name}` })
      await moverSobre({ ...base, sobre: dest, amount: amt, kind: 'mover', note: note || `Desde ${sobre.name}` })
    } else {
      const { error } = await moverSobre({ ...base, sobre, amount: add ? amt : -amt, transactionId: txId })
      if (error) { setBusy(false); return setErr(error.message) }
    }
    setBusy(false); notifyChange(); onDone?.(); onClose()
  }

  return (
    <Modal title={add ? `Poner plata en "${sobre.name}"` : `Sacar plata de "${sobre.name}"`} onClose={onClose}>
      <form onSubmit={save}>
        {info && (
          <div className="card" style={{ background: 'var(--bg-elevated)', padding: 12, marginBottom: 14, fontSize: 13 }}>
            <div className="row between"><span className="text-2">En este sobre</span><strong>{money(info.saldo)}</strong></div>
            <div className="row between" style={{ marginTop: 4 }}><span className="text-2">Sin asignar en {cuenta}</span><span>{money(info.libre)}</span></div>
          </div>
        )}
        <div className="field"><label>Monto</label><MoneyInput value={amount} onChange={setAmount} big autoFocus /></div>
        <div className="field">
          <label>{add ? '¿De dónde sale la plata?' : '¿A dónde va la plata?'}</label>
          <select className="form-select" value={via} onChange={(e) => setVia(e.target.value)}>
            <option value="libre">{add ? 'De lo sin asignar (ya está en la cuenta)' : 'Queda en la cuenta, sin asignar'}</option>
            {!add && info?.otros.map((x) => <option key={x.key} value={'sob:' + x.key}>Pasarla al sobre: {x.name}</option>)}
            {accounts.map((a) => <option key={a.id} value={'acc:' + a.id}>{add ? `La transfiero desde ${a.name}` : `La transfiero a ${a.name}`}</option>)}
          </select>
          <div className="text-muted" style={{ fontSize: 11.5, marginTop: 5 }}>
            {via.startsWith('acc:') ? 'Se registra la transferencia entre cuentas y se anota en este sobre.' : via.startsWith('sob:') ? 'La plata no se mueve de cuenta, solo cambia de sobre.' : 'No se mueve plata entre cuentas, solo se asigna.'}
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label>Fecha</label><input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label>Nota</label><input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" /></div>
        </div>
        {err && <div className="text-red" style={{ fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !info}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Modal>
  )
}
