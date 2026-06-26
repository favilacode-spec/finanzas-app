export default function LabelChip({ label, size = 'md' }) {
  if (!label) return null
  const pad = size === 'sm' ? '1px 7px' : '2px 9px'
  const fs = size === 'sm' ? 10.5 : 11.5
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 999,
      fontSize: fs, fontWeight: 600, color: label.color,
      background: label.color + '22', border: `1px solid ${label.color}55`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, background: label.color }} />
      {label.name}
    </span>
  )
}
