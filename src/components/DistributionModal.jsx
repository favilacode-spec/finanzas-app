import Modal from './Modal'
import { money } from '../lib/format'
import { Calculator } from 'lucide-react'

// Muestra cuánto transferir a cada cuenta según las reglas de distribución.
export default function DistributionModal({ amount, rules, accounts, onClose }) {
  const accName = (id) => accounts.find((a) => a.id === id)?.name || 'Sin asignar'
  const rows = (rules || []).map((r) => ({
    ...r,
    monto: Math.round(Number(amount) * Number(r.percent) / 100),
  }))
  const totalPct = rows.reduce((s, r) => s + Number(r.percent), 0)
  const totalMonto = rows.reduce((s, r) => s + r.monto, 0)

  return (
    <Modal title="Reparto del ingreso" onClose={onClose}>
      <div className="card" style={{ background: 'var(--bg-base)', marginBottom: 16, textAlign: 'center', padding: 16 }}>
        <div className="row" style={{ gap: 8, justifyContent: 'center', color: 'var(--text-2)' }}>
          <Calculator size={16} /> <span className="stat-label">Ingreso recibido</span>
        </div>
        <div className="stat-value" style={{ fontSize: 26 }}>{money(amount)}</div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          Todavía no configuraste el reparto. Andá a <b>Ajustes → Distribución de ingresos</b> para definirlo.
        </div>
      ) : (
        <>
          <p className="text-2" style={{ fontSize: 13, marginBottom: 10 }}>Transferí estos montos a cada cuenta:</p>
          <table className="data-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.label}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{accName(r.account_id)} · {r.percent}%</div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{money(r.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row between" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <span className="text-2" style={{ fontSize: 13 }}>Total ({totalPct}%)</span>
            <span style={{ fontWeight: 700 }}>{money(totalMonto)}</span>
          </div>
          {totalPct !== 100 && (
            <p style={{ color: '#ff9aa0', fontSize: 12.5, marginTop: 8 }}>⚠️ Los porcentajes suman {totalPct}%, no 100%. Revisá la configuración en Ajustes.</p>
          )}
        </>
      )}

      <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={onClose}>Entendido</button>
    </Modal>
  )
}
