import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const OWNER_NAMES = ['jose fabian avila sancho']
const MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b']
// Frases de relleno que ueno mete en "Mensaje" y no son el remitente
const RELLENO = /aviso|acreditad|transferencia|operaci[oó]n|detalle|sin concepto|n\/a/i
// Correos de publicidad: no son movimientos
const PUBLICIDAD = /promo|descuento|beneficio exclusivo|sorteo|te regalamos|cashback|aprovech|oferta|newsletter|nuevas funciones/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body.token || req.headers.get('x-ingest-token') || '').trim()
    if (!token) return json({ error: 'token requerido' }, 400)

    const subject: string = body.subject || ''
    const bodyText: string = body.text || body.body || ''
    const text = `${subject}\n${bodyText}`.replace(/<?https?:\/\/[^\s>]+>?/g, ' ')
    const t = text.toLowerCase()

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const txId = parseTxId(text)

    const m = analizar(text, t, !!txId)
    // Guardamos los formatos nuevos para poder afinarlos después
    if (m.formato !== 'conocido') {
      try { await admin.from('email_samples').insert({ subject: `[${m.formato}] ${subject}`.slice(0, 300), body: bodyText.slice(0, 4000) }) } catch { /* no bloquea */ }
    }
    if (!m.amount) return json({ ok: true, ignorado: m.formato === 'publicidad' ? 'publicidad' : 'sin monto', asunto: subject })

    const occurred_on = parseDate(text) || new Date().toISOString().slice(0, 10)
    const external_id = txId || ('h' + hashStr(`${subject}|${m.amount}|${occurred_on}|${m.name || ''}`))

    const { data: tok } = await admin.from('ingest_tokens').select('household_id').eq('token', token).maybeSingle()
    if (!tok) return json({ error: 'token inválido' }, 401)
    const hh = tok.household_id

    const [{ data: d1 }, { data: d2 }] = await Promise.all([
      admin.from('pending_transactions').select('id').eq('household_id', hh).eq('external_id', external_id).maybeSingle(),
      admin.from('transactions').select('id').eq('household_id', hh).eq('external_id', external_id).maybeSingle(),
    ])
    if (d1 || d2) return json({ ok: true, duplicate: true })

    const res = await routeMovement(admin, hh, {
      ...m, occurred_on, external_id, source: 'email', raw: subject.slice(0, 300),
    })
    return json({ ok: true, tipo: m.type, monto: m.amount, nombre: m.name, formato: m.formato, ...res })
  } catch (e) { return json({ error: String(e) }, 500) }
})

function nombreDe(text: string, labels: string[]) {
  for (const l of labels) { const v = field(text, l); if (v) return v }
  return null
}

