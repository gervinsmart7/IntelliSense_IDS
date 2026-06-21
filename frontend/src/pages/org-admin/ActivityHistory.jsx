import { useState, useEffect } from 'react'
import { Activity, RefreshCw, LogIn, Key, AlertTriangle, Settings, Shield } from 'lucide-react'
import api from '../../services/api'
import Layout from '../../components/Layout'
import TopBar from '../../components/TopBar'
import useAuthStore from '../../store/useAuthStore'

function ActivityHistory() {
  const { admin } = useAuthStore()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(function() {
    loadActivity()
  }, [])

  async function loadActivity() {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get('/api/audit-logs/my-activity')
      setLogs(response.data.data || [])
    } catch(e) {
      setError('Failed to load activity history')
    } finally {
      setLoading(false)
    }
  }

  const ACTION_GROUPS = {
    auth: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED'],
    agent: ['AGENT_AUTHENTICATED', 'AGENT_MODEL_UPDATED', 'API_KEY_REGENERATED'],
    alerts: ['ALERT_DISMISSED'],
    settings: ['ORGANISATION_UPDATED', 'EMAIL_VERIFIED']
  }

  const filtered = logs.filter(function(log) {
    if (filter === 'all') return true
    return ACTION_GROUPS[filter]?.includes(log.action_type)
  })

  function getActionIcon(actionType) {
    if (ACTION_GROUPS.auth.includes(actionType)) return LogIn
    if (ACTION_GROUPS.agent.includes(actionType)) return Shield
    if (ACTION_GROUPS.alerts.includes(actionType)) return AlertTriangle
    if (ACTION_GROUPS.settings.includes(actionType)) return Settings
    if (actionType === 'API_KEY_REGENERATED') return Key
    return Activity
  }

  function getActionColor(actionType, status) {
    if (status === 'failed' || status === 'denied') return 'var(--danger)'
    if (ACTION_GROUPS.auth.includes(actionType)) return 'var(--accent)'
    if (ACTION_GROUPS.agent.includes(actionType)) return 'var(--success)'
    if (ACTION_GROUPS.alerts.includes(actionType)) return 'var(--warning)'
    return 'var(--text-muted)'
  }

  function parseTimestamp(timestamp) {
  if (!timestamp) return null
  if (typeof timestamp === 'string') return new Date(timestamp)
  if (timestamp._seconds) return new Date(timestamp._seconds * 1000)
  if (timestamp.toDate) return timestamp.toDate()
  return null
}

function getRelativeTime(timestamp) {
  const date = parseTimestamp(timestamp)
  if (!date) return '—'
  const diff = Math.floor((new Date() - date) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return Math.floor(diff / 60) + ' minutes ago'
  if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago'
  if (diff < 604800) return Math.floor(diff / 86400) + ' days ago'
  return date.toLocaleDateString()
}

function getFullTime(timestamp) {
  const date = parseTimestamp(timestamp)
  return date ? date.toLocaleString() : '—'
}

  return (
    <Layout>
      <TopBar title="Activity History" />

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px', marginBottom: '24px'
      }}>
        {[
          { label: 'Total Actions', value: logs.length, color: '#6366F1' },
          { label: 'Logins', value: logs.filter(function(l) { return l.action_type === 'LOGIN_SUCCESS' }).length, color: '#34D399' },
          { label: 'Agent Events', value: logs.filter(function(l) { return ACTION_GROUPS.agent.includes(l.action_type) }).length, color: '#60A5FA' },
          { label: 'Failed', value: logs.filter(function(l) { return l.status === 'failed' }).length, color: '#F87171' }
        ].map(function(item) {
          return (
            <div key={item.label} className="stat-card">
              <p style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {item.label}
              </p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: item.color, fontFamily: 'Syne, sans-serif' }}>
                {item.value}
              </p>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
        }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
            My Activity
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'auth', label: 'Logins' },
              { key: 'agent', label: 'Agent' },
              { key: 'settings', label: 'Settings' }
            ].map(function(f) {
              return (
                <button
                  key={f.key}
                  onClick={function() { setFilter(f.key) }}
                  style={{
                    padding: '6px 12px', borderRadius: '6px',
                    fontSize: '12px', fontWeight: '500',
                    border: 'none', cursor: 'pointer',
                    background: filter === f.key ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: filter === f.key ? 'white' : 'var(--text-muted)'
                  }}
                >
                  {f.label}
                </button>
              )
            })}
            <button
              onClick={loadActivity}
              className="btn-secondary"
              style={{ padding: '6px 10px' }}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <div style={{
              width: '32px', height: '32px',
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px'
            }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Loading activity history...
            </p>
          </div>
        ) : error ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <p style={{ color: 'var(--danger)', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </p>
            <button onClick={loadActivity} className="btn-primary">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '64px', textAlign: 'center' }}>
            <Activity size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              No activity recorded yet
            </p>
          </div>
        ) : (
          <div>
            {filtered.map(function(log, index) {
              const IconComponent = getActionIcon(log.action_type)
              const color = getActionColor(log.action_type, log.status)
              const isLast = index === filtered.length - 1

              return (
                <div
                  key={log.log_id || log.id || index}
                  style={{
                    display: 'flex',
                    gap: '16px',
                    padding: '16px 20px',
                    borderBottom: isLast ? 'none' : '1px solid var(--border)',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={function(e) {
                    e.currentTarget.style.background = 'rgba(99,102,241,0.03)'
                  }}
                  onMouseLeave={function(e) {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: '36px', height: '36px',
                    borderRadius: '10px',
                    background: color + '18',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    <IconComponent size={16} color={color} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '2px' }}>
                          {log.action_type?.replace(/_/g, ' ')}
                        </p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {log.action_detail}
                        </p>
                        {log.ip_address && (
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'JetBrains Mono, monospace' }}>
                            IP: {log.ip_address}
                          </p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span className={'badge badge-' + (log.status === 'success' ? 'success' : log.status === 'failed' ? 'danger' : 'warning')}>
                          {log.status}
                        </span>
                        <p
                          style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}
                          title={getFullTime(log.timestamp)}
                        >
                          {getRelativeTime(log.timestamp)}
                        </p>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {getFullTime(log.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
          {filtered.length} activities recorded
        </div>
      </div>
    </Layout>
  )
}

export default ActivityHistory
