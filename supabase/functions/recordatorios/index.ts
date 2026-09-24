// Recordatorio diario (lo llama pg_cron a las 8:00 de Asunción).
// Avisa por push los pagos que vencen hoy o dentro de sus "días de aviso".
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const gs = (n: number) => '₲ ' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
function diffDays(a: string, b: string) {
  return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400e3)
}
function cardDue(today: string, dueDay: number) {
  const [y, m, d] = today.split('-').map(Number)
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()
  let yy = y, mm = m
  if (d > Math.min(dueDay, last(y, m))) { mm++; if (mm > 12) { mm = 1; yy++ } }
  const dd = Math.min(dueDay, last(yy, mm))
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}))
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: cfg } = await admin.from('app_config').select('v').eq('k', 'cron_secret').maybeSingle()
  if (!cfg?.v || body.secret !== cfg.v) return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })

  const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10) // America/Asuncion (UTC-3)
  const [{ data: recs }, { data: cards }, { data: bals }, { data: toks }] = await Promise.all([
    admin.from('recurring_transactions').select('*').eq('active', true).eq('type', 'expense'),
    admin.from('accounts').select('id,household_id,name,due_day').eq('type', 'credit_card').eq('archived', false),
    admin.from('account_balances').select('*'),
    admin.from('ingest_tokens').select('household_id,token'),
  ])

  const byHh: Record<string, { hoy: string[]; pronto: string[] }> = {}
  const push = (hh: string, when: number, text: string) => {
    byHh[hh] ||= { hoy: [], pronto: [] }
    if (when === 0) byHh[hh].hoy.push(text)
    else byHh[hh].pronto.push(`${text} (${when === 1 ? 'mañana' : `en ${when} días`})`)
  }

  for (const r of recs || []) {
    if (r.end_date && r.end_date < today) continue
    const d = diffDays(r.next_date, today)
    const remind = Number(r.remind_days ?? 1)
    if (d === 0 || (remind > 0 && d === remind)) push(r.household_id, d, `${r.payee || 'Pago'} ${gs(r.amount)}`)
  }
  for (const c of cards || []) {
    if (!c.due_day) continue
    const bal = Number((bals || []).find((b: any) => b.account_id === c.id)?.balance || 0)
    if (bal >= 0) continue
    const d = diffDays(cardDue(today, Number(c.due_day)), today)
    if (d === 0 || d === 2) push(c.household_id, d, `Tarjeta ${c.name} ${gs(-bal)}`)
  }

  const fn = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-push`
  let sent = 0
  for (const [hh, v] of Object.entries(byHh)) {
    const tok = (toks || []).find((t: any) => t.household_id === hh)?.token
    if (!tok) continue
    const title = v.hoy.length ? `Hoy vence${v.hoy.length > 1 ? 'n' : ''} ${v.hoy.length} pago${v.hoy.length > 1 ? 's' : ''}` : 'Pagos que se vienen'
    const text = [...v.hoy, ...v.pronto].join(' · ')
    await fetch(fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, title, body: text, url: '/pagos' }) })
    sent++
  }
  return new Response(JSON.stringify({ ok: true, hogares: sent, hoy: today }), { headers: { 'Content-Type': 'application/json' } })
})
