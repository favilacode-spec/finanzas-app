import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b']
const BASURA = /^(apple pay|apple card|tarjeta|card|compra|pago|payment|transacci[oó]n|transaction|merchant|comercio|monto|amount|n\/a|null|undefined|sin nombre)$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const ct = req.headers.get('content-type') || ''
  let crudo = ''

  try {
    const url = new URL(req.url)
    let body: Record<string, any> = {}
    if (req.method === 'POST') {
      crudo = await req.text()
      if (crudo.trim().startsWith('{')) { try { body = JSON.parse(crudo) } catch { body = { text: crudo } } }
      else body = { text: crudo }
    }
    const data = { ...Object.fromEntries(url.searchParams), ...body }

    const token = String(data.token || req.headers.get('x-ingest-token') || '').trim()
    if (!token) return await fin(admin, req, ct, crudo, { error: 'token requerido' }, 400)

    // Junta todo el texto que haya mandado el atajo, sin importar el nombre del campo
    const campos = ['text', 'transaction', 'transaccion', 'nota', 'note', 'detalle', 'descripcion', 'body', 'input']
    const fullText = campos.map((k) => data[k]).filter(Boolean).join('\n')
      || Object.entries(data).filter(([k]) => !['token', 'categoria', 'category', 'cuenta', 'account'].includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n')

    let amount = parseAmount(data.amount ?? data.monto ?? data.importe)
    let merchant = limpiar(data.merchant || data.payee || data.comercio || data.name || data.lugar)
    // Categoría y cuenta elegidas en el atajo (opcionales)
    const catName = String(data.categoria || data.category || '').trim()
    const cuentaName = String(data.cuenta || data.account || '').trim()

    if ((!amount || !merchant) && fullText.trim().length > 2) {
      const ia = await extraerConIA(fullText)
      if (!amount) amount = parseAmount(ia?.monto)
      if (!merchant) merchant = limpiar(ia?.comercio)
    }
    if (!amount) amount = parseAmountFromText(fullText)
    if (!merchant) merchant = parseMerchant(fullText)

    if (!amount) return await fin(admin, req, ct, crudo, { ok: false, error: 'No pude leer el monto', recibido: fullText.slice(0, 200) })

    const occurred_on = data.date || data.fecha || new Date().toISOString().slice(0, 10)
    const external_id = data.id || ('ap' + hashStr(`${occurred_on}|${amount}|${merchant || ''}`))

    const { data: tok } = await admin.from('ingest_tokens').select('household_id').eq('token', token).maybeSingle()
    if (!tok) return await fin(admin, req, ct, crudo, { error: 'token inválido' }, 401)
    const hh = tok.household_id

    const [{ data: d1 }, { data: d2 }] = await Promise.all([
      admin.from('pending_transactions').select('id').eq('household_id', hh).eq('external_id', external_id).maybeSingle(),
      admin.from('transactions').select('id').eq('household_id', hh).eq('external_id', external_id).maybeSingle(),
    ])
    if (d1 || d2) return await fin(admin, req, ct, crudo, { ok: true, duplicate: true })

    const ayer = new Date(new Date(occurred_on).getTime() - 864e5).toISOString().slice(0, 10)
    const manana = new Date(new Date(occurred_on).getTime() + 864e5).toISOString().slice(0, 10)
    const { data: cruz } = await admin.from('transactions').select('id')
      .eq('household_id', hh).eq('amount', amount).eq('source', 'email')
      .gte('occurred_on', ayer).lte('occurred_on', manana).maybeSingle()
    if (cruz) return await fin(admin, req, ct, crudo, { ok: true, duplicate: 'ya vino por email' })

    const res = await routeMovement(admin, hh, {
      type: 'expense', name: merchant, amount, occurred_on, external_id, source: 'apple_pay',
      raw: merchant ? `Apple Pay: ${merchant}` : 'Apple Pay', catName, cuentaName,
    })
    return await fin(admin, req, ct, crudo, { ok: true, monto: amount, comercio: merchant, ...res })
  } catch (e) {
    return await fin(admin, req, ct, crudo, { error: String(e) }, 500)
  }
})

async function fin(admin: any, req: Request, ct: string, crudo: string, salida: any, status = 200) {
  try {
    await admin.from('atajo_debug').insert({
      metodo: req.method, content_type: ct.slice(0, 80),
      crudo: (crudo || req.url).slice(0, 1200), resultado: JSON.stringify(salida).slice(0, 600),
    })
  } catch { /* el registro nunca debe romper la ingesta */ }
  return new Response(JSON.stringify(salida), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function extraerConIA(texto: string) {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) return null
  const prompt = `De este aviso de pago con tarjeta en Paraguay, extrae el monto (solo numeros, sin puntos) y el nombre del comercio. Si no hay comercio, deja "". Texto: """${texto.slice(0, 600)}""" Responde en JSON: {"monto":"","comercio":""}`
  for (const model of MODELS) {
    try {
      const b: any = { model, temperature: 0, max_tokens: 900, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }
      if (model.startsWith('openai/')) b.reasoning_effort = 'low'
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b),
      })
      if (!r.ok) continue
      const j = await r.json()
      return JSON.parse(j?.choices?.[0]?.message?.content || '{}')
    } catch { /* siguiente */ }
  }
  return null
}

