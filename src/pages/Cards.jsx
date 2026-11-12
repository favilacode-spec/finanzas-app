import { useEffect, useState } from 'react'
import {
  CreditCard, Plus, Gift, Store, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronRight, Calendar, Receipt,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { money } from '../lib/format'
import CreditCardArt from '../components/CreditCardArt'
import StatRow from '../components/StatRow'
import Modal from '../components/Modal'
import { useOnChange, notifyChange } from '../lib/events'

export default function Cards() {
  const { household } = useAuth()
  const [cards, setCards] = useState([])
  const [planes, setPlanes] = useState([])
  const [promos, setPromos] = useState([])
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)      // tarjeta abierta
  const [verPromo, setVerPromo] = useState(null)
  const [pagar, setPagar] = useState(null)
  const [cuentasPago, setCuentasPago] = useState([])

  const load = async () => {
    const mesIni = new Date(); mesIni.setDate(1)
    const desde = mesIni.toISOString().slice(0, 10)
    const [acc, bal, cu, pr, tx, otras] = await Promise.all([
      supabase.from('accounts').select('*').eq('archived', false).eq('type', 'credit_card').order('sort'),
      supabase.from('account_balances').select('*'),
      supabase.from('installment_plans').select('*').eq('closed', false).order('first_date'),
      supabase.from('card_promos').select('*').order('applies', { ascending: false }).order('discount_pct', { ascending: false }),
      supabase.from('transactions').select('*').gte('occurred_on', desde).eq('type', 'expense'),
      supabase.from('accounts').select('id,name,type').eq('archived', false).neq('type', 'credit_card').order('sort'),
    ])
    const balances = bal.data || []
    const lista = (acc.data || []).map((c) => ({
      ...c,
      usado: Math.abs(Math.min(0, Number(balances.find((b) => b.account_id === c.id)?.balance || 0))),
    }))
    setCards(lista)
    setPlanes(cu.data || [])
    setPromos(pr.data || [])
    setGastos(tx.data || [])
    setCuentasPago(otras.data || [])
    if (!sel && lista.length) setSel(lista[0].id)
    setLoading(false)
  }
  useEffect(() => { if (household) load() }, [household]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnChange(load)

  if (loading) return <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>

  if (!cards.length) {
    return (
      <div className="card empty-state" style={{ padding: 40 }}>
        <CreditCard size={40} />
        <p>Todavía no tenés tarjetas de crédito.</p>
        <p className="text-muted" style={{ fontSize: 13 }}>
          Creá una cuenta de tipo <b>Tarjeta de crédito</b> en Cuentas y aparece acá con sus cuotas y reintegros.
        </p>
      </div>
    )
  }

  const card = cards.find((c) => c.id === sel) || cards[0]
  const misPlanes = planes.filter((p) => p.account_id === card.id)
  const cuotaMes = misPlanes.reduce((t, p) => t + Math.round(Number(p.total_amount) / (p.months || 1)), 0)
  const futuro = misPlanes.reduce((t, p) => {
    const c = Math.round(Number(p.total_amount) / (p.months || 1))
    return t + c * Math.max(0, p.months - p.paid_months - 1)
  }, 0)
  const esteMes = Math.max(0, card.usado - futuro)
  const lim = Number(card.credit_limit || 0)

  // Promos del banco de esta tarjeta
  const misPromos = promos.filter((p) => !p.bank_id || p.bank_id === card.bank_id)
  const activas = misPromos.filter((p) => p.applies)
  const dudosas = misPromos.filter((p) => !p.applies)

  // Cuánto gasté este mes en cada promo (para saber cuánto me queda de tope)
  const usoDe = (promo) => {
    const nombres = (promo.merchants || []).map(norm)
    const usados = gastos.filter((g) => g.account_id === card.id && g.payee && nombres.some((n) => norm(g.payee).includes(n) || n.includes(norm(g.payee))))
    const total = usados.reduce((t, g) => t + Number(g.amount), 0)
    return { total, compras: usados.length, reintegro: Math.round(total * Number(promo.discount_pct || 0) / 100) }
  }

  const totalReintegro = activas.reduce((t, p) => {
    const u = usoDe(p)
    const base = Math.min(u.total, Number(p.cap_amount || u.total))
    return t + Math.round(base * Number(p.discount_pct || 0) / 100)
  }, 0)

  // Agrupar promos por categoría
  const porCategoria = {}
  for (const p of activas) {
    const k = p.category || 'OTROS'
    ;(porCategoria[k] = porCategoria[k] || []).push(p)
  }

  return (
    <div>
      {/* Selector si hay varias */}
      {cards.length > 1 && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
          {cards.map((c) => (
            <button key={c.id} type="button" onClick={() => setSel(c.id)}
              className="badge" style={{
                cursor: 'pointer', padding: '7px 13px', fontSize: 13,
                background: sel === c.id ? '#ededf2' : 'var(--bg-elevated)',
                color: sel === c.id ? '#0c0c0f' : 'var(--text-2)',
                borderColor: sel === c.id ? '#ededf2' : 'var(--border)',
              }}>{c.name}</button>
          ))}
        </div>
      )}

      <div className="grid grid-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <CreditCardArt
          name={card.name} bankId={card.bank_id} network={card.card_network}
          color={card.color} limit={card.credit_limit} used={card.usado}
          dueDay={card.due_day} closeDay={card.statement_day} currency={card.currency}
          enCuotas={futuro} cuotasActivas={misPlanes.length}
        />
        <div>
          <button className="btn btn-primary btn-block" style={{ marginBottom: 12 }}
            onClick={() => setPagar({ card, esteMes, planes: misPlanes })}>
            <CheckCircle2 size={17} /> Pagar tarjeta
          </button>
          <StatRow items={[
            { label: 'A pagar este mes', value: esteMes, color: '#ef3e48', valueColor: '#ef3e48', icon: Calendar },
            { label: 'En cuotas', value: futuro, color: '#7c5cff', icon: Receipt,
              hint: misPlanes.length ? `${misPlanes.length} compra${misPlanes.length === 1 ? '' : 's'}` : 'Sin cuotas' },
            { label: 'Cupo disponible', value: Math.max(0, lim - card.usado), color: '#34d399',
              hint: lim ? `de ${money(lim)}` : 'Sin límite' },
            { label: 'Reintegros del mes', value: totalReintegro, color: '#f0a500', valueColor: '#f0a500', icon: Gift,
              hint: `${activas.length} promo${activas.length === 1 ? '' : 's'} activa${activas.length === 1 ? '' : 's'}` },
          ]} />
        </div>
      </div>

      {/* Cuotas de esta tarjeta */}
      <div className="section-head">
        <Receipt size={16} /><h2>Compras en cuotas</h2><span className="line" />
        {cuotaMes > 0 && <span className="text-2" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{money(cuotaMes)} por mes</span>}
      </div>
      {misPlanes.length === 0 ? (
        <div className="card empty-state" style={{ padding: 24, fontSize: 13, marginBottom: 16 }}>
          Cuando cargues un gasto con esta tarjeta vas a poder marcar en cuántas cuotas lo hiciste.
        </div>
      ) : (
        <div className="card card-pad-0" style={{ marginBottom: 16 }}>
          {misPlanes.map((p, i) => {
            const cuota = Math.round(Number(p.total_amount) / (p.months || 1))
            const restan = Math.max(0, p.months - p.paid_months)
            const pct = p.months ? (p.paid_months / p.months) * 100 : 0
            return (
              <div key={p.id} style={{ padding: '12px 18px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <div className="row between" style={{ gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.merchant}</div>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {money(cuota)} × {p.months} · pagaste {p.paid_months} de {p.months}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700 }}>{money(cuota * restan)}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{restan} {restan === 1 ? 'cuota' : 'cuotas'}</div>
                  </div>
                </div>
                <div className="progress" style={{ marginTop: 8 }}>
                  <span style={{ width: pct + '%', background: '#7c5cff' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Reintegros por categoría */}
      <div className="section-head">
        <Gift size={16} /><h2>Reintegros de este mes</h2><span className="line" />
        <span className="text-muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
          {card.card_tier ? card.card_tier.toUpperCase() : 'tu tarjeta'}
        </span>
      </div>

      {activas.length === 0 && dudosas.length === 0 ? (
        <div className="card empty-state" style={{ padding: 24, fontSize: 13 }}>
          Todavía no cargamos promociones para este banco.
        </div>
      ) : (
        <>
          {Object.entries(porCategoria).map(([cat, lista]) => (
            <div key={cat} className="card card-pad-0" style={{ marginBottom: 12 }}>
              <div style={{ padding: '12px 18px' }} className="row between">
                <div className="row" style={{ gap: 8 }}>
                  <Store size={14} style={{ color: '#f0a500' }} />
                  <b style={{ fontSize: 13.5 }}>{cat}</b>
                </div>
                <span className="badge" style={{ background: '#f0a50022', color: '#f0a500', borderColor: '#f0a50055' }}>
                  {lista[0].discount_pct}% de reintegro
                </span>
              </div>
              {lista.map((p) => {
                const u = usoDe(p)
                const tope = Number(p.cap_amount || 0)
                const usoPct = tope ? Math.min(100, (u.total / tope) * 100) : 0
                return (
                  <div key={p.id} style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                    <div className="row between wrap" style={{ gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{p.title}</div>
                        <div className="text-muted" style={{ fontSize: 11.5 }}>
                          {p.days}{p.valid_to ? ` · hasta ${new Date(p.valid_to).toLocaleDateString('es', { day: 'numeric', month: 'short' })}` : ''}
                          {p.merchants?.length ? ` · ${p.merchants.length} locales` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#f0a500' }}>{money(u.reintegro)}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>ganado este mes</div>
                      </div>
                    </div>

                    {tope > 0 && (
                      <>
                        <div className="progress" style={{ marginTop: 8 }}>
                          <span style={{ width: usoPct + '%', background: usoPct > 90 ? '#ef3e48' : '#f0a500' }} />
                        </div>
                        <div className="row between" style={{ marginTop: 6, fontSize: 11.5 }}>
                          <span className="text-2">Gastaste {money(u.total)} de {money(tope)}</span>
                          <span className="text-muted">Te queda {money(Math.max(0, tope - u.total))}</span>
                        </div>
                      </>
                    )}

                    <button type="button" className="btn-ghost" style={{ fontSize: 12, padding: '6px 0', marginTop: 6 }}
                      onClick={() => setVerPromo(p)}>
                      <ChevronRight size={13} style={{ verticalAlign: -2 }} /> Ver los {p.merchants?.length || 0} locales y las condiciones
                    </button>
                  </div>
                )
              })}
            </div>
          ))}

          {dudosas.length > 0 && (
            <div className="card" style={{ borderColor: '#f0a50055' }}>
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={15} style={{ color: '#f0a500' }} />
                <b style={{ fontSize: 13.5 }}>Para confirmar con el banco</b>
              </div>
              {dudosas.map((p) => (
                <div key={p.id} style={{ marginTop: 10 }}>
                  <div className="row between">
                    <span style={{ fontWeight: 600 }}>{p.title}</span>
                    <span className="text-2">{p.discount_pct}% · tope {money(p.cap_amount)}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: 11.5, marginTop: 3 }}>{p.exclusions}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {verPromo && <DetallePromo promo={verPromo} onClose={() => setVerPromo(null)} />}
      {pagar && (
        <PagoTarjeta
          {...pagar} cuentas={cuentasPago} household={household}
          onClose={() => setPagar(null)} onSaved={load}
        />
      )}
    </div>
  )
}

function DetallePromo({ promo, onClose }) {
  return (
    <Modal title={promo.title} onClose={onClose}>
      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        <span className="badge" style={{ background: '#f0a50022', color: '#f0a500', borderColor: '#f0a50055' }}>
          {promo.discount_pct}% de reintegro
        </span>
        {promo.cap_amount ? <span className="badge">Tope {money(promo.cap_amount)}</span> : null}
        <span className="badge">{promo.days}</span>
      </div>

      {promo.cap_note && <p className="text-2" style={{ fontSize: 12.5, marginBottom: 12 }}>{promo.cap_note}.</p>}

      <div className="card-title" style={{ marginBottom: 8 }}>Locales adheridos ({promo.merchants?.length || 0})</div>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          {(promo.merchants || []).map((m) => (
            <span key={m} className="badge" style={{ fontSize: 11.5 }}>{m}</span>
          ))}
        </div>
      </div>

      {promo.exclusions && (
        <>
          <div className="card-title" style={{ marginTop: 14, marginBottom: 6 }}>Letra chica</div>
          <p className="text-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>{promo.exclusions}</p>
        </>
      )}

      {promo.source_url && (
        <a className="btn btn-secondary btn-block" style={{ marginTop: 14 }} href={promo.source_url} target="_blank" rel="noreferrer">
          Ver en la web del banco
        </a>
      )}
    </Modal>
  )
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

/* Pagar la tarjeta: todo el saldo, solo lo del mes, o el monto que quieras */
function PagoTarjeta({ card, esteMes, planes, cuentas, household, onClose, onSaved }) {
  const total = card.usado
  const [modo, setModo] = useState(esteMes > 0 && esteMes < total ? 'mes' : 'total')
  const [monto, setMonto] = useState(String(esteMes > 0 && esteMes < total ? esteMes : total))
  const [cuenta, setCuenta] = useState(cuentas[0]?.id || '')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [avanzar, setAvanzar] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const elegir = (m) => {
    setModo(m)
    if (m === 'total') setMonto(String(total))
    if (m === 'mes') setMonto(String(esteMes))
    if (m === 'otro') setMonto('')
  }

  const amt = parseInt(String(monto).replace(/[^0-9]/g, ''), 10) || 0

  const save = async (e) => {
    e.preventDefault()
    setErr('')
    if (amt <= 0) return setErr('Poné un monto')
    if (!cuenta) return setErr('Elegí de qué cuenta sale la plata')
    setBusy(true)
    // El pago es una transferencia: sale de la cuenta y entra a la tarjeta (baja la deuda)
    const { error } = await supabase.from('transactions').insert({
      household_id: household.id,
      account_id: cuenta,
      transfer_account_id: card.id,
      type: 'transfer',
      amount: amt, currency: 'PYG',
      occurred_on: fecha,
      payee: `Pago ${card.name}`,
      note: modo === 'total' ? 'Pago total' : modo === 'mes' ? 'Pago del mes' : 'Pago parcial',
    })
    if (error) { setBusy(false); return setErr(error.message) }

    // Si pagaste al menos la cuota del mes, avanzamos una cuota en cada plan
    const cuotaMes = planes.reduce((t, p) => t + Math.round(Number(p.total_amount) / (p.months || 1)), 0)
    if (avanzar && planes.length && amt >= cuotaMes) {
      for (const p of planes) {
        const nuevas = Math.min(p.months, (p.paid_months || 0) + 1)
        await supabase.from('installment_plans')
          .update({ paid_months: nuevas, closed: nuevas >= p.months })
          .eq('id', p.id)
      }
    }
    setBusy(false)
    notifyChange()
    onSaved(); onClose()
  }

  const cuotaMes = planes.reduce((t, p) => t + Math.round(Number(p.total_amount) / (p.months || 1)), 0)

  return (
    <Modal title={`Pagar ${card.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <div className="row between" style={{ marginBottom: 14, fontSize: 13 }}>
          <span className="text-2">Deuda total <b style={{ color: 'var(--text)' }}>{money(total)}</b></span>
          {esteMes > 0 && esteMes < total && (
            <span className="text-2">Vence este mes <b style={{ color: '#ef3e48' }}>{money(esteMes)}</b></span>
          )}
        </div>

        <div className="field">
          <label>¿Cuánto vas a pagar?</label>
          <div className="row wrap" style={{ gap: 7, marginBottom: 10 }}>
            {[
              { k: 'total', t: 'Todo', v: total },
              ...(esteMes > 0 && esteMes < total ? [{ k: 'mes', t: 'Solo este mes', v: esteMes }] : []),
              { k: 'otro', t: 'Otro monto', v: null },
            ].map((o) => (
              <button key={o.k} type="button" onClick={() => elegir(o.k)}
                className="badge" style={{
                  cursor: 'pointer', padding: '8px 13px', fontSize: 13,
                  background: modo === o.k ? '#ededf2' : 'var(--bg-elevated)',
                  color: modo === o.k ? '#0c0c0f' : 'var(--text-2)',
                  borderColor: modo === o.k ? '#ededf2' : 'var(--border)',
                }}>
                {o.t}{o.v != null ? ` · ${money(o.v)}` : ''}
              </button>
            ))}
          </div>
          <input className="form-input" inputMode="numeric" value={monto}
            onChange={(e) => { setMonto(e.target.value); setModo('otro') }}
            placeholder="0" autoFocus={modo === 'otro'}
            style={{ fontSize: 20, fontWeight: 700 }} />
          {amt > 0 && amt < total && (
            <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
              Te queda debiendo {money(total - amt)}
            </div>
          )}
        </div>

        <div className="field">
          <label>¿De qué cuenta sale?</label>
          <select className="form-select" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
            <option value="">Elegir…</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Fecha</label>
          <input className="form-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        {planes.length > 0 && amt >= cuotaMes && (
          <label className="row" style={{ gap: 9, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={avanzar} onChange={(e) => setAvanzar(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span style={{ fontSize: 13 }}>
              Avanzar una cuota en mis {planes.length} compra{planes.length === 1 ? '' : 's'} en cuotas
            </span>
          </label>
        )}

        {err && <div className="text-2" style={{ color: '#ef3e48', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Registrando…' : `Pagar ${money(amt)}`}
        </button>
      </form>
    </Modal>
  )
}
