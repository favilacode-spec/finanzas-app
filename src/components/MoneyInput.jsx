import { useEffect, useState } from 'react'

// Campo de monto con separador de miles y mini calculadora (+ − × ÷)
export function toNumber(v) {
  const s = String(v ?? '').replace(/\./g, '').replace(/,/g, '.').replace(/[^\d+\-*/().x÷×]/g, '').replace(/[x×]/g, '*').replace(/÷/g, '/')
  if (!s) return 0
  if (/^[\d.]+$/.test(s)) return Math.round(parseFloat(s) || 0)
  try {
    if (!/^[\d+\-*/().\s]+$/.test(s)) return 0
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict";return (${s})`)()
    return Number.isFinite(r) ? Math.round(r) : 0
  } catch { return 0 }
}
const fmt = (n) => (n ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')

export default function MoneyInput({ value, onChange, autoFocus, big, placeholder = '0', ...rest }) {
  const [text, setText] = useState(value ? fmt(value) : '')
  const hasOp = /[+\-*/x×÷]/.test(text.replace(/^-/, ''))
  const handle = (raw) => {
    const clean = raw.replace(/[^\d.,+\-*/x×÷() ]/g, '')
    const isExpr = /[+\-*/x×÷]/.test(clean.replace(/^-/, ''))
    const next = isExpr ? clean : fmt(parseInt(clean.replace(/[^\d]/g, ''), 10) || 0)
    setText(next)
    if (!isExpr) onChange(toNumber(clean))
    else { const n = toNumber(clean); if (n) onChange(n) }
  }
  // si el valor cambia desde afuera (carga rápida), reflejarlo
  useEffect(() => {
    if (hasOp) return
    if (toNumber(text) !== Math.round(Number(value) || 0)) setText(value ? fmt(value) : '')
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: big ? 20 : 15 }}>₲</span>
      <input className="form-input" inputMode="decimal" autoFocus={autoFocus} value={text} placeholder={placeholder}
        onChange={(e) => handle(e.target.value)}
        onBlur={() => { if (hasOp) { const n = toNumber(text); setText(fmt(n)); onChange(n) } }}
        style={{ paddingLeft: big ? 38 : 32, fontSize: big ? 26 : 16, fontWeight: big ? 800 : 600, letterSpacing: big ? '-0.02em' : 0 }} {...rest} />
      {hasOp && <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>= ₲ {fmt(toNumber(text)) || 0}</div>}
    </div>
  )
}
