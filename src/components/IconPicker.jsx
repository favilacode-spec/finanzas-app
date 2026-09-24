import Icon, { COLORS } from './Icon'
import { hexA } from './Tile'

export default function IconPicker({ icons, icon, color, onIcon, onColor }) {
  return (
    <div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
        {COLORS.map((c) => (
          <button type="button" key={c} onClick={() => onColor(c)} aria-label={`color ${c}`}
            style={{ width: 28, height: 28, borderRadius: 9, background: c, border: color === c ? '2px solid #fff' : '2px solid transparent' }} />
        ))}
        <label style={{ width: 28, height: 28, borderRadius: 9, position: 'relative', cursor: 'pointer', background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#10b981,#06b6d4,#6366f1,#d946ef,#f43f5e)', border: !COLORS.includes(color) ? '2px solid #fff' : '2px solid transparent' }}>
          <input type="color" value={color} onChange={(e) => onColor(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
      </div>
      <div className="row wrap" style={{ gap: 7 }}>
        {icons.map((ic) => (
          <button type="button" key={ic} onClick={() => onIcon(ic)}
            style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: icon === ic ? hexA(color, 0.22) : 'var(--bg-elevated)', color: icon === ic ? color : 'var(--text-2)', border: icon === ic ? `1.5px solid ${color}` : '1.5px solid transparent' }}>
            <Icon name={ic} size={18} />
          </button>
        ))}
      </div>
    </div>
  )
}
