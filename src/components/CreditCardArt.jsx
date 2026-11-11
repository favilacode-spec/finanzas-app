import { bankById, redById, guessBank } from '../lib/banks'
import { money } from '../lib/format'
import { oscurecer, aclarar, contraste, hexA } from './BankBadge'

/**
 * Tarjeta de crédito visual. Diseño propio: gradiente del color del banco,
 * chip dibujado, brillo diagonal y datos del cupo. No usa logos de terceros.
 */
export default function CreditCardArt({
  name, bankId, network, color, limit = 0, used = 0,
  dueDay, closeDay, currency = 'PYG', onClick, compact = false,
}) {
  const b = bankById(bankId) || guessBank(name)
  const base = color || b?.color || '#2f3540'
  const red = redById(network)
  const txt = contraste(base)
  const lim = Number(limit || 0)
  const usado = Math.max(0, Number(used || 0))
  const disp = Math.max(0, lim - usado)
  const pct = lim > 0 ? Math.min(100, (usado / lim) * 100) : 0
  const alerta = pct > 85 ? '#ff6b6b' : pct > 60 ? '#ffd166' : txt

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        position: 'relative', overflow: 'hidden',
        borderRadius: 18, padding: compact ? 14 : 18,
        minHeight: compact ? 120 : 172,
        background: `linear-gradient(135deg, ${aclarar(base, 12)} 0%, ${base} 45%, ${oscurecer(base, 42)} 100%)`,
        color: txt,
        boxShadow: `0 10px 30px ${hexA(base, 0.3)}, inset 0 1px 0 rgba(255,255,255,.16)`,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      {/* Brillo diagonal */}
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(115deg, rgba(255,255,255,.20) 0%, rgba(255,255,255,0) 42%)',
        pointerEvents: 'none',
      }} />
      {/* Círculo decorativo */}
      <span aria-hidden="true" style={{
        position: 'absolute', right: -40, bottom: -56, width: 170, height: 170,
        borderRadius: '50%', background: 'rgba(255,255,255,.07)', pointerEvents: 'none',
      }} />

      <div className="row between" style={{ position: 'relative', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: compact ? 14 : 15.5, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
          <div style={{ opacity: .78, fontSize: 11.5, marginTop: 2 }}>
            {b?.short || 'Tarjeta'}{currency !== 'PYG' ? ` · ${currency}` : ''}
          </div>
        </div>
        <Chip txt={txt} />
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ opacity: .8, fontSize: 10.5, letterSpacing: '.08em', fontWeight: 700 }}>SALDO USADO</div>
        <div style={{ fontSize: compact ? 20 : 25, fontWeight: 800, letterSpacing: '-.02em', marginTop: 1 }}>
          {money(usado)}
        </div>

        {lim > 0 && (
          <>
            <div style={{ height: 5, borderRadius: 999, background: 'rgba(0,0,0,.28)', marginTop: 10, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: pct + '%', background: alerta, borderRadius: 999 }} />
            </div>
            <div className="row between" style={{ fontSize: 11, marginTop: 6, opacity: .9 }}>
              <span>Disponible <b>{money(disp)}</b></span>
              <span style={{ color: alerta, fontWeight: 700 }}>{pct.toFixed(0)}% usado</span>
            </div>
          </>
        )}

        {(dueDay || closeDay || red) && (
          <div className="row" style={{ gap: 12, marginTop: 10, fontSize: 10.5, opacity: .85, flexWrap: 'wrap' }}>
            {closeDay ? <span>Cierra <b>día {closeDay}</b></span> : null}
            {dueDay ? <span>Vence <b>día {dueDay}</b></span> : null}
            {red ? <span style={{ marginLeft: 'auto', fontWeight: 800, letterSpacing: '.06em' }}>{red.label.toUpperCase()}</span> : null}
          </div>
        )}
      </div>
    </div>
  )
}

/* Chip EMV dibujado (no es de ninguna marca) */
function Chip({ txt }) {
  const c = txt === '#ffffff' ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.6)'
  return (
    <svg width="34" height="26" viewBox="0 0 34 26" style={{ flexShrink: 0, opacity: .9 }} aria-hidden="true">
      <rect x="0.75" y="0.75" width="32.5" height="24.5" rx="4.5" fill="rgba(255,255,255,.22)" stroke={c} strokeWidth="1" />
      <path d="M12 1v24M22 1v24M1 9h32M1 17h32" stroke={c} strokeWidth="1" opacity=".75" />
      <rect x="12" y="9" width="10" height="8" fill="rgba(255,255,255,.18)" stroke={c} strokeWidth="1" />
    </svg>
  )
}
