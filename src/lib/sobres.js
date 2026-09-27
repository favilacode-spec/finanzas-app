// Sobres: metas y proyectos vinculados a una cuenta comparten esa cuenta.
// Cada uno avanza solo con lo que se le asigna (tabla goal_contributions),
// y lo que sobra en la cuenta queda como "sin asignar".
import { supabase } from './supabase'

export const keyOf = (kind, id) => (kind === 'goal' ? 'g:' : 't:') + id

export function buildSobres(goals = [], trips = [], contribs = []) {
  const sum = {}
  contribs.forEach((c) => {
    const k = c.goal_id ? 'g:' + c.goal_id : c.trip_id ? 't:' + c.trip_id : null
    if (k) sum[k] = (sum[k] || 0) + Number(c.amount || 0)
  })
  const list = [
    ...goals.filter((g) => g.account_id && !g.archived).map((g) => ({
      key: 'g:' + g.id, kind: 'goal', id: g.id, name: g.name, accountId: g.account_id,
      color: g.color || '#34d399', icon: g.icon || 'target', target: Number(g.target_amount || 0), saldo: sum['g:' + g.id] || 0,
    })),
    ...trips.filter((t) => t.saved_account_id && !t.archived).map((t) => ({
      key: 't:' + t.id, kind: 'trip', id: t.id, name: t.name, accountId: t.saved_account_id,
      color: '#60a5fa', icon: /viaje|costa rica/i.test(t.name) ? 'plane' : 'target', target: 0, saldo: sum['t:' + t.id] || 0,
    })),
  ]
  return {
    list,
    saldo: (kind, id) => sum[keyOf(kind, id)] || 0,
    deCuenta: (accountId) => list.filter((s) => s.accountId === accountId),
    asignado: (accountId) => list.filter((s) => s.accountId === accountId).reduce((a, s) => a + s.saldo, 0),
    find: (key) => list.find((s) => s.key === key),
  }
}

export async function loadSobres() {
  const [g, t, c] = await Promise.all([
    supabase.from('goals').select('id,name,account_id,archived,color,icon,target_amount'),
    supabase.from('trips').select('id,name,saved_account_id,archived,currency,fx_rate'),
    supabase.from('goal_contributions').select('goal_id,trip_id,amount'),
  ])
  return buildSobres(g.data || [], t.data || [], c.data || [])
}

// Anota plata en (o saca de) un sobre. amount positivo = entra, negativo = sale.
export async function moverSobre({ householdId, userId, sobre, amount, date, note, transactionId, kind }) {
  if (!sobre || !amount) return { error: null }
  return supabase.from('goal_contributions').insert({
    household_id: householdId,
    goal_id: sobre.kind === 'goal' ? sobre.id : null,
    trip_id: sobre.kind === 'trip' ? sobre.id : null,
    amount: Math.round(amount), contributed_on: date, note: note || null,
    account_id: sobre.accountId, transaction_id: transactionId || null,
    kind: kind || (amount > 0 ? 'aporte' : 'retiro'), created_by: userId,
  })
}

export const KIND_LABEL = { aporte: 'Aporte', retiro: 'Retiro', interes: 'Rendimiento', mover: 'Movido entre sobres' }
