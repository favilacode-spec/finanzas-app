// Carga rápida en lenguaje natural:
//   "café 15 mil ueno", "sueldo 3.500.000 itau", "uber 23500 ayer", "pasé 200 mil de ueno a efectivo"

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// "15 mil" → 15000, "1,5 millones" / "1.5M" → 1500000, "150.000" → 150000
export function parseAmount(text) {
  const t = norm(text).replace(/gs\.?|₲/g, ' ')
  const m = t.match(/(\d+(?:[.,]\d+)*)\s*(millones|millon|mill|mm|m|mil|k|lucas)?\b/)
  if (!m) return null
  let raw = m[1]
  const unit = m[2] || ''
  let n
  if (unit) {
    n = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
    if (/^\d+\.\d{1,2}$/.test(raw)) n = parseFloat(raw) // "1.5"
  } else {
    n = parseInt(raw.replace(/[.,]/g, ''), 10)
  }
  if (!isFinite(n)) return null
  if (/^(millones|millon|mill|mm|m)$/.test(unit)) n *= 1_000_000
  else if (/^(mil|k|lucas)$/.test(unit)) n *= 1000
  return { amount: Math.round(n), match: m[0] }
}

const INCOME_WORDS = /\b(cobre|cobro|sueldo|salario|ingreso|me pagaron|pago de cliente|recibi|recibí|venta|honorario)/
const TRANSFER_WORDS = /\b(transferi|transferencia|pase|pasé|movi|moví)\b/

export function quickParse(text, { accounts = [], categories = [] } = {}) {
  const t = norm(text)
  const res = { type: 'expense', amount: null, accountId: '', toAccountId: '', categoryId: '', payee: '', date: null }
  if (!t.trim()) return res

  const amt = parseAmount(text)
  if (amt) res.amount = amt.amount

  if (TRANSFER_WORDS.test(t)) res.type = 'transfer'
  else if (INCOME_WORDS.test(t)) res.type = 'income'

  // fecha relativa
  const d = new Date()
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  if (/\banteayer\b/.test(t)) { d.setDate(d.getDate() - 2); res.date = iso(d) }
  else if (/\bayer\b/.test(t)) { d.setDate(d.getDate() - 1); res.date = iso(d) }

  // cuentas mencionadas (en orden de aparición)
  const found = accounts
    .map((a) => {
      const keys = [a.name, a.bank, a.bank_alias].filter(Boolean).map(norm)
      const idx = Math.min(...keys.map((k) => { const i = t.indexOf(k.split(' ')[0]); return i < 0 ? 1e9 : i }))
      return { a, idx }
    })
    .filter((x) => x.idx < 1e9)
    .sort((x, y) => x.idx - y.idx)
  if (found[0]) res.accountId = found[0].a.id
  if (res.type === 'transfer' && found[1]) res.toAccountId = found[1].a.id

  // categoría por nombre (o palabras típicas)
  const HINTS = {
    comida: /(cafe|almuerzo|cena|super|supermercado|comida|resto|pizza|hamburguesa|biggie|stock|real)/,
    transporte: /(uber|bolt|nafta|combustible|taxi|colectivo|peaje|estacionamiento)/,
    salud: /(farmacia|medico|consulta|remedio)/,
    servicios: /(ande|essap|luz|agua|internet|claro|tigo|personal|copaco)/,
    entretenimiento: /(netflix|spotify|cine|disney|hbo|youtube)/,
  }
  const kind = res.type === 'income' ? 'income' : 'expense'
  const cats = categories.filter((c) => c.kind === kind)
  let cat = cats.find((c) => t.includes(norm(c.name)))
  if (!cat) {
    for (const [k, re] of Object.entries(HINTS)) {
      if (re.test(t)) { cat = cats.find((c) => norm(c.name).includes(k)); if (cat) break }
    }
  }
  if (cat) res.categoryId = cat.id

  // comercio: lo que queda sin monto, cuentas ni palabras de relleno
  let rest = ' ' + t + ' '
  if (amt) rest = rest.replace(norm(amt.match), ' ')
  found.forEach(({ a }) => [a.name, a.bank, a.bank_alias].filter(Boolean).forEach((k) => { rest = rest.replace(norm(k), ' ') }))
  rest = rest.replace(/\b(con|en|de|del|la|el|a|al|desde|hacia|para|por|ayer|anteayer|hoy|pague|pagué|gaste|gasté|gs|mil|cobre|recibi|transferi|pase|movi)\b/g, ' ')
  rest = rest.replace(/\s+/g, ' ').trim()
  if (rest) {
    const original = text.split(/\s+/).filter((w) => rest.split(' ').includes(norm(w)))
    res.payee = (original.join(' ') || rest).replace(/^\w/, (c) => c.toUpperCase())
  }
  return res
}
