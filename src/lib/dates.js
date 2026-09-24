// Utilidades de fechas para pagos, recurrentes y calendario.
// Todas las fechas se manejan como 'YYYY-MM-DD' en hora local (Asunción).

export const FREQ = {
  weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual', yearly: 'Anual', daily: 'Diario',
}

export function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseLocal(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12)
}

export function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(iso, n) {
  const d = parseLocal(iso); d.setDate(d.getDate() + n); return toISO(d)
}

const lastDay = (y, m) => new Date(y, m + 1, 0).getDate()

// Suma meses respetando el día (31 → 30/28 en meses cortos, sin "saltar" de mes)
export function addMonths(iso, n, anchorDay) {
  const d = parseLocal(iso)
  const day = anchorDay || d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1, 12)
  target.setDate(Math.min(day, lastDay(target.getFullYear(), target.getMonth())))
  return toISO(target)
}

export function advance(iso, freq, anchorDay) {
  if (freq === 'daily') return addDays(iso, 1)
  if (freq === 'weekly') return addDays(iso, 7)
  if (freq === 'biweekly') return addDays(iso, 15)
  if (freq === 'yearly') return addMonths(iso, 12, anchorDay)
  return addMonths(iso, 1, anchorDay)
}

export function daysBetween(a, b) {
  return Math.round((parseLocal(b) - parseLocal(a)) / 86400000)
}

// Días desde hoy hasta la fecha (negativo = vencido)
export function daysUntil(iso) { return daysBetween(todayLocal(), iso) }

export function dueLabel(iso) {
  const d = daysUntil(iso)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d === -1) return 'Venció ayer'
  if (d < 0) return `Venció hace ${-d} días`
  if (d < 7) return `En ${d} días`
  if (d < 14) return 'En 1 semana'
  if (d < 31) return `En ${Math.floor(d / 7)} semanas`
  return `En ${Math.round(d / 30)} ${Math.round(d / 30) === 1 ? 'mes' : 'meses'}`
}

export function dueTone(iso) {
  const d = daysUntil(iso)
  if (d < 0) return 'red'
  if (d <= 2) return 'amber'
  return 'muted'
}

// Primera fecha de la serie que sea >= desde (sin registrar pagos)
export function catchUp(iso, freq, from = todayLocal()) {
  let cur = iso
  const anchor = parseLocal(iso).getDate()
  let guard = 0
  while (cur < from && guard++ < 2000) cur = advance(cur, freq, anchor)
  return cur
}

// Cuántas cuotas vencidas quedaron sin marcar
export function overdueCount(iso, freq, until = todayLocal()) {
  let cur = iso, n = 0
  const anchor = parseLocal(iso).getDate()
  while (cur < until && n < 500) { n++; cur = advance(cur, freq, anchor) }
  return n
}

// Todas las ocurrencias de un recurrente entre dos fechas (incluidas)
export function occurrences(rec, from, to) {
  const out = []
  if (!rec?.next_date) return out
  let cur = rec.next_date
  const anchor = parseLocal(cur).getDate()
  let guard = 0
  while (cur <= to && guard++ < 800) {
    if (rec.end_date && cur > rec.end_date) break
    if (cur >= from) out.push(cur)
    cur = advance(cur, rec.frequency, anchor)
  }
  return out
}

// Próximo vencimiento de una tarjeta de crédito según su día de pago
export function cardDueDate(dueDay, from = todayLocal()) {
  if (!dueDay) return null
  const f = parseLocal(from)
  let y = f.getFullYear(), m = f.getMonth()
  let d = Math.min(dueDay, lastDay(y, m))
  if (f.getDate() > d) { m++; if (m > 11) { m = 0; y++ } d = Math.min(dueDay, lastDay(y, m)) }
  return toISO(new Date(y, m, d, 12))
}

// Inicio del ciclo actual de una tarjeta (día siguiente al último cierre)
export function cardCycleStart(statementDay, from = todayLocal()) {
  if (!statementDay) return null
  const f = parseLocal(from)
  let y = f.getFullYear(), m = f.getMonth()
  let close = Math.min(statementDay, lastDay(y, m))
  if (f.getDate() <= close) { m--; if (m < 0) { m = 11; y-- } close = Math.min(statementDay, lastDay(y, m)) }
  return addDays(toISO(new Date(y, m, close, 12)), 1)
}

// Próximo cobro: día de cobro del hogar o el ingreso recurrente más cercano
export function nextPayday(payday, incomes = []) {
  const t = todayLocal()
  if (payday) {
    const f = parseLocal(t)
    let y = f.getFullYear(), m = f.getMonth()
    let d = Math.min(payday, lastDay(y, m))
    if (f.getDate() >= d) { m++; if (m > 11) { m = 0; y++ } d = Math.min(payday, lastDay(y, m)) }
    return toISO(new Date(y, m, d, 12))
  }
  const dates = incomes.filter((r) => r.active !== false).map((r) => catchUp(r.next_date, r.frequency, addDays(t, 1))).sort()
  return dates[0] || addMonths(t, 1)
}

export const monthKey = (iso) => String(iso).slice(0, 7)
export function monthStart(iso = todayLocal()) { return monthKey(iso) + '-01' }
export function monthEnd(iso = todayLocal()) { const d = parseLocal(monthStart(iso)); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)) }
export function shiftMonth(iso, n) { return addMonths(monthStart(iso), n, 1) }

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function monthName(iso) { const d = parseLocal(iso); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
export function shortDate(iso) { const d = parseLocal(iso); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` }
