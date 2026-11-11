import { money } from '../lib/format'

/**
 * Fila de métricas: cada una con una barra de color al costado.
 * Se usa arriba de Cuentas, Deudas y Patrimonio para dar el mismo pulso visual.
 */
export default function StatRow({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="stat-row">
      {items.map((it, i) => (
        <div key={i} className="card stat-cell" style={{ borderLeft: `3px solid ${it.color || '#34d399'}` }}>
          <div className="row" style={{ gap: 7, marginBottom: 4 }}>
            {it.icon ? <it.icon size={13} style={{ color: it.color || '#34d399' }} /> : null}
            <span className="stat-label" style={{ margin: 0 }}>{it.label}</span>
          </div>
          <div className="stat-value" style={{ fontSize: 21, color: it.valueColor }}>
            {it.raw != null ? it.raw : money(it.value)}
          </div>
          {it.hint && <div className="text-muted" style={{ fontSize: 11.5, marginTop: 3 }}>{it.hint}</div>}
        </div>
      ))}
    </div>
  )
}