function analizar(text: string, t: string, tieneId: boolean) {
  const amount = parseAmount(text)
  const conocido = 'conocido'

  if (/transferencia recibida|recibiste una transferencia/.test(t)) {
    const entidad = field(text, 'entidad pagadora')
    let concepto = field(text, 'mensaje') || field(text, 'concepto')
    if (concepto && RELLENO.test(concepto)) concepto = null
    return {
      type: 'income' as const, formato: conocido,
      name: concepto || (entidad ? `Transferencia de ${entidad}` : 'Transferencia recibida'),
      entidad, generico: !concepto, amount,
    }
  }

  if (/transferencia realizada|enviamos tu transferencia/.test(t)) {
    const benef = field(text, 'beneficiario')
    const entidad = field(text, 'entidad beneficiario')
    if (isOwner(benef)) {
      return { type: 'transfer' as const, formato: conocido, name: `Transferencia a ${entidad || 'mi otra cuenta'}`, entidad, generico: false, amount }
    }
    return { type: 'expense' as const, formato: conocido, name: benef || 'Transferencia enviada', entidad, generico: !benef, amount }
  }

  if (/realizaste una extracci[oó]n|extracci[oó]n de efectivo/.test(t)) {
    return { type: 'transfer' as const, formato: conocido, name: 'Extracción de efectivo', entidad: 'EFECTIVO', generico: false, amount }
  }

  // Publicidad del banco (sin N° de transacción): se ignora
  if (PUBLICIDAD.test(t) && !tieneId) return { type: 'expense' as const, formato: 'publicidad', name: null, entidad: null, generico: true, amount: null }

  // Pago de la tarjeta de crédito = mover plata a la tarjeta, no es un gasto
  if (/pago de (tu )?tarjeta|pagaste (tu|la) tarjeta|pago de tc\b/.test(t)) {
    const tarjeta = nombreDe(text, ['tarjeta', 'entidad', 'emisor'])
    return { type: 'transfer' as const, formato: conocido, name: `Pago tarjeta${tarjeta ? ' ' + tarjeta : ''}`, entidad: tarjeta || 'tarjeta', generico: false, amount }
  }

  // Cualquier pago de servicio, factura, débito automático, suscripción o QR
  if (/pago de servicio|pagaste tu servicio|pagaste|pago (exitoso|realizado|de factura)|factura|d[eé]bito autom|debitamos|suscripci[oó]n|\bqr\b|pago/.test(t)) {
    const n = nombreDe(text, ['empresa', 'servicio', 'facturador', 'comercio', 'establecimiento', 'destinatario', 'beneficiario', 'entidad'])
      || parseMerchant(text)
    const esServicio = /pago de servicio|pagaste tu servicio/.test(t)
    return { type: 'expense' as const, formato: esServicio ? conocido : 'pago', name: n || 'Pago', entidad: null, generico: !n, amount }
  }

  if (/compra|consumo|tarjeta/.test(t)) {
    const n = nombreDe(text, ['comercio', 'establecimiento', 'empresa']) || parseMerchant(text)
    return { type: 'expense' as const, formato: 'compra', name: n, entidad: null, generico: !n, amount }
  }

  // Formato desconocido: solo si parece un movimiento real (tiene N° de transacción o "Monto:")
  const pareceMovimiento = tieneId || /monto\s*:?/i.test(text)
  const n = nombreDe(text, ['empresa', 'beneficiario', 'comercio'])
  return { type: 'expense' as const, formato: 'desconocido', name: n, entidad: null, generico: !n, amount: pareceMovimiento ? amount : null }
}

async function routeMovement(admin: any, hh: string, m: any) {
  const key = norm(m.name || '')
  const { data: hhRow } = await admin.from('households')
    .select('auto_approve, default_account_id, card_account_id, income_category_id').eq('id', hh).maybeSingle()
  const { data: cuentas } = await admin.from('accounts').select('id,name,bank_alias').eq('household_id', hh).eq('archived', false)

  let rule: any = null
  if (key.length >= 3 && !m.generico) {
    const { data } = await admin.from('merchant_rules').select('*').eq('household_id', hh).eq('key', key).maybeSingle()
    rule = data
  }

  const account_id = rule?.account_id
    || (m.source === 'apple_pay' ? hhRow?.card_account_id : null)
    || hhRow?.default_account_id || null

  if (m.type === 'transfer') {
    const destino = matchCuenta(cuentas || [], m.entidad)
    if (hhRow?.auto_approve && account_id && destino && destino.id !== account_id) {
      await admin.from('transactions').insert({
        household_id: hh, account_id, transfer_account_id: destino.id, type: 'transfer',
        amount: m.amount, currency: 'PYG', occurred_on: m.occurred_on, payee: m.name,
        note: m.raw, source: m.source, external_id: m.external_id, auto: true,
      })
      return { auto: true, destino: destino.name }
    }
    await admin.from('pending_transactions').insert({
      household_id: hh, source: m.source, suggested_type: 'transfer', raw_text: m.raw,
      amount: m.amount, currency: 'PYG', merchant: m.name, occurred_on: m.occurred_on,
      external_id: m.external_id, suggested_account_id: account_id,
    })
    return { auto: false, motivo: destino ? 'misma cuenta' : 'banco destino desconocido' }
  }

  let category_id = rule?.category_id || null
  let aiUsed = false
  // Nombre generico (sin remitente real) -> categoria por defecto, sin gastar IA
  if (!category_id && m.generico && m.type === 'income') category_id = hhRow?.income_category_id || null
  if (!category_id && m.name && !m.generico) {
    category_id = await aiCategory(admin, hh, m.name, m.type)
    aiUsed = !!category_id
  }
  if (!category_id && m.type === 'income') category_id = hhRow?.income_category_id || null

  // Formatos nuevos siempre pasan por la Bandeja para que los revises
  const puedeAuto = !!(hhRow?.auto_approve && account_id && m.amount && category_id && m.formato === 'conocido')

  if (puedeAuto) {
    await admin.from('transactions').insert({
      household_id: hh, account_id, type: m.type, amount: m.amount, currency: 'PYG',
      category_id, occurred_on: m.occurred_on, payee: m.name, note: m.raw,
      source: m.source, external_id: m.external_id, auto: true,
    })
    if (key.length >= 3 && !m.generico) {
      await admin.from('merchant_rules').upsert({
        household_id: hh, key, label: m.name, category_id, account_id, tx_type: m.type, hits: (rule?.hits || 0) + 1,
      }, { onConflict: 'household_id,key' })
    }
    return { auto: true, aiUsed }
  }

  await admin.from('pending_transactions').insert({
    household_id: hh, source: m.source, suggested_type: m.type, raw_text: m.raw,
    amount: m.amount, currency: 'PYG', merchant: m.name, occurred_on: m.occurred_on,
    external_id: m.external_id, suggested_category_id: category_id, suggested_account_id: account_id,
  })
  return { auto: false, aiUsed }
}

