import { useEffect, useState } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money, ACCOUNT_TYPES, accountTypeLabel, EARNING_TYPES, pct, interestFor, nextInterestDate, daysBetween } from '../lib/format'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import LabelChip from '../components/LabelChip'
import Tile from '../components/Tile'
import TransactionModal from '../components/TransactionModal'
import { useOnChange } from '../lib/events'
import { todayLocal, addDays, shortDate, cardDueDate, cardCycleStart, dueLabel } from '../lib/dates'

const COLORS = ['#0b3b8f', '#2f6fed', '#d4202a', '#ef3e48', '#f0a500', '#22b8a6', '#7c5cff', '#e06bd0']

export default function Accounts() {
  const { household, user } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState([])
  const [labels, setLabels] = useState([])
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [edit, setEdit] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [detail, setDetail] = useState(null)
  const [pay, setPay] = useState(null)

  const load = async () => {
    const since = addDays(todayLocal(), -70)
    const [acc, bal, lab, tx] = await Promise.all([
      supabase.from('accounts').select('*').order('sort').order('created_at'),
      supabase.from('account_balances').select('*'),
      supabase.from('account_labels').select('*').order('name'),
      supabase.from('transactions').select('*').gte('occurred_on', since).order('occurred_on', { ascending: false }),
    ])
    setAccounts(acc.data || []); setBalances(bal.data || []); setLabels(lab.data || []); setTxns(tx.data || [])
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  const labelOf = (id) => labels.find((l) => l.id === id)
  const balOf = (id) => Number(balances.find((b) => b.account_id === id)?.balance || 0)
  const visible = accounts.filter((a) => showArchived ? a.archived : !a.archived)
  const active = accounts.filter((a) => !a.archived && !a.exclude_from_total)
  const total = active.reduce((s, a) => s + balOf(a.id), 0)
  const debt = active.reduce((s, a) => s + Math.min(0, balOf(a.id)), 0)

  // grupos: nombre de grupo propio, o por tipo
  const groupName = (a) => a.group_name || (a.type === 'credit_card' ? 'Tarjetas de crédito' : a.type === 'savings' ? 'Ahorros' : a.type === 'investment' ? 'Inversiones' : a.type === 'loan' ? 'Préstamos' : a.type === 'cash' ? 'Efectivo' : 'Bancos y billeteras')
  const groups = []
  visible.forEach((a) => { const g = groupName(a); let x = groups.find((y) => y.name === g); if (!x) { x = { name: g, list: [] }; groups.push(x) } x.list.push(a) })

  const move = async (a, dir, list) => {
    const i = list.findIndex((x) => x.id === a.id); const j = i + dir
    if (j < 0 || j >= list.length) return
    const b = list[j]
    await Promise.all([
      supabase.from('accounts').update({ sort: j }).eq('id', a.id),
      supabase.from('accounts').update({ sort: i }).eq('id', b.id),
    ])
    load()
  }
  const toggleArchive = async (a) => { await supabase.from('accounts').update({ archived: !a.archived }).eq('id', a.id); setDetail(null); load() }

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>
  const openAcc = detail && accounts.find((a) => a.id === detail)

  return (
    <div className="stack">
      <div className="card card-hero">
        <div className="stat-label">Saldo total de tus cuentas</div>
        <div className="amount-big" style={{ fontSize: 32, color: total < 0 ? 'var(--red)' : 'var(--accent)' }}>{money(total)}</div>
        {debt < 0 && <div className="text-muted" style={{ fontSize: 12.5 }}>incluye {money(debt)} de tarjetas</div>}
      </div>

      <div className="row between wrap">
        <button className="btn btn-ghost btn-sm" onClick={() => setShowArchived((s) => !s)}>{showArchived ? 'Ver activas' : 'Ver archivadas'}</button>
        <button className="btn btn-primary" onClick={() => { setEdit(null); setShowForm(true) }}><Plus size={17} /> Nueva cuenta</button>
      </div>

      {visible.length === 0 ? (
        <div className="card empty-state"><Icon name="wallet" size={40} /><p>{showArchived ? 'No hay cuentas archivadas.' : 'Creá tu primera cuenta para empezar.'}</p></div>
      ) : groups.map((g) => (
        <div key={g.name}>
          <div className="section-label row between"><span>{g.name}</span><span>{money(g.list.reduce((s, a) => s + balOf(a.id), 0))}</span></div>
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            <div className="list">
              {g.list.map((a) => {
                const b = balOf(a.id)
                const card = a.type === 'credit_card'
                return (
                  <div className="list-row clickable" key={a.id} onClick={() => setDetail(a.id)}>
                    <Tile icon={a.icon || 'wallet'} color={a.color || '#5eead4'} />
                    <div className="list-main">
                      <div className="list-title row" style={{ gap: 7 }}>{a.name}{labelOf(a.label_id) && <LabelChip label={labelOf(a.label_id)} size="sm" />}</div>
                      <div className="list-sub">
                        {card ? `${a.credit_limit ? 'Disponible ' + money(Number(a.credit_limit) + b) : 'Tarjeta'}${a.due_day ? ' · vence ' + shortDate(cardDueDate(a.due_day)) : ''}` : `${accountTypeLabel(a.type)}${a.bank ? ' · ' + a.bank : ''}`}
                        {Number(a.interest_rate) > 0 ? ` · rinde ${pct(a.interest_rate)}% anual` : ''}
                        {a.exclude_from_total ? ' · fuera del total' : ''}
                      </div>
                    </div>
                    <span className={`list-amount ${b < 0 ? 'amount-neg' : ''}`}>{money(b)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}

      {openAcc && (
        <AccountDetail a={openAcc} bal={balOf(openAcc.id)} txns={txns} accounts={accounts}
          onClose={() => setDetail(null)} onEdit={() => { setEdit(openAcc); setShowForm(true); setDetail(null) }}
          onArchive={() => toggleArchive(openAcc)} onPay={() => { setPay(openAcc); setDetail(null) }}
          onMove={(dir) => move(openAcc, dir, accounts.filter((x) => !x.archived && groupName(x) === groupName(openAcc)))} />
      )}
      {showForm && <AccountForm account={edit} household={household} user={user} labels={labels} onClose={() => setShowForm(false)} onSaved={load} />}
      {pay && <TransactionModal prefill={{ type: 'transfer', amount: Math.max(0, -balOf(pay.id)), toAccount: pay.id, accountId: accounts.find((x) => x.type !== 'credit_card' && !x.archived)?.id, payee: `Pago tarjeta ${pay.name}` }} onClose={() => setPay(null)} onSaved={load} />}
    </div>
  )
}

function AccountDetail({ a, bal, txns, accounts, onClose, onEdit, onArchive, onPay, onMove }) {
  const card = a.type === 'credit_card'
  const mine = txns.filter((t) => t.account_id === a.id || t.transfer_account_id === a.id)
  const cycleStart = card && a.statement_day ? cardCycleStart(a.statement_day) : null
  const cycleTx = cycleStart ? mine.filter((t) => t.occurred_on >= cycleStart && t.account_id === a.id && t.type === 'expense') : []
  const cycleSpent = cycleTx.reduce((s, t) => s + Number(t.amount), 0)
  const payments = mine.filter((t) => t.type === 'transfer' && t.transfer_account_id === a.id)
  const accName = (id) => accounts.find((x) => x.id === id)?.name || ''
  const used = card && a.credit_limit ? Math.min(100, (Math.max(0, -bal) / Number(a.credit_limit)) * 100) : 0

  return (
    <Modal title={a.name} onClose={onClose}>
      <div className="row" style={{ gap: 14, marginBottom: 14 }}>
        <Tile icon={a.icon || 'wallet'} color={a.color || '#5eead4'} size="lg" />
        <div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>{card ? 'Deuda actual' : 'Saldo'}</div>
          <div className="amount-big" style={{ fontSize: 28, color: bal < 0 ? 'var(--red)' : undefined }}>{money(bal)}</div>
        </div>
      </div>

      {card && (
        <div className="card" style={{ background: 'var(--bg-elevated)', padding: 14, marginBottom: 14 }}>
          {a.credit_limit ? (
            <>
              <div className="row between" style={{ fontSize: 13 }}><span className="text-2">Usado {used.toFixed(0)}%</span><span>Límite {money(a.credit_limit)}</span></div>
              <div className="progress" style={{ margin: '8px 0 10px' }}><span style={{ width: used + '%', background: used > 80 ? 'var(--red)' : a.color || 'var(--accent)' }} /></div>
              <div className="row between"><span className="text-2">Disponible</span><strong className="text-accent">{money(Number(a.credit_limit) + bal)}</strong></div>
            </>
          ) : <div className="text-muted" style={{ fontSize: 13 }}>Cargá el límite editando la tarjeta.</div>}
          {cycleStart && <div className="row between" style={{ marginTop: 8 }}><span className="text-2">Ciclo actual (desde {shortDate(cycleStart)})</span><strong>{money(cycleSpent)}</strong></div>}
          {a.statement_day && <div className="row between" style={{ marginTop: 8 }}><span className="text-2">Cierre</span><span>día {a.statement_day}</span></div>}
          {a.due_day ? <div className="row between" style={{ marginTop: 8 }}><span className="text-2">Próximo vencimiento</span><span>{shortDate(cardDueDate(a.due_day))} · {dueLabel(cardDueDate(a.due_day))}</span></div>
            : <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Poné el día de vencimiento para que aparezca en Pagos y en tu calendario.</div>}
        </div>
      )}
      {Number(a.interest_rate) > 0 && <InterestCard a={a} bal={bal} txns={mine} />}
      {card && <button className="btn btn-primary btn-block" style={{ marginBottom: 14 }} onClick={onPay}><Icon name="credit-card" size={16} /> Pagar tarjeta</button>}

      <div className="section-label" style={{ marginTop: 0 }}>{card && cycleStart ? 'Compras del ciclo' : 'Últimos movimientos'}</div>
      <div className="list" style={{ marginBottom: 14 }}>
        {(card && cycleStart ? cycleTx : mine).slice(0, 12).map((t) => {
          const incoming = t.type === 'income' || (t.type === 'transfer' && t.transfer_account_id === a.id)
          return (
            <div className="list-row" key={t.id} style={{ minHeight: 46 }}>
              <div className="list-main"><div className="list-title" style={{ fontSize: 14 }}>{t.payee || (t.type === 'transfer' ? (incoming ? `Desde ${accName(t.account_id)}` : `Hacia ${accName(t.transfer_account_id)}`) : 'Movimiento')}</div><div className="list-sub">{shortDate(t.occurred_on)}</div></div>
              <span className={`list-amount ${incoming ? 'amount-pos' : 'amount-neg'}`}>{incoming ? '+' : '−'}{money(t.amount)}</span>
            </div>
          )
        })}
        {!mine.length && <div className="text-muted" style={{ fontSize: 13 }}>Sin movimientos recientes.</div>}
      </div>
      {card && payments.length > 0 && <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Último pago: {money(payments[0].amount)} el {shortDate(payments[0].occurred_on)}</div>}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onEdit}><Pencil size={14} /> Editar</button>
        <button className="icon-btn" onClick={() => onMove(-1)} title="Subir"><ArrowUp size={15} /></button>
        <button className="icon-btn" onClick={() => onMove(1)} title="Bajar"><ArrowDown size={15} /></button>
        <button className="btn btn-secondary btn-sm" onClick={onArchive}>{a.archived ? <><ArchiveRestore size={14} /> Restaurar</> : <><Archive size={14} /> Archivar</>}</button>
      </div>
    </Modal>
  )
}

function InterestCard({ a, bal, txns }) {
  const today = todayLocal()
  const next = nextInterestDate(a.interest_since || today, a.interest_day)
  const days = next ? daysBetween(a.interest_since || today, next) : 0
  const est = interestFor(bal, a.interest_rate, days)
  const monthly = interestFor(bal, a.interest_rate, 365 / 12)
  const year = interestFor(bal, a.interest_rate, 365)
  const earned = txns.filter((t) => t.source === 'interest' && t.account_id === a.id)
  return (
    <div className="card" style={{ background: 'var(--bg-elevated)', padding: 14, marginBottom: 14 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="row" style={{ gap: 6, fontWeight: 600 }}><Icon name="trending-up" size={16} /> Rinde {pct(a.interest_rate)}% anual</span>
        <span className="text-muted" style={{ fontSize: 12.5 }}>se acredita el día {a.interest_day}</span>
      </div>
      {next && <div className="row between" style={{ fontSize: 13.5 }}><span className="text-2">Próximo ({shortDate(next)}, {days} días)</span><strong className="text-accent">+{money(est)}</strong></div>}
      <div className="row between" style={{ fontSize: 13.5, marginTop: 6 }}><span className="text-2">Por mes, aprox.</span><span>+{money(monthly)}</span></div>
      <div className="row between" style={{ fontSize: 13.5, marginTop: 6 }}><span className="text-2">En un año, sin tocarlo</span><span>{money(bal + year)}</span></div>
      {earned.length > 0 && <div className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Último rendimiento: +{money(earned[0].amount)} el {shortDate(earned[0].occurred_on)}</div>}
      <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Se suma solo como ingreso a esta cuenta. Si el extracto del fondo dice otro monto, editá ese movimiento.</div>
    </div>
  )
}

function AccountForm({ account, household, user, labels: initialLabels = [], onClose, onSaved }) {
  const [name, setName] = useState(account?.name || '')
  const [type, setType] = useState(account?.type || 'cash')
  const [bank, setBank] = useState(account?.bank || '')
  const [opening, setOpening] = useState(account?.opening_balance ? String(account.opening_balance) : '')
  const [limit, setLimit] = useState(account?.credit_limit ? String(account.credit_limit) : '')
  const [statementDay, setStatementDay] = useState(account?.statement_day || '')
  const [dueDay, setDueDay] = useState(account?.due_day || '')
  const [group, setGroup] = useState(account?.group_name || '')
  const [earns, setEarns] = useState(Number(account?.interest_rate) > 0)
  const [rate, setRate] = useState(account?.interest_rate ? pct(account.interest_rate) : '')
  const [interestDay, setInterestDay] = useState(account?.interest_day || '')
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
      statement_day: type === 'credit_card' ? (parseInt(statementDay, 10) || null) : null,
      due_day: type === 'credit_card' ? (parseInt(dueDay, 10) || null) : null,
      group_name: group.trim() || null,
    }
    const r = parseFloat(String(rate).replace(',', '.'))
    const canEarn = EARNING_TYPES.includes(type) && earns
    if (canEarn && !(r > 0)) { setBusy(false); return setErr('Poné la tasa anual, ej: 6,5') }
    payload.interest_rate = canEarn ? r : null
    payload.interest_day = canEarn ? (Math.min(31, parseInt(interestDay, 10)) || null) : null
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
        {type === 'credit_card' && (
          <div className="grid grid-2" style={{ gap: 12 }}>
            <div className="field"><label>Día de cierre</label><input className="form-input" inputMode="numeric" value={statementDay} onChange={(e) => setStatementDay(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="Ej: 20" /></div>
            <div className="field"><label>Día de vencimiento</label><input className="form-input" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="Ej: 5" /></div>
          </div>
        )}
        {type === 'credit_card' && <p className="text-muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>Si la tarjeta tiene deuda, el vencimiento aparece en Pagos, en el calendario y te aviso 2 días antes. El saldo inicial es lo que debés hoy, en negativo (ej: -1500000).</p>}
        {EARNING_TYPES.includes(type) && (
          <div className="card" style={{ background: 'var(--bg-elevated)', padding: 12, marginBottom: 12 }}>
            <label className="row" style={{ gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={earns} onChange={(e) => setEarns(e.target.checked)} />
              Genera rendimiento (fondo mutuo, ahorro con interés)
            </label>
            {earns && (<>
              <div className="grid grid-2" style={{ gap: 12, marginTop: 10 }}>
                <div className="field" style={{ marginBottom: 0 }}><label>Tasa anual (%)</label><input className="form-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Ej: 6,5" /></div>
                <div className="field" style={{ marginBottom: 0 }}><label>Día que se acredita</label><input className="form-input" inputMode="numeric" value={interestDay} onChange={(e) => setInterestDay(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder={'Ej: ' + new Date().getDate()} /></div>
              </div>
              {(() => {
                const r = parseFloat(String(rate).replace(',', '.'))
                const b = parseInt(String(opening).replace(/[^0-9-]/g, ''), 10) || 0
                return r > 0 && b > 0 ? <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Con {money(b)} serían unos <strong className="text-accent">+{money(interestFor(b, r, 365 / 12))}</strong> por mes. Cada mes se suma solo como ingreso y el siguiente se calcula sobre el saldo nuevo.</p>
                  : <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Cada mes se suma solo el rendimiento como ingreso a esta cuenta.</p>
              })()}
            </>)}
          </div>
        )}
        <div className="field"><label>Grupo (opcional)</label><input className="form-input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Ej: Negocio, Personal, Bia" /></div>
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
