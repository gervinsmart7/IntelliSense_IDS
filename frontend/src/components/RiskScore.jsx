function RiskScore({ score, level, size = 'normal', showLabel = true }) {
  const colors = {
    critical: { color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
    high: { color: '#FBBF24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' },
    medium: { color: '#6366F1', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)' },
    low: { color: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)' }
  }

  const c = colors[level] || colors.low
  const isLarge = size === 'large'

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px'
    }}>
      <div style={{
        width: isLarge ? '64px' : '44px',
        height: isLarge ? '64px' : '44px',
        borderRadius: '50%',
        background: c.bg,
        border: '2px solid ' + c.border,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <span style={{
          fontSize: isLarge ? '18px' : '13px',
          fontWeight: '700',
          color: c.color,
          fontFamily: 'Syne, sans-serif'
        }}>
          {score}
        </span>
      </div>
      {showLabel && (
        <span style={{
          fontSize: '10px',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: c.color
        }}>
          {level}
        </span>
      )}
    </div>
  )
}

export default RiskScore