function matchCuenta(cuentas: any[], entidad: string | null) {
  if (!entidad) return null
  const e = norm(entidad)
  for (const c of cuentas) {
    const alias = (c.bank_alias || c.name || '').split('|').map(norm).filter(Boolean)
    if (alias.some((a: string) => a.length >= 3 && e.includes(a))) return c
  }
  return null
}

async function aiCategory(admin: any, hh: string, merchant: string, type: string) {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) return null
  const { data: cats } = await admin.from('categories').select('id,name')
    .eq('household_id', hh).eq('kind', type === 'income' ? 'income' : 'expense')
  if (!cats?.length) return null
  const list = cats.map((c: any) => c.name).join(', ')
  const prompt = `Comercio, empresa o persona en Paraguay: "${merchant}". Elegí UNA categoría de esta lista exacta: ${list}. Si es una persona sin más pistas, elegí la más genérica. Responde en JSON: {"categoria":"..."}`
  for (const model of MODELS) {
    try {
      const b: any = { model, temperature: 0, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }
      if (model.startsWith('openai/')) b.reasoning_effort = 'low'
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b),
      })
      if (!r.ok) continue
      const j = await r.json()
      const pick = JSON.parse(j?.choices?.[0]?.message?.content || '{}')?.categoria
      const found = cats.find((c: any) => norm(c.name) === norm(pick || ''))
        || cats.find((c: any) => norm(pick || '').includes(norm(c.name)))
      if (found) return found.id
    } catch { /* siguiente */ }
  }
  return null
}

function norm(s: string) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '') }
function isOwner(n: string | null) {
  if (!n) return false
  const x = norm(n); if (x.length < 8) return false
  return OWNER_NAMES.some((o) => { const y = norm(o); return x.includes(y) || y.includes(x) })
}
function hashStr(s: string) { let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h = h & 0xffffffff } return (h >>> 0).toString(16) }
function field(text: string, label: string) {
  const m = text.match(new RegExp('(?:^|\\n)\\s*' + label + '\\s*:?\\s*\\n?\\s*([^\\n]{2,70})', 'i'))
  return m ? clean(m[1]) : null
}
function parseMerchant(text: string) {
  const m = text.match(/\b(?:en|comercio|establecimiento|pago a|servicio de|a favor de)\s+([A-Za-z0-9][A-Za-z0-9 .&'\-]{2,40})/i)
  return m ? clean(m[1]) : null
}
function parseAmount(text: string) {
  const m = text.match(/(?:monto|importe|total)\s*(?:pagado|debitado|abonado)?\s*:?\s*\n?\s*(?:gs\.?|₲|pyg)?\s*([0-9][0-9.,]*)/i)
    || text.match(/(?:gs\.?|₲|pyg)\s*([0-9][0-9.,]*)/i)
  if (!m) return null
  const n = parseInt(m[1].replace(/[.,]/g, ''), 10)
  return isNaN(n) || n <= 0 ? null : n
}
function parseDate(text: string) {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}
function parseTxId(text: string) {
  const m = text.match(/(?:nro\.?\s*de\s*(?:transacci[oó]n|operaci[oó]n|comprobante)|c[oó]digo\s*de\s*(?:transacci[oó]n|operaci[oó]n))\s*:?\s*\n?\s*([A-Za-z0-9-]{4,})/i)
  return m ? m[1].trim() : null
}
function clean(s: string) { const t = (s || '').replace(/\s+/g, ' ').trim(); return t.length >= 2 ? t.slice(0, 60) : null }
function json(o: unknown, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }) }
