// Catálogo de bancos, financieras y billeteras de Paraguay.
// Usamos monograma propio + color institucional (no logos de terceros).
// Todos los colores son editables desde la app.

export const BANKS = [
  // ---- Bancos ----
  { id: 'itau',        name: 'Banco Itaú',            short: 'Itaú',       mono: 'IT', color: '#EC7000', kind: 'banco' },
  { id: 'continental', name: 'Banco Continental',     short: 'Continental', mono: 'BC', color: '#0B3B8F', kind: 'banco' },
  { id: 'basa',        name: 'Banco Basa',            short: 'Basa',       mono: 'BA', color: '#1B4F9C', kind: 'banco' },
  { id: 'familiar',    name: 'Banco Familiar',        short: 'Familiar',   mono: 'BF', color: '#E4002B', kind: 'banco' },
  { id: 'atlas',       name: 'Banco Atlas',           short: 'Atlas',      mono: 'AT', color: '#C8102E', kind: 'banco' },
  { id: 'sudameris',   name: 'Sudameris Bank',        short: 'Sudameris',  mono: 'SU', color: '#00843D', kind: 'banco' },
  { id: 'gnb',         name: 'Banco GNB',             short: 'GNB',        mono: 'GN', color: '#E30613', kind: 'banco' },
  { id: 'bnf',         name: 'Banco Nacional de Fomento', short: 'BNF',    mono: 'BN', color: '#0057A8', kind: 'banco' },
  { id: 'bancop',      name: 'Bancop',                short: 'Bancop',     mono: 'BP', color: '#5BA829', kind: 'banco' },
  { id: 'rio',         name: 'Banco Río',             short: 'Río',        mono: 'RI', color: '#D81E05', kind: 'banco' },
  { id: 'vision',      name: 'Visión Banco',          short: 'Visión',     mono: 'VI', color: '#F58220', kind: 'banco' },
  { id: 'interfisa',   name: 'Interfisa Banco',       short: 'Interfisa',  mono: 'IF', color: '#0B4EA2', kind: 'banco' },
  { id: 'zeta',        name: 'Zeta Banco',            short: 'Zeta',       mono: 'ZB', color: '#7C3AED', kind: 'banco' },
  { id: 'nacion_arg',  name: 'Banco de la Nación Argentina', short: 'BNA', mono: 'NA', color: '#43B0E6', kind: 'banco' },
  { id: 'ueno',        name: 'ueno bank',             short: 'ueno',       mono: 'UE', color: '#8DC63F', kind: 'banco' },
  { id: 'solar',       name: 'Solar Ahorro y Finanzas', short: 'Solar',    mono: 'SO', color: '#F7B500', kind: 'financiera' },
  { id: 'fic',         name: 'FIC S.A.',              short: 'FIC',        mono: 'FI', color: '#1F6FEB', kind: 'financiera' },
  { id: 'paraguayo_jap', name: 'Financiera Paraguayo Japonesa', short: 'FPJ', mono: 'PJ', color: '#C8102E', kind: 'financiera' },

  // ---- Billeteras y fintech ----
  { id: 'tigo_money',  name: 'Tigo Money',            short: 'Tigo Money', mono: 'TM', color: '#00AEEF', kind: 'billetera' },
  { id: 'personal',    name: 'Billetera Personal',    short: 'Personal',   mono: 'PE', color: '#0057B8', kind: 'billetera' },
  { id: 'eko',         name: 'Eko',                   short: 'Eko',        mono: 'EK', color: '#00C389', kind: 'billetera' },
  { id: 'mango',       name: 'Mango',                 short: 'Mango',      mono: 'MA', color: '#FF8A00', kind: 'billetera' },
  { id: 'zimple',      name: 'Zimple',                short: 'Zimple',     mono: 'ZI', color: '#E4002B', kind: 'billetera' },
  { id: 'wally',       name: 'Wally',                 short: 'Wally',      mono: 'WA', color: '#F58220', kind: 'billetera' },
  { id: 'wepa',        name: 'Wepa',                  short: 'Wepa',       mono: 'WE', color: '#2DB24A', kind: 'billetera' },
  { id: 'claro_money', name: 'Claro Money',           short: 'Claro',      mono: 'CM', color: '#DA291C', kind: 'billetera' },

  // ---- Otros ----
  { id: 'efectivo',    name: 'Efectivo',              short: 'Efectivo',   mono: '₲',  color: '#34d399', kind: 'otro' },
  { id: 'otro',        name: 'Otro',                  short: 'Otro',       mono: '••', color: '#9aa0aa', kind: 'otro' },
]

export const RED_TARJETA = [
  { id: 'visa',       label: 'Visa',        color: '#1A1F71' },
  { id: 'mastercard', label: 'Mastercard',  color: '#EB001B' },
  { id: 'amex',       label: 'Amex',        color: '#006FCF' },
  { id: 'cabal',      label: 'Cabal',       color: '#0B6E4F' },
  { id: 'panal',      label: 'Panal',       color: '#F2A900' },
  { id: 'credicard',  label: 'Credicard',   color: '#C8102E' },
  { id: 'otra',       label: 'Otra',        color: '#6b7280' },
]

export function bankById(id) {
  return BANKS.find((b) => b.id === id) || null
}

// Busca el banco a partir de un texto libre (nombre de cuenta, alias, etc.)
export function guessBank(texto) {
  const t = norm(texto)
  if (!t) return null
  // Primero coincidencia por nombre corto (más específico)
  for (const b of BANKS) {
    if (b.id === 'otro') continue
    if (t.includes(norm(b.short)) || t.includes(norm(b.name))) return b
  }
  return null
}

export function redById(id) {
  return RED_TARJETA.find((r) => r.id === id) || null
}

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

// Agrupado para los selectores
export const BANK_GROUPS = [
  { label: 'Bancos', items: BANKS.filter((b) => b.kind === 'banco') },
  { label: 'Financieras', items: BANKS.filter((b) => b.kind === 'financiera') },
  { label: 'Billeteras', items: BANKS.filter((b) => b.kind === 'billetera') },
  { label: 'Otros', items: BANKS.filter((b) => b.kind === 'otro') },
]
