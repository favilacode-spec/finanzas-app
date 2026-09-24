// Feed de calendario (.ics) para suscribirse desde Google Calendar o Apple Calendar.
// URL: /functions/v1/calendario?t=<calendar_token del hogar>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RRULE: Record<string, string> = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=DAILY;INTERVAL=15',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
}

const gs = (n: number) => 'Gs. ' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const ymd = (d: string) => d.replaceAll('-', '').slice(0, 8)
const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
function fold(line: string) {
  const out: string[] = []
  let s = line
  while (new TextEncoder().encode(s).length > 74) {
    let cut = 74
    while (new TextEncoder().encode(s.slice(0, cut)).length > 74) cut--
    out.push(s.slice(0, cut)); s = ' ' + s.slice(cut)
  }
  out.push(s)
  return out.join('\r\n')
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function alarm(days: number) {
  // Eventos de día completo: aviso a las 9:00 del día (o N días antes)
  const trig = days <= 0 ? 'PT9H' : `-PT${days * 24 - 9}H`
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio de pago', `TRIGGER:${trig}`, 'END:VALARM']
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const t = (url.searchParams.get('t') || '').trim()
  if (!t) return new Response('falta token', { status: 400 })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: hh } = await admin.from('households').select('id,name').eq('calendar_token', t).maybeSingle()
  if (!hh) return new Response('no autorizado', { status: 401 })

  const [rec, acc, goals] = await Promise.all([
    admin.from('recurring_transactions').select('*').eq('household_id', hh.id).eq('active', true),
    admin.from('accounts').select('id,name,type,due_day,archived').eq('household_id', hh.id).eq('type', 'credit_card').eq('archived', false),
    admin.from('goals').select('id,name,target_amount,target_date,archived').eq('household_id', hh.id).eq('archived', false),
  ])

  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const L: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mi Billetera//Pagos//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc('Mi Billetera · Pagos')}`, 'X-WR-TIMEZONE:America/Asuncion', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
  ]

  for (const r of rec.data || []) {
    if (!r.next_date) continue
    const name = r.payee || 'Pago'
    const isInc = r.type === 'income'
    const summary = `${isInc ? '💰 Cobro' : '💳 Pagar'}: ${name} · ${gs(r.amount)}${r.amount_variable ? ' (aprox.)' : ''}`
    let rule = RRULE[r.frequency] || RRULE.monthly
    if (r.end_date) rule += `;UNTIL=${ymd(r.end_date)}`
    const desc = [isInc ? 'Ingreso esperado' : 'Pago pendiente', r.note || '', r.pay_url ? `Pagar: ${r.pay_url}` : '', 'Marcalo como pagado en Mi Billetera.'].filter(Boolean).join('\n')
    L.push('BEGIN:VEVENT', `UID:rec-${r.id}@mibilletera`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(r.next_date)}`, `DTEND;VALUE=DATE:${ymd(addDays(r.next_date, 1))}`,
      `RRULE:${rule}`, `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`, 'TRANSP:TRANSPARENT')
    if (r.pay_url) L.push(`URL:${esc(r.pay_url)}`)
    if (!isInc) L.push(...alarm(Number(r.remind_days ?? 1)))
    L.push('END:VEVENT')
  }

  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
  for (const a of acc.data || []) {
    const dd = Number(a.due_day)
    if (!dd) continue
    const [y, m] = today.split('-').map(Number)
    const day = dd > 28 ? new Date(Date.UTC(y, m, 0)).getUTCDate() : dd
    const start = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    L.push('BEGIN:VEVENT', `UID:card-${a.id}@mibilletera`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`, `DTEND;VALUE=DATE:${ymd(addDays(start, 1))}`,
      `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dd > 28 ? -1 : dd}`, `SUMMARY:${esc('💳 Vence tarjeta ' + a.name)}`,
      `DESCRIPTION:${esc('Pagá el resumen de tu tarjeta. Mirá el monto en Mi Billetera.')}`, 'TRANSP:TRANSPARENT', ...alarm(2), 'END:VEVENT')
  }

  for (const g of goals.data || []) {
    if (!g.target_date) continue
    L.push('BEGIN:VEVENT', `UID:goal-${g.id}@mibilletera`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(g.target_date)}`, `DTEND;VALUE=DATE:${ymd(addDays(g.target_date, 1))}`,
      `SUMMARY:${esc('🎯 Meta: ' + g.name + ' · ' + gs(g.target_amount))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT')
  }

  L.push('END:VCALENDAR')
  return new Response(L.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="mi-billetera-pagos.ics"',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
