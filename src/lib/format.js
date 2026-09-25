import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// Guaraní: sin decimales, separador de miles con punto. Ej: ₲ 1.500.000
const pyg = new Intl.NumberFormat('es-PY', {
  style: 'currency',
  currency: 'PYG',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

// Modo privado: ocultar todos los montos
let _hidden = false
export function setAmountsHidden(v) { _hidden = !!v }
export function amountsHidden() { return _hidden }
const MASK = '₲ •••••'

export function money(value) {
  if (_hidden) return MASK
  const n = Number(value || 0)
  return pyg.format(Math.round(n))
}

// versión compacta para gráficos (1,5 M)
export function moneyShort(value) {
  if (_hidden) return '•••'
  const n = Number(value || 0)
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `₲${(n / 1_000_000_000).toFixed(1)} MM`
  if (abs >= 1_000_000) return `₲${(n / 1_000_000).toFixed(1)} M`
  if (abs >= 1_000) return `₲${Math.round(n / 1_000)} mil`
  return `₲${n}`
}

export function fmtDate(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, "d 'de' MMM, yyyy", { locale: es })
}

export function fmtDateShort(d) {
  if (!d) return ''
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, 'dd/MM/yy', { locale: es })
}

export function monthLabel(d = new Date()) {
  return format(d, 'MMMM yyyy', { locale: es })
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function monthRange(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth()
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export const ACCOUNT_TYPES = [
  { value: 'cash', label: 'Efectivo', icon: 'banknote' },
  { value: 'checking', label: 'Cuenta corriente', icon: 'landmark' },
  { value: 'savings', label: 'Ahorros', icon: 'piggy-bank' },
  { value: 'credit_card', label: 'Tarjeta de crédito', icon: 'credit-card' },
  { value: 'investment', label: 'Inversión / Fondo mutuo', icon: 'trending-up' },
  { value: 'loan', label: 'Préstamo', icon: 'hand-coins' },
  { value: 'other', label: 'Otro', icon: 'wallet' },
]

export function accountTypeLabel(v) {
  return ACCOUNT_TYPES.find((t) => t.value === v)?.label || 'Cuenta'
}

// Cuentas que pueden generar rendimiento
export const EARNING_TYPES = ['savings', 'investment', 'checking', 'other']

// "6,5" a partir de 6.5
export function pct(n) {
  return String(Math.round(Number(n || 0) * 100) / 100).replace('.', ',')
}

// Rendimiento estimado de un saldo en `days` días a una tasa efectiva anual (%)
export function interestFor(balance, ratePct, days) {
  const b = Number(balance || 0), r = Number(ratePct || 0)
  if (b <= 0 || r <= 0 || days <= 0) return 0
  return Math.round(b * (Math.pow(1 + r / 100, days / 365) - 1))
}

// Próxima fecha de acreditación (YYYY-MM-DD) después de `since`
export function nextInterestDate(since, day) {
  if (!since || !day) return null
  const [y, m, d] = since.split('-').map(Number)
  const at = (yy, mm) => {
    const last = new Date(yy, mm + 1, 0).getDate()
    const dt = new Date(yy, mm, Math.min(day, last))
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }
  let due = at(y, m - 1)
  if (due <= since) due = at(y, m)
  return due
}

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

// compacto para tarjetitas chicas: ₲ 850.000 · ₲ 4,86 M
export function moneyCompact(value) {
  if (_hidden) return MASK
  const n = Number(value || 0)
  const a = Math.abs(n)
  if (a < 1_000_000) return money(n)
  const s = (a / 1_000_000).toFixed(a >= 100_000_000 ? 0 : a >= 10_000_000 ? 1 : 2).replace('.', ',')
  return `${n < 0 ? '-' : ''}₲ ${s} M`
}
