import { useState } from 'react'
import { Search, Check } from 'lucide-react'
import { BANK_GROUPS, bankById } from '../lib/banks'
import BankBadge from './BankBadge'

// Selector visual de banco: buscás y tocás. Cada opción muestra su monograma.
export default function BankPicker({ value, onChange, label = 'Banco' }) {
  const [q, setQ] = useState('')
  const sel = bankById(value)
  const filtro = (b) => !q || norm(b.name + b.short).includes(norm(q))

  return (
    <div className="field">
      <label>{label}</label>

      {sel && (
        <div className="row between" style={{
          gap: 10, padding: '9px 12px', marginBottom: 10,
          border: '1px solid var(--border-2)', borderRadius: 12, background: 'var(--bg-elevated)',
        }}>
          <span className="row" style={{ gap: 10 }}>
            <BankBadge bankId={sel.id} size="sm" />
            <b style={{ fontSize: 14 }}>{sel.name}</b>
          </span>
          <button type="button" className="btn-ghost" style={{ fontSize: 12.5, padding: 0 }} onClick={() => onChange('')}>
            Cambiar
          </button>
        </div>
      )}

      {!sel && (
        <>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscá tu banco: Itaú, Basa, Familiar…" style={{ paddingLeft: 32 }}
            />
          </div>

          <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
            {BANK_GROUPS.map((g) => {
              const items = g.items.filter(filtro)
              if (!items.length) return null
              return (
                <div key={g.label}>
                  <div style={{
                    padding: '7px 12px', fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em',
                    color: 'var(--text-muted)', background: 'var(--bg-base)', position: 'sticky', top: 0,
                  }}>
                    {g.label.toUpperCase()}
                  </div>
                  {items.map((b) => (
                    <button
                      key={b.id} type="button" onClick={() => { onChange(b.id); setQ('') }}
                      className="row between"
                      style={{
                        width: '100%', gap: 10, padding: '9px 12px', background: 'none',
                        border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <span className="row" style={{ gap: 10 }}>
                        <BankBadge bankId={b.id} size="sm" />
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{b.name}</span>
                      </span>
                      {value === b.id && <Check size={15} />}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
