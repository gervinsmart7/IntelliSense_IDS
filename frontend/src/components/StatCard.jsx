function StatCard({ title, value, subtitle, icon: Icon, color }) {
  const colorMap = {
    accent:  { bg: 'rgba(99,102,241,0.1)',  text: '#6366F1' },
    success: { bg: 'rgba(52,211,153,0.1)',  text: '#34D399' },
    warning: { bg: 'rgba(251,191,36,0.1)',  text: '#FBBF24' },
    danger:  { bg: 'rgba(248,113,113,0.1)', text: '#F87171' }
  }
  const c = colorMap[color] || colorMap.accent

  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <p style={{
            fontSize: '11px', fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            color: 'var(--text-muted)', marginBottom: '10px'
          }}>
            {title}
          </p>
          <p style={{
            fontSize: '28px', fontWeight: '700',
            color: 'var(--text-primary)',
            fontFamily: 'Syne, sans-serif'
          }}>
            {value}
          </p>
          {subtitle && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div style={{
            width: '40px', height: '40px',
            background: c.bg, borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
          }}>
            <Icon size={18} color={c.text} />
          </div>
        )}
      </div>
    </div>
  )
}

export default StatCard
