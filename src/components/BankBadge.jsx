import { bankById, guessBank } from '../lib/banks'

// Monograma circular con el color del banco. Diseño propio: iniciales, no logos.
export default function BankBadge({ bankId, name, color, size = 'md' }) {
  const b = bankById(bankId) || guessBank(name)
  const px = size === 'sm' ? 30 : size === 'lg' ? 52 : 40
  const fs = size === 'sm' ? 11 : size === 'lg' ? 17 : 13.5
  const col = color || b?.color || '#6b7280'
  const mono = b?.mono || iniciales(name)

  return (
    <span
      aria-hidden="true"
      style={{
        width: px, height: px, minWidth: px, borderRadius: '50%',
        background: `linear-gradient(145deg, ${col}, ${oscurecer(col, 28)})`,
        display: 'inline-grid', placeItems: 'center',
        color: contraste(col), fontWeight: 800, fontSize: fs, letterSpacing: '.02em',
        boxShadow: `0 2px 10px ${hexA(col, 0.35)}, inset 0 1px 0 rgba(255,255,255,.18)`,
        flexShrink: 0,
      }}
    >
      {mono}
    </span>
  )
}

function iniciales(txt) {
  const w = String(txt || '').trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '••'
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase()
  return (w[0][0] + w[1][0]).toUpperCase()
}

export function hexA(hex, a) {
  const { r, g, b } = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

export function oscurecer(hex, pct) {
  const { r, g, b } = rgb(hex)
  const f = (n) => Math.max(0, Math.round(n * (1 - pct / 100)))
  return `#${[f(r), f(g), f(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

export function aclarar(hex, pct) {
  const { r, g, b } = rgb(hex)
  const f = (n) => Math.min(255, Math.round(n + (255 - n) * (pct / 100)))
  return `#${[f(r), f(g), f(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

// Blanco o negro según el fondo, para que el texto siempre se lea
export function contraste(hex) {
  const { r, g, b } = rgb(hex)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.62 ? '#10131a' : '#ffffff'
}

function rgb(hex) {
  const h = String(hex || '#6b7280').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return { r: 107, g: 114, b: 128 }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
