import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase, FUNCTIONS_URL } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { monthRange } from '../lib/format'

export default function Insights() {
  const { household } = useAuth()
  const [loading, setLoading] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')

  const generate = async () => {
    setLoading(true); setErr(''); setText('')
    try {
      const { start, end } = monthRange()
      const [tx, cat, acc, bal] = await Promise.all([
        supabase.from('transactions').select('amount,type,category_id').gte('occurred_on', start).lte('occurred_on', end),
        supabase.from('categories').select('id,name'),
        supabase.from('accounts').select('id,name').eq('archived', false),
        supabase.from('account_balances').select('*'),
      ])
      const cmap = {}; (cat.data || []).forEach((c) => cmap[c.id] = c.name)
      const income = (tx.data || []).filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
      const expense = (tx.data || []).filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
      const byCat = {}
      ;(tx.data || []).filter((t) => t.type === 'expense').forEach((t) => { const k = cmap[t.category_id] || 'Otros'; byCat[k] = (byCat[k] || 0) + Number(t.amount) })
      const totalBal = (bal.data || []).reduce((s, b) => s + Number(b.balance), 0)
      const summary = { moneda: 'PYG (Guaraníes)', saldo_total: totalBal, ingresos_mes: income, gastos_mes: expense, ahorro_mes: income - expense, gastos_por_categoria: byCat }

      const { data: sess } = await supabase.auth.getSession()
      const resp = await fetch(`${FUNCTIONS_URL}/ai-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session.access_token}` },
        body: JSON.stringify({ summary }),
      })
      const j = await resp.json()
      if (j.error) throw new Error(j.error)
      setText(j.insights || 'Sin respuesta.')
    } catch (e) {
      setErr(String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ background: 'linear-gradient(120deg, var(--blue-deep), #2a0a12)', marginBottom: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="icon-chip" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}><Sparkles size={20} /></span>
          <div>
            <h2 style={{ fontSize: 18 }}>Asesor financiero IA</h2>
            <p className="text-2" style={{ fontSize: 13.5, color: '#cdd9f2' }}>Analizo tus finanzas del mes y te doy consejos personalizados. Gratis, con IA.</p>
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={generate} disabled={loading}>
          {loading ? 'Analizando…' : 'Generar consejos'}
        </button>
      </div>

      {err && <div className="card" style={{ borderColor: 'var(--red-border)', color: '#ff9aa0' }}>{err}</div>}

      {text && (
        <div className="card">
          <div className="card-title">Tus consejos</div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14.5 }}>{text}</div>
        </div>
      )}

      {!text && !loading && !err && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          Nota: para activar la IA hay que cargar una clave gratuita de Groq en Supabase (te lo explico en Ajustes). Sin la clave, igual funciona todo lo demás de la app.
        </p>
      )}
    </div>
  )
}
