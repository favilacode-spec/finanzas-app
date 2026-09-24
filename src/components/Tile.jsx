import Icon from './Icon'

// Cuadradito redondeado con ícono teñido (estilo MoneyCoach)
export default function Tile({ icon = 'tag', color = '#34d399', size = 'md', image }) {
  const cls = size === 'sm' ? 'tile tile-sm' : size === 'lg' ? 'tile tile-lg' : 'tile'
  const px = size === 'sm' ? 15 : size === 'lg' ? 22 : 18
  if (image) return <span className={cls} style={{ background: `center/cover url(${image})` }} />
  return (
    <span className={cls} style={{ background: hexA(color, 0.16), color }}>
      <Icon name={icon} size={px} />
    </span>
  )
}

export function hexA(hex, a) {
  const h = String(hex || '#34d399').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return `rgba(52,211,153,${a})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
