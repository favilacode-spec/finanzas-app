import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// Guaraní: sin decimales, separador de miles con punto. Ej: ₲ 1.500.000
const pyg = new Intl.NumberFormat('es-PY', {
  style: 'currency',
  currency: 'PYG',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

export function money(value) {
  const n = Number(value || 0)
  return pyg.format(Math.round(n))
}

// versión compacta para gráficos (1,5 M)
export function moneyShort(value) {
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
  { value: 'investment', label: 'Inversión', icon: 'trending-up' },
  { value: 'loan', label: 'Préstamo', icon: 'hand-coins' },
  { value: 'other', label: 'Otro', icon: 'wallet' },
]

export function accountTypeLabel(v) {
  return ACCOUNT_TYPES.find((t) => t.value === v)?.label || 'Cuenta'
}
