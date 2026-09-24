import { FUNCTIONS_URL } from './supabase'

// Links para sumar pagos a Google Calendar / Apple Calendar

const RRULE = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=DAILY;INTERVAL=15', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }
const ymd = (iso) => String(iso).replaceAll('-', '').slice(0, 8)
const nextDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + 1)); return t.toISOString().slice(0, 10) }
const gs = (n) => 'Gs. ' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Feed con TODOS los pagos (se actualiza solo)
export function feedUrls(calendarToken) {
  const https = `${FUNCTIONS_URL}/calendario?t=${calendarToken}`
  const webcal = https.replace(/^https:/, 'webcal:')
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
  }
}

function recTitle(r) {
  return `${r.type === 'income' ? '💰 Cobro' : '💳 Pagar'}: ${r.payee || 'Pago'} · ${gs(r.amount)}`
}

// Un solo pago → Google Calendar (evento repetido)
export function googleEventUrl(r) {
  let rule = RRULE[r.frequency] || RRULE.monthly
  if (r.end_date) rule += `;UNTIL=${ymd(r.end_date)}`
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: recTitle(r),
    dates: `${ymd(r.next_date)}/${ymd(nextDay(r.next_date))}`,
    details: 'Recordatorio de Mi Billetera. Marcalo como pagado en la app.',
    recur: `RRULE:${rule}`,
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

// Un solo pago → archivo .ics (Apple Calendar lo abre directo)
export function downloadIcs(r) {
  let rule = RRULE[r.frequency] || RRULE.monthly
  if (r.end_date) rule += `;UNTIL=${ymd(r.end_date)}`
  const days = Number(r.remind_days ?? 1)
  const trig = days <= 0 ? 'PT9H' : `-PT${days * 24 - 9}H`
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Billetera//Pagos//ES',
    'BEGIN:VEVENT', `UID:rec-${r.id}@mibilletera`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(r.next_date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(r.next_date))}`,
    `RRULE:${rule}`, `SUMMARY:${esc(recTitle(r))}`, `DESCRIPTION:${esc('Recordatorio de Mi Billetera')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio de pago', `TRIGGER:${trig}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(r.payee || 'pago').replace(/[^\w\- ]+/g, '').trim() || 'pago'}.ics`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