// Busca por nombre (sin tildes ni mayúsculas); acepta subcategorías "Padre › Hija"
function buscarPorNombre(lista: any[], nombre: string) {
  const n = norm(nombre.split(/[›>/]/).pop() || nombre)
  if (!n) return null
  return lista.find((x) => norm(x.name) === n)
    || lista.find((x) => norm(x.name).startsWith(n) || n.startsWith(norm(x.name)))
    || null
}

async function routeMovement(admin: any, hh: string, m: any) {
  const key = norm(m.name || '')
  const { data: hhRow } = await admin.from('households')
    .select('auto_approve, default_account_id, card_account_id').eq('id', hh).maybeSingle()

  let rule: any = null
  if (key.length >= 3) {
    const { data } = await admin.from('merchant_rules').select('*').eq('household_id', hh).eq('key', key).maybeSingle()
    rule = data
  }

  // Categoría elegida en el atajo > regla aprendida > IA
  let elegida: any = null
  if (m.catName) {
    const { data: cats } = await admin.from('categories').select('id,name').eq('household_id', hh).eq('kind', 'expense')
    elegida = buscarPorNombre(cats || [], m.catName)
  }
  let cuentaElegida: any = null
  if (m.cuentaName) {
    const { data: accs } = await admin.from('accounts').select('id,name').eq('household_id', hh).eq('archived', false)
    cuentaElegida = buscarPorNombre(accs || [], m.cuentaName)
  }

  let category_id = elegida?.id || rule?.category_id || null
  const account_id = cuentaElegida?.id || rule?.account_id || hhRow?.card_account_id || hhRow?.default_account_id || null

  let aiUsed = false
  if (!category_id && m.name) { category_id = await aiCategory(admin, hh, m.name); aiUsed = !!category_id }

  // Si vos elegiste la categoría en el atajo, se registra directo (aunque la aprobación automática esté apagada)
  const puedeAuto = !!(account_id && m.amount && category_id && (elegida || hhRow?.auto_approve))

  if (puedeAuto) {
    await admin.from('transactions').insert({
      household_id: hh, account_id, type: 'expense', amount: m.amount, currency: 'PYG',
      category_id, occurred_on: m.occurred_on, payee: m.name || elegida?.name || 'Apple Pay', note: m.raw,
      source: m.source, external_id: m.external_id, auto: true,
    })
    if (key.length >= 3) {
      await admin.from('merchant_rules').upsert({
        household_id: hh, key, label: m.name, category_id, account_id, tx_type: 'expense', hits: (rule?.hits || 0) + 1,
      }, { onConflict: 'household_id,key' })
    }
    return { auto: true, aiUsed, categoria: elegida?.name || null }
  }

  await admin.from('pending_transactions').insert({
    household_id: hh, source: m.source, suggested_type: 'expense', raw_text: m.raw,
    amount: m.amount, currency: 'PYG', merchant: m.name, occurred_on: m.occurred_on,
    external_id: m.external_id, suggested_category_id: category_id, suggested_account_id: account_id,
  })
  return {
    auto: false,
    motivo: !account_id ? 'falta la cuenta por defecto' : m.catName && !elegida ? `no encontré la categoría "${m.catName}"` : m.name ? 'no se pudo categorizar' : 'el atajo no mandó el comercio',
  }
}

async function aiCategory(admin: any, hh: string, merchant: string) {
  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) return null
  const { data: cats } = await admin.from('categories').select('id,name').eq('household_id', hh).eq('kind', 'expense')
  if (!cats?.length) return null
  const list = cats.map((c: any) => c.name).join(', ')
  const prompt = `Comercio en Paraguay: "${merchant}". Elegí UNA categoría de esta lista exacta: ${list}. Responde en JSON: {"categoria":"..."}`
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
      const f = cats.find((c: any) => norm(c.name) === norm(pick || '')) || cats.find((c: any) => norm(pick || '').includes(norm(c.name)))
      if (f) return f.id
    } catch { /* siguiente */ }
  }
  return null
}

function limpiar(v: unknown) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (s.length < 2 || BASURA.test(s) || /^[0-9.,₲$\s]+$/.test(s)) return null
  return s.slice(0, 60)
}
function norm(s: string) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '') }
function hashStr(s: string) { let h = 5381; for (let i = 0; i < s.length; i++) { h = ((h << 5) + h) + s.charCodeAt(i); h = h & 0xffffffff } return (h >>> 0).toString(16) }
function parseAmount(v: unknown) {
  if (v == null) return null
  let s = String(v).replace(/[^0-9.,]/g, ''); if (!s) return null
  s = s.replace(/[.,](\d{2})$/, '').replace(/[.,]/g, '')
  const n = parseInt(s, 10); return isNaN(n) || n <= 0 ? null : n
}
function parseAmountFromText(text: string) {
  const m = text.match(/(?:₲|gs\.?|pyg|\$|usd)\s*([0-9][0-9.,]*)/i)
  if (m) return parseAmount(m[1])
  const nums = (text.match(/[0-9][0-9.,]{2,}/g) || []).map(parseAmount).filter((x): x is number => x != null)
  return nums.length ? Math.max(...nums) : null
}
function parseMerchant(text: string) {
  const m = text.match(/\b(?:en|at|comercio|a)\s+([A-Za-z][A-Za-z0-9 .&'\-]{2,40})/i)
  return m ? limpiar(m[1]) : null
}
